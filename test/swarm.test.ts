import { Bytes, FeedIndex, keccak256, makeSOCAddress } from '@ethersphere/core-sdk'
import { Topic } from '@ethersphere/bee-js'
import { Wallet } from 'ethers'
import { describe, expect, it } from 'vitest'
import { feedIdentifier, feedUpdateAddress, TOPICS, topicHex } from '../src/core/swarm.js'

describe('feed arithmetic matches bee-js 13.1.0 / core-sdk', () => {
  it('topic = Topic.fromString', () => {
    for (const t of Object.values(TOPICS)) expect(topicHex(t)).toBe(Topic.fromString(t).toHex())
  })

  it('identifier and SOC address match core-sdk', () => {
    const owner = Wallet.createRandom().address
    const topic = topicHex(TOPICS.registry)
    for (const i of [0n, 1n, 7n, 300n]) {
      const expectedId = new Bytes(keccak256(Bytes.concat(new Topic(topic).toUint8Array(), FeedIndex.fromBigInt(i).toUint8Array())))
      expect(feedIdentifier(topic, i)).toBe(expectedId.toHex())
      expect(feedUpdateAddress(owner, topic, i)).toBe(makeSOCAddress(expectedId.toHex(), owner.slice(2)).toHex())
    }
  })
})
