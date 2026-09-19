import { z } from 'zod'
import type { FeedReadStore } from './feedstore.js'
import { readCatalogue, readPendingCorrections, readRegistry, type Anchor } from './resolve.js'
import { RegistryEntry, type Charter } from './schemas.js'
import { sameAddress, shortHex, stripHex } from './swarm.js'
import { evaluateTriggers, type TriggerState } from './triggers.js'

/**
 * The stewardship watchdog: a keyless daily check, run by anyone (a GitHub
 * Action here), that answers "is the catalogue still reachable, still paid
 * for, and is the steward still publishing?" and says which STEWARDSHIP.md §4
 * trigger is met. It reads only public data through a public gateway and never
 * signs or pays for anything.
 *
 *   gatherFacts()  network: registry walk, catalogue, GET /batches
 *   assess()       pure: facts → checks, triggers, exit code, title
 *   renderText() / renderIssue() / topUpRecipe()   pure: words for people
 */

export const PUBLIC_GATEWAY = 'https://api.gateway.ethswarm.org'
const DAY_MS = 86_400_000

// ── storage: the batch as the network sees it ───────────────────────────────

/** One entry of Bee's `GET /batches` (every live batch the node knows of, anyone's). */
const BatchRow = z.object({
  batchID: z.string(),
  batchTTL: z.number(),
  depth: z.number().int().optional(),
  owner: z.string().optional(),
  immutable: z.boolean().optional(),
})

export interface BatchInfo {
  batchId: string
  /** the node's estimate at today's storage price, in seconds */
  ttlSeconds: number
  ttlDays: number
  depth: number | null
  owner: string | null
}

/** Finds our batch in a `GET /batches` answer (a bare array, or `{ batches: [...] }`). */
export function findBatch(body: unknown, batchId: string): BatchInfo | null {
  const rows = Array.isArray(body) ? body : (body as { batches?: unknown })?.batches
  if (!Array.isArray(rows)) throw new Error('GET /batches did not return a list of batches')
  const wanted = stripHex(batchId)
  for (const row of rows) {
    const parsed = BatchRow.safeParse(row)
    if (!parsed.success || stripHex(parsed.data.batchID) !== wanted) continue
    const b = parsed.data
    return {
      batchId: wanted,
      ttlSeconds: b.batchTTL,
      ttlDays: b.batchTTL / 86_400,
      depth: b.depth ?? null,
      owner: b.owner ? `0x${stripHex(b.owner)}` : null,
    }
  }
  return null
}

// ── facts gathered from the network ─────────────────────────────────────────

export interface WatchdogInput {
  gateway: string
  anchor: Anchor
  registryTopic: string
  registryManifest: string | null
  batchId: string | null
  /** the payer (node wallet) recorded in the config, to check the batch owner */
  payerAddress: string | null
  /** used only if the registry cannot give us the genesis charter */
  fallbackCharter: Charter | null
  /** libraries that report written requests unanswered (T2's second half); the robot cannot see this */
  unansweredLibraries: number
  now: Date
}

export interface WatchdogFacts {
  input: WatchdogInput
  registry: {
    updates: number
    valid: number
    ignored: { feedIndex: number; problems: string[] }[]
    current: {
      epoch: number
      feedIndex: number
      stewardName: string
      stewardAddress: string
      since: string
      trigger: string
      seals: number
      threshold: number
      next: { name: string; address: string } | null
    } | null
  } | null
  registryError: string | null
  /** what `GET /bzz/<registry manifest>/` answers: the latest entry, sealed or not */
  manifest: { epoch: number; stewardName: string } | null
  manifestError: string | null
  catalogue: { version: number; publishedAt: string; publisherName: string; inherited: boolean; feedIndex: number } | null
  catalogueError: string | null
  pendingCorrections: number | null
  charter: Charter | null
  charterSource: 'registry' | 'config' | null
  batch: BatchInfo | null
  batchError: string | null
}

type Fetcher = (url: string) => Promise<Response>

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Everything the watchdog looks at, read with no keys. Never throws: failures become facts. */
export async function gatherFacts(store: FeedReadStore, fetcher: Fetcher, input: WatchdogInput): Promise<WatchdogFacts> {
  const base = input.gateway.replace(/\/+$/, '')
  const facts: WatchdogFacts = {
    input, registry: null, registryError: null, manifest: null, manifestError: null, catalogue: null, catalogueError: null,
    pendingCorrections: null, charter: input.fallbackCharter, charterSource: input.fallbackCharter ? 'config' : null, batch: null, batchError: null,
  }

  try {
    const view = await readRegistry(store, input.anchor)
    const cur = view.current
    facts.registry = {
      updates: view.entries.length,
      valid: view.valid.length,
      ignored: view.entries.filter((e) => !e.ok).map((e) => ({ feedIndex: e.feedIndex, problems: e.problems })),
      current: cur?.entry
        ? {
            epoch: cur.entry.epoch,
            feedIndex: cur.feedIndex,
            stewardName: cur.entry.steward.name,
            stewardAddress: cur.entry.steward.address,
            since: cur.entry.issuedAt,
            trigger: cur.entry.fields.trigger,
            seals: cur.quorum?.counted.length ?? 0,
            threshold: cur.quorum?.threshold ?? 0,
            next: cur.entry.designatedSuccessor,
          }
        : null,
    }
    if (view.genesisCharter) {
      facts.charter = view.genesisCharter
      facts.charterSource = 'registry'
    }
    try {
      const { catalogue, source } = await readCatalogue(store, view, input.anchor)
      if (catalogue && source) {
        facts.catalogue = {
          version: catalogue.version, publishedAt: catalogue.publishedAt, publisherName: source.stewardName,
          inherited: source.inherited, feedIndex: source.feedIndex,
        }
      }
      if (view.genesisCharter) {
        facts.pendingCorrections = (await readPendingCorrections(store, view.genesisCharter, catalogue, input.anchor)).length
      }
    } catch (e) {
      facts.catalogueError = message(e)
    }
  } catch (e) {
    facts.registryError = message(e)
  }

  if (input.registryManifest) {
    try {
      const res = await fetcher(`${base}/bzz/${input.registryManifest}/`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const entry = RegistryEntry.parse(await res.json())
      facts.manifest = { epoch: entry.epoch, stewardName: entry.steward.name }
    } catch (e) {
      facts.manifestError = message(e)
    }
  }

  if (input.batchId) {
    try {
      const res = await fetcher(`${base}/batches`)
      if (!res.ok) throw new Error(`GET /batches -> HTTP ${res.status}`)
      facts.batch = findBatch(await res.json(), input.batchId)
    } catch (e) {
      facts.batchError = message(e)
    }
  }
  return facts
}

// ── judgement ───────────────────────────────────────────────────────────────

export type Level = 'ok' | 'info' | 'warn' | 'alert' | 'broken'

export interface Check {
  level: Level
  label: string
  detail: string
}

export interface Assessment {
  facts: WatchdogFacts
  /** 0 all clear · 1 a charter trigger is met (act now) · 2 the catalogue could not be confirmed reachable or paid for */
  exitCode: 0 | 1 | 2
  status: 'all-clear' | 'alert' | 'unconfirmed'
  title: string
  headline: string
  checks: Check[]
  triggers: TriggerState[]
  /** days since the current steward last published (or took over, if they have not published yet) */
  quietDays: number | null
  storageAlert: boolean
  silenceAlert: boolean
}

const days = (ms: number) => Math.floor(ms / DAY_MS)
const shortRef = (ref: string) => `${stripHex(ref).slice(0, 8)}…`
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export function assess(facts: WatchdogFacts): Assessment {
  const { input } = facts
  const now = input.now
  const checks: Check[] = []
  const reg = facts.registry
  const cur = reg?.current ?? null

  // 1. reachable
  if (facts.registryError || !reg) {
    checks.push({ level: 'broken', label: 'Catalogue reachable', detail: `the register could not be read through ${input.gateway}: ${facts.registryError ?? 'no answer'}` })
  } else if (!cur) {
    checks.push({ level: 'broken', label: 'Catalogue reachable', detail: `the register has ${reg.updates} update(s) but none carries valid library seals` })
  } else {
    checks.push({
      level: 'ok',
      label: 'Catalogue reachable',
      detail: `the register (${shortHex(input.anchor.registryOwner)} / ${input.registryTopic}) has ${reg.updates} update(s), ${reg.valid} with valid library seals; the latest valid one carries ${cur.seals} of ${cur.threshold} required seals`,
    })
    for (const ig of reg.ignored) {
      checks.push({ level: 'warn', label: `Register update #${ig.feedIndex} ignored`, detail: `readers skip it: ${ig.problems.join('; ')}` })
    }
  }
  if (input.registryManifest) {
    if (facts.manifestError) {
      checks.push({ level: 'warn', label: 'Stable address', detail: `/bzz/${shortRef(input.registryManifest)}/ did not answer (${facts.manifestError}); readers can still walk the register chunk by chunk` })
    } else if (facts.manifest && cur && facts.manifest.epoch !== cur.epoch) {
      checks.push({ level: 'warn', label: 'Stable address', detail: `/bzz/${shortRef(input.registryManifest)}/ shows epoch ${facts.manifest.epoch} (${facts.manifest.stewardName}), which readers do not accept; careful readers fall back to epoch ${cur.epoch}` })
    } else if (facts.manifest) {
      checks.push({ level: 'ok', label: 'Stable address', detail: `/bzz/${shortRef(input.registryManifest)}/ answers with epoch ${facts.manifest.epoch} (${facts.manifest.stewardName})` })
    }
  }

  // 2. who is steward, and are they still publishing
  let quietDays: number | null = null
  let lastPublishedAt: string | null = null
  if (cur) {
    const next = cur.next ? ` Next in line: ${cur.next.name} (${cur.next.address}).` : ' No successor is named.'
    checks.push({ level: 'ok', label: 'Current steward', detail: `${cur.stewardName} (${cur.stewardAddress}), epoch ${cur.epoch}, since ${cur.since.slice(0, 10)}.${next}` })
    const own = facts.catalogue && !facts.catalogue.inherited ? facts.catalogue : null
    // The silence clock runs from the steward's last publication, or from the day they took over.
    lastPublishedAt = own ? own.publishedAt : cur.since
    quietDays = days(now.getTime() - Date.parse(lastPublishedAt))
    if (facts.catalogueError) {
      checks.push({ level: 'broken', label: 'Last catalogue update', detail: `the catalogue could not be read: ${facts.catalogueError}` })
    } else if (own) {
      checks.push({ level: 'ok', label: 'Last catalogue update', detail: `v${own.version} by ${cur.stewardName}, ${quietDays} day(s) ago (${own.publishedAt.slice(0, 10)}), feed update #${own.feedIndex}` })
    } else if (facts.catalogue) {
      checks.push({ level: 'warn', label: 'Last catalogue update', detail: `${cur.stewardName} has not published since taking over ${quietDays} day(s) ago; readers still see ${facts.catalogue.publisherName}'s v${facts.catalogue.version}` })
    } else {
      checks.push({ level: 'broken', label: 'Last catalogue update', detail: 'no steward has published a catalogue yet' })
    }
    if (facts.pendingCorrections !== null && facts.pendingCorrections > 0) {
      checks.push({ level: 'info', label: 'Library corrections', detail: `${facts.pendingCorrections} signed correction(s) are visible to readers and wait for the next publication` })
    }
  }

  // 3. storage
  const floor = facts.charter?.triggers.ttlFloorDays ?? 30
  if (!input.batchId) {
    checks.push({ level: 'broken', label: 'Storage paid for', detail: 'no postage batch is recorded in stewardship.config.json' })
  } else if (facts.batchError) {
    checks.push({ level: 'broken', label: 'Storage paid for', detail: `the network's list of batches could not be read through ${input.gateway}: ${facts.batchError}` })
  } else if (!facts.batch) {
    checks.push({ level: 'broken', label: 'Storage paid for', detail: `batch ${shortHex(input.batchId)} is not in the network's list of live batches: it may have run out. Expired storage cannot be topped up, only uploaded again.` })
  } else {
    const b = facts.batch
    const until = isoDay(new Date(now.getTime() + b.ttlSeconds * 1000))
    const low = b.ttlDays < floor
    checks.push({
      level: low ? 'alert' : 'ok',
      label: 'Storage paid for',
      detail: `about ${b.ttlDays.toFixed(1)} day(s) left (until about ${until}, at today's price); the charter's floor is ${floor} days`,
    })
    if (b.owner && input.payerAddress && !sameAddress(b.owner, input.payerAddress)) {
      checks.push({ level: 'warn', label: 'Batch owner', detail: `the batch belongs to ${b.owner}, not the payer ${input.payerAddress} recorded in the config` })
    }
  }

  // 4. the charter's triggers, evaluated by the same code the CLI uses
  const triggers = facts.charter
    ? evaluateTriggers({
        charter: facts.charter, now, lastPublishedAt,
        ttlDays: facts.batch ? facts.batch.ttlDays : null,
        unansweredLibraries: input.unansweredLibraries,
      })
    : []
  const silenceDays = facts.charter?.triggers.silenceDays ?? 60
  const t2 = triggers.find((t) => t.id === 'T2-silence')
  const t3 = triggers.find((t) => t.id === 'T3-storage')
  const silenceAlert = quietDays !== null && quietDays >= silenceDays
  const storageAlert = Boolean(t3?.met)
  if (quietDays !== null) {
    checks.push({
      level: silenceAlert ? 'alert' : 'ok',
      label: 'Silence (T2)',
      detail: silenceAlert
        ? `${quietDays} quiet day(s), at or past the ${silenceDays}-day mark. ${t2?.met ? 'T2 is MET: two libraries also report no reply.' : 'T2 is met once two libraries confirm their written requests went unanswered for ' + (facts.charter?.triggers.unansweredDays ?? 30) + ' days.'}`
        : `${quietDays} of ${silenceDays} quiet days`,
    })
  }

  const broken = checks.some((c) => c.level === 'broken')
  const alert = storageAlert || silenceAlert
  const exitCode = broken ? 2 : alert ? 1 : 0
  const status = broken ? 'unconfirmed' : alert ? 'alert' : 'all-clear'

  const ttlText = facts.batch ? `storage paid ~${Math.round(facts.batch.ttlDays)} days` : 'storage NOT confirmed'
  const parts = [
    `Catalogue ${cur ? 'reachable ✓' : 'NOT confirmed reachable ✗'}`,
    cur ? `current steward ${cur.stewardName}` : null,
    quietDays !== null ? `last update ${quietDays} day(s) ago` : null,
    ttlText,
  ].filter(Boolean)
  const actions: string[] = []
  if (storageAlert) actions.push(`T3 MET: any library may top up; here's how`)
  if (silenceAlert) actions.push(`T2 silence mark reached: the libraries may start a hand-off`)
  if (broken) actions.push('something could not be confirmed; see below')
  const headline = `${parts.join(', ')}${actions.length ? ` — ${actions.join('; ')}` : ' — all clear'}`

  const titleBits: string[] = []
  if (broken) titleBits.push(cur ? 'storage or catalogue not confirmed' : 'catalogue not confirmed reachable')
  if (storageAlert && facts.batch) titleBits.push(`T3 met, storage paid for ~${Math.round(facts.batch.ttlDays)} days (floor ${floor})`)
  if (silenceAlert) titleBits.push(`steward quiet for ${quietDays} days (T2 mark ${silenceDays})`)
  const title = titleBits.length ? `Stewardship alert: ${titleBits.join('; ')}` : 'Stewardship: all clear'

  return { facts, exitCode, status, title, headline, checks, triggers, quietDays, storageAlert, silenceAlert }
}

// ── words ───────────────────────────────────────────────────────────────────

const MARK: Record<Level, string> = { ok: '✓', info: '·', warn: '!', alert: '✗', broken: '✗' }

/** The top-up commands from docs/MECHANISMS.md, with our batch filled in. */
export function topUpRecipe(mechanismsMarkdown: string, batchId: string): string | null {
  const section = mechanismsMarkdown.split(/^## /m).find((s) => s.startsWith('Topping up from your own wallet'))
  const block = section?.match(/```sh\n([\s\S]*?)```/)?.[1]
  if (!block) return null
  return block.replace(/^BATCH=.*$/m, `BATCH=0x${stripHex(batchId)}`).trimEnd()
}

function actionLines(a: Assessment): string[] {
  const { facts } = a
  const lines: string[] = []
  const cur = facts.registry?.current
  if (a.storageAlert || (facts.input.batchId && !facts.batch && !facts.batchError)) {
    lines.push(
      'Storage: anyone may add rent to the batch, without asking the steward or the node operator',
      '(PostageStamp.topUp has no owner check). From any wallet with xBZZ and a little xDAI, see the',
      'recipe below (docs/MECHANISMS.md). The node operator can instead run `npm run cli -- storage extend --days N --yes`.',
      'Write the payment into STORAGE_LOG.md. T3 is also a succession trigger (STEWARDSHIP.md §4).',
    )
  }
  if (a.silenceAlert && cur) {
    const next = cur.next
    lines.push(
      `Silence: the libraries may start a hand-off (STEWARDSHIP.md §4-§5).${next ? ` ${next.name} (${next.address}) is the named successor: 4 of 7 seals are enough.` : ' No successor is named: 5 of 7 seals are needed.'}`,
      `  npm run cli -- succession propose --incoming ${next?.address ?? '0x…'} --trigger T2-silence`,
    )
  }
  return lines
}

export function renderText(a: Assessment, recipe: string | null): string {
  const { input } = a.facts
  const out = [
    `Stewardship watchdog, ${input.now.toISOString().replace('T', ' ').slice(0, 16)} UTC, read through ${input.gateway} with no keys`,
    '',
    a.headline,
    '',
    ...a.checks.map((c) => `  ${MARK[c.level]} ${c.label}: ${c.detail}`),
    '',
    'Charter triggers (STEWARDSHIP.md §4):',
    ...a.triggers.map((t) => `  ${t.met ? '[MET]' : '[ - ]'} ${t.id}  ${t.detail}`),
  ]
  const actions = actionLines(a)
  if (actions.length) out.push('', 'What to do:', ...actions.map((l) => `  ${l}`))
  if (recipe && a.storageAlert) out.push('', recipe.split('\n').map((l) => `    ${l}`).join('\n'))
  out.push('', `Exit code ${a.exitCode} (${a.status}).`)
  return out.join('\n')
}

export function renderIssue(a: Assessment, opts: { recipe: string | null; repoUrl: string | null; runUrl: string | null }): string {
  const { facts } = a
  const link = (path: string, anchor = '') => (opts.repoUrl ? `${opts.repoUrl}/blob/main/${path}${anchor}` : `${path}${anchor}`)
  const cur = facts.registry?.current
  const lines = [
    '<!-- lsc:watchdog -->',
    `**${a.headline}**`,
    '',
    `Checked ${facts.input.now.toISOString().slice(0, 16).replace('T', ' ')} UTC by the stewardship watchdog, reading public data through ${facts.input.gateway}. No keys, no payment, nothing written to Swarm.`,
    '',
    '| | Check | What the network says |',
    '|---|---|---|',
    ...a.checks.map((c) => `| ${MARK[c.level]} | ${c.label} | ${c.detail.replace(/\|/g, '\\|')} |`),
    '',
    '**Charter triggers** ([STEWARDSHIP.md §4](' + link('STEWARDSHIP.md', '#4-when-a-hand-off-may-begin') + '))',
    '',
    ...a.triggers.map((t) => `- ${t.met ? '**MET**' : 'not met'}: ${t.id}, ${t.label}. ${t.detail}.`),
  ]
  if (a.storageAlert || (facts.input.batchId && !facts.batch)) {
    lines.push(
      '',
      '### Keep the catalogue paid for (anyone may do this)',
      '',
      'Swarm storage is rent paid in advance. Topping up the batch is open to anyone on Gnosis Chain: `PostageStamp.topUp` has no owner check, so any library or donor can add days without asking the steward or the node operator. ' +
        `From your own wallet ([docs/MECHANISMS.md](${link('docs/MECHANISMS.md', '#topping-up-from-your-own-wallet-no-node-no-permission')})):`,
      '',
      '```sh',
      opts.recipe ?? `# see docs/MECHANISMS.md; batch 0x${facts.input.batchId ?? '…'}`,
      '```',
      '',
      'Or, on the node that owns the batch: `npm run cli -- storage extend --days 30 --yes`. Then add a line to ' +
        `[STORAGE_LOG.md](${link('STORAGE_LOG.md')}) so the other libraries can see it. This issue updates itself on the next daily check and closes when every check is clear.`,
    )
  }
  lines.push(
    '',
    '### If the steward has gone quiet',
    '',
    `A trigger only opens the door; a hand-off still needs the seals. [STEWARDSHIP.md §5](${link('STEWARDSHIP.md', '#5-how-a-hand-off-happens')}) is the procedure: ` +
      (cur?.next
        ? `the named successor is **${cur.next.name}** (\`${cur.next.address}\`), so 4 of the 7 library seals and their own acceptance are enough. `
        : 'no successor is named, so 5 of the 7 library seals are needed. ') +
      `The current steward's key is not needed. Every hand-off is recorded in [HANDOFF_LOG.md](${link('HANDOFF_LOG.md')}).`,
  )
  if (a.silenceAlert) {
    lines.push('', '```sh', `npm run cli -- succession propose --incoming ${cur?.next?.address ?? '0x…'} --trigger T2-silence`, '```')
  }
  lines.push('', `---`, `Exit code ${a.exitCode} (${a.status}).${opts.runUrl ? ` [Workflow run](${opts.runUrl}).` : ''} Re-run it yourself, no keys: \`npm run watchdog\`.`)
  return lines.join('\n')
}
