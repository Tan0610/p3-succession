/**
 * Re-checks a committed hand-off record, trusting nothing in it:
 *   offline - re-counts the seals and the acceptance against the signed statement
 *   online  - reads the registry update back from the node and checks the
 *             signed chunk is owned by the council scribe
 *
 *   npm run verify:handoff -- handoffs/2026-09-20-epoch-1.json [--bee http://localhost:1633] [--offline]
 */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { readRegistry, defaultAnchor } from '../src/core/resolve.js'
import { RegistryEntry } from '../src/core/schemas.js'
import { recoverSigner, verifyQuorum } from '../src/core/signatures.js'
import { sameAddress } from '../src/core/swarm.js'
import { BeeFeedStore, makeBee } from '../src/node/bee.js'
import type { HandoffRecord } from '../src/node/evidence.js'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { bee: { type: 'string' }, offline: { type: 'boolean' } } })
const file = positionals[0]
if (!file) {
  console.log('usage: npm run verify:handoff -- <handoffs/…json> [--bee url] [--offline]')
  process.exit(2)
}

const record = JSON.parse(readFileSync(file, 'utf8')) as HandoffRecord
let failures = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures++
}

const main = async () => {
  check(!sameAddress(record.outgoing?.address, record.incoming.address), 'outgoing and incoming are two distinct signing identities')
  check(sameAddress(recoverSigner(record.statement, record.incoming.acceptanceSignature), record.incoming.address), 'incoming steward signed the statement')
  for (const a of record.approvals) {
    check(sameAddress(recoverSigner(record.statement, a.signature), a.address), `seal from ${a.library} recovers to ${a.address}`)
  }
  if (values.offline) return
  const url = values.bee ?? record.bee.url
  const store = new BeeFeedStore(makeBee(url), null)
  const anchor = defaultAnchor(record.council.scribe)
  const ref = await store.readRefAt(record.council.scribe, anchor.registryTopicHex, BigInt(record.registryUpdate.feedIndex))
  check(ref === record.registryUpdate.entryReference, `registry update #${record.registryUpdate.feedIndex} on the node points to the recorded entry`)
  const entry = RegistryEntry.parse(await store.readJson(ref))
  const registry = await readRegistry(store, anchor)
  const charter = registry.genesisCharter ?? entry.charter
  const q = verifyQuorum(entry.statement, entry.approvals, charter, charter.threshold)
  check(q.counted.length >= charter.threshold, `entry on the network carries ${q.counted.length} valid seals`)
  const proof = await store.socProof(record.council.scribe, anchor.registryTopicHex, BigInt(record.registryUpdate.feedIndex))
  check(sameAddress(proof.owner, record.council.scribe), `signed chunk ${proof.socAddress.slice(0, 12)}… is owned by the council scribe`)
  check(
    registry.valid.some((v) => v.feedIndex === record.registryUpdate.feedIndex),
    'a keyless reader accepts this entry as valid',
  )
}

main()
  .then(() => {
    console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
    process.exitCode = failures ? 1 : 0
  })
  .catch((e: Error) => {
    console.error(e.message)
    process.exitCode = 1
  })
