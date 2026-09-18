# What each mechanism can actually do

The brief said: *paying, publishing and deciding are not obviously the same party. Find out which of them each mechanism can actually do.* This is what we found, checked against the code rather than taken from blog posts.

Sources: `@ethersphere/bee-js@13.1.0` type definitions and compiled source (`dist/types/modules/*.d.ts`, `dist/mjs/feed/index.js`), `@ethersphere/core-sdk@0.1.1`, and `PostageStamp.sol` in [ethersphere/storage-incentives](https://github.com/ethersphere/storage-incentives/blob/master/src/PostageStamp.sol).

## The table

| Mechanism | Who can do it | Can it pay? | Can it publish? | Can it decide? | Where we use it |
|---|---|---|---|---|---|
| **Buy a postage batch** (`bee.storage.buy`, `PostageStamp.createBatch`) | Any wallet. The batch *owner* is whoever the node says, and on a shared node that is always the node wallet. | ✅ | — | — | `storage buy` → `src/node/storage.ts#buyBatch` |
| **Top up / extend a batch** (`bee.stamp.topUp`, `bee.storage.extendDuration`, `PostageStamp.topUp`) | **Anyone** with xBZZ, for any live batch. `topUp` has no owner check on-chain. | ✅ | — | — | `storage extend` / `storage topup` → `extendBatch` / `topUpBatch` |
| **Dilute a batch** (`bee.stamp.dilute`, `PostageStamp.increaseDepth`) | Owner only (`NotBatchOwner` otherwise). | — | — | — | not used |
| **Stamp an upload** (`swarm-postage-batch-id` header on every upload) | Only the node that holds the batch's key. On a shared node: whoever runs it. | (spends) | enables | — | every upload goes through `BeeFeedStore` constructed with the payer's batch |
| **Write a feed update** (`bee.feed.makeWriter(topic, key).uploadReference`) | Whoever holds the feed owner's **private key**. Needs a stamp too. | — | ✅ | — | stewards (`lsc/catalogue/v1`), libraries (`lsc/corrections/v1`), scribe (`lsc/registry/v1`) |
| **Overwrite a feed update** | Nobody. A single-owner chunk at a given index is immutable, so the next update always goes at the next index. | — | — | — | `resolveNextIndex` always reads the network first |
| **Create a feed manifest** (`bee.feed.createManifest`) | Anyone with a stamp, for **any** owner and topic. It is only a pointer and signs nothing. | — | — | — | the stable `/bzz/<manifest>/` URLs |
| **Sign a statement** (EIP-191 `personal_sign`) | Any key holder, in any wallet. | — | — | ✅ (as one seal) | library seals, steward acceptance, corrections |
| **Count seals** | **Every reader**, independently (`src/core/resolve.ts#readRegistry`). | — | — | ✅ (the quorum *is* the decision) | readers skip registry entries without 4 of 7 (or 5 of 7) valid seals |

## What that means for the design

1. **Paying can be shared; custody of storage cannot.** Because `topUp` is permissionless, any of the seven libraries, or a donor, can keep the catalogue's storage alive without asking the node operator. But only the node can stamp uploads, and only the owner can dilute. On one shared node, storage custody sits with whoever runs that machine. STEWARDSHIP.md §8 says so plainly.

2. **Publishing is a key, and keys are cheap.** A feed belongs to whoever holds its key. So each steward gets their **own** catalogue feed, rather than inheriting a shared key. Passing a private key from one person to the next is not succession: the old holder still has it.

3. **Deciding cannot be a feed key at all.** If readers followed "whatever key X last wrote", then key X would be the decider. Instead, the registry entry must *carry* the decision (4 of 7 library signatures over the exact statement), and readers verify it themselves. The scribe's key can write an entry, but it cannot make readers accept one. `test/succession.test.ts` › "an entry the scribe writes without seals is ignored by readers".

4. **One subtle bee-js behaviour we avoided.** When no index is given, `FeedWriter.uploadReference` calls `findNextIndex`, which treats *any* HTTP error, including a 500, as "empty feed" and writes to index 0. We always pass an explicit index, read from the network immediately before writing (`resolveNextIndex`). Only a genuine 404 counts as empty (`src/node/bee.ts#latestIndex`).

5. **Signatures: two schemes, deliberately.** `PrivateKey.sign(data)` in core-sdk signs `keccak256("\x19Ethereum Signed Message:\n32" ‖ keccak256(data))`. It is right for chunks, but awkward for a committee member with MetaMask. Human seals therefore use standard `personal_sign` over readable text (ethers v6). `test/signatures.test.ts` shows how the two relate.

## What we did not build (and why)

- **A Safe multisig on Gnosis holding a storage endowment** that tops up the batch with 4 of 7 signatures. `topUp` is permissionless, so this would work without Bee's cooperation. It is the natural next step, but funding seven signers with xDAI was out of scope for a weekend.
- **A second node** holding a mirror batch, which is the only way to actually separate storage custody.
- **Mirror registries** kept by several libraries, to remove the scribe key as a single point of liveness failure.
