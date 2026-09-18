import { getAddress, verifyMessage, type Wallet } from 'ethers'
import type { Approval, Charter, LibraryId, RegistryEntry } from './schemas.js'
import { sameAddress } from './swarm.js'

/**
 * Human-facing signatures are plain EIP-191 `personal_sign` over readable text,
 * so a committee member can sign in MetaMask, Frame or a hardware wallet and
 * paste the result. (bee-js's PrivateKey.sign is only used for feed chunks.)
 */
export async function signText(wallet: Wallet, text: string): Promise<string> {
  return wallet.signMessage(text)
}

export function recoverSigner(text: string, signature: string): string | null {
  try {
    return getAddress(verifyMessage(text, signature))
  } catch {
    return null
  }
}

export interface QuorumResult {
  ok: boolean
  threshold: number
  counted: { library: LibraryId; address: string }[]
  rejected: { library: string; address: string; reason: string }[]
}

/**
 * Counts valid seals on a statement. A seal counts only if it names a charter
 * member, the address matches the charter, the signature recovers to that
 * address, and the library hasn't already been counted.
 */
export function verifyQuorum(statement: string, approvals: Approval[], charter: Charter, threshold: number): QuorumResult {
  const counted: QuorumResult['counted'] = []
  const rejected: QuorumResult['rejected'] = []
  for (const a of approvals) {
    const member = charter.members.find((m) => m.id === a.library)
    const reject = (reason: string) => rejected.push({ library: a.library, address: a.address, reason })
    if (!member) {
      reject('not a charter member')
    } else if (!sameAddress(member.address, a.address)) {
      reject(`address is not ${member.id}'s key in the charter`)
    } else if (!sameAddress(recoverSigner(statement, a.signature), member.address)) {
      reject('signature does not recover to the library key')
    } else if (counted.some((c) => c.library === a.library)) {
      reject('duplicate seal from the same library')
    } else {
      counted.push({ library: member.id, address: member.address })
    }
  }
  return { ok: counted.length >= threshold, threshold, counted, rejected }
}

/**
 * How many seals a hand-off needs. Handing over to the successor the previous
 * steward themselves named (in their signed acceptance) needs the ordinary
 * threshold; handing over to anyone else is a bigger decision and needs more.
 */
export function requiredThreshold(charter: Charter, previous: RegistryEntry | null, incoming: string): number {
  if (!previous) return charter.threshold
  return sameAddress(previous.designatedSuccessor?.address, incoming) ? charter.threshold : charter.undesignatedThreshold
}
