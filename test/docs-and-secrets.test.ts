import { readFileSync } from 'node:fs'
import { Wallet } from 'ethers'
import { describe, expect, it } from 'vitest'
import { buildCharter } from '../src/core/operations.js'
import { LIBRARY_IDS, type LibraryId } from '../src/core/schemas.js'
import { evaluateTriggers } from '../src/core/triggers.js'
import { auditSecrets } from '../src/node/audit.js'
import {
  loadConfig,
  renderAnchorBlock,
  renderIdentitiesBlock,
  renderStatusBlock,
  renderSuccessorBlock,
  type StewardshipConfig,
} from '../src/node/config.js'
import { assertIdentitiesSeparated } from '../src/node/identities.js'

const stewardship = readFileSync(new URL('../STEWARDSHIP.md', import.meta.url), 'utf8')

describe('STEWARDSHIP.md', () => {
  it('names a successor and states the triggers', () => {
    expect(stewardship).toMatch(/<!-- lsc:successor -->[\s\S]*Designated successor[\s\S]*<!-- \/lsc:successor -->/)
    for (const t of ['T1', 'T2', 'T3', 'T4']) expect(stewardship).toContain(t)
    expect(stewardship).toMatch(/60 days/)
  })

  it('once keys exist, the successor address in the document is the one in the config', () => {
    const config = loadConfig()
    if (!config.designatedSuccessor) return // before the live ceremony the block is clearly marked as pending
    expect(stewardship).toContain(config.designatedSuccessor)
    expect(renderSuccessorBlock(config)).toContain(config.designatedSuccessor)
  })

  it('after the live ceremony every placeholder is replaced by a concrete 0x address', () => {
    const live = liveConfig()
    const docs = [renderSuccessorBlock(live), renderIdentitiesBlock(live), renderAnchorBlock(live), renderStatusBlock(live)].join('\n')
    expect(docs).not.toMatch(/not made yet|no batch yet|created by the first live hand-off|not yet in force|not yet performed/)
    const successor = renderSuccessorBlock(live)
    // the named successor, their key and the triggers, all in the same block
    expect(successor).toContain(`Stanzin Namgyal, key \`${live.designatedSuccessor}\``)
    for (const t of ['T1', 'T2', 'T3', 'T4', '60 days', '4 of the 7']) expect(successor).toContain(t)
    expect(renderStatusBlock(live)).toContain('handoffs/2026-09-20-epoch-1.json')
  })

  it('before the live ceremony the block says it is only a plan', () => {
    const fresh = { ...loadConfig(), currentSteward: null, designatedSuccessor: null, history: [] }
    expect(renderSuccessorBlock(fresh)).toMatch(/planned, not yet in force/)
  })

  it('says plainly that storage custody is not separated on a shared node', () => {
    expect(stewardship.toLowerCase()).toContain('custody')
    expect(stewardship).toMatch(/one shared (Bee )?node/i)
  })
})

describe('triggers', () => {
  const charter = buildCharter(Object.fromEntries(LIBRARY_IDS.map((l) => [l, Wallet.createRandom().address])) as Record<LibraryId, string>)
  it('silence needs both 60 quiet days and two unanswered libraries', () => {
    const now = new Date('2026-12-01T00:00:00Z')
    const quiet = evaluateTriggers({ charter, now, lastPublishedAt: '2026-09-01T00:00:00Z', ttlDays: 100, unansweredLibraries: 2 })
    expect(quiet.find((t) => t.id === 'T2-silence')?.met).toBe(true)
    const notAsked = evaluateTriggers({ charter, now, lastPublishedAt: '2026-09-01T00:00:00Z', ttlDays: 100, unansweredLibraries: 1 })
    expect(notAsked.find((t) => t.id === 'T2-silence')?.met).toBe(false)
    const lowTtl = evaluateTriggers({ charter, now, lastPublishedAt: '2026-11-30T00:00:00Z', ttlDays: 12 })
    expect(lowTtl.find((t) => t.id === 'T3-storage')?.met).toBe(true)
  })
})

describe('identities', () => {
  it('refuses a config where the payer is also a steward', () => {
    const config = loadConfig()
    const shared = Wallet.createRandom().address
    const bad = { ...config, stewards: config.stewards.map((s, i) => (i === 0 ? { ...s, address: shared } : s)) }
    expect(() => assertIdentitiesSeparated(bad, shared)).toThrow(/Identity overlap/)
  })
})

describe('secret audit', () => {
  it('the repository is clean', () => {
    expect(auditSecrets()).toEqual([])
  })
})

/** What stewardship.config.json looks like after `ceremony --live`, with throwaway addresses. */
function liveConfig(): StewardshipConfig {
  const c = structuredClone(loadConfig())
  const addr = () => Wallet.createRandom().address
  c.status = 'live'
  c.payer.nodeAddress = addr()
  c.payer.batchId = 'ab'.repeat(32)
  c.council.scribe.address = addr()
  c.registryManifest = 'cd'.repeat(32)
  for (const l of c.libraries) l.address = addr()
  for (const s of c.stewards) s.address = addr()
  const [ngawang, padma, stanzin] = c.stewards
  c.currentSteward = padma!.address
  c.designatedSuccessor = stanzin!.address
  c.history = [
    { epoch: 0, steward: ngawang!.address!, stewardName: ngawang!.name, registryFeedIndex: 0, entryReference: 'ef'.repeat(32), record: 'handoffs/2026-09-20-epoch-0.json', at: '2026-09-20T10:00:00.000Z' },
    { epoch: 1, steward: padma!.address!, stewardName: padma!.name, registryFeedIndex: 1, entryReference: 'fe'.repeat(32), record: 'handoffs/2026-09-20-epoch-1.json', at: '2026-09-20T10:30:00.000Z' },
  ]
  return c
}
