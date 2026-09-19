/**
 * Stewardship watchdog: is the catalogue still reachable, still paid for, and
 * is the steward still publishing? Keyless and read-only. It reads the tracked
 * stewardship.config.json (public addresses, topics, batch id) and asks a public
 * Swarm gateway; it never loads a key, never stamps, never pays.
 *
 *   npm run watchdog                                   # plain-language report
 *   npm run watchdog -- --gateway https://…            # any Bee node or gateway (or WATCHDOG_GATEWAY)
 *   npm run watchdog -- --unanswered 2                 # libraries report unanswered requests (T2's second half)
 *   npm run watchdog -- --report-file alert.md --json  # also write the GitHub issue body / machine output
 *
 * Exit codes: 0 all clear · 1 a charter trigger is met (act now) · 2 reachability or storage not confirmed.
 * The daily GitHub Action (.github/workflows/steward-watchdog.yml) files or updates one public issue on 1 or 2.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { HttpFeedStore } from '../src/core/http-feedstore.js'
import { defaultAnchor } from '../src/core/resolve.js'
import { assess, gatherFacts, PUBLIC_GATEWAY, renderIssue, renderText, topUpRecipe } from '../src/core/watchdog.js'
import { charterFromConfig, loadConfig } from '../src/node/config.js'
import { PATHS } from '../src/node/paths.js'

const { values } = parseArgs({
  options: {
    gateway: { type: 'string' },
    unanswered: { type: 'string' },
    'report-file': { type: 'string' },
    json: { type: 'boolean' },
    now: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log('usage: npm run watchdog -- [--gateway url] [--unanswered N] [--report-file path.md] [--json] [--now ISO]')
  process.exit(0)
}

/** GET with a timeout, retried on network errors and gateway hiccups (502/503/504). */
async function patientFetch(url: string): Promise<Response> {
  let last: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      if (![502, 503, 504].includes(res.status) || attempt === 3) return res
      last = new Error(`HTTP ${res.status}`)
    } catch (e) {
      last = e
    }
    await new Promise((r) => setTimeout(r, 2_000 * attempt))
  }
  throw last instanceof Error ? last : new Error(String(last))
}

const main = async () => {
  const config = loadConfig()
  const gateway = (values.gateway ?? process.env.WATCHDOG_GATEWAY ?? PUBLIC_GATEWAY).replace(/\/+$/, '')
  const owner = config.council.scribe.address
  if (!owner) throw new Error('stewardship.config.json names no council scribe: there is no register to watch yet.')
  let fallbackCharter = null
  try {
    fallbackCharter = charterFromConfig(config)
  } catch {
    // the genesis registry entry carries the charter anyway
  }

  const facts = await gatherFacts(new HttpFeedStore(gateway, patientFetch), patientFetch, {
    gateway,
    anchor: defaultAnchor(owner),
    registryTopic: config.topics.registry.string,
    registryManifest: config.registryManifest,
    batchId: config.payer.batchId,
    payerAddress: config.payer.nodeAddress,
    fallbackCharter,
    unansweredLibraries: Number(values.unanswered ?? 0),
    now: values.now ? new Date(values.now) : new Date(),
  })
  const a = assess(facts)
  const recipe = config.payer.batchId ? topUpRecipe(readFileSync(PATHS.mechanisms, 'utf8'), config.payer.batchId) : null

  if (values.json) {
    console.log(JSON.stringify({ exitCode: a.exitCode, status: a.status, title: a.title, headline: a.headline, checks: a.checks, triggers: a.triggers }, null, 2))
  } else {
    console.log(renderText(a, recipe))
  }

  const server = process.env.GITHUB_SERVER_URL
  const repo = process.env.GITHUB_REPOSITORY
  const repoUrl = server && repo ? `${server}/${repo}` : null
  const runUrl = repoUrl && process.env.GITHUB_RUN_ID ? `${repoUrl}/actions/runs/${process.env.GITHUB_RUN_ID}` : null
  if (values['report-file']) writeFileSync(values['report-file'], `${renderIssue(a, { recipe, repoUrl, runUrl })}\n`)
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `status=${a.status}\nexit_code=${a.exitCode}\ntitle=${a.title}\n`)
  }
  process.exitCode = a.exitCode
}

main().catch((e: unknown) => {
  console.error(`watchdog could not run: ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 3
})
