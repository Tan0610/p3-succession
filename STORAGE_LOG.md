# Storage log

Swarm storage is rent paid in advance. Every purchase, extension and top-up of the catalogue's postage batch is appended here automatically (machine-readable copy: `ledger/storage.json`). "TTL" is the node's own estimate of the days left at today's storage price, read from the node before and after each payment.

Topping up is open to anyone on Gnosis Chain (`PostageStamp.topUp` has no owner check), so any library or donor can keep the catalogue alive. See `docs/MECHANISMS.md`.

| When (UTC) | Action | Batch | Paid by | Detail | Cost (xBZZ) | TTL days before → after |
|---|---|---|---|---|---|---|
| 2026-09-19 05:44 | buy | `65c1e84317fa…` | `0x9452a51F8b43239b8572C08253E4b7ECAf339cb8` | 5 MB for 14 days | 0.6546056628404224 | — → 14 |
| 2026-09-19 05:52 | extend | `65c1e84317fa…` | `0x9452a51F8b43239b8572C08253E4b7ECAf339cb8` | +1 day(s) | 0.0467575473700864 | 14 → 15 |
