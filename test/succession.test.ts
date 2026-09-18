import { readFileSync } from 'node:fs'
import { Wallet } from 'ethers'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryFeedStore } from '../src/core/memory-feedstore.js'
import {
  acceptWith,
  buildCharter,
  draftProposal,
  performHandoff,
  publishCatalogue,
  QuorumRejected,
  sealWith,
  submitCorrection,
  SuccessionError,
} from '../src/core/operations.js'
import { makeEphemeralCast, rehearse, type Cast } from '../src/core/rehearsal.js'
import { defaultAnchor, readRegistry, resolveAll, type Anchor } from '../src/core/resolve.js'
import { LIBRARY_IDS, SeedCatalogue, type Charter, type HandoffProposal, type LibraryId } from '../src/core/schemas.js'
import { sameAddress } from '../src/core/swarm.js'

const seed = SeedCatalogue.parse(JSON.parse(readFileSync(new URL('../seed/catalogue.seed.json', import.meta.url), 'utf8')))

let store: MemoryFeedStore
let cast: Cast
let anchor: Anchor
let charter: Charter
const now = new Date('2026-09-20T00:00:00Z')

async function sealed(p: HandoffProposal, libs: LibraryId[]) {
  for (const l of libs) p = await sealWith(p, charter, l, cast.libraries[l].wallet)
  return p
}

async function genesis() {
  let p = draftProposal({
    charter, current: null, incoming: { address: cast.ngawang.address, name: 'Ngawang Dorje', library: 'hemis' },
    next: { address: cast.padma.address, name: 'Padma Chodon' }, trigger: 'T0-genesis', effectiveFrom: '2026-09-20', now,
  })
  p = await acceptWith(await sealed(p, ['hemis', 'thiksey', 'diskit', 'lamayuru']), cast.ngawang.wallet)
  return performHandoff({ store, anchor, charter, proposal: p, incoming: cast.ngawang.address, scribe: cast.scribe, now })
}

async function toPadma() {
  const current = (await readRegistry(store, anchor)).current
  const p = draftProposal({
    charter, current, incoming: { address: cast.padma.address, name: 'Padma Chodon', library: 'tabo' },
    next: null, trigger: 'T2-silence', effectiveFrom: '2026-11-20', now,
  })
  return acceptWith(p, cast.padma.wallet)
}

beforeEach(() => {
  store = new MemoryFeedStore()
  cast = makeEphemeralCast()
  anchor = defaultAnchor(cast.scribe.address)
  charter = buildCharter(Object.fromEntries(LIBRARY_IDS.map((l) => [l, cast.libraries[l].address])) as Record<LibraryId, string>)
})

describe('the whole story', () => {
  it('rehearses end to end: 3 stewards, 4 refused attempts, same registry address', async () => {
    const gen = rehearse({ store, cast, seed })
    let step = await gen.next()
    const ids: string[] = []
    while (!step.done) {
      ids.push(step.value.id)
      step = await gen.next()
    }
    const r = step.value
    expect(ids).toContain('refused-three')
    expect(r.rejectedAttempts).toHaveLength(4)
    expect(r.finalView.registry.valid.map((v) => v.entry?.steward.name)).toEqual(['Ngawang Dorje', 'Padma Chodon', 'Stanzin Namgyal'])
    expect(r.finalView.registry.entries.filter((e) => !e.ok)).toHaveLength(1)
    expect(r.finalView.catalogue?.version).toBe(4)
    expect(r.anchor.registryOwner).toBe(cast.scribe.address)

    // what the tools write out never carries a key: no private key, no mnemonic
    const written = JSON.stringify({ ...r, finalView: undefined }, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))
    const everyone = [cast.scribe, cast.ngawang, cast.padma, cast.stanzin, ...Object.values(cast.libraries)]
    for (const id of everyone) expect(written.toLowerCase()).not.toContain(id.wallet.privateKey.slice(2).toLowerCase())
    expect(written).not.toMatch(/privateKey|mnemonic|phrase/i)
  })
})

describe('the indirection readers rely on', () => {
  it('readers follow the registry to whoever is steward now, from the same starting address', async () => {
    await genesis()
    await publishCatalogue({ store, anchor, steward: cast.ngawang, seed, now })
    const before = await resolveAll(store, anchor)
    expect(before.source?.steward).toBe(cast.ngawang.address)

    await performHandoff({ store, anchor, charter, proposal: await sealed(await toPadma(), ['hemis', 'alchi', 'tabo', 'kye']), incoming: cast.padma.address, scribe: cast.scribe, now })
    const inherited = await resolveAll(store, anchor)
    expect(inherited.registry.current?.entry?.steward.address).toBe(cast.padma.address)
    expect(inherited.source?.inherited).toBe(true) // Padma hasn't published yet: readers still get the catalogue

    await publishCatalogue({ store, anchor, steward: cast.padma, seed, now })
    const after = await resolveAll(store, anchor)
    expect(after.source?.steward).toBe(cast.padma.address)
    expect(after.source?.inherited).toBe(false)
    expect(after.catalogue?.version).toBe(2)
    expect(after.anchor).toEqual(before.anchor)
  })

  it('an entry the scribe writes without seals is ignored by readers', async () => {
    const g = await genesis()
    const p = await toPadma()
    const forged = { ...g.entry, epoch: 1, kind: 'handoff', fields: p.fields, statement: p.statement, steward: p.fields.incoming, designatedSuccessor: null, previousEntry: p.fields.previous, approvals: [], acceptance: p.acceptance }
    const ref = await store.putJson('registry-entry.json', forged)
    await store.writeRef(cast.scribe, anchor.registryTopicHex, 1n, ref)
    const view = await readRegistry(store, anchor)
    expect(view.current?.entry?.steward.address).toBe(cast.ngawang.address)
    expect(view.entries[1]?.ok).toBe(false)
    expect(view.entries[1]?.problems.join()).toMatch(/0 of 4/)
  })
})

describe('who can change the steward', () => {
  it('refuses 3 of 7', async () => {
    await genesis()
    await expect(
      performHandoff({ store, anchor, charter, proposal: await sealed(await toPadma(), ['hemis', 'alchi', 'tabo']), incoming: cast.padma.address, scribe: cast.scribe, now }),
    ).rejects.toBeInstanceOf(QuorumRejected)
    expect((await readRegistry(store, anchor)).entries).toHaveLength(1)
  })

  it('the outgoing steward cannot write the registry: his key is not the scribe', async () => {
    await genesis()
    const p = await sealed(await toPadma(), ['hemis', 'alchi', 'tabo', 'kye'])
    await expect(performHandoff({ store, anchor, charter, proposal: p, incoming: cast.padma.address, scribe: cast.ngawang, now })).rejects.toMatchObject({ code: 'NOT_SCRIBE' })
  })

  it('--incoming must match the signed statement (no hardcoded successor)', async () => {
    await genesis()
    const p = await sealed(await toPadma(), ['hemis', 'alchi', 'tabo', 'kye'])
    await expect(
      performHandoff({ store, anchor, charter, proposal: p, incoming: Wallet.createRandom().address, scribe: cast.scribe, now }),
    ).rejects.toMatchObject({ code: 'INCOMING_MISMATCH' })
  })

  it('needs the incoming steward to accept', async () => {
    await genesis()
    const current = (await readRegistry(store, anchor)).current
    const p = draftProposal({ charter, current, incoming: { address: cast.padma.address, name: 'Padma', library: 'tabo' }, next: null, trigger: 'T2-silence', effectiveFrom: '2026-11-20', now })
    await expect(
      performHandoff({ store, anchor, charter, proposal: await sealed(p, ['hemis', 'alchi', 'tabo', 'kye']), incoming: cast.padma.address, scribe: cast.scribe, now }),
    ).rejects.toMatchObject({ code: 'NO_ACCEPTANCE' })
  })

  it('an undesignated successor needs five seals', async () => {
    await genesis()
    const current = (await readRegistry(store, anchor)).current
    let p = draftProposal({ charter, current, incoming: { address: cast.stanzin.address, name: 'Stanzin', library: 'thiksey' }, next: null, trigger: 'T4-removal', effectiveFrom: '2026-11-20', now })
    p = await acceptWith(await sealed(p, ['hemis', 'alchi', 'tabo', 'kye']), cast.stanzin.wallet)
    await expect(performHandoff({ store, anchor, charter, proposal: p, incoming: cast.stanzin.address, scribe: cast.scribe, now })).rejects.toBeInstanceOf(QuorumRejected)
    p = await sealed(p, ['diskit'])
    const ok = await performHandoff({ store, anchor, charter, proposal: p, incoming: cast.stanzin.address, scribe: cast.scribe, now })
    expect(ok.quorum.threshold).toBe(5)
  })

  it('a stale proposal (registry moved on) is refused', async () => {
    await genesis()
    const stale = await sealed(await toPadma(), ['hemis', 'alchi', 'tabo', 'kye'])
    await performHandoff({ store, anchor, charter, proposal: stale, incoming: cast.padma.address, scribe: cast.scribe, now })
    await expect(performHandoff({ store, anchor, charter, proposal: stale, incoming: cast.padma.address, scribe: cast.scribe, now })).rejects.toBeInstanceOf(SuccessionError)
  })

  it('a steward key that is also a library key is refused', async () => {
    let p = draftProposal({ charter, current: null, incoming: { address: cast.libraries.hemis.address, name: 'x', library: 'hemis' }, next: null, trigger: 'T0-genesis', effectiveFrom: '2026-09-20', now })
    p = await acceptWith(await sealed(p, ['hemis', 'thiksey', 'diskit', 'lamayuru']), cast.libraries.hemis.wallet)
    await expect(performHandoff({ store, anchor, charter, proposal: p, incoming: cast.libraries.hemis.address, scribe: cast.scribe, now })).rejects.toMatchObject({ code: 'IDENTITY_OVERLAP' })
  })
})

describe('publishing and correcting', () => {
  it('only the current steward can publish', async () => {
    await genesis()
    await expect(publishCatalogue({ store, anchor, steward: cast.padma, seed, now })).rejects.toMatchObject({ code: 'NOT_STEWARD' })
  })

  it('libraries correct their own shelves; other shelves become proposals; forgeries are dropped', async () => {
    await genesis()
    await publishCatalogue({ store, anchor, steward: cast.ngawang, seed, now })
    const taboRec = seed.records.find((r) => r.library === 'tabo')!
    const hemisRec = seed.records.find((r) => r.library === 'hemis')!
    await submitCorrection({ store, anchor, library: cast.libraries.tabo, libraryId: 'tabo', recordId: taboRec.id, changes: { condition: 'missing' }, now })
    await submitCorrection({ store, anchor, library: cast.libraries.tabo, libraryId: 'tabo', recordId: hemisRec.id, changes: { condition: 'missing' }, now })
    // Kye's key posting a "Tabo" correction on Kye's own feed: wrong library, dropped
    await submitCorrection({ store, anchor, library: cast.libraries.kye, libraryId: 'tabo', recordId: taboRec.id, changes: { condition: 'good' }, now })

    const view = await resolveAll(store, anchor)
    expect(view.pending.filter((p) => p.verified)).toHaveLength(2)
    expect(view.pending.find((p) => !p.verified)?.problem).toMatch(/different library/)

    const v2 = await publishCatalogue({ store, anchor, steward: cast.ngawang, seed, now })
    expect(v2.applied).toBe(1)
    expect(v2.proposed).toBe(1)
    expect(v2.catalogue.records.find((r) => r.id === taboRec.id)?.condition).toBe('missing')
    expect(v2.catalogue.records.find((r) => r.id === hemisRec.id)?.condition).toBe(hemisRec.condition)
    expect((await resolveAll(store, anchor)).pending).toHaveLength(1) // only the forgery, never applied
  })

  it('feeds start at #0 and never skip or overwrite', async () => {
    const id = cast.ngawang
    await expect(store.writeRef(id, anchor.catalogueTopicHex, 1n, 'ab'.repeat(32))).rejects.toThrow(/gap/)
    await store.writeRef(id, anchor.catalogueTopicHex, 0n, 'ab'.repeat(32))
    await expect(store.writeRef(id, anchor.catalogueTopicHex, 0n, 'cd'.repeat(32))).rejects.toThrow(/cannot be overwritten/)
    expect(sameAddress(id.address, cast.ngawang.address)).toBe(true)
  })
})
