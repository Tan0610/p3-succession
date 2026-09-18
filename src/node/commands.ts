import { existsSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { BZZ, type Bee } from '@ethersphere/bee-js'
import { stats } from '../core/catalogue.js'
import type { Identity } from '../core/feedstore.js'
import {
  addAcceptance,
  addSeal,
  acceptWith,
  draftProposal,
  performHandoff,
  publishCatalogue,
  QuorumRejected,
  sealWith,
  submitCorrection,
  type HandoffOutcome,
} from '../core/operations.js'
import { readRegistry, resolveAll, defaultAnchor, type Anchor, type CatalogueView } from '../core/resolve.js'
import { CorrectionChanges, LibraryId, TriggerId, type Condition, type HandoffProposal } from '../core/schemas.js'
import { recoverSigner, verifyQuorum, requiredThreshold } from '../core/signatures.js'
import { sameAddress, shortHex } from '../core/swarm.js'
import { evaluateTriggers } from '../core/triggers.js'
import { BeeFeedStore, makeBee } from './bee.js'
import {
  beeUrl,
  charterFromConfig,
  loadConfig,
  loadSeed,
  personName,
  requireAnchor,
  saveConfig,
  stewardByKey,
  syncDocs,
  type StewardshipConfig,
} from './config.js'
import { loadProposal, noteSuccessorPublication, proposalPath, recordFor, saveProposal, writeHandoffRecord } from './evidence.js'
import { assertIdentitiesSeparated } from './identities.js'
import { hasKey, loadIdentity, newKey } from './keys.js'
import { PATHS, ROOT } from './paths.js'
import {
  buyBatch,
  extendBatch,
  listBatches,
  payerAddress,
  quoteBuy,
  quoteExtend,
  recordLedger,
  storageStatus,
  topUpBatch,
  waitUntilUsable,
  walletFunds,
  type StorageStatus,
} from './storage.js'

export interface Ctx {
  config: StewardshipConfig
  bee: Bee
  url: string
}

export function ctx(beeOverride?: string): Ctx {
  const config = loadConfig()
  const url = beeUrl(config, beeOverride)
  return { config, bee: makeBee(url), url }
}

const out = (...lines: string[]) => console.log(lines.join('\n'))

function writeStore(c: Ctx): BeeFeedStore {
  return new BeeFeedStore(c.bee, c.config.payer.batchId)
}

function requireBatch(c: Ctx): string {
  if (!c.config.payer.batchId) throw new Error('No postage batch yet. Run `npm run cli -- storage buy --mb 100 --days 14 --yes` or `storage use <batchId>`.')
  return c.config.payer.batchId
}

// ── keys ────────────────────────────────────────────────────────────────────

/** Creates any missing keys (git-ignored) and writes their PUBLIC addresses into the config. */
export function keysInit(): StewardshipConfig {
  const config = loadConfig()
  const created: string[] = []
  const ensure = (keyName: string, display: string) => {
    if (!hasKey(keyName)) {
      newKey(keyName)
      created.push(keyName)
    }
    return loadIdentity(keyName, display).address
  }
  config.council.scribe.address = ensure(config.council.scribe.keyName, config.council.scribe.name)
  for (const l of config.libraries) l.address = ensure(l.keyName, l.name)
  for (const s of config.stewards) s.address = ensure(s.keyName, s.name)
  assertIdentitiesSeparated(config, config.payer.nodeAddress)
  saveConfig(config)
  syncDocs(config)
  out(created.length ? `Created ${created.length} key(s) in .secrets/keys (git-ignored): ${created.join(', ')}` : 'All keys already exist.')
  return config
}

export function keysList(): void {
  const c = loadConfig()
  const rows = [
    ['scribe', c.council.scribe.keyName, c.council.scribe.address],
    ...c.stewards.map((s) => ['steward', s.keyName, s.address]),
    ...c.libraries.map((l) => ['library', l.keyName, l.address]),
  ]
  for (const [role, name, addr] of rows) out(`${role!.padEnd(8)} ${name!.padEnd(18)} ${addr ?? '(no key yet)'} ${hasKey(name!) ? '' : '  [key not on this machine]'}`)
}

// ── storage (the PAYER's side) ──────────────────────────────────────────────

export async function storageStatusCmd(c: Ctx): Promise<StorageStatus | null> {
  const payer = await payerAddress(c.bee)
  out(`Payer (node wallet, owns every batch): ${payer}`)
  if (!c.config.payer.batchId) {
    out('No batch configured. Batches on this node:')
    for (const b of await listBatches(c.bee)) out(`  ${b.batchId}  ${b.label || '(no label)'}  depth ${b.depth}  ${b.ttlDays} days  ${b.usable ? 'usable' : 'not usable yet'}`)
    return null
  }
  const s = await storageStatus(c.bee, c.config.payer.batchId)
  const floor = TTL_FLOOR_DAYS
  out(
    `Batch ${s.batchId} "${s.label}"`,
    `  paid until ${s.expiresAt}  (~${s.ttlDays} days, node's estimate at today's price)`,
    `  usage ${s.usageText}, depth ${s.depth}, ${s.usable ? 'usable' : 'NOT usable'}`,
    s.ttlDays < floor ? `  !! below the ${floor}-day floor in STEWARDSHIP.md (trigger T3): top it up now. Anyone may.` : '',
  )
  return s
}

const TTL_FLOOR_DAYS = 30

export async function storageBuy(c: Ctx, opts: { mb: number; days: number; label?: string; yes?: boolean }): Promise<string | null> {
  const cost = await quoteBuy(c.bee, opts.mb, opts.days)
  out(`Buying ${opts.mb} MB for ${opts.days} days costs about ${cost} xBZZ, paid by the node wallet.`)
  if (!opts.yes) {
    out('Nothing bought. Re-run with --yes to buy.')
    return null
  }
  const payer = await payerAddress(c.bee)
  await assertCanPay(c, cost, 'Nothing bought.')
  const batchId = await buyBatch(c.bee, opts.mb, opts.days, opts.label ?? c.config.payer.batchLabel)
  // Save the id the moment the purchase is mined, before any waiting that could fail.
  c.config.payer.batchId = batchId
  c.config.payer.nodeAddress = payer
  saveConfig(c.config)
  syncDocs(c.config)
  out(`Bought batch ${batchId} (saved to stewardship.config.json). Waiting for the node to call it usable…`)
  let s: StorageStatus | null = null
  try {
    s = await waitUntilUsable(c.bee, batchId, { onWait: (sec) => out(`  not usable yet (${sec} s)`) })
  } finally {
    recordLedger({
      at: new Date().toISOString(), action: 'buy', batchId, payer, detail: `${opts.mb} MB for ${opts.days} days`,
      costBzz: cost, ttlDaysBefore: null, ttlDaysAfter: s?.ttlDays ?? null, expiresAfter: s?.expiresAt ?? null,
    })
  }
  out(`Batch ${shortHex(batchId)} is usable. Paid until ${s?.expiresAt}.`)
  return batchId
}

/** Refuses before any transaction if the node wallet can't cover `costBzz` plus gas. */
export async function assertCanPay(c: Ctx, costBzz: string, refusal: string): Promise<void> {
  const funds = await walletFunds(c.bee)
  if (funds.bzz.lt(BZZ.fromDecimalString(costBzz))) {
    throw new Error(`The node wallet holds ${funds.bzz.toDecimalString()} xBZZ, less than the ${costBzz} xBZZ needed. ${refusal}`)
  }
  if (!funds.hasGas) throw new Error(`The node wallet has no xDAI to pay gas. ${refusal}`)
}

export async function storageUse(c: Ctx, batchId: string): Promise<void> {
  const s = await storageStatus(c.bee, batchId)
  c.config.payer.batchId = s.batchId
  c.config.payer.nodeAddress = s.payer
  saveConfig(c.config)
  syncDocs(c.config)
  out(`Using batch ${s.batchId} (${s.ttlDays} days left).`)
}

export async function storageCost(c: Ctx, opts: { days: number; mb?: number }): Promise<void> {
  if (c.config.payer.batchId) out(`Extending the current batch by ${opts.days} day(s): ~${await quoteExtend(c.bee, c.config.payer.batchId, opts.days)} xBZZ`)
  if (opts.mb) out(`A new ${opts.mb} MB batch for ${opts.days} day(s): ~${await quoteBuy(c.bee, opts.mb, opts.days)} xBZZ`)
}

/** Extends the EXISTING batch: storage kept alive, not merely re-bought. */
export async function storageExtend(c: Ctx, opts: { days: number; yes?: boolean }) {
  const batchId = requireBatch(c)
  const cost = await quoteExtend(c.bee, batchId, opts.days)
  out(`Extending batch ${shortHex(batchId)} by ${opts.days} day(s) costs about ${cost} xBZZ.`)
  if (!opts.yes) return out('Nothing spent. Re-run with --yes.')
  await assertCanPay(c, cost, 'Nothing spent.')
  const { before, after } = await extendBatch(c.bee, batchId, opts.days)
  recordLedger({
    at: new Date().toISOString(), action: 'extend', batchId, payer: before.payer, detail: `+${opts.days} day(s)`,
    costBzz: cost, ttlDaysBefore: before.ttlDays, ttlDaysAfter: after.ttlDays, expiresAfter: after.expiresAt,
  })
  out(`Storage now paid until ${after.expiresAt} (${before.ttlDays} → ${after.ttlDays} days).`)
  return { before, after }
}

export async function storageTopup(c: Ctx, opts: { amount?: string; bzz?: string; yes?: boolean }) {
  const batchId = requireBatch(c)
  if (!opts.yes) return out(`Would top up ${shortHex(batchId)} with ${opts.amount ? `${opts.amount} PLUR/chunk` : `${opts.bzz} xBZZ`}. Re-run with --yes.`)
  const { before, after, amountPerChunk } = await topUpBatch(c.bee, batchId, { ...(opts.amount ? { amountPerChunk: opts.amount } : {}), ...(opts.bzz ? { bzz: opts.bzz } : {}) })
  recordLedger({
    at: new Date().toISOString(), action: 'topup', batchId, payer: before.payer, detail: `+${amountPerChunk} PLUR per chunk`,
    costBzz: opts.bzz ?? null, ttlDaysBefore: before.ttlDays, ttlDaysAfter: after.ttlDays, expiresAfter: after.expiresAt,
  })
  out(`Topped up. ${before.ttlDays} → ${after.ttlDays} days.`)
}

// ── catalogue (the STEWARD's side) ──────────────────────────────────────────

export async function cataloguePublish(c: Ctx, opts: { as: string; summary?: string; now?: Date }) {
  const s = stewardByKey(c.config, opts.as)
  const steward = loadIdentity(s.keyName, s.name)
  const store = writeStore(c)
  const payer = await payerAddress(c.bee)
  if (sameAddress(payer, steward.address)) throw new Error('The steward key must not be the node (payer) key.')
  const result = await publishCatalogue({
    store, anchor: requireAnchor(c.config), steward, seed: loadSeed(), now: opts.now ?? new Date(), ...(opts.summary ? { summary: opts.summary } : {}),
  })
  c.config.catalogueManifests[steward.address] = result.manifest
  saveConfig(c.config)
  const st = stats(result.catalogue.records)
  out(
    `${steward.name} published catalogue v${result.catalogue.version}`,
    `  signed by   ${steward.address} (steward key)`,
    `  stamped by  batch ${shortHex(requireBatch(c))} of node wallet ${payer} (payer)`,
    `  feed update #${result.feedIndex} on ${c.config.topics.catalogue.string}, collection ${result.reference}`,
    `  read it     ${c.url}/bzz/${result.manifest}/`,
    `  ${st.total} works, ${st.byCondition.damaged} damaged, ${st.byCondition.missing} missing; ${result.applied} correction(s) applied, ${result.proposed} proposed`,
    result.inheritedFrom ? `  (picked up from predecessor ${personName(c.config, result.inheritedFrom)})` : '',
  )
  const noted = noteSuccessorPublication(steward.address, {
    feedIndex: result.feedIndex, catalogueReference: result.reference, version: result.catalogue.version,
    applied: result.applied, proposed: result.proposed, at: result.catalogue.publishedAt,
  })
  if (noted) out(`  recorded as the successor's first publication in ${noted}`)
  return result
}

// ── corrections (a LIBRARY's side) ─────────────────────────────────────────

export function parseChanges(set: string[], note?: string): CorrectionChanges {
  const raw: Record<string, unknown> = {}
  for (const kv of set) {
    const [k, v] = kv.split('=')
    if (!k || v === undefined) throw new Error(`--set expects key=value, got "${kv}"`)
    if (k === 'condition') raw.condition = v as Condition
    else if (k === 'photographed') raw.photographed = v === 'true' || v === 'yes'
    else if (k === 'folios' || k === 'foliosPresent') raw.foliosPresent = Number(v)
    else throw new Error(`unknown field "${k}" (condition | photographed | folios)`)
  }
  if (note) raw.notes = note
  return CorrectionChanges.parse(raw)
}

export async function correctionSubmit(c: Ctx, opts: { as: string; record: string; set: string[]; note?: string; now?: Date }) {
  const libraryId = LibraryId.parse(opts.as.replace(/^library-/, ''))
  const lib = c.config.libraries.find((l) => l.id === libraryId)!
  const library = loadIdentity(lib.keyName, lib.name)
  const r = await submitCorrection({
    store: writeStore(c), anchor: requireAnchor(c.config), library, libraryId, recordId: opts.record,
    changes: parseChanges(opts.set, opts.note), now: opts.now ?? new Date(),
  })
  out(`${lib.name} posted correction #${r.feedIndex} for ${opts.record} to its own feed (signed by ${library.address}). No steward involved.`)
  return r
}

// ── reading (nobody's keys) ─────────────────────────────────────────────────

export async function read(opts: { bee?: string; registryOwner?: string; json?: boolean }): Promise<CatalogueView> {
  const config = loadConfig()
  const url = beeUrl(config, opts.bee)
  const owner = opts.registryOwner ?? config.council.scribe.address
  if (!owner) throw new Error('Give --registry-owner <address> (the council scribe address from README / STEWARDSHIP.md).')
  // read-only: no batch, no keys
  const view = await resolveAll(new BeeFeedStore(makeBee(url), null), defaultAnchor(owner))
  if (opts.json) {
    console.log(JSON.stringify(view, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
    return view
  }
  const cur = view.registry.current?.entry
  out(`Registry ${owner} / ${config.topics.registry.string}: ${view.registry.entries.length} update(s), ${view.registry.valid.length} valid`)
  for (const e of view.registry.entries) {
    out(`  #${e.feedIndex} ${e.ok ? 'ok ' : 'IGNORED'} ${e.entry ? `epoch ${e.entry.epoch} → ${e.entry.steward.name} ${e.entry.steward.address} (${e.quorum?.counted.length}/${e.quorum?.threshold} seals)` : ''} ${e.problems.join('; ')}`)
  }
  if (!cur) return out('No valid registry entry yet.'), view
  out(`Current steward: ${cur.steward.name} ${cur.steward.address} (epoch ${cur.epoch}, trigger ${cur.fields.trigger})`)
  if (view.catalogue && view.source) {
    const st = stats(view.catalogue.records)
    out(
      `Catalogue v${view.catalogue.version} from ${view.source.stewardName}'s feed #${view.source.feedIndex}${view.source.inherited ? ' (inherited: the new steward has not published yet)' : ''}`,
      `  ${st.total} works · ${st.foliosPresent}/${st.foliosTotal} folios present · ${st.photographed} photographed · ${st.byCondition.damaged} damaged · ${st.byCondition.missing} missing`,
    )
  } else out('No catalogue published yet.')
  out(`Pending signed corrections not yet folded in: ${view.pending.length}`)
  for (const p of view.pending) out(`  ${p.correction.library} #${p.feedIndex} ${p.correction.recordId} ${JSON.stringify(p.correction.changes)} ${p.verified ? 'signature ok' : `REJECTED ${p.problem}`} (${p.authority})`)
  return view
}

// ── succession ──────────────────────────────────────────────────────────────

export async function propose(c: Ctx, opts: { incoming: string; incomingName?: string; next?: string; nextName?: string; trigger: string; effective?: string; now?: Date }) {
  const anchor = requireAnchor(c.config)
  const charter = charterFromConfig(c.config)
  const registry = await readRegistry(new BeeFeedStore(c.bee, null), anchor)
  const known = c.config.stewards.find((s) => sameAddress(s.address, opts.incoming))
  const nextKnown = opts.next ? c.config.stewards.find((s) => sameAddress(s.address, opts.next)) : null
  const now = opts.now ?? new Date()
  const proposal = draftProposal({
    charter,
    current: registry.current,
    incoming: { address: opts.incoming, name: opts.incomingName ?? known?.name ?? 'incoming steward', library: known?.library ?? null },
    next: opts.next ? { address: opts.next, name: opts.nextName ?? nextKnown?.name ?? 'next steward' } : null,
    trigger: TriggerId.parse(opts.trigger),
    effectiveFrom: opts.effective ?? now.toISOString().slice(0, 10),
    now,
  })
  const path = saveProposal(proposal)
  const needed = requiredThreshold(charter, registry.current?.entry ?? null, proposal.fields.incoming.address)
  out(`Proposal for epoch ${proposal.fields.epoch} written to ${path} (+ .statement.txt). It needs ${needed} of 7 library seals and the incoming steward's acceptance.`, '', proposal.statement)
  return { proposal, path: resolve(ROOT, path) }
}

/** Adds a seal produced elsewhere (e.g. pasted from a committee member's own wallet). */
export function signExternal(opts: { proposal: string; library: string; signature: string }): HandoffProposal {
  const charter = charterFromConfig(loadConfig())
  const p = addSeal(loadProposal(opts.proposal), charter, LibraryId.parse(opts.library), opts.signature)
  saveProposal(p, opts.proposal)
  out(`Seal from ${opts.library} verified and added. ${p.approvals.length} seal(s) so far.`)
  return p
}

export async function signWithKey(opts: { proposal: string; as: string }): Promise<HandoffProposal> {
  const config = loadConfig()
  const charter = charterFromConfig(config)
  const libraryId = LibraryId.parse(opts.as.replace(/^library-/, ''))
  const lib = config.libraries.find((l) => l.id === libraryId)!
  const p = await sealWith(loadProposal(opts.proposal), charter, libraryId, loadIdentity(lib.keyName, lib.name).wallet)
  saveProposal(p, opts.proposal)
  out(`${lib.name} sealed. ${p.approvals.length} seal(s) so far: ${p.approvals.map((a) => a.library).join(', ')}`)
  return p
}

export async function accept(opts: { proposal: string; as?: string; signature?: string }): Promise<HandoffProposal> {
  const config = loadConfig()
  let p = loadProposal(opts.proposal)
  if (opts.signature) p = addAcceptance(p, opts.signature)
  else {
    const s = stewardByKey(config, opts.as ?? '')
    p = await acceptWith(p, loadIdentity(s.keyName, s.name).wallet)
  }
  saveProposal(p, opts.proposal)
  out(`Accepted by ${p.fields.incoming.name} (${p.fields.incoming.address}).`)
  return p
}

/**
 * The hand-off. `incoming` is the new steward's address, supplied from outside
 * (command line or LSC_INCOMING); it must equal the one in the signed statement.
 * On refusal the attempt is recorded in the proposal file.
 */
export async function handoff(
  c: Ctx,
  opts: { proposal: string; incoming: string; dryRun?: boolean; attempt?: string; notes?: string[]; now?: Date },
): Promise<HandoffOutcome | null> {
  const now = opts.now ?? new Date()
  const anchor = requireAnchor(c.config)
  const charter = charterFromConfig(c.config)
  const proposal = loadProposal(opts.proposal)
  const payer = await payerAddress(c.bee)
  const roles = assertIdentitiesSeparated(c.config, payer)

  if (opts.dryRun) {
    const registry = await readRegistry(new BeeFeedStore(c.bee, null), anchor)
    const threshold = requiredThreshold(charter, registry.current?.entry ?? null, proposal.fields.incoming.address)
    const q = verifyQuorum(proposal.statement, proposal.approvals, charter, threshold)
    const acc = proposal.acceptance ? sameAddress(recoverSigner(proposal.statement, proposal.acceptance.signature), opts.incoming) : false
    out(`Dry run: ${q.counted.length}/${threshold} seals valid, acceptance ${acc ? 'valid' : 'missing'}, --incoming ${sameAddress(opts.incoming, proposal.fields.incoming.address) ? 'matches' : 'DOES NOT match'}. Nothing written.`)
    return null
  }

  const scribe: Identity = loadIdentity(c.config.council.scribe.keyName, c.config.council.scribe.name)
  const store = writeStore(c)
  const before = await readRegistry(store, anchor)
  const outgoingAddr = before.current?.entry?.steward.address ?? null
  const outgoingLast = outgoingAddr ? await store.latestIndex(outgoingAddr, anchor.catalogueTopicHex) : null

  let outcome: HandoffOutcome
  try {
    outcome = await performHandoff({ store, anchor, charter, proposal, incoming: opts.incoming, scribe, now })
  } catch (e) {
    if (e instanceof QuorumRejected) {
      proposal.rejectedAttempts.push({ at: now.toISOString(), attempt: opts.attempt ?? `hand-off with ${proposal.approvals.length} seal(s)`, result: e.message })
      saveProposal(proposal, opts.proposal)
      out(`REFUSED and recorded in ${relative(ROOT, opts.proposal)}: ${e.message}`)
      return null
    }
    throw e
  }

  // first entry: create the stable registry manifest readers can bookmark forever
  if (!c.config.registryManifest) c.config.registryManifest = await store.createFeedManifest(anchor.registryTopicHex, scribe.address)
  const status = await storageStatus(c.bee, requireBatch(c)).catch(() => null)
  const versions = await c.bee.status.getHealth().catch(() => null)
  const record = recordFor(outcome, {
    proposal, beeUrl: c.url, beeVersion: versions?.version ?? null, apiVersion: versions?.apiVersion ?? null,
    payer, batchId: requireBatch(c), ttlDays: status?.ttlDays ?? null, registryManifest: c.config.registryManifest,
    registryTopicHex: anchor.registryTopicHex, roles, outgoingLastIndex: outgoingLast === null ? null : Number(outgoingLast),
    incomingSuppliedAs: `--incoming ${opts.incoming}`, now, ...(opts.notes ? { notes: opts.notes } : {}),
  })
  const file = writeHandoffRecord(record)

  c.config.status = 'live'
  c.config.payer.nodeAddress = payer
  c.config.currentSteward = outcome.entry.steward.address
  c.config.designatedSuccessor = outcome.entry.designatedSuccessor?.address ?? null
  c.config.catalogueManifests[outcome.entry.steward.address] = outcome.catalogueManifest
  c.config.history.push({
    epoch: outcome.entry.epoch, steward: outcome.entry.steward.address, stewardName: outcome.entry.steward.name,
    registryFeedIndex: outcome.feedIndex, entryReference: outcome.entryReference, record: file, at: now.toISOString(),
  })
  saveConfig(c.config)
  syncDocs(c.config)
  out(
    `Hand-off done. Epoch ${outcome.entry.epoch}: readers now follow ${outcome.entry.steward.name} (${outcome.entry.steward.address}).`,
    `  seals        ${outcome.quorum.counted.length}/${outcome.quorum.threshold}: ${outcome.quorum.counted.map((x) => x.library).join(', ')}`,
    `  registry     update #${outcome.feedIndex}, entry ${outcome.entryReference}`,
    `  signed chunk ${outcome.socAddress} by scribe ${outcome.proof?.owner ?? scribe.address}`,
    `  evidence     ${file} and HANDOFF_LOG.md`,
  )
  return outcome
}

export async function checkTrigger(c: Ctx, opts: { unanswered?: number; declared?: boolean; removalVotes?: number }) {
  const anchor = requireAnchor(c.config)
  const view = await resolveAll(new BeeFeedStore(c.bee, null), anchor)
  const charter = view.registry.genesisCharter ?? charterFromConfig(c.config)
  const ttl = c.config.payer.batchId ? await storageStatus(c.bee, c.config.payer.batchId).then((s) => s.ttlDays).catch(() => null) : null
  const states = evaluateTriggers({
    charter, now: new Date(), lastPublishedAt: view.catalogue?.publishedAt ?? null, ttlDays: ttl,
    declared: Boolean(opts.declared), unansweredLibraries: opts.unanswered ?? 0, removalVotes: opts.removalVotes ?? 0,
  })
  for (const s of states) out(`${s.met ? '[MET]' : '[ - ]'} ${s.id}  ${s.label}\n        ${s.detail}`)
  return states
}

export function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
}

export function proposalFor(epoch: number): string {
  const path = proposalPath(epoch)
  if (!existsSync(path)) throw new Error(`No proposal for epoch ${epoch} at ${relative(ROOT, path)}`)
  return path
}

export { PATHS }
export type { Anchor }
