# The Stewardship Arrangement

### for the Ladakh–Spiti Shared Manuscript Catalogue

*A plain-language agreement between the seven library committees of Diskit, Thiksey, Hemis, Alchi and Lamayuru in Ladakh, and Kye and Tabo in Spiti.*

---

## 1. What we share

Together we keep one catalogue: what each library holds, the condition of every work, which folios are damaged or missing, and which have been photographed. No one library has the whole picture. This catalogue does.

For nine years one person, Ngawang Dorje, kept it for all of us. He paid for the storage, held the only key that could publish it, and typed in every correction we sent him. This agreement exists so that the catalogue does not depend on any one person, including whoever comes after him.

The catalogue lives on **Swarm**, a storage network with no single company or server behind it. Anyone can read it. Only the people named below can change it, and only in the ways described below.

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
| Payer (storage custodian) | the shared Bee node's wallet | _(no batch yet: `npm run cli -- storage buy` or `storage use` fills this in)_ |
| Council scribe (owns the registry feed) | held by the council secretary | _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_ |
| Steward key | Ngawang Dorje (hemis) | _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_ |
| Steward key | Padma Chodon (tabo) | _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_ |
| Steward key | Stanzin Namgyal (thiksey) | _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_ |
| Library committee key | Diskit library committee (Ladakh) | _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_ |
| Library committee key | Thiksey library committee (Ladakh) | _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_ |
| Library committee key | Hemis library committee (Ladakh) | _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_ |
| Library committee key | Alchi library committee (Ladakh) | _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_ |
| Library committee key | Lamayuru library committee (Ladakh) | _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_ |
| Library committee key | Kye library committee (Spiti) | _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_ |
| Library committee key | Tabo library committee (Spiti) | _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_ |
<!-- /lsc:identities -->

## 3. Who comes next

Every steward, when they accept the role, names the person they would like to follow them. They sign this with their own key while they are still able to. It is their **standing designation**, and it stays on record even if they later become unreachable.

<!-- lsc:successor -->
**Status: planned, not yet in force.** The live ceremony has not run yet, so nobody has signed anything.

**First steward:** Ngawang Dorje, key _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_

**Designated successor:** Padma Chodon, key _(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_. This becomes binding when Ngawang Dorje signs the genesis statement that names them.

**When the successor takes over:** when any trigger in §4 is met (T1 they step down; T2 no catalogue update for 60 days and two libraries unanswered for 30; T3 under 30 days of storage left; T4 five of the seven libraries ask for removal), with 4 of the 7 library seals.
<!-- /lsc:successor -->

Handing over to the designated successor needs **4 of the 7 seals**. Handing over to anyone else needs **5 of the 7**, because it overrides the outgoing steward's own wish.

## 4. When a hand-off may begin

Any library may start a hand-off when **one** of these is true:

- **T1: The steward steps down.** The steward says so in writing to at least two libraries.
- **T2: The steward has gone silent.** There has been no catalogue update for **60 days**, *and* at least two libraries have sent written requests that went unanswered for **30 days**.
- **T3: The storage is running out.** Less than **30 days** of paid storage remain and nobody has topped it up. (Any library may top it up first; see §7.)
- **T4: Removal for cause.** Five of the seven libraries ask for it.

The software can check T2 and T3 against the network (`npm run cli -- succession check-trigger`). A trigger only opens the door: the hand-off still needs the seals.

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
- **Anyone may add to the rent.** Topping up an existing batch is open to anyone on the Gnosis Chain, not only its owner. Any library, donor or well-wisher with xBZZ can extend the storage without asking permission.
- If the storage falls below 30 days, that is trigger T3, whether or not the steward is active.

## 8. What this arrangement cannot protect against

We would rather say this plainly than have you discover it later.

- **Storage custody is not separated.** At present all storage runs on **one shared Bee node**, and every postage batch belongs to that node's wallet. Whoever controls that machine controls whether new uploads can be stamped. Other people can *add rent*, but cannot stamp uploads or take over the batch. A future step is for a second library to run its own node and hold its own batch as a mirror.
- **All the keys were made on one machine for this demonstration.** In real use, each library committee and each steward generates their own key on their own device and shares only the public address.
- **Losing the scribe key** would freeze the register: no new steward could be recorded, although the catalogue stays readable. The council secretary keeps the key, with sealed copies at two libraries. A later version may let several libraries each keep a mirror register.
- **Storage that has fully expired cannot be revived.** It can only be uploaded again from a copy. Top up before it runs out.
- **Everything published is public.** Do not put anything in the catalogue that should not be seen by anyone, forever.

## 9. Changing this agreement

This agreement may be changed with the seals of **5 of the 7** libraries. The charter that the software enforces (members, 4-of-7, 5-of-7, the 60/30/30-day numbers) is part of the first register entry, and every later entry must match it exactly. In this version, changing the charter means starting a new register.

## 10. Where to find everything

- The **register** (readers start here; the address never changes):

<!-- lsc:anchor -->
```
registry owner (council scribe) : (created by the first live hand-off)
registry topic                  : lsc/registry/v1
registry topic (hex)            : f17e2832a227f4efaf7867e0d8f9ba14fa070ef851fb46967eb51c77a4b88a6d
registry feed manifest          : (created by the first live hand-off)
catalogue topic                 : lsc/catalogue/v1  (5585bf7626ca42b72333dfda4e6a6bf7118861a23e4e2b026a727e0e9db1249f)
corrections topic               : lsc/corrections/v1  (2cf9be53bb7408cee80ea7678ddcb7700e4ae3167670105625954316124ee633)
```
<!-- /lsc:anchor -->

- How to read the catalogue with no software from us: [`docs/READ_WITHOUT_US.md`](docs/READ_WITHOUT_US.md)
- What each technical mechanism can and cannot do: [`docs/MECHANISMS.md`](docs/MECHANISMS.md)
- Every hand-off that has happened: [`HANDOFF_LOG.md`](HANDOFF_LOG.md)
- Every storage payment: [`STORAGE_LOG.md`](STORAGE_LOG.md)
