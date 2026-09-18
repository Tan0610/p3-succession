/**
 * The succession ceremony, end to end.
 *
 *   npm run ceremony -- --rehearse      in memory, ephemeral keys, nothing leaves the process
 *   npm run ceremony -- --live --yes    against the Bee node: real keys, real feeds, real evidence
 *
 * The live run is resumable: each stage checks the network first and is skipped
 * if it already happened.
 */
import { writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import { parseArgs } from 'node:util'
import { MemoryFeedStore } from '../src/core/memory-feedstore.js'
import { performHandoff, QuorumRejected } from '../src/core/operations.js'
import { makeEphemeralCast, rehearse } from '../src/core/rehearsal.js'
import { readRegistry } from '../src/core/resolve.js'
import { signText } from '../src/core/signatures.js'
import { sameAddress } from '../src/core/swarm.js'
import { auditSecrets } from '../src/node/audit.js'
import { BeeFeedStore } from '../src/node/bee.js'
import {
  accept,
  cataloguePublish,
  correctionSubmit,
  ctx,
  handoff,
  keysInit,
  propose,
  read,
  signWithKey,
  storageExtend,
  storageStatusCmd,
  type Ctx,
} from '../src/node/commands.js'
import { charterFromConfig, loadSeed, requireAnchor, stewardByKey } from '../src/node/config.js'
import { loadProposal, rehearsalPath, saveProposal } from '../src/node/evidence.js'
import { loadIdentity } from '../src/node/keys.js'
import { ROOT } from '../src/node/paths.js'
import { readLedger } from '../src/node/storage.js'

const { values: args } = parseArgs({
  options: {
    rehearse: { type: 'boolean' },
    live: { type: 'boolean' },
    yes: { type: 'boolean' },
    'extend-days': { type: 'string', default: '1' },
    bee: { type: 'string' },
  },
})

const say = (s: string) => console.log(s)
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
  say(`\nrehearsal passed · summary in ${relative(ROOT, path)} (git-ignored)`)
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
  const status = await storageStatusCmd(c)
  if (!status) throw new Error('Choose or buy a batch first: npm run cli -- storage buy --mb 100 --days 14 --yes')

  act('1. Keys (private halves stay in .secrets/, git-ignored)')
  keysInit()
  c = fresh()
  const anchor = requireAnchor(c.config)
  const readStore = new BeeFeedStore(c.bee, null)
  const st = (k: string) => stewardByKey(c.config, k)
  const ngawang = st('steward-ngawang')
  const padma = st('steward-padma')
  const stanzin = st('steward-stanzin')

  act('2. Genesis: four libraries seal, Ngawang accepts and names Padma')
  if ((await readRegistry(readStore, anchor)).current) say('already done')
  else {
    const { path } = await propose(c, { incoming: ngawang.address!, next: padma.address!, trigger: 'T0-genesis' })
    for (const lib of ['hemis', 'thiksey', 'diskit', 'lamayuru']) await signWithKey({ proposal: path, as: lib })
    await accept({ proposal: path, as: 'steward-ngawang' })
    await handoff(fresh(), { proposal: path, incoming: ngawang.address! })
  }

  act('3. Ngawang publishes the catalogue')
  c = fresh()
  if ((await readStore.latestIndex(ngawang.address!, anchor.catalogueTopicHex)) !== null) say('already published')
  else await cataloguePublish(c, { as: 'steward-ngawang' })

  act('4. Tabo and Kye post signed corrections, without the steward')
  const taboLatest = await readStore.latestIndex(c.config.libraries.find((l) => l.id === 'tabo')!.address!, anchor.correctionsTopicHex)
  if (taboLatest !== null) say('already posted')
  else {
    const seed = loadSeed()
    const taboRec = seed.records.find((r) => r.library === 'tabo')!
    const hemisRec = seed.records.find((r) => r.library === 'hemis')!
    await correctionSubmit(c, { as: 'tabo', record: taboRec.id, set: ['condition=damaged', 'photographed=true'], note: 'Water stain on the last twelve folios after the spring leak.' })
    await correctionSubmit(c, { as: 'kye', record: hemisRec.id, set: [], note: 'Kye holds a second copy of this text; worth comparing.' })
  }

  act(`5. Keep the storage alive: extend the existing batch by ${args['extend-days']} day(s)`)
  if (readLedger().some((e) => e.action === 'extend' || e.action === 'topup')) say('already extended once (see STORAGE_LOG.md)')
  else await storageExtend(fresh(), { days: Number(args['extend-days']), yes: true })

  act('6. Ngawang goes quiet. The committees move to hand over to Padma.')
  c = fresh()
  const reg = await readRegistry(readStore, anchor)
  if (!sameAddress(reg.current?.entry?.steward.address, ngawang.address)) say('already handed over')
  else {
    const { path } = await propose(c, { incoming: padma.address!, next: stanzin.address!, trigger: 'T2-silence' })
    await accept({ proposal: path, as: 'steward-padma' })

    // Refusal A: the outgoing steward tries to seal on a library's behalf.
    let p = loadProposal(path)
    const ngKey = loadIdentity(ngawang.keyName, ngawang.name)
    const charter = charterFromConfig(c.config)
    const forged = { ...p, approvals: [{ library: 'hemis' as const, address: charter.members.find((m) => m.id === 'hemis')!.address, signature: await signText(ngKey.wallet, p.statement) }] }
    try {
      await performHandoff({ store: new BeeFeedStore(c.bee, c.config.payer.batchId), anchor, charter, proposal: forged, incoming: padma.address!, scribe: loadIdentity(c.config.council.scribe.keyName, 'Council scribe'), now: new Date() })
      throw new Error('forged hand-off was accepted: this must never happen')
    } catch (e) {
      if (!(e instanceof QuorumRejected)) throw e
      p = loadProposal(path)
      p.rejectedAttempts.push({ at: new Date().toISOString(), attempt: 'The outgoing steward signs on behalf of Hemis', result: e.message })
      saveProposal(p, path)
      say(`refused as expected: ${e.message}`)
    }

    // Refusal B: three seals only.
    for (const lib of ['hemis', 'alchi', 'tabo']) await signWithKey({ proposal: path, as: lib })
    await handoff(fresh(), { proposal: path, incoming: padma.address!, attempt: 'Three of seven libraries seal the hand-off' })

    // The fourth seal: now it goes through.
    await signWithKey({ proposal: path, as: 'kye' })
    await handoff(fresh(), {
      proposal: path,
      incoming: padma.address!,
      notes: [
        'Trigger T2 (silence) was declared by the sealing committees for this demonstration; the 60-day clock itself is exercised in the rehearsal and tests, not waited out in real time.',
        "Ngawang's key was not used in this hand-off. His earlier signed acceptance (epoch 0) named Padma, which is why four seals suffice.",
      ],
    })
  }

  act('7. Padma publishes on her own feed, folding in the corrections')
  c = fresh()
  if ((await readStore.latestIndex(padma.address!, anchor.catalogueTopicHex)) !== null) say('already published')
  else await cataloguePublish(c, { as: 'steward-padma' })

  act('8. Read it back with no keys at all')
  await read({ bee: args.bee })

  act('9. Secret audit')
  const hits = auditSecrets()
  if (hits.length) throw new Error(`secret audit failed: ${hits.map((h) => `${h.file}:${h.line} ${h.kind}`).join(', ')}`)
  say('clean')
  say('\nCommit handoffs/, HANDOFF_LOG.md, STORAGE_LOG.md, ledger/, stewardship.config.json and STEWARDSHIP.md.')
}

const run = args.live ? live : args.rehearse ? rehearseAll : null
if (!run) {
  console.log('usage: npm run ceremony -- --rehearse | --live --yes [--extend-days 1] [--bee url]')
  process.exitCode = 2
} else {
  run().catch((e: Error) => {
    console.error(`\nceremony failed: ${e.message}`)
    process.exitCode = 1
  })
}
