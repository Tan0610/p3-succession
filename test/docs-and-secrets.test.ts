import { readFileSync } from 'node:fs'
import { Wallet } from 'ethers'
import { describe, expect, it } from 'vitest'
import { buildCharter } from '../src/core/operations.js'
import { LIBRARY_IDS, type LibraryId } from '../src/core/schemas.js'
import { evaluateTriggers } from '../src/core/triggers.js'
import { auditSecrets } from '../src/node/audit.js'
import { loadConfig, renderSuccessorBlock } from '../src/node/config.js'
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
