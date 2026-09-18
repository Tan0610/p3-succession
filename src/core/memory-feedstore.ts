import { concat, getBytes, keccak256 } from 'ethers'
import { canonicalJson, keccakText } from './canonical.js'
import type { CollectionFile, FeedWriteStore, Identity, SocProof } from './feedstore.js'
import { feedIdentifier, hex0x, socAddress, stripHex } from './swarm.js'

interface Update {
  ref: string
  proof: SocProof
}

/**
 * In-memory stand-in for a Bee node, used by tests, `ceremony --rehearse` and
 * the in-browser rehearsal. It keeps Swarm's important rules: a feed update at
 * an index can be written once (SOCs are immutable) and indexes have no gaps.
 * Content references are keccak hashes of the content, not real BMT hashes.
 */
export class MemoryFeedStore implements FeedWriteStore {
  readonly label = 'memory (rehearsal: nothing leaves this process)'
  private feeds = new Map<string, Update[]>()
  private blobs = new Map<string, { json?: unknown; files?: Map<string, unknown> }>()
  private manifests = new Map<string, { owner: string; topic: string }>()

  private key(owner: string, topic: string) {
    return `${stripHex(owner)}/${stripHex(topic)}`
  }

  async latestIndex(owner: string, topicHex: string): Promise<bigint | null> {
    const updates = this.feeds.get(this.key(owner, topicHex))
    return updates && updates.length > 0 ? BigInt(updates.length - 1) : null
  }

  async readRefAt(owner: string, topicHex: string, index: bigint): Promise<string> {
    const update = this.feeds.get(this.key(owner, topicHex))?.[Number(index)]
    if (!update) throw new Error(`404: no feed update at index ${index}`)
    return update.ref
  }

  async readJson(ref: string, path?: string): Promise<unknown> {
    const manifest = this.manifests.get(ref)
    if (manifest) {
      const latest = await this.latestIndex(manifest.owner, manifest.topic)
      if (latest === null) throw new Error('404: feed manifest points at an empty feed')
      return this.readJson(await this.readRefAt(manifest.owner, manifest.topic, latest), path)
    }
    const blob = this.blobs.get(ref)
    if (!blob) throw new Error(`404: ${ref} not found`)
    if (blob.files) {
      const file = blob.files.get(path ?? 'catalogue.json')
      if (file === undefined) throw new Error(`404: ${path} not in collection`)
      return structuredClone(file)
    }
    return structuredClone(blob.json)
  }

  async socProof(owner: string, topicHex: string, index: bigint): Promise<SocProof> {
    const update = this.feeds.get(this.key(owner, topicHex))?.[Number(index)]
    if (!update) throw new Error(`404: no feed update at index ${index}`)
    return update.proof
  }

  async putJson(name: string, value: unknown): Promise<string> {
    const ref = keccakText(`${name}\n${canonicalJson(value)}`).slice(2)
    this.blobs.set(ref, { json: structuredClone(value) })
    return ref
  }

  async putCollection(files: CollectionFile[], indexDocument: string): Promise<string> {
    const map = new Map<string, unknown>()
    for (const f of files) {
      const text = new TextDecoder().decode(f.bytes)
      map.set(f.path, f.contentType.includes('json') ? JSON.parse(text) : text)
    }
    const listing = files.map((f) => `${f.path}:${keccak256(f.bytes)}`).join('\n')
    const ref = keccakText(`${indexDocument}\n${listing}`).slice(2)
    this.blobs.set(ref, { files: map })
    return ref
  }

  async writeRef(signer: Identity, topicHex: string, index: bigint, ref: string): Promise<{ socAddress: string }> {
    const k = this.key(signer.address, topicHex)
    const updates = this.feeds.get(k) ?? []
    if (index < BigInt(updates.length)) {
      throw new Error(`409: feed update #${index} already exists and cannot be overwritten`)
    }
    if (index > BigInt(updates.length)) {
      throw new Error(`400: index #${index} would leave a gap (next is #${updates.length})`)
    }
    const identifier = feedIdentifier(topicHex, index)
    const address = socAddress(identifier, signer.address)
    const digest = keccak256(concat([getBytes(hex0x(identifier)), getBytes(hex0x(ref))]))
    const signature = signer.wallet.signingKey.sign(digest).serialized
    updates.push({ ref, proof: { socAddress: address, owner: signer.address, signature, identifier } })
    this.feeds.set(k, updates)
    return { socAddress: address }
  }

  async createFeedManifest(topicHex: string, owner: string): Promise<string> {
    const ref = keccakText(`feed-manifest\n${stripHex(owner)}\n${stripHex(topicHex)}`).slice(2)
    this.manifests.set(ref, { owner, topic: topicHex })
    return ref
  }
}
