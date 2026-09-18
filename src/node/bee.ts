import { Bee, BeeResponseError, FeedIndex, PrivateKey } from '@ethersphere/bee-js'
import type { CollectionFile, FeedWriteStore, Identity, SocProof } from '../core/feedstore.js'
import { feedUpdateAddress } from '../core/swarm.js'

export function makeBee(url: string): Bee {
  return new Bee(url, { network: 'gnosis' })
}

const isNotFound = (e: unknown) => e instanceof BeeResponseError && e.status === 404

/**
 * The real store, backed by a Bee node through bee-js 13.1.0.
 *
 * Two identities meet here and stay separate:
 *  - PAYING: `batchId` is a postage batch owned by the node's wallet (the payer).
 *    Every upload and every feed chunk is stamped with it.
 *  - SIGNING: `writeRef(signer, …)` signs the feed chunk with the steward's /
 *    library's / scribe's own key. The node's key never signs catalogue updates.
 */
export class BeeFeedStore implements FeedWriteStore {
  readonly label: string

  constructor(
    readonly bee: Bee,
    private readonly batchId: string | null,
  ) {
    this.label = `bee node at ${bee.url}`
  }

  private stamp(): string {
    if (!this.batchId) {
      throw new Error('No postage batch configured. Run `npm run cli -- storage buy` or `storage use <batchId>` first.')
    }
    return this.batchId
  }

  async latestIndex(owner: string, topicHex: string): Promise<bigint | null> {
    try {
      const update = await this.bee.feed.makeReader(topicHex, owner).downloadReference()
      return update.feedIndex.toBigInt()
    } catch (e) {
      // A feed with no updates yet answers 404: that is "start at #0", not an error.
      if (isNotFound(e)) return null
      throw e
    }
  }

  async readRefAt(owner: string, topicHex: string, index: bigint): Promise<string> {
    const update = await this.bee.feed.makeReader(topicHex, owner).downloadReference({ index: FeedIndex.fromBigInt(index) })
    return update.reference.toHex()
  }

  async readJson(ref: string, path?: string): Promise<unknown> {
    const file = await this.bee.file.download(ref, path)
    return JSON.parse(file.data.toUtf8())
  }

  async socProof(owner: string, topicHex: string, index: bigint): Promise<SocProof> {
    const address = feedUpdateAddress(owner, topicHex, index)
    const data = await this.bee.chunk.download(address)
    // unmarshal verifies the signature and that it recovers to the SOC's owner
    const soc = this.bee.unmarshalSingleOwnerChunk(data, address)
    return {
      socAddress: address,
      owner: soc.owner.toChecksum(),
      signature: `0x${soc.signature.toHex()}`,
      identifier: soc.identifier.toHex(),
    }
  }

  async putJson(name: string, value: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2))
    const stamp = this.stamp()
    const result = await this.bee.file.upload(stamp, bytes, name, { contentType: 'application/json' })
    return result.reference.toHex()
  }

  async putCollection(files: CollectionFile[], indexDocument: string): Promise<string> {
    const stamp = this.stamp()
    const entries = files.map((f) => ({
      path: f.path, // flat names only: no directory separators, so no Windows path issues
      size: f.bytes.length,
      file: new File([f.bytes as Uint8Array<ArrayBuffer>], f.path, { type: f.contentType }),
    }))
    const result = await this.bee.collection.upload(stamp, entries, { indexDocument })
    return result.reference.toHex()
  }

  async writeRef(signer: Identity, topicHex: string, index: bigint, ref: string): Promise<{ socAddress: string }> {
    const stamp = this.stamp()
    const writer = this.bee.feed.makeWriter(topicHex, new PrivateKey(signer.wallet.privateKey))
    // The index is always explicit, resolved from the network by the caller just before this call.
    const result = await writer.uploadReference(stamp, ref, { index: FeedIndex.fromBigInt(index) })
    return { socAddress: result.reference.toHex() }
  }

  async createFeedManifest(topicHex: string, owner: string): Promise<string> {
    const stamp = this.stamp()
    const ref = await this.bee.feed.createManifest(stamp, topicHex, owner)
    return ref.toHex()
  }
}
