import { hashCanonical } from './canonical.js'
import type { FeedReadStore } from './feedstore.js'
import {
  Catalogue,
  Correction,
  RegistryEntry,
  type Charter,
  type CatalogueRecord,
  type Correction as CorrectionT,
  type LibraryId,
} from './schemas.js'
import { recoverSigner, requiredThreshold, verifyQuorum, type QuorumResult } from './signatures.js'
import { renderCorrectionStatement, renderHandoffStatement } from './statements.js'
import { sameAddress, TOPICS, topicHex } from './swarm.js'

/**
 * The only things a third party needs to find the catalogue: who writes the
 * registry (the council scribe's address) and under which topic. These never
 * change when the steward changes.
 */
export interface Anchor {
  registryOwner: string
  registryTopicHex: string
  catalogueTopicHex: string
  correctionsTopicHex: string
}

export function defaultAnchor(registryOwner: string): Anchor {
  return {
    registryOwner,
    registryTopicHex: topicHex(TOPICS.registry),
    catalogueTopicHex: topicHex(TOPICS.catalogue),
    correctionsTopicHex: topicHex(TOPICS.corrections),
  }
}

export interface ResolvedEntry {
  feedIndex: number
  reference: string
  entry: RegistryEntry | null
  ok: boolean
  problems: string[]
  quorum: QuorumResult | null
}

export interface RegistryView {
  entries: ResolvedEntry[]
  /** Last entry that passed every check: this is who readers follow. */
  current: ResolvedEntry | null
  valid: ResolvedEntry[]
  genesisCharter: Charter | null
}

/**
 * Walks the registry feed from #0 and decides, *on the reader's side*, which
 * entries count. An entry is ignored unless it carries enough valid library
 * seals, the incoming steward's acceptance, the right epoch, and a correct link
 * to the previous valid entry. So neither the scribe nor a steward can redirect
 * readers on their own: the scribe's key only gives them a pen, not a vote.
 */
export async function readRegistry(store: FeedReadStore, anchor: Anchor): Promise<RegistryView> {
  const latest = await store.latestIndex(anchor.registryOwner, anchor.registryTopicHex)
  const entries: ResolvedEntry[] = []
  const valid: ResolvedEntry[] = []
  let genesisCharter: Charter | null = null
  if (latest === null) return { entries, current: null, valid, genesisCharter }

  for (let i = 0n; i <= latest; i++) {
    const feedIndex = Number(i)
    let reference = ''
    const problems: string[] = []
    let entry: RegistryEntry | null = null
    let quorum: QuorumResult | null = null
    try {
      reference = await store.readRefAt(anchor.registryOwner, anchor.registryTopicHex, i)
      const parsed = RegistryEntry.safeParse(await store.readJson(reference))
      if (!parsed.success) {
        problems.push(`not a registry entry: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`)
      } else {
        entry = parsed.data
        const previous = valid.at(-1) ?? null
        const charter = genesisCharter ?? entry.charter
        quorum = checkEntry(entry, previous, charter, anchor, problems)
      }
    } catch (e) {
      problems.push(`unreadable: ${(e as Error).message}`)
    }
    const resolved: ResolvedEntry = { feedIndex, reference, entry, ok: problems.length === 0, problems, quorum }
    entries.push(resolved)
    if (resolved.ok && entry) {
      valid.push(resolved)
      genesisCharter ??= entry.charter
    }
  }
  return { entries, current: valid.at(-1) ?? null, valid, genesisCharter }
}

function checkEntry(
  entry: RegistryEntry,
  previous: ResolvedEntry | null,
  charter: Charter,
  anchor: Anchor,
  problems: string[],
): QuorumResult {
  const expectedEpoch = previous?.entry ? previous.entry.epoch + 1 : 0
  if (entry.epoch !== expectedEpoch) problems.push(`epoch ${entry.epoch}, expected ${expectedEpoch}`)
  if (entry.fields.epoch !== entry.epoch) problems.push('signed epoch differs from entry epoch')
  if (!sameAddress(entry.scribe, anchor.registryOwner)) problems.push('entry names a different scribe')

  const expectedPrev = previous ? { feedIndex: previous.feedIndex, reference: previous.reference } : null
  const signedPrev = entry.fields.previous
  if (JSON.stringify(signedPrev) !== JSON.stringify(expectedPrev)) {
    problems.push('does not link to the previous valid registry entry (stale or forked)')
  }
  if (hashCanonical(entry.charter) !== entry.charterHash) problems.push('charter hash mismatch')
  if (entry.fields.charterHash !== hashCanonical(charter)) problems.push('charter differs from the genesis charter')
  if (renderHandoffStatement(entry.fields) !== entry.statement) problems.push('statement does not match its fields')
  if (!sameAddress(entry.fields.incoming.address, entry.steward.address)) problems.push('steward differs from signed incoming')
  if (!sameAddress(entry.fields.next?.address, entry.designatedSuccessor?.address) && (entry.fields.next || entry.designatedSuccessor)) {
    problems.push('designated successor differs from signed statement')
  }

  if (!sameAddress(recoverSigner(entry.statement, entry.acceptance.signature), entry.steward.address)) {
    problems.push('incoming steward did not sign the acceptance')
  }
  const threshold = requiredThreshold(charter, previous?.entry ?? null, entry.steward.address)
  const quorum = verifyQuorum(entry.statement, entry.approvals, charter, threshold)
  if (!quorum.ok) problems.push(`only ${quorum.counted.length} of ${threshold} required library seals are valid`)
  return quorum
}

// ── catalogue ───────────────────────────────────────────────────────────────

export interface CatalogueSource {
  steward: string
  stewardName: string
  epoch: number
  feedIndex: number
  reference: string
  /** true when the current steward hasn't published yet and we show the predecessor's last version */
  inherited: boolean
}

export async function readCatalogue(
  store: FeedReadStore,
  registry: RegistryView,
  anchor: Anchor,
): Promise<{ catalogue: Catalogue | null; source: CatalogueSource | null }> {
  const lineage = [...registry.valid].reverse()
  for (const [i, r] of lineage.entries()) {
    const e = r.entry
    if (!e) continue
    const latest = await store.latestIndex(e.steward.address, anchor.catalogueTopicHex)
    if (latest === null) continue
    const reference = await store.readRefAt(e.steward.address, anchor.catalogueTopicHex, latest)
    const catalogue = Catalogue.parse(await store.readJson(reference, 'catalogue.json'))
    return {
      catalogue,
      source: {
        steward: e.steward.address,
        stewardName: e.steward.name,
        epoch: e.epoch,
        feedIndex: Number(latest),
        reference,
        inherited: i > 0,
      },
    }
  }
  return { catalogue: null, source: null }
}

// ── corrections ─────────────────────────────────────────────────────────────

export interface PendingCorrection {
  correction: CorrectionT
  feedIndex: number
  reference: string
  verified: boolean
  problem: string | null
  /** a library speaks for its own shelves; corrections about other shelves are proposals */
  authority: 'own-shelf' | 'other-shelf'
}

export async function readPendingCorrections(
  store: FeedReadStore,
  charter: Charter,
  catalogue: Catalogue | null,
  anchor: Anchor,
): Promise<PendingCorrection[]> {
  const pending: PendingCorrection[] = []
  for (const member of charter.members) {
    const latest = await store.latestIndex(member.address, anchor.correctionsTopicHex)
    if (latest === null) continue
    const cursor = catalogue?.correctionCursor[member.id] ?? -1
    for (let i = BigInt(cursor + 1); i <= latest; i++) {
      const reference = await store.readRefAt(member.address, anchor.correctionsTopicHex, i)
      const parsed = Correction.safeParse(await store.readJson(reference))
      if (!parsed.success) continue
      const c = parsed.data
      const problem = checkCorrection(c, member.id, member.address, Number(i))
      const record = catalogue?.records.find((r) => r.id === c.recordId)
      pending.push({
        correction: c,
        feedIndex: Number(i),
        reference,
        verified: problem === null,
        problem,
        authority: record?.library === member.id ? 'own-shelf' : 'other-shelf',
      })
    }
  }
  return pending
}

export function checkCorrection(c: CorrectionT, library: LibraryId, address: string, feedIndex: number): string | null {
  if (c.library !== library) return 'correction names a different library than the feed it was posted to'
  if (!sameAddress(c.author, address)) return 'author is not the library key'
  if (c.seq !== feedIndex) return `sequence ${c.seq} posted at feed index ${feedIndex}`
  if (renderCorrectionStatement(c) !== c.statement) return 'statement does not match its fields'
  if (!sameAddress(recoverSigner(c.statement, c.signature), address)) return 'signature does not recover to the library key'
  return null
}

// ── everything a reader sees ────────────────────────────────────────────────

export interface OverlaidRecord extends CatalogueRecord {
  pending: PendingCorrection[]
}

export interface CatalogueView {
  store: string
  anchor: Anchor
  registry: RegistryView
  catalogue: Catalogue | null
  source: CatalogueSource | null
  pending: PendingCorrection[]
  records: OverlaidRecord[]
}

/** Registry → current steward → their catalogue feed → pending signed corrections. */
export async function resolveAll(store: FeedReadStore, anchor: Anchor): Promise<CatalogueView> {
  const registry = await readRegistry(store, anchor)
  const { catalogue, source } = await readCatalogue(store, registry, anchor)
  const pending = registry.genesisCharter
    ? await readPendingCorrections(store, registry.genesisCharter, catalogue, anchor)
    : []
  const records = (catalogue?.records ?? []).map((r) => ({
    ...r,
    pending: pending.filter((p) => p.correction.recordId === r.id && p.verified),
  }))
  return { store: store.label, anchor, registry, catalogue, source, pending, records }
}
