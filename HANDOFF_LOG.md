# Hand-off log

Every change of steward is appended here automatically by `npm run cli -- succession handoff`. The full evidence for each entry is in the `handoffs/*.json` file it links to. Anyone can re-check it with `npm run verify:handoff -- <file>`, which re-counts the seals and reads the registry update back from the network.

*Honest note:* the hand-offs below were performed by a single person. All signing keys were generated on one machine for the demonstration and kept in its git-ignored `.secrets/` folder. In real use each library committee and each steward generates their own key on their own device and shares only the address. Storage custody is also not separated: every postage batch belongs to the one shared Bee node.

<!-- lsc:status -->
**Status:** performed live on a Bee node, not only rehearsed.

- Epoch 1, 2026-09-19: Ngawang Dorje → **Padma Chodon** `0x9e9e0Cd098e4492bfC6889014d48936eE01a3720`, register update #1, evidence [handoffs/2026-09-19-epoch-1.json](handoffs/2026-09-19-epoch-1.json)
<!-- /lsc:status -->

## Epoch 0: genesis, Ngawang Dorje named first steward

- **When:** 2026-09-19T05:46:37.798Z
- **Trigger:** T0-genesis
- **Outgoing steward key:** none (genesis)
- **Incoming steward key:** `0x0E91aD8a49d9cB2209983E556cBEF0fdDaEBaB99` (Ngawang Dorje), passed to the hand-off command as `--incoming 0x0E91aD8a49d9cB2209983E556cBEF0fdDaEBaB99`
- **Next designated successor:** `0x9e9e0Cd098e4492bfC6889014d48936eE01a3720` (Padma Chodon)
- **Seals:** 4 valid of 4 required (charter has 7 members)
- **Registry update:** feed index **#0**, entry `967e0dd4cc09674a71742bc83776ba6b39f399e0fc6c3b786c991094d7da28cb`
- **Signed chunk (SOC):** `6afb09ba707802c64674c59ea73b917149ec24e1a44d845d9e4a0f9c2b6027ff`, owner `0xB3959e06E1edE30605Ed3136C857cC57B0a64af0` (the council scribe, not the steward)
- **Read back from the node:** matches; readers now follow `0x0E91aD8a49d9cB2209983E556cBEF0fdDaEBaB99`
- **Paid for by:** node wallet `0x9452a51F8b43239b8572C08253E4b7ECAf339cb8`, batch `65c1e84317fa4a5f469bd5b53180edaab7c2fc7fa5d66b4c2bbe86a749a6038c` (14 days of storage left at the time)
- **Evidence file:** [handoffs/2026-09-19-epoch-0.json](handoffs/2026-09-19-epoch-0.json) · re-check with `npm run verify:handoff -- handoffs/2026-09-19-epoch-0.json`

| Library | Committee key | Seal | Signature |
|---|---|---|---|
| hemis | `0x6Becf774B2bE9008bcFc9f5aE84bb5BDF4765f87` | counted | `0x120d5a25756c3fe0…` |
| thiksey | `0x9D1298BE49EdcE997464464D50F8251C9A53D4AF` | counted | `0x906435d1bce173b0…` |
| diskit | `0x0b6409c83d6CF1874FB307F3CA21A4224e18FFB6` | counted | `0xe1e6843e1db35833…` |
| lamayuru | `0x536f2dd5E150cB087e1F46dAd444e037C27959aD` | counted | `0x5c9a49720a46ba3d…` |

<details><summary>Exact statement everyone signed</summary>

```
Ladakh–Spiti Shared Manuscript Catalogue — Succession Statement v1
Catalogue: ladakh-spiti-manuscripts
Charter: 0xeaaab87204f6e075b06e78f175c261ca39e8997afb55c95c86d2d161f6c90430
Epoch: 0 (previous registry entry: none — this is the genesis of the registry)
Outgoing steward: none
Incoming steward: 0x0E91aD8a49d9cB2209983E556cBEF0fdDaEBaB99 (Ngawang Dorje)
Next designated successor: 0x9e9e0Cd098e4492bfC6889014d48936eE01a3720 (Padma Chodon)
Trigger: T0-genesis
Effective from: 2026-09-19
We consent that readers follow the incoming steward's catalogue feed from this epoch.
```
</details>


> Epoch 0 follow-up, 2026-09-19T05:47:39.267Z: Ngawang Dorje published catalogue v1 on their own feed (update #0, collection `a9e716452fb27fe0cc8b08a38efe96f820d59a460b8449209e1285a303d586e4`, signed chunk `c3e3a6e4985a31d7d2d2c79436d600ff90aa8db984727521f47e5a452030acb8` owned by `not read back`, the steward's own key), applying 0 library correction(s) and keeping 0 as proposals.

## Epoch 1: Ngawang Dorje → Padma Chodon

- **When:** 2026-09-19T05:52:07.829Z
- **Trigger:** T2-silence
- **Outgoing steward key:** `0x0E91aD8a49d9cB2209983E556cBEF0fdDaEBaB99` (Ngawang Dorje)
- **Outgoing steward's last signed catalogue update:** feed index #0, chunk `c3e3a6e4985a31d7d2d2c79436d600ff90aa8db984727521f47e5a452030acb8`, signed by `0x0E91aD8a49d9cB2209983E556cBEF0fdDaEBaB99` (the outgoing key)
- **Incoming steward key:** `0x9e9e0Cd098e4492bfC6889014d48936eE01a3720` (Padma Chodon), passed to the hand-off command as `--incoming 0x9e9e0Cd098e4492bfC6889014d48936eE01a3720`
- **Next designated successor:** `0x906039f8366F9Ef6E44A172a006bE21B66dE7C63` (Stanzin Namgyal)
- **Seals:** 4 valid of 4 required (charter has 7 members)
- **Registry update:** feed index **#1**, entry `0d558b12415865406f82bbef9e6a5687eeb552ac511816a37ede1146b7a409a7`
- **Signed chunk (SOC):** `a9e6be18de613cc7ef6a2584b683e96427bea54217053e7f3823a1438ef10296`, owner `0xB3959e06E1edE30605Ed3136C857cC57B0a64af0` (the council scribe, not the steward)
- **Read back from the node:** matches; readers now follow `0x9e9e0Cd098e4492bfC6889014d48936eE01a3720`
- **Paid for by:** node wallet `0x9452a51F8b43239b8572C08253E4b7ECAf339cb8`, batch `65c1e84317fa4a5f469bd5b53180edaab7c2fc7fa5d66b4c2bbe86a749a6038c` (15 days of storage left at the time)
- **Evidence file:** [handoffs/2026-09-19-epoch-1.json](handoffs/2026-09-19-epoch-1.json) · re-check with `npm run verify:handoff -- handoffs/2026-09-19-epoch-1.json`

| Library | Committee key | Seal | Signature |
|---|---|---|---|
| hemis | `0x6Becf774B2bE9008bcFc9f5aE84bb5BDF4765f87` | counted | `0xad7abae4c06a3cf6…` |
| alchi | `0xAE823252730c6dB4a1bdE010Dddc5220ED733875` | counted | `0x9fc209f496684661…` |
| tabo | `0x42DAF750ea05e3D9dd39D1213C7d29E0B20e3ae7` | counted | `0xf0b841ae92c59cd6…` |
| kye | `0x91A4935D87166e09fb27d01d946B1Cf61dc87Cc4` | counted | `0xe1a8b4f4a926fbb1…` |

> Trigger T2 (silence) was declared by the sealing committees for this demonstration; the 60-day clock itself is exercised in the rehearsal and tests, not waited out in real time.
> Ngawang Dorje's key was not used in this hand-off. The acceptance Ngawang Dorje signed at epoch 0 named Padma Chodon, which is why 4 seals suffice.

**Refused before this succeeded:**
- The outgoing steward signs on behalf of Hemis: Refused: 0 valid seal(s) of 4 needed (hemis: signature does not recover to the library key)
- 3 of 7 libraries seal the hand-off: Refused: 3 valid seal(s) of 4 needed

<details><summary>Exact statement everyone signed</summary>

```
Ladakh–Spiti Shared Manuscript Catalogue — Succession Statement v1
Catalogue: ladakh-spiti-manuscripts
Charter: 0xeaaab87204f6e075b06e78f175c261ca39e8997afb55c95c86d2d161f6c90430
Epoch: 1 (previous registry entry: #0 967e0dd4cc09674a71742bc83776ba6b39f399e0fc6c3b786c991094d7da28cb)
Outgoing steward: 0x0E91aD8a49d9cB2209983E556cBEF0fdDaEBaB99 (Ngawang Dorje)
Incoming steward: 0x9e9e0Cd098e4492bfC6889014d48936eE01a3720 (Padma Chodon)
Next designated successor: 0x906039f8366F9Ef6E44A172a006bE21B66dE7C63 (Stanzin Namgyal)
Trigger: T2-silence
Effective from: 2026-09-19
We consent that readers follow the incoming steward's catalogue feed from this epoch.
```
</details>


> Epoch 1 follow-up, 2026-09-19T05:52:31.228Z: Padma Chodon published catalogue v2 on their own feed (update #0, collection `0328398dc9b3fe1544afd87239e1292050c7b0b541e263e249941f90210e8f75`, signed chunk `aada0de1bdcedac4054764638d103b906349c7c6d4c0bb8d6a4db2bede119d35` owned by `not read back`, the steward's own key), applying 1 library correction(s) and keeping 1 as proposals.
