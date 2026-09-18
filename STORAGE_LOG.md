# Storage log

Swarm storage is rent paid in advance. Every purchase, extension and top-up of the catalogue's postage batch is appended here automatically (machine-readable copy: `ledger/storage.json`). "TTL" is the node's own estimate of the days left at today's storage price, read from the node before and after each payment.

Topping up is open to anyone on Gnosis Chain (`PostageStamp.topUp` has no owner check), so any library or donor can keep the catalogue alive. See `docs/MECHANISMS.md`.

| When (UTC) | Action | Batch | Paid by | Detail | Cost (xBZZ) | TTL days before → after |
|---|---|---|---|---|---|---|
