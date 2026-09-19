# Reading the catalogue without our software

You need **one address** (the council scribe's) and **any Bee node or gateway**. You do not need keys, and you do not need to trust our code.

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

The registry address **never changes**, however many stewards come and go. It points to whoever the current steward is.

## 1. Quickest: two `curl`s

```sh
BEE=http://localhost:1633            # or any Bee node / gateway you trust

# the current registry entry (JSON): who the steward is, and the seals that put them there
curl $BEE/bzz/<registry feed manifest>/

# the catalogue, from the steward the entry names
curl $BEE/bzz/<entry.catalogueManifest>/catalogue.json     # machine-readable
curl $BEE/bzz/<entry.catalogueManifest>/                   # a plain HTML page, no JavaScript
curl $BEE/bzz/<entry.catalogueManifest>/catalogue.csv      # for spreadsheets
```

<!-- lsc:curl -->
_The same two commands with the real references appear here once they exist: the registry feed manifest is (created by the first live hand-off)._
<!-- /lsc:curl -->

This shows the **latest** registry entry. A careful reader also checks its seals (step 3), because the scribe could write an entry without them. Readers are expected to ignore such an entry and fall back to the previous valid one.

## 2. Careful: walk the registry yourself

Feed arithmetic (Swarm "sequence" feeds):

```
topic         = keccak256(utf8("lsc/registry/v1"))
identifier(i) = keccak256(topic ‖ uint64_big_endian(i))
chunk(i)      = keccak256(identifier(i) ‖ owner_address_20_bytes)
```

- `GET $BEE/feeds/<owner>/<topic>` (send header `Swarm-Only-Root-Chunk: true`) returns the latest index in the `swarm-feed-index` response header. A 404 means *either* an empty feed *or* a lookup that timed out, so before concluding "empty", ask for `chunk(0)` directly. Public gateways may hide the header; then walk `chunk(0), chunk(1), …` until one is missing.
- `GET $BEE/chunks/<chunk(i)>` returns `identifier(32) ‖ signature(65) ‖ span(8) ‖ timestamp(8) ‖ reference(32)`.
- `GET $BEE/bzz/<reference>/` returns the registry entry JSON for update *i*.

Go from `i = 0` upwards. **An entry counts only if** all of these hold:

1. its `epoch` is one more than the last entry that counted (0 for the first);
2. `fields.previous` is `{feedIndex, reference}` of the last entry that counted (null for the first);
3. `charterHash == keccak256(canonical JSON of charter)`, and the charter is the same as in the first entry;
4. `statement` equals the text rendered from `fields` (template in `src/core/statements.ts`);
5. `acceptance.signature` is a `personal_sign` of `statement` by `steward.address`;
6. at least **4** `approvals` (or **5** if `steward` is not the previous entry's `designatedSuccessor`) are `personal_sign`s of `statement` by distinct charter members, each with the address the charter lists for that library.

The last entry that counts names the current steward. Their catalogue is the latest update on feed (`steward.address`, `keccak256("lsc/catalogue/v1")`), a collection containing `catalogue.json`. If they haven't published yet, use the previous steward's latest.

## 3. Checking a signature with any wallet tool

Every seal is a standard Ethereum signed message. For example, with `cast` (Foundry):

```sh
cast wallet verify --address <library address> "<statement text exactly>" <signature>
```

or in a browser console with ethers: `ethers.verifyMessage(statement, signature)`.

## 4. Library corrections not yet folded in

For each of the seven charter members, feed (`member.address`, `keccak256("lsc/corrections/v1")`) holds that library's signed corrections. Any update past `catalogue.correctionCursor[library]` is still pending. It is valid if `signature` is a `personal_sign` of `statement` by that library's address and `statement` re-renders from the fields.

## 5. Or use ours, which follows exactly these rules

```sh
npm run cli -- read --registry-owner <address>        # keyless
```

or open the web viewer (`npm run dev:web`), which uses `src/core/http-feedstore.ts`: plain `fetch`, no bee-js, no keys.
