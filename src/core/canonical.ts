import { keccak256, toUtf8Bytes } from 'ethers'

/**
 * Canonical JSON: object keys sorted, `undefined` dropped, no whitespace.
 * Everything that gets hashed or signed goes through this, so two machines that
 * build "the same" document always produce the same bytes.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = canonicalize(v)
    }
    return out
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`canonical JSON only carries integers, got ${value}`)
  }
  return value
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

/** keccak256 of UTF-8 text, 0x-prefixed. */
export function keccakText(text: string): string {
  return keccak256(toUtf8Bytes(text))
}

export function hashCanonical(value: unknown): string {
  return keccakText(canonicalJson(value))
}

export function utf8(value: string): Uint8Array {
  return toUtf8Bytes(value)
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2) + '\n'
}
