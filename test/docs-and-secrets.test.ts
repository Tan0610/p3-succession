import { readFileSync } from 'node:fs'
import { HDNodeWallet, Wallet } from 'ethers'
import { describe, expect, it } from 'vitest'
import { buildCharter } from '../src/core/operations.js'
import { LIBRARY_IDS, type LibraryId } from '../src/core/schemas.js'
import { evaluateTriggers } from '../src/core/triggers.js'
import { auditSecrets, scanText } from '../src/node/audit.js'
import {
  loadConfig,
  PENDING_MARKERS,
  renderAnchorBlock,
  renderCurlBlock,
  renderDocs,
  renderIdentitiesBlock,
  renderStatusBlock,
  renderSuccessorBlock,
  SYNCED_DOCS,
  type StewardshipConfig,
} from '../src/node/config.js'
import { assertIdentitiesSeparated } from '../src/node/identities.js'
import { repoPath } from '../src/node/paths.js'

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
    expect(docs).not.toMatch(PENDING_MARKERS)
    const successor = renderSuccessorBlock(live)
    // the named successor, their key and the triggers, all in the same block
    expect(successor).toContain(`Stanzin Namgyal, key \`${live.designatedSuccessor}\``)
    for (const t of ['T1', 'T2', 'T3', 'T4', '60 days', '4 of the 7']) expect(successor).toContain(t)
    expect(renderStatusBlock(live)).toContain('handoffs/2026-09-20-epoch-1.json')
    // a stranger gets copy-paste commands for the registry and the current steward's catalogue
    expect(renderCurlBlock(live)).toContain(`/bzz/${live.registryManifest}/`)
    expect(renderCurlBlock(live)).toContain(`/bzz/${'34'.repeat(32)}/catalogue.json`)
  })

  it('after the live ceremony no placeholder is left anywhere in the tracked documents', () => {
    const live = liveConfig()
    for (const path of SYNCED_DOCS) {
      const before = readFileSync(path, 'utf8')
      const after = renderDocs(before, live)
      expect(after, repoPath(path)).not.toEqual(before)
      expect(after.split('\n').filter((l) => PENDING_MARKERS.test(l)), repoPath(path)).toEqual([])
    }
  })

  it('before the live ceremony every generated block says plainly that it is waiting for it', () => {
    if (loadConfig().status === 'live') return
    for (const path of SYNCED_DOCS) {
      for (const [, name, body] of readFileSync(path, 'utf8').matchAll(/<!-- lsc:(\w+) -->([\s\S]*?)<!-- \/lsc:\1 -->/g)) {
        expect(body, `${repoPath(path)} lsc:${name}`).toMatch(PENDING_MARKERS)
      }
    }
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

  // Every key below is made at runtime, so this file never holds one.
  const kinds = (text: string, roles = new Set<string>()) => scanText('x', text, [], roles).map((h) => h.kind)

  it('flags 32 bytes of hex under any key-like name', () => {
    const hex = Wallet.createRandom().privateKey
    expect(kinds(`LSC_KEY_STEWARD_PADMA=${hex}`)).toContain('32-byte hex assigned to a key-like name')
    expect(kinds(`const pk = "${hex.slice(2)}"`)).toContain('32-byte hex assigned to a key-like name')
    expect(kinds(`new Wallet('${hex}')`)).toContain('ethers Wallet built from a literal key')
  })

  it('flags the private key of any role address, whatever it is called', () => {
    const w = Wallet.createRandom()
    expect(kinds(`"reference": "${w.privateKey.slice(2)}"`, new Set([w.address.toLowerCase()]))).toContain(
      'the private key of a role address in stewardship.config.json',
    )
  })

  it('flags the well-known Hardhat/Anvil development keys', () => {
    const phrase = [...Array(11).fill('test'), 'junk'].join(' ')
    const dev = HDNodeWallet.fromPhrase(phrase, undefined, "m/44'/60'/0'/0/0")
    expect(kinds(`const fixture = '${dev.privateKey}'`)).toContain('a well-known development private key (Hardhat/Anvil)')
  })

  it('leaves topic hashes, references and addresses alone', () => {
    expect(kinds(`"hex": "${'5585bf7626ca42b72333dfda4e6a6bf7118861a23e4e2b026a727e0e9db1249f'}"`)).toEqual([])
    expect(kinds(`registry owner : ${Wallet.createRandom().address}`)).toEqual([])
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
  c.catalogueManifests = { [ngawang!.address!]: '12'.repeat(32), [padma!.address!]: '34'.repeat(32) }
  c.history = [
    { epoch: 0, steward: ngawang!.address!, stewardName: ngawang!.name, registryFeedIndex: 0, entryReference: 'ef'.repeat(32), record: 'handoffs/2026-09-20-epoch-0.json', at: '2026-09-20T10:00:00.000Z' },
    { epoch: 1, steward: padma!.address!, stewardName: padma!.name, registryFeedIndex: 1, entryReference: 'fe'.repeat(32), record: 'handoffs/2026-09-20-epoch-1.json', at: '2026-09-20T10:30:00.000Z' },
  ]
  return c
}
