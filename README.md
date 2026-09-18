# The succession nobody wrote down

Seven monastery libraries across Ladakh and Spiti share one manuscript catalogue. For nine years one man, Ngawang Dorje, renewed its storage, held the only key that could publish it, and typed in everyone's corrections. This repository is the arrangement that lets the catalogue outlive him, and outlive whoever comes after him.

The short version:

- **Readers always start from the same address.** A registry feed, written by a council scribe key, names the current steward. The address never changes when the steward does.
- **Nobody can change the steward alone.** A hand-off needs **4 of the 7 library seals** (5 of 7 for someone the outgoing steward didn't name), plus the incoming steward's own signature. Readers check the seals themselves, so not even the scribe can redirect them.
- **Paying, publishing and deciding are three different keys.** The Bee node's wallet pays for storage. Each steward signs on their own feed. The libraries decide. The tools refuse to run if any two roles share a key.
- **Corrections don't need the steward.** Each library posts signed corrections about its own shelves to its own feed. Readers see them at once, and the next steward, whoever that is, folds them in.
- **The succession has actually been performed** (see [HANDOFF_LOG.md](HANDOFF_LOG.md)), and the arrangement is written down in plain language in [STEWARDSHIP.md](STEWARDSHIP.md).

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
registry owner (council scribe) : (after the live ceremony)
registry topic                  : lsc/registry/v1
registry topic (hex)            : f17e2832a227f4efaf7867e0d8f9ba14fa070ef851fb46967eb51c77a4b88a6d
registry feed manifest          : (after the live ceremony)
catalogue topic                 : lsc/catalogue/v1  (5585bf7626ca42b72333dfda4e6a6bf7118861a23e4e2b026a727e0e9db1249f)
corrections topic               : lsc/corrections/v1  (2cf9be53bb7408cee80ea7678ddcb7700e4ae3167670105625954316124ee633)
```
<!-- /lsc:anchor -->

## Try it in two minutes, no node needed

```sh
npm ci
npm run ceremony -- --rehearse     # the whole story in memory: genesis, silence, 4 refusals, 2 hand-offs
npm test                           # 36 tests: quorum rules, refusals, reader indirection, feed indexes, secrets
npm run dev:web                    # http://localhost:5175, then pick "Rehearsal" and press "Begin the story"
```

`http://localhost:5175/?play=all` plays the whole rehearsal on arrival.

## With a funded Bee node (Swarm Desktop at `localhost:1633`)

```sh
npm run cli -- storage cost --days 14 --mb 100           # quote first
npm run cli -- storage buy --mb 100 --days 14 --yes       # the PAYER (node wallet) buys a batch
npm run ceremony -- --live --yes                          # keys → genesis → publish → corrections →
                                                          # extend storage → refusals → hand-off → successor publishes
npm run cli -- read                                       # keyless: registry → steward → catalogue
npm run verify:handoff -- handoffs/<date>-epoch-1.json    # re-check the evidence against the network
npm run audit:secrets
```

The live ceremony is resumable. Each stage checks the network and is skipped if it already happened. Or do every step by hand:

```sh
npm run cli -- keys init                                  # private keys → .secrets/ (git-ignored), addresses → config
npm run cli -- succession propose --incoming 0x… --next 0x… --trigger T2-silence
npm run cli -- succession sign --epoch 1 --as hemis       # or --library hemis --signature 0x… from any wallet
npm run cli -- succession accept --epoch 1 --as steward-padma
npm run cli -- succession handoff --epoch 1 --incoming 0x…
npm run cli -- catalogue publish --as steward-padma
npm run cli -- correction submit --as tabo --record TABO-0003 --set condition=damaged --note "water stain"
npm run cli -- storage extend --days 7 --yes              # or: storage topup --bzz 0.1 --yes
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

## Scored checks, and where each one lives

| # | Check | Where |
|---|---|---|
| 1 | Readers reach current content through an indirection that survives a change of publisher | `src/core/resolve.ts` `readRegistry` → `readCatalogue`: registry (scribe) → valid entry → current steward's feed. Keyless paths: `cli read`, `src/core/http-feedstore.ts` (fetch-only, used by the web viewer), [docs/READ_WITHOUT_US.md](docs/READ_WITHOUT_US.md). Tested in `test/succession.test.ts` › "readers follow the registry…" |
| 2 | Paying identity and signing identity configured separately | Payer: `stewardship.config.json` `payer.nodeAddress` / `payer.batchId` (node wallet via `src/node/storage.ts` `payerAddress`). Signers: `stewards[]`, `libraries[]`, `council.scribe` (keys in `.secrets/`). `src/node/bee.ts` `BeeFeedStore` stamps with the payer batch and signs with the passed identity. `src/node/identities.ts` `assertIdentitiesSeparated` refuses overlaps. |
| 3 | Storage is extended or topped up, not only purchased | `cli storage extend` → `src/node/commands.ts` `storageExtend` → `src/node/storage.ts` `extendBatch` (`bee.storage.extendDuration`); `cli storage topup` → `topUpBatch` (`bee.stamp.topUp`). Called by the live ceremony, step 5. Logged to [STORAGE_LOG.md](STORAGE_LOG.md). |
| 4 | A written arrangement names a successor and the triggering condition | [STEWARDSHIP.md](STEWARDSHIP.md) §3 "Who comes next" (successor address, filled from config by `syncDocs`) and §4 triggers T1–T4 |
| 5 | A hand-off that was actually performed is recorded | [HANDOFF_LOG.md](HANDOFF_LOG.md) + `handoffs/<date>-epoch-N.json`: outgoing and incoming steward keys, 4+ seal signatures, acceptance signature, registry feed index, entry reference, SOC address and owner. Re-check: `npm run verify:handoff` |
| 6 | The authority that can change the publisher is distinct from the publisher | The registry is owned by the **scribe**, not the steward, and every entry must carry **4-of-7 library seals** that readers verify (`src/core/signatures.ts` `verifyQuorum`, enforced in `performHandoff` *and* `readRegistry`). Tests: steward alone refused, 3/7 refused, scribe without seals ignored. |
| 7 | No credential, key, mnemonic, gift code or authenticated URL in tracked files | `.gitignore` (committed first), keys only in `.secrets/` or `LSC_KEY_*` env vars, `src/node/keys.ts` refuses to write keys to tracked paths, `npm run audit:secrets` (also a test) scans every tracked file for local key bytes, labelled keys, 12-word phrases and credential URLs |
| 8 | The succession path takes the incoming steward's identity as a parameter | `cli succession handoff --incoming <address>` (or `LSC_INCOMING`) → `performHandoff({ incoming })`, which refuses if it doesn't match the signed statement. Nothing is hardcoded. |

## Honest limits

- **Storage custody is not separated.** Everything runs on one shared Bee node, and every postage batch belongs to its wallet. Anyone can *top up* (it's permissionless on-chain), but only that node can stamp uploads. A second node with its own batch would be the real fix.
- **One person performed the hand-off.** All keys were generated on one machine. The records say so. In real use each library and steward generates their own key and shares only the address.
- **The T2 silence period was declared, not waited out.** The 60-day clock is exercised in the rehearsal and the tests; the live run records that the committees declared T2.
- **The catalogue entries are illustrative sample data**, not a real inventory.
- **Losing the scribe key freezes the register** (the catalogue stays readable). Mirror registries kept by several libraries would remove that single point of failure. See [docs/MECHANISMS.md](docs/MECHANISMS.md).

## Stack

bee-js **13.1.0** (pinned exactly, v13 namespaced API), ethers 6.17.0 for human-readable EIP-191 seals, zod, commander, TypeScript 5.9, Vite 7 + React 19 for the read-only viewer, vitest. Node 22.
