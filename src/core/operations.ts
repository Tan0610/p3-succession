import type { BaseWallet } from 'ethers'
import { hashCanonical, utf8 } from './canonical.js'
import { nextCatalogue, renderCatalogueCsv, renderCatalogueHtml } from './catalogue.js'
import { resolveNextIndex, type FeedReadStore, type FeedWriteStore, type Identity, type SocProof } from './feedstore.js'
import { readPendingCorrections, readRegistry, resolveAll, type Anchor, type ResolvedEntry } from './resolve.js'
import {
  Charter,
  Correction,
  HandoffProposal,
  RegistryEntry,
  type Approval,
  type Catalogue,
  type CorrectionChanges,
  type LibraryId,
  type Person,
  type SeedCatalogue,
  type TriggerId,
} from './schemas.js'
import { recoverSigner, requiredThreshold, signText, verifyQuorum, type QuorumResult } from './signatures.js'
import { renderCorrectionStatement, renderHandoffStatement } from './statements.js'
import { checksum, sameAddress, TOPICS } from './swarm.js'

export const CATALOGUE_ID = 'ladakh-spiti-manuscripts'

export const LIBRARIES: { id: LibraryId; name: string; valley: 'Ladakh' | 'Spiti' }[] = [
  { id: 'diskit', name: 'Diskit library committee', valley: 'Ladakh' },
  { id: 'thiksey', name: 'Thiksey library committee', valley: 'Ladakh' },
  { id: 'hemis', name: 'Hemis library committee', valley: 'Ladakh' },
  { id: 'alchi', name: 'Alchi library committee', valley: 'Ladakh' },
  { id: 'lamayuru', name: 'Lamayuru library committee', valley: 'Ladakh' },
  { id: 'kye', name: 'Kye library committee', valley: 'Spiti' },
  { id: 'tabo', name: 'Tabo library committee', valley: 'Spiti' },
]

export function buildCharter(addresses: Record<LibraryId, string>): Charter {
  return Charter.parse({
    schema: 'lsc/charter@1',
    catalogueId: CATALOGUE_ID,
    threshold: 4,
    undesignatedThreshold: 5,
    members: LIBRARIES.map((l) => ({ ...l, address: checksum(addresses[l.id]) })),
    triggers: { silenceDays: 60, unansweredDays: 30, ttlFloorDays: 30 },
  })
}

export class SuccessionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
  }
}

export class QuorumRejected extends SuccessionError {
  constructor(readonly result: QuorumResult) {
    super(
      `Refused: ${result.counted.length} valid seal(s) of ${result.threshold} needed` +
        (result.rejected.length ? ` (${result.rejected.map((r) => `${r.library}: ${r.reason}`).join('; ')})` : ''),
      'QUORUM',
    )
  }
}

// ── the steward publishes ───────────────────────────────────────────────────

export interface PublishResult {
  catalogue: Catalogue
  reference: string
  feedIndex: number
  socAddress: string
  manifest: string
  inheritedFrom: string | null
  applied: number
  proposed: number
}

/**
 * The steward's job: take the latest catalogue (theirs, or their predecessor's
 * if they just took over), fold in the libraries' signed corrections, and
 * publish the next version on *their own* feed. Stamped with the payer's batch
 * (inside `store`), signed with the steward's key (`steward`).
 */
export async function publishCatalogue(opts: {
  store: FeedWriteStore
  anchor: Anchor
  steward: Identity
  seed: SeedCatalogue
  now: Date
  summary?: string
}): Promise<PublishResult> {
  const { store, anchor, steward } = opts
  const view = await resolveAll(store, anchor)
  const current = view.registry.current?.entry
  if (!current) throw new SuccessionError('The registry is empty: the council has not named a steward yet.', 'NO_REGISTRY')
  if (!sameAddress(current.steward.address, steward.address)) {
    throw new SuccessionError(
      `${steward.name} (${steward.address}) is not the current steward; the registry names ${current.steward.name} (${current.steward.address}).`,
      'NOT_STEWARD',
    )
  }
  const pending = view.registry.genesisCharter
    ? await readPendingCorrections(store, view.registry.genesisCharter, view.catalogue, anchor)
    : []
  const { catalogue, applied } = nextCatalogue({
    base: view.catalogue,
    seed: opts.seed,
    steward: { address: steward.address, name: steward.name },
    epoch: current.epoch,
    registryEntryRef: view.registry.current?.reference ?? null,
    previous: view.source
      ? { steward: checksum(view.source.steward), feedIndex: view.source.feedIndex, reference: view.source.reference }
      : null,
    pending,
    now: opts.now,
    ...(opts.summary ? { summary: opts.summary } : {}),
  })
  const reference = await store.putCollection(
    [
      { path: 'index.html', contentType: 'text/html; charset=utf-8', bytes: utf8(renderCatalogueHtml(catalogue)) },
      { path: 'catalogue.json', contentType: 'application/json', bytes: utf8(JSON.stringify(catalogue, null, 2)) },
      { path: 'catalogue.csv', contentType: 'text/csv; charset=utf-8', bytes: utf8(renderCatalogueCsv(catalogue)) },
    ],
    'index.html',
  )
  // Read the feed from the network right before writing: never a local counter.
  const { next } = await resolveNextIndex(store, steward.address, anchor.catalogueTopicHex)
  const { socAddress } = await store.writeRef(steward, anchor.catalogueTopicHex, next, reference)
  const manifest = current.catalogueManifest ?? (await store.createFeedManifest(anchor.catalogueTopicHex, steward.address))
  return {
    catalogue,
    reference,
    feedIndex: Number(next),
    socAddress,
    manifest,
    inheritedFrom: view.source?.inherited ? view.source.steward : null,
    applied: applied.filter((a) => a.status === 'applied').length,
    proposed: applied.filter((a) => a.status === 'proposed').length,
  }
}

// ── a library corrects its own shelf, without asking the steward ───────────

export async function submitCorrection(opts: {
  store: FeedWriteStore
  anchor: Anchor
  library: Identity
  libraryId: LibraryId
  recordId: string
  changes: CorrectionChanges
  now: Date
}): Promise<{ correction: Correction; reference: string; feedIndex: number; socAddress: string }> {
  const { store, anchor, library } = opts
  const { next } = await resolveNextIndex(store, library.address, anchor.correctionsTopicHex)
  const fields = {
    catalogueId: CATALOGUE_ID,
    library: opts.libraryId,
    author: checksum(library.address),
    seq: Number(next),
    recordId: opts.recordId,
    changes: opts.changes,
    observedAt: opts.now.toISOString(),
  }
  const statement = renderCorrectionStatement(fields)
  const correction = Correction.parse({
    schema: 'lsc/correction@1',
    ...fields,
    statement,
    signature: await signText(library.wallet, statement),
  })
  const reference = await store.putJson('correction.json', correction)
  const { socAddress } = await store.writeRef(library, anchor.correctionsTopicHex, next, reference)
  return { correction, reference, feedIndex: Number(next), socAddress }
}

// ── hand-off: propose → seals → acceptance → scribe writes ─────────────────

export function draftProposal(opts: {
  charter: Charter
  current: ResolvedEntry | null
  incoming: Person & { library: LibraryId | null }
  next: Person | null
  trigger: TriggerId
  effectiveFrom: string
  now: Date
}): HandoffProposal {
  const current = opts.current?.entry ?? null
  if (!current && opts.trigger !== 'T0-genesis') {
    throw new SuccessionError('The registry is empty, so the first entry must use trigger T0-genesis.', 'TRIGGER')
  }
  if (current && opts.trigger === 'T0-genesis') throw new SuccessionError('The registry already has a genesis.', 'TRIGGER')
  if (current && sameAddress(current.steward.address, opts.incoming.address)) {
    throw new SuccessionError('The incoming steward is already the steward.', 'SAME_STEWARD')
  }
  const fields = {
    catalogueId: CATALOGUE_ID,
    charterHash: hashCanonical(opts.charter),
    epoch: current ? current.epoch + 1 : 0,
    previous: opts.current && current ? { feedIndex: opts.current.feedIndex, reference: opts.current.reference } : null,
    outgoing: current ? { address: current.steward.address, name: current.steward.name } : null,
    incoming: { ...opts.incoming, address: checksum(opts.incoming.address) },
    next: opts.next ? { ...opts.next, address: checksum(opts.next.address) } : null,
    trigger: opts.trigger,
    effectiveFrom: opts.effectiveFrom,
  }
  return HandoffProposal.parse({
    schema: 'lsc/handoff-proposal@1',
    catalogueId: CATALOGUE_ID,
    fields,
    statement: renderHandoffStatement(fields),
    approvals: [],
    acceptance: null,
    rejectedAttempts: [],
    createdAt: opts.now.toISOString(),
  })
}

/** Adds a library seal after checking it really is that library's key signing this statement. */
export function addSeal(proposal: HandoffProposal, charter: Charter, library: LibraryId, signature: string): HandoffProposal {
  const member = charter.members.find((m) => m.id === library)
  if (!member) throw new SuccessionError(`${library} is not in the charter`, 'NOT_MEMBER')
  if (!sameAddress(recoverSigner(proposal.statement, signature), member.address)) {
    throw new SuccessionError(`That signature is not ${library}'s key signing this statement.`, 'BAD_SIGNATURE')
  }
  const approval: Approval = { library, address: member.address, signature }
  return { ...proposal, approvals: [...proposal.approvals.filter((a) => a.library !== library), approval] }
}

export async function sealWith(proposal: HandoffProposal, charter: Charter, library: LibraryId, wallet: BaseWallet) {
  return addSeal(proposal, charter, library, await signText(wallet, proposal.statement))
}

/** The incoming steward proves they hold the key being named, and names their own successor. */
export function addAcceptance(proposal: HandoffProposal, signature: string): HandoffProposal {
  if (!sameAddress(recoverSigner(proposal.statement, signature), proposal.fields.incoming.address)) {
    throw new SuccessionError('The acceptance was not signed by the incoming steward named in the statement.', 'BAD_ACCEPTANCE')
  }
  return { ...proposal, acceptance: { address: proposal.fields.incoming.address, signature } }
}

export async function acceptWith(proposal: HandoffProposal, wallet: BaseWallet) {
  return addAcceptance(proposal, await signText(wallet, proposal.statement))
}

export interface HandoffOutcome {
  entry: RegistryEntry
  entryReference: string
  feedIndex: number
  socAddress: string
  proof: SocProof | null
  readBack: { feedIndex: number; entryReference: string; match: boolean }
  quorum: QuorumResult
  catalogueManifest: string
  readerNowFollows: string | null
}

/**
 * The only way the steward changes. `incoming` is passed in by the caller
 * (a command-line argument), never taken from source, and must match the
 * statement everybody signed. The scribe's key writes the registry update,
 * but only after the seals check out, and readers re-check the seals anyway.
 */
export async function performHandoff(opts: {
  store: FeedWriteStore
  anchor: Anchor
  charter: Charter
  proposal: HandoffProposal
  incoming: string
  scribe: Identity
  now: Date
}): Promise<HandoffOutcome> {
  const { store, anchor, charter, proposal, scribe } = opts
  const f = proposal.fields

  if (!sameAddress(opts.incoming, f.incoming.address)) {
    throw new SuccessionError(`--incoming ${opts.incoming} is not the incoming steward in the proposal (${f.incoming.address}).`, 'INCOMING_MISMATCH')
  }
  if (!sameAddress(scribe.address, anchor.registryOwner)) {
    throw new SuccessionError('This key is not the council scribe that owns the registry.', 'NOT_SCRIBE')
  }
  if (sameAddress(scribe.address, f.incoming.address) || charter.members.some((m) => sameAddress(m.address, f.incoming.address))) {
    throw new SuccessionError('A steward must use its own key, separate from the scribe and the library committees.', 'IDENTITY_OVERLAP')
  }
  if (hashCanonical(charter) !== f.charterHash) throw new SuccessionError('The proposal was signed against a different charter.', 'CHARTER')
  if (renderHandoffStatement(f) !== proposal.statement) throw new SuccessionError('The statement text does not match its fields.', 'STATEMENT')

  const registry = await readRegistry(store, anchor)
  if (registry.genesisCharter && hashCanonical(registry.genesisCharter) !== f.charterHash) {
    throw new SuccessionError('The charter differs from the one adopted at genesis.', 'CHARTER')
  }
  const current = registry.current
  const expectedEpoch = current?.entry ? current.entry.epoch + 1 : 0
  const expectedPrev = current ? { feedIndex: current.feedIndex, reference: current.reference } : null
  if (f.epoch !== expectedEpoch || JSON.stringify(f.previous) !== JSON.stringify(expectedPrev)) {
    throw new SuccessionError(
      `Stale proposal: it continues epoch ${f.epoch - 1}, but the registry is at epoch ${expectedEpoch - 1}. Draft a new one.`,
      'STALE',
    )
  }

  const threshold = requiredThreshold(charter, current?.entry ?? null, f.incoming.address)
  const quorum = verifyQuorum(proposal.statement, proposal.approvals, charter, threshold)
  if (!quorum.ok) throw new QuorumRejected(quorum)
  if (!proposal.acceptance || !sameAddress(recoverSigner(proposal.statement, proposal.acceptance.signature), f.incoming.address)) {
    throw new SuccessionError('The incoming steward has not signed their acceptance yet.', 'NO_ACCEPTANCE')
  }

  const catalogueManifest = await store.createFeedManifest(anchor.catalogueTopicHex, f.incoming.address)
  const entry = RegistryEntry.parse({
    schema: 'lsc/registry-entry@1',
    catalogueId: CATALOGUE_ID,
    epoch: f.epoch,
    kind: f.epoch === 0 ? 'genesis' : 'handoff',
    fields: f,
    statement: proposal.statement,
    steward: f.incoming,
    catalogueTopic: TOPICS.catalogue,
    catalogueTopicHex: anchor.catalogueTopicHex,
    catalogueManifest,
    designatedSuccessor: f.next,
    charter,
    charterHash: f.charterHash,
    approvals: proposal.approvals,
    acceptance: proposal.acceptance,
    previousEntry: f.previous,
    issuedAt: opts.now.toISOString(),
    scribe: checksum(scribe.address),
  })
  const entryReference = await store.putJson('registry-entry.json', entry)
  // Next registry index comes from the network, immediately before the write.
  const { next } = await resolveNextIndex(store, scribe.address, anchor.registryTopicHex)
  const { socAddress } = await store.writeRef(scribe, anchor.registryTopicHex, next, entryReference)

  // The registry update is written. From here on nothing may throw: a slow
  // read-back must not lose the evidence of a hand-off that really happened.
  const back = await readBackRegistry(store, anchor, scribe.address, next, f.incoming.address)
  return {
    entry,
    entryReference,
    feedIndex: Number(next),
    socAddress,
    proof: back.proof,
    readBack: { feedIndex: Number(next), entryReference: back.reference, match: back.reference === entryReference },
    quorum,
    catalogueManifest,
    readerNowFollows: back.readerNowFollows,
  }
}

/**
 * Reads a fresh registry update back the way a stranger would, retrying while
 * the node catches up (a feed lookup can briefly still answer the previous
 * index). Never throws; whatever could not be read is recorded as missing and
 * can be re-checked later with `npm run verify:handoff`.
 */
export async function readBackRegistry(
  store: FeedReadStore,
  anchor: Anchor,
  scribe: string,
  index: bigint,
  expectSteward: string,
  opts: { attempts?: number; waitMs?: number } = {},
): Promise<{ reference: string; proof: SocProof | null; readerNowFollows: string | null }> {
  const attempts = opts.attempts ?? 6
  const waitMs = opts.waitMs ?? 5_000
  let reference = ''
  let proof: SocProof | null = null
  let readerNowFollows: string | null = null
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, waitMs))
    try {
      reference ||= await store.readRefAt(scribe, anchor.registryTopicHex, index)
      if (!proof && store.socProof) proof = await store.socProof(scribe, anchor.registryTopicHex, index)
      const after = await readRegistry(store, anchor)
      readerNowFollows = after.current?.entry?.steward.address ?? null
      if (sameAddress(readerNowFollows, expectSteward)) break
    } catch {
      // not visible yet; try again
    }
  }
  return { reference, proof, readerNowFollows }
}
