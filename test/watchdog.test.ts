import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MemoryFeedStore } from '../src/core/memory-feedstore.js'
import { acceptWith, buildCharter, draftProposal, performHandoff, publishCatalogue, sealWith } from '../src/core/operations.js'
import { makeEphemeralCast } from '../src/core/rehearsal.js'
import { defaultAnchor } from '../src/core/resolve.js'
import { LIBRARY_IDS, SeedCatalogue, type LibraryId } from '../src/core/schemas.js'
import {
  assess,
  findBatch,
  gatherFacts,
  renderIssue,
  renderText,
  topUpRecipe,
  type WatchdogFacts,
} from '../src/core/watchdog.js'

const BATCH = 'ab'.repeat(32)
const DAY = 86_400
const seed = SeedCatalogue.parse(JSON.parse(readFileSync(new URL('../seed/catalogue.seed.json', import.meta.url), 'utf8')))
const mechanisms = readFileSync(new URL('../docs/MECHANISMS.md', import.meta.url), 'utf8')

/** A small world in memory: genesis names Ngawang, who publishes once. */
async function world(publishedAt: Date) {
  const store = new MemoryFeedStore()
  const cast = makeEphemeralCast()
  const anchor = defaultAnchor(cast.scribe.address)
  const charter = buildCharter(Object.fromEntries(LIBRARY_IDS.map((l) => [l, cast.libraries[l].address])) as Record<LibraryId, string>)
  let p = draftProposal({
    charter, current: null, incoming: { address: cast.ngawang.address, name: 'Ngawang Dorje', library: 'hemis' },
    next: { address: cast.padma.address, name: 'Padma Chodon' }, trigger: 'T0-genesis', effectiveFrom: '2026-09-01', now: publishedAt,
  })
  for (const l of ['hemis', 'thiksey', 'diskit', 'lamayuru'] as const) p = await sealWith(p, charter, l, cast.libraries[l].wallet)
  p = await acceptWith(p, cast.ngawang.wallet)
  await performHandoff({ store, anchor, charter, proposal: p, incoming: cast.ngawang.address, scribe: cast.scribe, now: publishedAt })
  await publishCatalogue({ store, anchor, steward: cast.ngawang, seed, now: publishedAt })
  return { store, anchor, cast }
}

/** Answers GET /batches with our batch at `ttlDays`, or leaves it out. */
const gateway = (ttlDays: number | null) => async (url: string) => {
  if (url.endsWith('/batches')) {
    const rows = [{ batchID: 'cd'.repeat(32), batchTTL: 99 * DAY, depth: 20, owner: '11'.repeat(20) }]
    if (ttlDays !== null) rows.push({ batchID: BATCH, batchTTL: ttlDays * DAY, depth: 18, owner: '22'.repeat(20) })
    return new Response(JSON.stringify(rows), { status: 200 })
  }
  return new Response('Not Found', { status: 404 })
}

async function run(opts: { publishedAt: string; now: string; ttlDays: number | null; unanswered?: number }) {
  const { store, anchor } = await world(new Date(opts.publishedAt))
  const facts = await gatherFacts(store, gateway(opts.ttlDays), {
    gateway: 'https://gateway.test', anchor, registryTopic: 'lsc/registry/v1', registryManifest: null, batchId: BATCH,
    payerAddress: `0x${'22'.repeat(20)}`, fallbackCharter: null, unansweredLibraries: opts.unanswered ?? 0, now: new Date(opts.now),
  })
  return assess(facts)
}

describe('watchdog: finding the batch in GET /batches', () => {
  const rows = [
    { batchID: 'cd'.repeat(32), batchTTL: 100, depth: 17, owner: 'aa'.repeat(20) },
    { batchID: BATCH, batchTTL: 1_292_678, depth: 18, owner: '9452a51f8b43239b8572c08253e4b7ecaf339cb8', immutable: true },
  ]
  it('reads the TTL of our batch from a bare array (what the public gateway returns)', () => {
    const b = findBatch(rows, `0x${BATCH.toUpperCase()}`)
    expect(b?.ttlSeconds).toBe(1_292_678)
    expect(b?.ttlDays).toBeCloseTo(14.96, 2)
    expect(b?.owner).toBe('0x9452a51f8b43239b8572c08253e4b7ecaf339cb8')
  })
  it('also accepts { batches: [...] } and says null when the batch is not live', () => {
    expect(findBatch({ batches: rows }, BATCH)?.depth).toBe(18)
    expect(findBatch(rows.slice(0, 1), BATCH)).toBeNull()
    expect(() => findBatch({ nope: 1 }, BATCH)).toThrow(/list of batches/)
  })
})

describe('watchdog: judging what the network says', () => {
  it('all clear: reachable, publishing, well paid for → exit 0', async () => {
    const a = await run({ publishedAt: '2026-09-01T00:00:00Z', now: '2026-09-10T00:00:00Z', ttlDays: 90 })
    expect(a.exitCode).toBe(0)
    expect(a.status).toBe('all-clear')
    expect(a.headline).toMatch(/^Catalogue reachable ✓, current steward Ngawang Dorje, last update 9 day\(s\) ago, storage paid ~90 days — all clear$/)
    expect(a.triggers.every((t) => !t.met)).toBe(true)
  })

  it('T3: under the 30-day floor → exit 1, and the report says anyone may top up', async () => {
    const a = await run({ publishedAt: '2026-09-01T00:00:00Z', now: '2026-09-02T00:00:00Z', ttlDays: 15 })
    expect(a.exitCode).toBe(1)
    expect(a.storageAlert).toBe(true)
    expect(a.triggers.find((t) => t.id === 'T3-storage')?.met).toBe(true)
    expect(a.title).toBe('Stewardship alert: T3 met, storage paid for ~15 days (floor 30)')
    expect(a.headline).toContain('T3 MET: any library may top up')
    const recipe = topUpRecipe(mechanisms, BATCH)
    const text = renderText(a, recipe)
    expect(text).toContain(`BATCH=0x${BATCH}`)
    const issue = renderIssue(a, { recipe, repoUrl: 'https://github.com/x/y', runUrl: null })
    expect(issue).toContain('topUp(bytes32,uint256)')
    expect(issue).toContain('https://github.com/x/y/blob/main/STEWARDSHIP.md#5-how-a-hand-off-happens')
    expect(issue).toContain('Padma Chodon')
  })

  it('T2: 60 quiet days raise the alarm; T2 itself is met only when two libraries report no reply', async () => {
    const quiet = await run({ publishedAt: '2026-09-01T00:00:00Z', now: '2026-11-05T00:00:00Z', ttlDays: 90 })
    expect(quiet.exitCode).toBe(1)
    expect(quiet.silenceAlert).toBe(true)
    expect(quiet.quietDays).toBe(65)
    expect(quiet.triggers.find((t) => t.id === 'T2-silence')?.met).toBe(false)
    expect(quiet.title).toContain('steward quiet for 65 days')
    const asked = await run({ publishedAt: '2026-09-01T00:00:00Z', now: '2026-11-05T00:00:00Z', ttlDays: 90, unanswered: 2 })
    expect(asked.triggers.find((t) => t.id === 'T2-silence')?.met).toBe(true)
    expect(renderText(asked, null)).toContain('succession propose --incoming')
  })

  it('a batch missing from the live list is not a warning, it is unconfirmed storage → exit 2', async () => {
    const a = await run({ publishedAt: '2026-09-01T00:00:00Z', now: '2026-09-02T00:00:00Z', ttlDays: null })
    expect(a.exitCode).toBe(2)
    expect(a.checks.find((c) => c.label === 'Storage paid for')?.detail).toMatch(/not in the network's list/)
  })

  it('an unreadable register → exit 2, with no steward claimed', () => {
    const facts: WatchdogFacts = {
      input: {
        gateway: 'https://gateway.test', anchor: defaultAnchor(`0x${'33'.repeat(20)}`), registryTopic: 'lsc/registry/v1', registryManifest: null,
        batchId: BATCH, payerAddress: null, fallbackCharter: null, unansweredLibraries: 0, now: new Date('2026-09-02T00:00:00Z'),
      },
      registry: null, registryError: 'fetch failed', manifest: null, manifestError: null, catalogue: null, catalogueError: null,
      pendingCorrections: null, charter: null, charterSource: null, batch: null, batchError: 'fetch failed',
    }
    const a = assess(facts)
    expect(a.exitCode).toBe(2)
    expect(a.headline).toMatch(/^Catalogue NOT confirmed reachable ✗/)
    expect(a.title).toBe('Stewardship alert: catalogue not confirmed reachable')
  })
})

describe('watchdog: the top-up recipe comes from docs/MECHANISMS.md', () => {
  it('fills in the batch and keeps the permissionless topUp call', () => {
    const recipe = topUpRecipe(mechanisms, `0x${BATCH}`)
    expect(recipe).toContain(`BATCH=0x${BATCH}`)
    expect(recipe).not.toContain('<"postage batch"')
    expect(recipe).toContain('cast send $POSTAGE "topUp(bytes32,uint256)" $BATCH $PER_CHUNK')
    expect(topUpRecipe('# nothing here', BATCH)).toBeNull()
  })
})
