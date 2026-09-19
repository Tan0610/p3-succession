# Hand-off log

Every change of steward is appended here automatically by `npm run cli -- succession handoff`. The full evidence for each entry is in the `handoffs/*.json` file it links to. Anyone can re-check it with `npm run verify:handoff -- <file>`, which re-counts the seals and reads the registry update back from the network.

*Honest note:* the hand-offs below were performed by a single person. All signing keys were generated on one machine for the demonstration and kept in its git-ignored `.secrets/` folder. In real use each library committee and each steward generates their own key on their own device and shares only the address. Storage custody is also not separated: every postage batch belongs to the one shared Bee node.

<!-- lsc:status -->
**Status:** rehearsed, not yet performed live. `npm run ceremony -- --live --yes` performs it on a Bee node and writes the evidence into `handoffs/` and [HANDOFF_LOG.md](HANDOFF_LOG.md).
<!-- /lsc:status -->
