import { concat, getBytes, getAddress, keccak256, toUtf8Bytes } from 'ethers'

/**
 * The few bits of Swarm feed arithmetic a reader needs, written out so that a
 * third party can resolve our feeds without bee-js. They match bee-js 13.1.0:
 *   topic       = keccak256(utf8(topicString))                  (Topic.fromString)
 *   identifier  = keccak256(topic ‖ uint64_be(index))            (makeFeedIdentifier)
 *   soc address = keccak256(identifier ‖ owner20)                (makeSOCAddress)
 * test/swarm.test.ts checks all three against bee-js / core-sdk.
 */
export const TOPICS = {
  registry: 'lsc/registry/v1',
  catalogue: 'lsc/catalogue/v1',
  corrections: 'lsc/corrections/v1',
} as const

export type TopicName = keyof typeof TOPICS

export function topicHex(topicString: string): string {
  return keccak256(toUtf8Bytes(topicString)).slice(2)
}

export function uint64be(index: bigint): Uint8Array {
  const out = new Uint8Array(8)
  new DataView(out.buffer).setBigUint64(0, index, false)
  return out
}

export function feedIdentifier(topic: string, index: bigint): string {
  return keccak256(concat([getBytes(hex0x(topic)), uint64be(index)])).slice(2)
}

export function socAddress(identifier: string, owner: string): string {
  return keccak256(concat([getBytes(hex0x(identifier)), getBytes(getAddress(owner))])).slice(2)
}

export function feedUpdateAddress(owner: string, topic: string, index: bigint): string {
  return socAddress(feedIdentifier(topic, index), owner)
}

export function hex0x(hex: string): string {
  return hex.startsWith('0x') ? hex : `0x${hex}`
}

export function stripHex(hex: string): string {
  return (hex.startsWith('0x') ? hex.slice(2) : hex).toLowerCase()
}

export function checksum(address: string): string {
  return getAddress(address)
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return stripHex(a) === stripHex(b)
}

export function shortHex(hex: string, head = 6, tail = 4): string {
  const h = hex.startsWith('0x') ? hex : `0x${hex}`
  return h.length <= head + tail + 3 ? h : `${h.slice(0, head)}…${h.slice(-tail)}`
}
