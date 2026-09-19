/**
 * The succession ceremony, end to end.
 *
 *   npm run ceremony -- --rehearse      in memory, ephemeral keys, nothing leaves the process
 *   npm run ceremony -- --live --yes    against the Bee node: real keys, real feeds, real evidence
 *        [--incoming <steward key name | 0x address>]   who takes over (default steward-padma, or LSC_INCOMING)
 *        [--next <steward>] [--first <steward>]          who they name next, and who held it first
 *
 * The live run is resumable: each stage checks the network first and is skipped
 * if it already happened.
 */
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { MemoryFeedStore } from '../src/core/memory-feedstore.js'
import { performHandoff, QuorumRejected } from '../src/core/operations.js'
import { makeEphemeralCast, rehearse } from '../src/core/rehearsal.js'
import { readRegistry, resolveAll } from '../src/core/resolve.js'
import { requiredThreshold, signText } from '../src/core/signatures.js'
import { sameAddress } from '../src/core/swarm.js'
import { auditSecrets } from '../src/node/audit.js'
import { BeeFeedStore } from '../src/node/bee.js'
import {
  accept,
  assertCanPay,
  cataloguePublish,
  correctionSubmit,
  ctx,
  handoff,
  keysInit,
  propose,
  read,
  recoverHandoffRecords,
  signWithKey,
  storageExtend,
  storageStatusCmd,
  type Ctx,
} from '../src/node/commands.js'
import { charterFromConfig, loadSeed, requireAnchor, stewardByKey, syncDocs } from '../src/node/config.js'
import { loadProposal, rehearsalPath, saveProposal } from '../src/node/evidence.js'
import { loadIdentity } from '../src/node/keys.js'
import { repoPath } from '../src/node/paths.js'
import { quoteExtend, readLedger, waitUntilUsable } from '../src/node/storage.js'

const { values: args } = parseArgs({
  options: {
    rehearse: { type: 'boolean' },
    live: { type: 'boolean' },
    yes: { type: 'boolean' },
    'extend-days': { type: 'string', default: '1' },
    bee: { type: 'string' },
    // the succession itself is parameterised: steward key names (steward-padma) or addresses (0x…)
    first: { type: 'string', default: 'steward-ngawang' },
    incoming: { type: 'string', default: process.env.LSC_INCOMING ?? 'steward-padma' },
    next: { type: 'string', default: 'steward-stanzin' },
  },
})

const extendDays = Number(args['extend-days'])
if (!Number.isFinite(extendDays) || extendDays <= 0) throw new Error('--extend-days must be a positive number')

const say = (s: string) => console.log(s)

/** A steward from stewardship.config.json, named by key name or by address. */
function stewardArg(c: Ctx, value: string, flag: string) {
  const s = value.startsWith('0x') ? c.config.stewards.find((x) => sameAddress(x.address, value)) : stewardByKey(c.config, value)
  if (!s?.address) throw new Error(`${flag} ${value}: no steward with that key name or address in stewardship.config.json`)
  return s
}

/** A hand-off the network has but this checkout has no record of (the run was cut off mid-write). */
async function recoverInterrupted(c: Ctx) {
  const recovered = await recoverHandoffRecords(c)
  if (recovered.length) say(`recovered evidence from the network for ${recovered.join(', ')} (an earlier run stopped after the registry write)`)
}
const act = (s: string) => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 66 - s.length))}`)

async function rehearseAll() {
  act('Rehearsal (memory store, throwaway keys: nothing leaves this process)')
  const gen = rehearse({ store: new MemoryFeedStore(), cast: makeEphemeralCast(), seed: loadSeed() })
  let step = await gen.next()
  let n = 0
  while (!step.done) {
    const s = step.value
    say(`${String(++n).padStart(2)}. ${s.refused ? '[refused as expected] ' : ''}${s.title}\n    ${s.detail}`)
    step = await gen.next()
  }
  const r = step.value
  const stewards = r.finalView.registry.valid.map((e) => e.entry!.steward.name)
  const ignored = r.finalView.registry.entries.filter((e) => !e.ok).length
  if (r.rejectedAttempts.length !== 4) throw new Error(`expected 4 refused attempts, got ${r.rejectedAttempts.length}`)
  if (r.handoffs.length !== 3) throw new Error(`expected 3 registry entries, got ${r.handoffs.length}`)
  act('Result')
  say(`lineage: ${stewards.join(' → ')}`)
  say(`registry updates: ${r.finalView.registry.entries.length} (${ignored} ignored by readers)`)
  say(`catalogue: v${r.finalView.catalogue?.version} published by ${r.finalView.catalogue?.publishedBy.name}`)
  say(`refused: ${r.rejectedAttempts.map((a) => a.attempt).join(' | ')}`)
  const path = rehearsalPath(new Date())
  writeFileSync(
    path,
    JSON.stringify({ mode: 'rehearsal', note: 'In-memory rehearsal with throwaway keys. Not evidence of a live hand-off.', ...r, finalView: undefined, lineage: stewards }, null, 2),
  )
  say(`\nrehearsal passed · summary in ${repoPath(path)} (git-ignored)`)
}

async function live() {
  if (!args.yes) {
    say('The live ceremony writes to Swarm through your node and spends a little xBZZ on the storage extension.')
    say('Re-run with --live --yes when you are ready.')
    return
  }
  const fresh = (): Ctx => ctx(args.bee)
  let c = fresh()

  act('0. Preflight: payer and storage')
  const health = await c.bee.status.getHealth()
  say(`Bee ${health.version} (API ${health.apiVersion}) at ${c.url}`)
  let status = await storageStatusCmd(c)
  if (!status) throw new Error('Choose or buy a batch first: npm run cli -- storage buy --mb 5 --days 14 --yes')
  if (status.ttlDays <= 0) throw new Error(`Batch ${status.batchId} has expired. Buy a new one; an expired batch cannot be revived.`)
  if (!status.usable) {
    say('The batch is not usable yet (the node is still waiting for confirmations). Waiting before anything is uploaded…')
    status = await waitUntilUsable(c.bee, status.batchId, { onWait: (s) => say(`  still waiting (${s} s)`) })
  }
  // Every stage below is either free (uploads use the prepaid batch) or the one
  // extension. Check the wallet can pay for it now, not halfway through.
  if (!readLedger().some((e) => e.action === 'extend' || e.action === 'topup')) {
    await assertCanPay(c, await quoteExtend(c.bee, status.batchId, extendDays), 'Stopping before anything is written.')
  }
  say(`Batch usable, ${status.ttlDays} days paid, ${status.usageText} used. Wallet can cover the extension.`)
  const cheques = await c.bee.chequebook.getBalance().catch(() => null)
  if (cheques && cheques.availableBalance.toPLURBigInt() === 0n) {
    // Not fatal: a few hundred chunks usually fit in the peers' free allowance.
    say('note: the chequebook is empty, so uploads rely on peers\' free bandwidth allowance. If an upload fails with')
    say('      "insufficient funds" or "overdraft", deposit a little xBZZ (e.g. 0.1) into the chequebook and re-run: it resumes.')
  }

  act('1. Keys (private halves stay in .secrets/, git-ignored)')
  keysInit()
  c = fresh()
  const anchor = requireAnchor(c.config)
  const readStore = new BeeFeedStore(c.bee, null)
  // Who is who comes from the command line (or LSC_INCOMING), not from this file.
  const first = stewardArg(c, args.first!, '--first')
  const incoming = stewardArg(c, args.incoming!, '--incoming')
  const next = stewardArg(c, args.next!, '--next')
  if (new Set([first.address, incoming.address, next.address]).size !== 3) throw new Error('--first, --incoming and --next must be three different stewards')
  say(`first steward ${first.name} ${first.address}\nincoming      ${incoming.name} ${incoming.address}  (named by --incoming)\nnext after    ${next.name} ${next.address}`)
  await recoverInterrupted(c)

  act(`2. Genesis: four libraries seal, ${first.name} accepts and names ${incoming.name}`)
  if ((await readRegistry(readStore, anchor)).current) say('already done')
  else {
    const { path } = await propose(c, { incoming: first.address!, next: incoming.address!, trigger: 'T0-genesis' })
    for (const lib of ['hemis', 'thiksey', 'diskit', 'lamayuru']) await signWithKey({ proposal: path, as: lib })
    await accept({ proposal: path, as: first.keyName })
    await handoff(fresh(), { proposal: path, incoming: first.address! })
  }

  act(`3. ${first.name} publishes the catalogue`)
  c = fresh()
  if ((await readStore.latestIndex(first.address!, anchor.catalogueTopicHex)) !== null) say('already published')
  else await cataloguePublish(c, { as: first.keyName })

  act('4. Tabo and Kye correct the catalogue themselves: no email, no steward key')
  const seed = loadSeed()
  const corrections = [
    { as: 'tabo', record: seed.records.find((r) => r.library === 'tabo')!.id, set: ['condition=damaged', 'photographed=true'], note: 'Water stain on the last twelve folios after the spring leak.' },
    { as: 'kye', record: seed.records.find((r) => r.library === 'hemis')!.id, set: [], note: 'Kye holds a second copy of this text; worth comparing.' },
  ]
  for (const k of corrections) {
    // each library is checked on its own feed, so a run that stopped between the two resumes cleanly
    const lib = c.config.libraries.find((l) => l.id === k.as)!
    if ((await readStore.latestIndex(lib.address!, anchor.correctionsTopicHex)) !== null) say(`${lib.name}: already posted`)
    else await correctionSubmit(c, k)
  }
  // What a stranger sees right now: the corrections, signed, on top of a catalogue nobody has republished.
  const seen = await resolveAll(readStore, anchor).catch(() => null)
  const verified = seen?.pending.filter((p) => p.verified).length ?? 0
  if (verified) say(`a keyless reader already sees ${verified} signed correction(s) on top of ${seen?.source ? `${seen.source.stewardName}'s catalogue` : 'the catalogue (the node has not indexed it yet)'}. ${first.name} has not touched them.`)

  act(`5. Keep the storage alive: extend the existing batch by ${extendDays} day(s)`)
  if (readLedger().some((e) => e.action === 'extend' || e.action === 'topup')) say('already extended once (see STORAGE_LOG.md)')
  else await storageExtend(fresh(), { days: extendDays, yes: true })

  act(`6. ${first.name} goes quiet. The committees move to hand over to ${incoming.name}.`)
  c = fresh()
  const reg = await readRegistry(readStore, anchor)
  const stewardNow = reg.current?.entry?.steward.address ?? null
  if (sameAddress(stewardNow, incoming.address)) say('already handed over')
  else if (!sameAddress(stewardNow, first.address)) {
    // never guess from a registry read that came back short: stop, and let a re-run resume here
    throw new Error(`The registry names ${stewardNow ?? 'nobody'} as steward, not ${first.name}. If the node is still catching up, re-run: the ceremony resumes.`)
  } else {
    const { path, proposal } = await propose(c, { incoming: incoming.address!, next: next.address!, trigger: 'T2-silence' })
    const charter = charterFromConfig(c.config)
    const needed = requiredThreshold(charter, reg.current?.entry ?? null, proposal.fields.incoming.address)
    await accept({ proposal: path, as: incoming.keyName })

    // Refusal A: the outgoing steward tries to seal on a library's behalf.
    let p = loadProposal(path)
    const outgoingKey = loadIdentity(first.keyName, first.name)
    const forged = { ...p, approvals: [{ library: 'hemis' as const, address: charter.members.find((m) => m.id === 'hemis')!.address, signature: await signText(outgoingKey.wallet, p.statement) }] }
    try {
      await performHandoff({ store: new BeeFeedStore(c.bee, c.config.payer.batchId), anchor, charter, proposal: forged, incoming: incoming.address!, scribe: loadIdentity(c.config.council.scribe.keyName, 'Council scribe'), now: new Date() })
      throw new Error('forged hand-off was accepted: this must never happen')
    } catch (e) {
      if (!(e instanceof QuorumRejected)) throw e
      p = loadProposal(path)
      p.rejectedAttempts.push({ at: new Date().toISOString(), attempt: 'The outgoing steward signs on behalf of Hemis', result: e.message })
      saveProposal(p, path)
      say(`refused as expected: ${e.message}`)
    }

    // Refusal B: one seal short.
    const sealers = ['hemis', 'alchi', 'tabo', 'kye', 'diskit'].slice(0, needed)
    for (const lib of sealers.slice(0, -1)) await signWithKey({ proposal: path, as: lib })
    await handoff(fresh(), { proposal: path, incoming: incoming.address!, attempt: `${needed - 1} of 7 libraries seal the hand-off` })

    // The last seal: now it goes through.
    await signWithKey({ proposal: path, as: sealers.at(-1)! })
    await handoff(fresh(), {
      proposal: path,
      incoming: incoming.address!,
      notes: [
        'Trigger T2 (silence) was declared by the sealing committees for this demonstration; the 60-day clock itself is exercised in the rehearsal and tests, not waited out in real time.',
        needed === charter.threshold
          ? `${first.name}'s key was not used in this hand-off. The acceptance ${first.name} signed at epoch 0 named ${incoming.name}, which is why ${needed} seals suffice.`
          : `${first.name}'s key was not used in this hand-off. ${incoming.name} was not the successor ${first.name} named, so ${needed} seals were required.`,
      ],
    })
  }

  act(`7. ${incoming.name} publishes on their own feed, folding in the corrections`)
  c = fresh()
  await recoverInterrupted(c)
  if ((await readStore.latestIndex(incoming.address!, anchor.catalogueTopicHex)) !== null) say('already published')
  else await cataloguePublish(c, { as: incoming.keyName })

  act('8. Read it back with no keys at all')
  await read({ bee: args.bee })

  act('9. Documents and secret audit')
  const synced = syncDocs()
  if (synced.length) say(`refreshed ${synced.map(repoPath).join(', ')} from stewardship.config.json`)
  const hits = auditSecrets()
  if (hits.length) throw new Error(`secret audit failed: ${hits.map((h) => `${h.file}:${h.line} ${h.kind}`).join(', ')}`)
  say('clean')
  say('\nCommit handoffs/, HANDOFF_LOG.md, STORAGE_LOG.md, ledger/, stewardship.config.json, STEWARDSHIP.md, README.md and docs/.')
}

const run = args.live ? live : args.rehearse ? rehearseAll : null
if (!run) {
  console.log('usage: npm run ceremony -- --rehearse | --live --yes [--incoming steward-padma|0x…] [--next steward-stanzin] [--first steward-ngawang] [--extend-days 1] [--bee url]')
  process.exitCode = 2
} else {
  run().catch((e: Error) => {
    console.error(`\nceremony failed: ${e.message}`)
    process.exitCode = 1
  })
}
