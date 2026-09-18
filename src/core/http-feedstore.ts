import { hexlify } from 'ethers'
import type { FeedReadStore, SocProof } from './feedstore.js'
import { feedIdentifier, feedUpdateAddress, stripHex } from './swarm.js'

type Fetcher = (input: string) => Promise<Response>

/**
 * A reader that needs nothing but `fetch` and the Bee HTTP API: no bee-js, no
 * keys. The web viewer uses it (through a same-origin proxy), and it doubles as
 * a reference implementation of docs/READ_WITHOUT_US.md.
 *
 *   latest index : GET /feeds/{owner}/{topic}  -> header `swarm-feed-index` (404 = empty feed)
 *   update #i    : GET /chunks/{socAddress(i)} -> identifier(32) sig(65) span(8) ts(8) ref(32)
 *   documents    : GET /bzz/{ref}/{path}
 */
export class HttpFeedStore implements FeedReadStore {
  readonly label: string
  private readonly base: string
  private readonly fetcher: Fetcher

  constructor(base: string, fetcher?: Fetcher) {
    this.base = base.replace(/\/+$/, '')
    this.fetcher = fetcher ?? ((input) => fetch(input))
    this.label = `bee http api at ${this.base}`
  }

  async latestIndex(owner: string, topicHex: string): Promise<bigint | null> {
    const res = await this.fetcher(`${this.base}/feeds/${stripHex(owner)}/${stripHex(topicHex)}?Swarm-Only-Root-Chunk=true`)
    if (res.status === 404) return null
    const header = res.ok ? res.headers.get('swarm-feed-index') : null
    if (header) return BigInt(`0x${header}`)
    // Public gateways don't expose the index header to browsers (CORS), so find
    // the latest update by probing chunk addresses directly.
    return this.probeLatest(owner, topicHex)
  }

  private async exists(owner: string, topicHex: string, index: bigint): Promise<boolean> {
    const res = await this.fetcher(`${this.base}/chunks/${feedUpdateAddress(owner, topicHex, index)}`)
    return res.ok // gateways answer 404 or 500 for a missing chunk
  }

  /** Gallop 1, 2, 4, … until a miss, then binary-search. Feeds have no gaps. */
  async probeLatest(owner: string, topicHex: string): Promise<bigint | null> {
    if (!(await this.exists(owner, topicHex, 0n))) return null
    let lo = 0n
    let hi = 1n
    while (await this.exists(owner, topicHex, hi)) {
      lo = hi
      hi *= 2n
    }
    while (hi - lo > 1n) {
      const mid = (lo + hi) / 2n
      if (await this.exists(owner, topicHex, mid)) lo = mid
      else hi = mid
    }
    return lo
  }

  private async chunk(owner: string, topicHex: string, index: bigint): Promise<Uint8Array> {
    const res = await this.fetcher(`${this.base}/chunks/${feedUpdateAddress(owner, topicHex, index)}`)
    if (!res.ok) throw new Error(`feed update #${index} not retrievable: HTTP ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length < 32 + 65 + 8 + 8 + 32) throw new Error(`feed update #${index} is too short to hold a reference`)
    const identifier = hexlify(bytes.slice(0, 32)).slice(2)
    if (identifier !== feedIdentifier(topicHex, index)) throw new Error(`feed update #${index} has the wrong identifier`)
    return bytes
  }

  async readRefAt(owner: string, topicHex: string, index: bigint): Promise<string> {
    const bytes = await this.chunk(owner, topicHex, index)
    // identifier(32) signature(65) span(8) | payload: timestamp(8) reference(32)
    return hexlify(bytes.slice(113, 145)).slice(2)
  }

  async readJson(ref: string, path?: string): Promise<unknown> {
    const res = await this.fetcher(`${this.base}/bzz/${ref}/${path ?? ''}`)
    if (!res.ok) throw new Error(`GET /bzz/${ref}/${path ?? ''} -> HTTP ${res.status}`)
    return res.json()
  }

  async socProof(owner: string, topicHex: string, index: bigint): Promise<SocProof> {
    const bytes = await this.chunk(owner, topicHex, index)
    return {
      socAddress: feedUpdateAddress(owner, topicHex, index),
      owner,
      identifier: hexlify(bytes.slice(0, 32)).slice(2),
      signature: hexlify(bytes.slice(32, 97)),
    }
  }
}
