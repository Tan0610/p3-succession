import type { Wallet } from 'ethers'

/**
 * An identity that can sign. The private key lives inside the ethers Wallet and
 * is never serialised: evidence files are built from `address` only.
 */
export interface Identity {
  name: string
  address: string
  wallet: Wallet
}

export interface SocProof {
  socAddress: string
  owner: string
  signature: string
  identifier: string
}

export interface CollectionFile {
  path: string
  contentType: string
  bytes: Uint8Array
}

/** Everything a *reader* needs. No keys, no postage batch. */
export interface FeedReadStore {
  readonly label: string
  /** Latest update index of a feed, or `null` when the feed has no updates yet. */
  latestIndex(owner: string, topicHex: string): Promise<bigint | null>
  /** Reference stored in the feed update at `index`. */
  readRefAt(owner: string, topicHex: string, index: bigint): Promise<string>
  /** JSON document behind a reference (a file manifest, or `path` inside a collection). */
  readJson(ref: string, path?: string): Promise<unknown>
  /** Signed single-owner-chunk behind a feed update, for evidence. */
  socProof?(owner: string, topicHex: string, index: bigint): Promise<SocProof>
}

/**
 * Writing needs two different things, and they come from two different parties:
 *  - uploads and feed chunks are *stamped* with the payer's postage batch
 *    (the store is constructed with it), and
 *  - feed chunks are *signed* by whichever Identity is passed to writeRef.
 */
export interface FeedWriteStore extends FeedReadStore {
  putJson(name: string, value: unknown): Promise<string>
  putCollection(files: CollectionFile[], indexDocument: string): Promise<string>
  writeRef(signer: Identity, topicHex: string, index: bigint, ref: string): Promise<{ socAddress: string }>
  createFeedManifest(topicHex: string, owner: string): Promise<string>
}

/**
 * Next index for a feed, resolved from the network immediately before writing.
 * An empty feed (`null`) starts at 0. Never taken from a local counter.
 */
export async function resolveNextIndex(
  store: FeedReadStore,
  owner: string,
  topicHex: string,
): Promise<{ latest: bigint | null; next: bigint }> {
  const latest = await store.latestIndex(owner, topicHex)
  return { latest, next: latest === null ? 0n : latest + 1n }
}
