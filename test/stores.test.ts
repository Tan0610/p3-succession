import { Bee, BeeResponseError, FeedIndex, Reference } from '@ethersphere/bee-js'
import { concat, getBytes, Wallet } from 'ethers'
import { describe, expect, it } from 'vitest'
import { resolveNextIndex } from '../src/core/feedstore.js'
import { HttpFeedStore } from '../src/core/http-feedstore.js'
import { MemoryFeedStore } from '../src/core/memory-feedstore.js'
import { feedIdentifier, feedUpdateAddress, TOPICS, topicHex, uint64be } from '../src/core/swarm.js'
import { BeeFeedStore } from '../src/node/bee.js'

const topic = topicHex(TOPICS.catalogue)
const owner = Wallet.createRandom().address

function fakeBee(behaviour: () => Promise<unknown>): Bee {
  return { url: 'http://fake', feed: { makeReader: () => ({ downloadReference: behaviour }) } } as unknown as Bee
}

describe('next index is read from the network', () => {
  it('an empty feed (404) starts at #0', async () => {
    const bee = fakeBee(async () => {
      throw new BeeResponseError('GET', 'feeds', 'no update found', undefined, 404)
    })
    expect(await resolveNextIndex(new BeeFeedStore(bee, null), owner, topic)).toEqual({ latest: null, next: 0n })
  })

  it('any other error is NOT treated as an empty feed', async () => {
    const bee = fakeBee(async () => {
      throw new BeeResponseError('GET', 'feeds', 'boom', undefined, 500)
    })
    await expect(resolveNextIndex(new BeeFeedStore(bee, null), owner, topic)).rejects.toThrow('boom')
  })

  it('an existing feed continues after its latest index', async () => {
    const bee = fakeBee(async () => ({ reference: new Reference('ab'.repeat(32)), feedIndex: FeedIndex.fromBigInt(6n), feedIndexNext: FeedIndex.fromBigInt(7n) }))
    expect(await resolveNextIndex(new BeeFeedStore(bee, null), owner, topic)).toEqual({ latest: 6n, next: 7n })
  })

  it('the memory store agrees', async () => {
    const m = new MemoryFeedStore()
    const w = Wallet.createRandom()
    expect((await resolveNextIndex(m, w.address, topic)).next).toBe(0n)
    await m.writeRef({ name: 'x', address: w.address, wallet: w }, topic, 0n, 'ab'.repeat(32))
    expect((await resolveNextIndex(m, w.address, topic)).next).toBe(1n)
  })

  it('writing without a batch fails loudly (the payer must be configured)', async () => {
    await expect(new BeeFeedStore(fakeBee(async () => null), null).putJson('x.json', {})).rejects.toThrow(/No postage batch/)
  })
})

describe('keyless HTTP reader', () => {
  it('parses a feed update chunk and a 404 feed', async () => {
    const ref = 'cd'.repeat(32)
    const chunk = concat([getBytes(`0x${feedIdentifier(topic, 2n)}`), new Uint8Array(65), new Uint8Array(8), uint64be(1_700_000_000n), getBytes(`0x${ref}`)])
    const fetcher = async (url: string) => {
      if (url.includes('/feeds/')) return new Response(null, { status: 404 })
      if (url.endsWith(`/chunks/${feedUpdateAddress(owner, topic, 2n)}`)) return new Response(new Uint8Array(getBytes(chunk)))
      return new Response('nope', { status: 500 })
    }
    const http = new HttpFeedStore('http://node', fetcher)
    expect(await http.latestIndex(owner, topic)).toBeNull()
    expect(await http.readRefAt(owner, topic, 2n)).toBe(ref)
    await expect(http.readRefAt(owner, topic, 3n)).rejects.toThrow(/500/)
  })

  it('finds the latest index by probing chunks when the header is hidden (public gateway)', async () => {
    const present = new Set([0n, 1n, 2n, 3n, 4n].map((i) => feedUpdateAddress(owner, topic, i)))
    const fetcher = async (url: string) => {
      if (url.includes('/feeds/')) return new Response('resolved content, header not exposed', { status: 200 })
      const addr = url.split('/chunks/')[1] ?? ''
      return new Response(null, { status: present.has(addr) ? 200 : 500 })
    }
    expect(await new HttpFeedStore('http://gw', fetcher).latestIndex(owner, topic)).toBe(4n)
  })
})
