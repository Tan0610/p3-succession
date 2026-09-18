import { PrivateKey } from '@ethersphere/bee-js'
import { getBytes, keccak256, Wallet } from 'ethers'
import { describe, expect, it } from 'vitest'
import { buildCharter, draftProposal } from '../src/core/operations.js'
import { LIBRARY_IDS, type Approval, type LibraryId } from '../src/core/schemas.js'
import { recoverSigner, requiredThreshold, signText, verifyQuorum } from '../src/core/signatures.js'

const wallets = Object.fromEntries(LIBRARY_IDS.map((l) => [l, Wallet.createRandom()])) as unknown as Record<LibraryId, Wallet>
const charter = buildCharter(Object.fromEntries(LIBRARY_IDS.map((l) => [l, wallets[l].address])) as Record<LibraryId, string>)
const statement = 'Ladakh–Spiti test statement'
const sealBy = async (l: LibraryId, w: Wallet = wallets[l]): Promise<Approval> => ({
  library: l,
  address: wallets[l].address,
  signature: await signText(w, statement),
})

describe('bee-js signing vs ethers signing', () => {
  it('PrivateKey.sign(x) == ethers signMessage(keccak256(x))', async () => {
    const w = Wallet.createRandom()
    const data = new TextEncoder().encode('lsc cross-check')
    const beeSig = new PrivateKey(w.privateKey).sign(data).toHex()
    const ethersSig = await w.signMessage(getBytes(keccak256(data)))
    expect(beeSig).toBe(ethersSig.slice(2).toLowerCase())
    expect(new PrivateKey(w.privateKey).publicKey().address().toChecksum()).toBe(w.address)
  })

  it('human seals are plain EIP-191 over the readable text', async () => {
    const w = Wallet.createRandom()
    expect(recoverSigner(statement, await signText(w, statement))).toBe(w.address)
    expect(recoverSigner(statement + ' ', await signText(w, statement))).not.toBe(w.address)
    expect(recoverSigner(statement, '0x1234')).toBeNull()
  })
})

describe('quorum', () => {
  it('4 distinct valid seals pass', async () => {
    const q = verifyQuorum(statement, await Promise.all((['hemis', 'tabo', 'kye', 'alchi'] as const).map((l) => sealBy(l))), charter, 4)
    expect(q.ok).toBe(true)
    expect(q.counted).toHaveLength(4)
  })

  it('3 of 7 is refused', async () => {
    const q = verifyQuorum(statement, await Promise.all((['hemis', 'tabo', 'kye'] as const).map((l) => sealBy(l))), charter, 4)
    expect(q.ok).toBe(false)
    expect(q.counted).toHaveLength(3)
  })

  it('the steward signing for a library does not count', async () => {
    const steward = Wallet.createRandom()
    const q = verifyQuorum(statement, [await sealBy('hemis', steward)], charter, 4)
    expect(q.counted).toHaveLength(0)
    expect(q.rejected[0]?.reason).toMatch(/does not recover/)
  })

  it('a library sealing twice counts once', async () => {
    const s = await sealBy('tabo')
    const q = verifyQuorum(statement, [s, s, s, s], charter, 4)
    expect(q.counted).toHaveLength(1)
    expect(q.rejected.map((r) => r.reason)).toContain('duplicate seal from the same library')
  })

  it('an address that is not the charter key is rejected', async () => {
    const outsider = Wallet.createRandom()
    const q = verifyQuorum(statement, [{ library: 'kye', address: outsider.address, signature: await signText(outsider, statement) }], charter, 4)
    expect(q.rejected[0]?.reason).toMatch(/not kye's key/)
  })

  it('handing over to the named successor needs 4, anyone else needs 5', () => {
    const named = Wallet.createRandom().address
    const p = draftProposal({
      charter, current: null, incoming: { address: Wallet.createRandom().address, name: 'A', library: null },
      next: { address: named, name: 'B' }, trigger: 'T0-genesis', effectiveFrom: '2026-09-20', now: new Date(),
    })
    const previous = { designatedSuccessor: p.fields.next } as Parameters<typeof requiredThreshold>[1]
    expect(requiredThreshold(charter, null, named)).toBe(4)
    expect(requiredThreshold(charter, previous, named)).toBe(4)
    expect(requiredThreshold(charter, previous, Wallet.createRandom().address)).toBe(5)
  })
})
