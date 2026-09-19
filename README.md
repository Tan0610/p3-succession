# The succession nobody wrote down

Seven monastery libraries across Ladakh and Spiti share one manuscript catalogue. For nine years one man, Ngawang Dorje, renewed its storage, held the only key that could publish it, and typed in everyone's corrections. This repository is the arrangement that lets the catalogue outlive him, and outlive whoever comes after him.

The short version:

- **Readers always start from the same address.** A registry feed, written by a council scribe key, names the current steward. The address never changes when the steward does.
- **Nobody can change the steward alone.** A hand-off needs **4 of the 7 library seals** (5 of 7 for someone the outgoing steward didn't name), plus the incoming steward's own signature. Readers check the seals themselves, so not even the scribe can redirect them.
- **Paying, publishing and deciding are three different keys.** The Bee node's wallet pays for storage. Each steward signs on their own feed. The libraries decide. The tools refuse to run if any two roles share a key.
- **Corrections don't need the steward.** Each library posts signed corrections about its own shelves to its own feed. Readers see them at once, and the next steward, whoever that is, folds them in.
- **The succession is performed for real, not only simulated**: `ceremony --live` runs it on a Bee node and records every signature and feed index in [HANDOFF_LOG.md](HANDOFF_LOG.md). The arrangement is written down in plain language in [STEWARDSHIP.md](STEWARDSHIP.md).

<!-- lsc:status -->
**Status:** rehearsed, not yet performed live. `npm run ceremony -- --live --yes` performs it on a Bee node and writes the evidence into `handoffs/` and [HANDOFF_LOG.md](HANDOFF_LOG.md).
<!-- /lsc:status -->

## Where to start reading

| If you are… | Read |
|---|---|
| a library committee | [STEWARDSHIP.md](STEWARDSHIP.md): the agreement, roles, triggers, what it can't protect against |
| a reader with no software from us | [docs/READ_WITHOUT_US.md](docs/READ_WITHOUT_US.md): `curl` and a byte layout |
| checking what's technically possible | [docs/MECHANISMS.md](docs/MECHANISMS.md): who can pay, publish and decide, with sources |
| checking the hand-off happened | [HANDOFF_LOG.md](HANDOFF_LOG.md), `handoffs/*.json`, `npm run verify:handoff` |
| checking storage is paid | [STORAGE_LOG.md](STORAGE_LOG.md), `ledger/storage.json`, `npm run cli -- storage status` |

The public anchor:

<!-- lsc:anchor -->
```
registry owner (council scribe) : (made by keys init at the start of the live ceremony)
registry topic                  : lsc/registry/v1
registry topic (hex)            : f17e2832a227f4efaf7867e0d8f9ba14fa070ef851fb46967eb51c77a4b88a6d
registry feed manifest          : (created by the first live hand-off)
catalogue topic                 : lsc/catalogue/v1  (5585bf7626ca42b72333dfda4e6a6bf7118861a23e4e2b026a727e0e9db1249f)
corrections topic               : lsc/corrections/v1  (2cf9be53bb7408cee80ea7678ddcb7700e4ae3167670105625954316124ee633)
postage batch (open to top-ups) : 65c1e84317fa4a5f469bd5b53180edaab7c2fc7fa5d66b4c2bbe86a749a6038c
```
<!-- /lsc:anchor -->

## If Ngawang stops answering tomorrow

| The catalogue is still… | Because | Where to see it |
|---|---|---|
| **reachable** | Readers start from the register (the scribe's address + `lsc/registry/v1`), which never moves, and follow it to whichever steward the libraries sealed. No steward key, no node of ours, no software of ours: two `curl`s against any Bee node or gateway. | [docs/READ_WITHOUT_US.md](docs/READ_WITHOUT_US.md), `npm run cli -- read`, ceremony step 8 |
| **paid for** | The rent sits in the PostageStamp contract on Gnosis Chain, not with Ngawang. `PostageStamp.topUp` has no owner check, so any library tops up the batch printed above from its own wallet, and the node's operator can run `storage extend`. | [two commands in docs/MECHANISMS.md](docs/MECHANISMS.md#topping-up-from-your-own-wallet-no-node-no-permission), [STORAGE_LOG.md](STORAGE_LOG.md) (ceremony step 5 extends the live batch), `npm run cli -- storage status` |
| **correctable by the other six** | Each library signs corrections about its own shelves onto its own feed (`npm run cli -- correction submit --as kye …`). Readers see them at once. The next steward applies them automatically; a note about another library's shelf is kept as a proposal for that library. | ceremony step 4 (Tabo and Kye post, a keyless reader sees them), step 7 (Padma folds them in, logged in [HANDOFF_LOG.md](HANDOFF_LOG.md)), [STEWARDSHIP.md](STEWARDSHIP.md) §6 |
| **run by someone else** | 4 of the 7 library seals and Padma's own acceptance move the register to her. Ngawang's key is never used. | [HANDOFF_LOG.md](HANDOFF_LOG.md) epoch 1, `npm run verify:handoff` |

## Try it in two minutes, no node needed

```sh
npm ci
npm run ceremony -- --rehearse     # the whole story in memory: genesis, silence, 4 refusals, 2 hand-offs
npm test                           # quorum rules, refusals, reader indirection, feed indexes, docs, secrets
npm run dev:web                    # http://localhost:5175, then pick "Rehearsal" and press "Begin the story"
```

`http://localhost:5175/?play=all` plays the whole rehearsal on arrival.

## With a funded Bee node (Swarm Desktop at `localhost:1633`)

```sh
npm run cli -- storage cost --days 14 --mb 5             # quote first (5 MB is plenty: the catalogue is ~100 kB)
npm run cli -- storage buy --mb 5 --days 14 --yes         # the PAYER (node wallet) buys a batch; waits until usable
npm run ceremony -- --live --yes --incoming steward-padma # keys → genesis → publish → corrections →
                                                          # extend storage → refusals → hand-off → successor publishes
npm run cli -- read                                       # keyless: registry → steward → catalogue
npm run verify:handoff -- handoffs/<date>-epoch-1.json    # re-check the evidence against the network
npm run audit:secrets
```

What it spends, at September 2026 prices: about 0.65 xBZZ for the batch and 0.05 xBZZ for the one-day extension (`--extend-days N` to change it). Everything else is stamped against the batch already bought. The live ceremony checks the batch is usable and the wallet can pay before it writes anything. It is resumable: each stage checks the network and is skipped if it already happened, and a hand-off whose evidence file was not written (run cut off) is rebuilt from the registry on the network. `--incoming` takes a steward key name or a 0x address (default `steward-padma`, or `LSC_INCOMING`). Or do every step by hand:

```sh
npm run cli -- keys init                                  # private keys → .secrets/ (git-ignored), addresses → config
npm run cli -- succession propose --incoming 0x… --next 0x… --trigger T2-silence
npm run cli -- succession sign --epoch 1 --as hemis       # or --library hemis --signature 0x… from any wallet
npm run cli -- succession accept --epoch 1 --as steward-padma
npm run cli -- succession handoff --epoch 1 --incoming 0x…
npm run cli -- catalogue publish --as steward-padma
npm run cli -- correction submit --as tabo --record TABO-0003 --set condition=damaged --note "water stain"
npm run cli -- storage extend --days 1 --yes              # or: storage topup --bzz 0.1 --yes
npm run cli -- succession check-trigger --unanswered 2
```

## How it fits together

```
                     ┌──────────────────────────── readers start here, forever ─────────────────────────────┐
                     │  registry feed  (owner: council scribe, topic lsc/registry/v1)                       │
                     │   #0 genesis: Ngawang   #1 (no seals: ignored)   #2 Padma, 4/7 seals   #3 …          │
                     └───────────────┬──────────────────────────────────────────────────────────────────────┘
                                     │ entry names steward address + carries the seals readers re-check
                                     ▼
      steward's own catalogue feed (owner: steward, topic lsc/catalogue/v1) ──► collection: index.html, catalogue.json, catalogue.csv
                                     ▲
      seven library correction feeds (owner: library, topic lsc/corrections/v1) ──► signed corrections, own shelf = applied

      every upload and feed chunk is STAMPED by the payer's batch (node wallet) but SIGNED by the role's own key
```

## How each check is met

Every pointer is `file` › `function`. Each row names the code path, the thing a reviewer can open, and the test that pins it.

| # | Check | Code path | What to open / run |
|---|---|---|---|
| 1 | **Readers reach current content through a pointer that survives a change of publisher** | `src/core/resolve.ts` › `readRegistry()` walks the registry feed (owner = council scribe, topic `lsc/registry/v1`) and keeps only entries with valid seals → `readCatalogue()` follows `entry.steward.address` to *that steward's own* catalogue feed → `resolveAll()`. The starting address (scribe + topic) never changes when the steward does. | Third-party read paths with no keys and no batch: `npm run cli -- read` (`src/node/commands.ts` › `read()`), `src/core/http-feedstore.ts` › `HttpFeedStore` (plain `fetch`, used by the web viewer, works against a public gateway), and `curl` in [docs/READ_WITHOUT_US.md](docs/READ_WITHOUT_US.md). Test: `test/succession.test.ts` › "readers follow the registry to whoever is steward now, from the same starting address". |
| 2 | **Paying and signing identities are configured separately and used by different paths** | Paying: `stewardship.config.json` › `payer.nodeAddress` + `payer.batchId` (the Bee node wallet, read by `src/node/storage.ts` › `payerAddress()`); the batch is only ever used as a *stamp* in `src/node/bee.ts` › `BeeFeedStore` (`stamp()` in `putJson`, `putCollection`, `writeRef`). Signing: keys in git-ignored `.secrets/keys/*.key` loaded by `src/node/keys.ts` › `loadIdentity()` and passed to `BeeFeedStore.writeRef(signer, …)` → `bee.feed.makeWriter(topic, new PrivateKey(signer))`. | `src/node/identities.ts` › `assertIdentitiesSeparated()` refuses any shared address (called by `keysInit()` and `handoff()`); `cataloguePublish()` refuses a steward key equal to the payer. Evidence files list both under `payer` and `identitiesSeparated`. |
| 3 | **Storage is extended or topped up through a reachable command, not only bought** | `npm run cli -- storage extend --days N --yes` → `cli/succession.ts` → `src/node/commands.ts` › `storageExtend()` → `src/node/storage.ts` › `extendBatch()` → `bee.storage.extendDuration(batchId, Duration.fromDays(N))` on the **existing** configured batch. `storage topup --bzz X --yes` → `topUpBatch()` → `bee.stamp.topUp()`. | The live ceremony calls `storageExtend()` at stage 5. Without the node: `PostageStamp.topUp` from any wallet, [two `cast` commands](docs/MECHANISMS.md#topping-up-from-your-own-wallet-no-node-no-permission) using the batch id in the anchor block. Every payment is appended to [STORAGE_LOG.md](STORAGE_LOG.md) and `ledger/storage.json` with the node's TTL before → after. |
| 4 | **One document names a specific successor and the triggering condition** | [STEWARDSHIP.md](STEWARDSHIP.md) §3, the `lsc:successor` block: the designated successor's name **and 0x key**, the current steward, and the triggers T1–T4 in the same paragraph (§4 spells the triggers out). Rendered by `src/node/config.ts` › `renderSuccessorBlock()` via `syncDocs()`, which runs on `keys init`, `storage buy/use`, every hand-off and at the end of the live ceremony. | `test/docs-and-secrets.test.ts` › "after the live ceremony every placeholder is replaced by a concrete 0x address" and "… no placeholder is left anywhere in the tracked documents". Before the live run every generated block says plainly that it is waiting for it. |
| 5 | **A completed hand-off is recorded, naming two distinct signing identities, with evidence** | `src/node/evidence.ts` › `writeHandoffRecord()` writes `handoffs/<date>-epoch-N.json` and appends [HANDOFF_LOG.md](HANDOFF_LOG.md): outgoing and incoming steward addresses, the incoming steward's acceptance signature, every library seal with its recovered signer, the registry **feed index**, entry reference, the scribe's signed chunk (address, owner, signature), the outgoing steward's last signed catalogue chunk and the incoming steward's first. The incoming address is also written to `stewardship.config.json` › `currentSteward` and `history[]`. | Both files are tracked (only `handoffs/rehearsals/` is ignored). `npm run verify:handoff -- handoffs/<file>` re-counts the seals and re-reads every chunk from the network. A run cut off mid-write is repaired by `recoverHandoffRecords()`. |
| 6 | **The authority that changes the publisher is not the publisher** | The registry belongs to the **council scribe**, not to any steward. `src/core/operations.ts` › `performHandoff()` writes only with 4 of 7 library seals (5 of 7 for anyone the outgoing steward did not name) plus the incoming steward's acceptance, checked by `src/core/signatures.ts` › `verifyQuorum()`. Readers re-check the same rules in `resolve.ts` › `checkEntry()`, so even the scribe cannot redirect them. | `test/succession.test.ts` › "the outgoing steward cannot write the registry: his key is not the scribe", "refuses 3 of 7", "an entry the scribe writes without seals is ignored by readers". The live ceremony performs two refusals on the real node and records them in the evidence. |
| 7 | **No key, mnemonic, gift code or credential URL in any tracked file** | `.gitignore` ignores `.secrets/` and `.env*`; `src/node/keys.ts` › `assertIgnored()` refuses to write a key where git would track it; keys never enter evidence (records are built from addresses only). `src/node/audit.ts` › `auditSecrets()` scans every tracked file for local key bytes, any 32-byte hex under a key-like name, literal keys passed to `Wallet`/`PrivateKey`, hex that derives to a role address, the published Hardhat/Anvil keys, 12-word phrases and credential URLs. | `npm run audit:secrets`; also a test, and the last stage of the live ceremony. Tests make every key at runtime (`Wallet.createRandom()`), and one checks that rehearsal output never serialises a private key. |
| 8 | **The succession path takes the incoming steward as a parameter** | `npm run cli -- succession handoff --epoch 1 --incoming 0x…` (or `LSC_INCOMING`) → `src/node/commands.ts` › `handoff({ incoming })` → `performHandoff({ incoming })`, which refuses if it differs from the signed statement (`INCOMING_MISMATCH`). The live ceremony takes `--incoming <steward key name or 0x address>` (and `--next`, `--first`). | `test/succession.test.ts` › "--incoming must match the signed statement (no hardcoded successor)". |

## Honest limits

- **Storage custody is not separated.** Everything runs on one shared Bee node, and every postage batch belongs to its wallet. Anyone can *top up* (it's permissionless on-chain), but only that node can stamp uploads. A second node with its own batch would be the real fix.
- **One person performs the whole demonstration.** All eleven keys (seven committees, three stewards, the scribe) are generated on one machine, in its git-ignored `.secrets/`. Every evidence file says so in its `honesty` field. In real use each library and steward generates their own key and shares only the address.
- **The T2 silence period was declared, not waited out.** The 60-day clock is exercised in the rehearsal and the tests; the live run records that the committees declared T2.
- **The demonstration batch is small and short-lived** (5 MB, 14 days). Below 30 days of paid storage, `storage status` and `check-trigger` report trigger T3 as met until someone tops it up. That is the arrangement working as written, not a bug.
- **The catalogue entries are illustrative sample data**, not a real inventory.
- **Losing the scribe key freezes the register** (the catalogue stays readable). Mirror registries kept by several libraries would remove that single point of failure. See [docs/MECHANISMS.md](docs/MECHANISMS.md).

## Stack

bee-js **13.1.0** (pinned exactly, v13 namespaced API), ethers 6.17.0 for human-readable EIP-191 seals, zod, commander, TypeScript 5.9, Vite 7 + React 19 for the read-only viewer, vitest. Node 22.
