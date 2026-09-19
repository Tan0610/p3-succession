# The Stewardship Arrangement

### for the Ladakh–Spiti Shared Manuscript Catalogue

*A plain-language agreement between the seven library committees of Diskit, Thiksey, Hemis, Alchi and Lamayuru in Ladakh, and Kye and Tabo in Spiti.*

> **In one minute**
>
> - Everyone finds the catalogue through **one register whose address never changes**. The register says who the steward is today.
> - **No single person can change the steward.** It takes the seals of **4 of the 7 libraries** (5 if the new person is not the one the old steward named), and the new steward must sign too.
> - **Each library can correct its own shelves itself**, at any time, without writing to the steward.
> - **Anyone can pay to keep the storage alive.** Nobody has to ask permission to add rent.
> - **The next steward is already named** (§3), and §4 says exactly when they may take over.
>
> **About this copy.** This is a working demonstration, prepared by one person. All eleven keys (the seven library committees, three stewards and the council scribe) were made on that one person's computer. In real use, each committee and each steward makes its own key on its own device and only ever shares the public address. See §8.

---

## 1. What we share

Together we keep one catalogue: what each library holds, the condition of every work, which folios are damaged or missing, and which have been photographed. No one library has the whole picture. This catalogue does.

For nine years one person, Ngawang Dorje, kept it for all of us. He paid for the storage, held the only key that could publish it, and typed in every correction we sent him. This agreement exists so that the catalogue does not depend on any one person, including whoever comes after him.

The catalogue lives on **Swarm**, a storage network with no single company or server behind it. Anyone can read it. Only the people named below can change it, and only in the ways described below.

A few words used below:

- **Key**: a secret, like a personal seal-stamp kept in a drawer. It comes with a public **address** (a long code starting `0x`) that anyone may see. Signing with the key proves the signer holds it. The key itself is never written down in this document or in any shared file.
- **Seal**: a library committee signing a statement with its key. Anyone can check a seal against the committee's address.
- **Register**: a short list, kept on Swarm, of who has been steward and who the libraries sealed.
- **Rent** (a "postage batch"): storage on Swarm is paid in advance for a length of time. When the rent runs out, the stored catalogue can disappear.

## 2. The four roles, and what each one cannot do

We found that *paying*, *publishing* and *deciding* are separate jobs. They are held by separate keys, and the software refuses to run if any two roles share one.

| Role | What it does | What it **cannot** do |
|---|---|---|
| **The payer** (the storage node's wallet) | Pays the storage rent. Every upload is stamped with its prepaid storage. | Publish the catalogue. Decide who the steward is. |
| **The steward** (one person, their own key) | Publishes new versions of the catalogue and folds in the libraries' corrections. | Name their own replacement. Change where readers look. Spend the storage. |
| **The seven library committees** (one key each) | Correct their own shelves directly, without asking the steward. Together, approve a change of steward: **4 of 7 seals**. | Publish the whole catalogue alone. Change the steward alone. |
| **The council scribe** (a key held by the council secretary) | Writes the one-line register that tells readers who the current steward is. | Change the steward without the seals. Readers check the seals themselves and ignore any entry that does not have them. |

The public addresses for every role are listed here and in `stewardship.config.json`. Private keys are never written into this document or anywhere in the shared files.

<!-- lsc:identities -->
| Role | Who | Address (public) |
|---|---|---|
| Payer (storage custodian) | the shared Bee node's wallet | `0x9452a51F8b43239b8572C08253E4b7ECAf339cb8` |
| Council scribe (owns the registry feed) | held by the council secretary | `0xB3959e06E1edE30605Ed3136C857cC57B0a64af0` |
| Steward key | Ngawang Dorje (hemis) | `0x0E91aD8a49d9cB2209983E556cBEF0fdDaEBaB99` |
| Steward key | Padma Chodon (tabo) | `0x9e9e0Cd098e4492bfC6889014d48936eE01a3720` |
| Steward key | Stanzin Namgyal (thiksey) | `0x906039f8366F9Ef6E44A172a006bE21B66dE7C63` |
| Library committee key | Diskit library committee (Ladakh) | `0x0b6409c83d6CF1874FB307F3CA21A4224e18FFB6` |
| Library committee key | Thiksey library committee (Ladakh) | `0x9D1298BE49EdcE997464464D50F8251C9A53D4AF` |
| Library committee key | Hemis library committee (Ladakh) | `0x6Becf774B2bE9008bcFc9f5aE84bb5BDF4765f87` |
| Library committee key | Alchi library committee (Ladakh) | `0xAE823252730c6dB4a1bdE010Dddc5220ED733875` |
| Library committee key | Lamayuru library committee (Ladakh) | `0x536f2dd5E150cB087e1F46dAd444e037C27959aD` |
| Library committee key | Kye library committee (Spiti) | `0x91A4935D87166e09fb27d01d946B1Cf61dc87Cc4` |
| Library committee key | Tabo library committee (Spiti) | `0x42DAF750ea05e3D9dd39D1213C7d29E0B20e3ae7` |
<!-- /lsc:identities -->

## 3. Who comes next

Every steward, when they accept the role, names the person they would like to follow them. They sign this with their own key while they are still able to. It is their **standing designation**, and it stays on record even if they later become unreachable.

<!-- lsc:successor -->
**Current steward:** Padma Chodon, key `0x9e9e0Cd098e4492bfC6889014d48936eE01a3720` (since epoch 1, 2026-09-19; register update #1; evidence in [handoffs/2026-09-19-epoch-1.json](handoffs/2026-09-19-epoch-1.json))

**Designated successor:** Stanzin Namgyal, key `0x906039f8366F9Ef6E44A172a006bE21B66dE7C63`. Padma Chodon named Stanzin Namgyal in the acceptance they signed with their own key when they took over.

**When Stanzin Namgyal takes over:** as soon as any trigger in §4 is met (T1 they step down; T2 no catalogue update for 60 days and two libraries unanswered for 30; T3 under 30 days of storage left; T4 five of the seven libraries ask for removal). Handing over to Stanzin Namgyal needs 4 of the 7 library seals; handing over to anyone else needs 5 of 7. Padma Chodon's own key is not needed.
<!-- /lsc:successor -->

Why the difference between 4 and 5 seals: choosing the person the outgoing steward named respects their wish, so a simple majority of libraries is enough. Choosing someone else overrides that wish, so it needs a larger majority.

The block above is filled in by the software from `stewardship.config.json`, so the names and keys here always match what the register on Swarm says.

## 4. When a hand-off may begin

Any library may start a hand-off when **one** of these is true:

- **T1: The steward steps down.** The steward says so in writing to at least two libraries.
- **T2: The steward has gone silent.** There has been no catalogue update for **60 days**, *and* at least two libraries have sent written requests that went unanswered for **30 days**.
- **T3: The storage is running out.** Less than **30 days** of paid storage remain and nobody has topped it up. (Any library may top it up first; see §7.)
- **T4: Removal for cause.** Five of the seven libraries ask for it.

The software can check T2 and T3 against the network (`npm run cli -- succession check-trigger`), and a robot checks them every day in public (see "The daily watchdog" in §7). A trigger only opens the door: the hand-off still needs the seals.

## 5. How a hand-off happens

1. **A statement is drafted.** It names the outgoing steward, the incoming steward and their key, the next designated successor, and which trigger applies. Every copy is identical, word for word (`handoffs/proposals/epoch-N.statement.txt`).
2. **The libraries seal it.** Each committee signs that exact text with its own key: with our tool, or with any ordinary Ethereum wallet using "Sign message". Four seals (five for someone not designated) are needed.
3. **The incoming steward accepts.** They sign the same text, which proves they hold the key being named. In doing so they also name *their* successor.
4. **The scribe writes the register.** The council scribe's key records the new entry. The software checks all the seals first, and every reader checks them again.
5. **The new steward publishes.** They pick up the latest catalogue through the register, fold in any waiting corrections, and publish the next version.

The outgoing steward's key is **not needed** at any point. That is the purpose of the arrangement: if the steward is unreachable, the catalogue still moves on.

Every hand-off is written down automatically in `HANDOFF_LOG.md`, with the signatures and the register entry, so anyone can check it later (`npm run verify:handoff`).

## 6. Correcting the catalogue without the steward

A library does not need to email the steward. It posts a signed correction about its own shelves to its own correction feed (`npm run cli -- correction submit --as tabo …`).

- Readers see the correction immediately, marked as signed by that library.
- The next time the steward publishes, corrections a library makes **to its own shelves** are applied automatically.
- A library's note about **another** library's shelf is kept as a *proposal*, for that library to confirm. Each committee speaks for its own collection.

If the steward stops publishing, corrections are still visible to every reader, and they are applied as soon as a new steward takes over.

## 7. Paying for the storage

Swarm storage is **rent paid in advance, not a purchase**. A postage batch lasts until its prepaid balance runs out. When it does, the catalogue can disappear from the network.

- The storage is checked **at least once a month** (`npm run cli -- storage status`), and every extension is written in `STORAGE_LOG.md`.
- **Anyone may add to the rent.** Topping up an existing batch is open to anyone on the Gnosis Chain, not only its owner. Any library, donor or well-wisher with xBZZ can extend the storage without asking permission, and without the steward or the node's operator being reachable. All they need is the batch number, printed as "postage batch" in §10. The two commands are in [`docs/MECHANISMS.md`](docs/MECHANISMS.md#topping-up-from-your-own-wallet-no-node-no-permission).
- If the storage falls below 30 days, that is trigger T3, whether or not the steward is active.

### The daily watchdog

A robot checks every day and raises its hand in public if the lamp is running low or the steward goes quiet.

Every morning a small program run by GitHub (`npm run watchdog`, [`.github/workflows/steward-watchdog.yml`](.github/workflows/steward-watchdog.yml)) reads the register, the steward's latest catalogue and the storage balance through a public Swarm gateway. It uses no keys and no node of ours, and it cannot change or pay for anything. It asks three questions:

- **Can readers still reach the catalogue?** It follows the register to the current steward, checking the seals as any reader would.
- **Is the rent still paid?** It reads how many days the postage batch has left. Under 30 days is trigger **T3**.
- **Is the steward still publishing?** It counts the days since the last catalogue update. At 60 days it raises the alarm for trigger **T2**. T2 itself is met once two libraries confirm that their written requests went unanswered, which the robot cannot see.

When something needs doing, it opens **one** public notice (a GitHub issue titled "Stewardship alert: …"), or updates the one already open. The notice says in plain words what it found, gives the commands any library can use to add rent without asking anyone (§7), and points to how a hand-off happens (§5). When everything is clear again, it closes the notice. Anyone can ask the same questions from their own computer with `npm run watchdog`.

The robot only *raises its hand*. It cannot top up the storage or change the steward: people do that, as described above.

## 8. What this arrangement cannot protect against

We would rather say this plainly than have you discover it later.

- **Storage custody is not separated.** At present all storage runs on **one shared Bee node** (one computer running the Swarm software), and every postage batch belongs to that node's wallet. In practice this means:
  - whoever looks after that computer decides whether *new* versions can be uploaded at all;
  - anyone else can *add rent* to keep what is already stored alive, but cannot upload with it or take the batch over;
  - if that computer is switched off for good, the catalogue already on Swarm stays readable until its rent runs out, and the steward's and libraries' keys still work, but a new node with its own batch is needed before anything new can be published.

  The fix is for a second library to run its own node and hold its own batch as a mirror. Until then, this is the one part of the arrangement that still depends on one machine.
- **All the keys were made on one machine for this demonstration.** One person played every part: the seven committees, the three stewards and the scribe. The hand-off records say so. In real use, each library committee and each steward generates their own key on their own device and shares only the public address. A key made on someone else's computer should never be trusted as your own.
- **Losing the scribe key** would freeze the register: no new steward could be recorded, although the catalogue stays readable. The council secretary keeps the key, with sealed copies at two libraries. A later version may let several libraries each keep a mirror register.
- **Storage that has fully expired cannot be revived.** It can only be uploaded again from a copy. Top up before it runs out.
- **Everything published is public.** Do not put anything in the catalogue that should not be seen by anyone, forever.

## 9. Changing this agreement

This agreement may be changed with the seals of **5 of the 7** libraries. The charter that the software enforces (members, 4-of-7, 5-of-7, the 60/30/30-day numbers) is part of the first register entry, and every later entry must match it exactly. In this version, changing the charter means starting a new register.

## 10. Where to find everything

- The **register** (readers start here; the address never changes):

<!-- lsc:anchor -->
```
registry owner (council scribe) : 0xB3959e06E1edE30605Ed3136C857cC57B0a64af0
registry topic                  : lsc/registry/v1
registry topic (hex)            : f17e2832a227f4efaf7867e0d8f9ba14fa070ef851fb46967eb51c77a4b88a6d
registry feed manifest          : 37eff4d56efe327da23b92cf60a692677053a854903a8e7f205cea3a12c291f2
catalogue topic                 : lsc/catalogue/v1  (5585bf7626ca42b72333dfda4e6a6bf7118861a23e4e2b026a727e0e9db1249f)
corrections topic               : lsc/corrections/v1  (2cf9be53bb7408cee80ea7678ddcb7700e4ae3167670105625954316124ee633)
postage batch (open to top-ups) : 65c1e84317fa4a5f469bd5b53180edaab7c2fc7fa5d66b4c2bbe86a749a6038c
```
<!-- /lsc:anchor -->

- How to read the catalogue with no software from us: [`docs/READ_WITHOUT_US.md`](docs/READ_WITHOUT_US.md)
- What each technical mechanism can and cannot do: [`docs/MECHANISMS.md`](docs/MECHANISMS.md)
- Every hand-off that has happened: [`HANDOFF_LOG.md`](HANDOFF_LOG.md)
- Every storage payment: [`STORAGE_LOG.md`](STORAGE_LOG.md)
