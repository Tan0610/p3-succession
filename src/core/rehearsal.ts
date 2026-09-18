import { Wallet } from 'ethers'
import { evaluateTriggers, type TriggerState } from './triggers.js'
import type { FeedWriteStore, Identity } from './feedstore.js'
import {
  acceptWith,
  buildCharter,
  draftProposal,
  performHandoff,
  publishCatalogue,
  QuorumRejected,
  sealWith,
  submitCorrection,
  type HandoffOutcome,
} from './operations.js'
import { defaultAnchor, readRegistry, resolveAll, type Anchor, type CatalogueView } from './resolve.js'
import { LIBRARY_IDS, RegistryEntry, type Charter, type HandoffProposal, type LibraryId, type RejectedAttempt, type SeedCatalogue } from './schemas.js'
import { signText } from './signatures.js'
import { sameAddress } from './swarm.js'

export interface StewardIdentity extends Identity {
  library: LibraryId
}

export interface Cast {
  scribe: Identity
  ngawang: StewardIdentity
  padma: StewardIdentity
  stanzin: StewardIdentity
  libraries: Record<LibraryId, Identity>
}

/** Throwaway identities for a rehearsal. They exist only in memory. */
export function makeEphemeralCast(): Cast {
  const id = (name: string): Identity => {
    const wallet = Wallet.createRandom() as unknown as Wallet
    return { name, address: wallet.address, wallet }
  }
  return {
    scribe: id('Council scribe'),
    ngawang: { ...id('Ngawang Dorje'), library: 'hemis' },
    padma: { ...id('Padma Chodon'), library: 'tabo' },
    stanzin: { ...id('Stanzin Namgyal'), library: 'thiksey' },
    libraries: Object.fromEntries(LIBRARY_IDS.map((l) => [l, id(`${l} committee`)])) as Record<LibraryId, Identity>,
  }
}

export interface RehearsalStep {
  id: string
  act: 'genesis' | 'stewardship' | 'silence' | 'refusals' | 'handoff' | 'after'
  title: string
  detail: string
  /** true for attempts that are *supposed* to be refused */
  refused?: boolean
  /** library seals collected on the current proposal, for the UI's seal row */
  seals?: LibraryId[]
  handoff?: HandoffOutcome
  view?: CatalogueView
  triggers?: TriggerState[]
}

export interface RehearsalResult {
  anchor: Anchor
  charter: Charter
  rejectedAttempts: RejectedAttempt[]
  handoffs: HandoffOutcome[]
  finalView: CatalogueView
}

const DAY = 86_400_000

/**
 * The whole story, end to end, against any FeedWriteStore: genesis, a steward
 * publishing, libraries correcting their own shelves, the steward going quiet,
 * three refused attempts to change the steward the wrong way, the real hand-off,
 * the successor publishing, and a second hand-off after that.
 *
 * Yields a step at a time so the web UI can play it like a story; the CLI just
 * drains it. Throws if anything that should succeed fails, or anything that
 * should be refused gets through.
 */
export async function* rehearse(opts: {
  store: FeedWriteStore
  cast: Cast
  seed: SeedCatalogue
  start?: Date
}): AsyncGenerator<RehearsalStep, RehearsalResult> {
  const { store, cast, seed } = opts
  let now = opts.start ?? new Date('2026-09-20T06:00:00Z')
  const anchor = defaultAnchor(cast.scribe.address)
  const charter = buildCharter(
    Object.fromEntries(LIBRARY_IDS.map((l) => [l, cast.libraries[l].address])) as Record<LibraryId, string>,
  )
  const rejectedAttempts: RejectedAttempt[] = []
  const handoffs: HandoffOutcome[] = []
  const seal = async (p: HandoffProposal, libs: LibraryId[]) => {
    for (const l of libs) p = await sealWith(p, charter, l, cast.libraries[l].wallet)
    return p
  }
  const tick = (days: number) => (now = new Date(now.getTime() + days * DAY))

  // ── act 1: genesis ────────────────────────────────────────────────────────
  let proposal = draftProposal({
    charter,
    current: null,
    incoming: { address: cast.ngawang.address, name: cast.ngawang.name, library: cast.ngawang.library },
    next: { address: cast.padma.address, name: cast.padma.name },
    trigger: 'T0-genesis',
    effectiveFrom: now.toISOString().slice(0, 10),
    now,
  })
  proposal = await seal(proposal, ['hemis', 'thiksey', 'diskit', 'lamayuru'])
  proposal = await acceptWith(proposal, cast.ngawang.wallet)
  yield {
    id: 'genesis-seals',
    act: 'genesis',
    title: 'Four libraries seal the charter; Ngawang accepts and names Padma',
    detail: 'Ngawang’s acceptance is also his standing designation: it names Padma Chodon as the next steward, while he is still here to say so.',
    seals: proposal.approvals.map((a) => a.library),
  }
  let outcome = await performHandoff({ store, anchor, charter, proposal, incoming: cast.ngawang.address, scribe: cast.scribe, now })
  handoffs.push(outcome)
  yield {
    id: 'genesis',
    act: 'genesis',
    title: 'The scribe writes registry entry #0',
    detail: `Readers now follow Ngawang’s catalogue feed. Registry update #${outcome.feedIndex}, entry ${outcome.entryReference.slice(0, 12)}…`,
    handoff: outcome,
  }

  // ── act 2: ordinary stewardship ──────────────────────────────────────────
  const v1 = await publishCatalogue({ store, anchor, steward: cast.ngawang, seed, now })
  tick(20)
  const v2 = await publishCatalogue({ store, anchor, steward: cast.ngawang, seed, now })
  yield {
    id: 'publish',
    act: 'stewardship',
    title: `Ngawang publishes the catalogue (v${v1.catalogue.version}, then v${v2.catalogue.version})`,
    detail: `Signed by Ngawang’s key, stamped by the shared node’s batch. Feed updates #${v1.feedIndex} and #${v2.feedIndex}.`,
  }
  tick(3)
  const tabo = seed.records.find((r) => r.library === 'tabo')
  const hemis = seed.records.find((r) => r.library === 'hemis')
  if (!tabo || !hemis) throw new Error('seed needs Tabo and Hemis records')
  await submitCorrection({
    store, anchor, library: cast.libraries.tabo, libraryId: 'tabo', recordId: tabo.id,
    changes: { condition: 'damaged', photographed: true, notes: 'Water stain on the last twelve folios after the spring leak.' }, now,
  })
  await submitCorrection({
    store, anchor, library: cast.libraries.kye, libraryId: 'kye', recordId: hemis.id,
    changes: { notes: 'Kye holds a second copy of this text; worth comparing.' }, now,
  })
  const pendingView = await resolveAll(store, anchor)
  yield {
    id: 'corrections',
    act: 'stewardship',
    title: 'Tabo and Kye post signed corrections to their own feeds',
    detail: `Nobody had to email the steward. Readers already see ${pendingView.pending.length} pending corrections on top of v${pendingView.catalogue?.version}.`,
    view: pendingView,
  }

  // ── act 3: silence ───────────────────────────────────────────────────────
  tick(62)
  const triggers = evaluateTriggers({ charter, now, lastPublishedAt: v2.catalogue.publishedAt, ttlDays: 90, unansweredLibraries: 2 })
  if (!triggers.find((t) => t.id === 'T2-silence')?.met) throw new Error('silence trigger should be met')
  yield {
    id: 'silence',
    act: 'silence',
    title: 'Ngawang stops answering',
    detail: 'No catalogue update for 62 days, and Tabo and Kye have had no reply for over 30. Trigger T2 is met; the door to a hand-off opens.',
    triggers,
  }

  // ── act 4: the wrong ways to change a steward, all refused ────────────────
  const current = (await readRegistry(store, anchor)).current
  proposal = draftProposal({
    charter,
    current,
    incoming: { address: cast.padma.address, name: cast.padma.name, library: cast.padma.library },
    next: { address: cast.stanzin.address, name: cast.stanzin.name },
    trigger: 'T2-silence',
    effectiveFrom: now.toISOString().slice(0, 10),
    now,
  })
  proposal = await acceptWith(proposal, cast.padma.wallet)

  const refuse = async (attempt: string, p: HandoffProposal): Promise<string> => {
    try {
      await performHandoff({ store, anchor, charter, proposal: p, incoming: cast.padma.address, scribe: cast.scribe, now })
    } catch (e) {
      if (!(e instanceof QuorumRejected)) throw e
      rejectedAttempts.push({ at: now.toISOString(), attempt, result: e.message })
      return e.message
    }
    throw new Error(`${attempt} should have been refused`)
  }

  const forged = {
    ...proposal,
    approvals: [{ library: 'hemis' as const, address: charter.members.find((m) => m.id === 'hemis')!.address, signature: await signText(cast.ngawang.wallet, proposal.statement) }],
  }
  const aloneMsg = await refuse('The outgoing steward signs for Hemis on his own', forged)
  yield { id: 'refused-alone', act: 'refusals', title: 'One person cannot do it', detail: aloneMsg, refused: true, seals: [] }

  // The steward writes a "registry" under his own key. Nobody reads it.
  const bogus = await store.putJson('registry-entry.json', { note: 'Ngawang redirects readers to himself' })
  await store.writeRef(cast.ngawang, anchor.registryTopicHex, 0n, bogus)
  const afterOwnFeed = await resolveAll(store, anchor)
  if (!sameAddress(afterOwnFeed.registry.current?.entry?.steward.address, cast.ngawang.address)) throw new Error('own-feed redirect leaked')
  rejectedAttempts.push({
    at: now.toISOString(),
    attempt: 'A steward publishes a registry under his own key',
    result: 'Ignored: readers only follow the registry owned by the council scribe.',
  })
  yield {
    id: 'refused-own-feed',
    act: 'refusals',
    title: 'A steward cannot redirect readers with his own key',
    detail: 'He can write a feed under his own address; readers never look there. The registry belongs to the council scribe.',
    refused: true,
  }

  const three = await seal(proposal, ['hemis', 'alchi', 'tabo'])
  const threeMsg = await refuse('Three of seven libraries seal the hand-off', three)
  yield { id: 'refused-three', act: 'refusals', title: 'Three seals are not enough', detail: threeMsg, refused: true, seals: three.approvals.map((a) => a.library) }

  // The scribe writes an entry without the seals. Readers check seals themselves.
  const unsealed = RegistryEntry.parse({
    ...outcome.entry,
    epoch: 1,
    kind: 'handoff',
    fields: proposal.fields,
    statement: proposal.statement,
    steward: proposal.fields.incoming,
    designatedSuccessor: proposal.fields.next,
    previousEntry: proposal.fields.previous,
    approvals: [],
    acceptance: three.acceptance,
  })
  const unsealedRef = await store.putJson('registry-entry.json', unsealed)
  const nextRegistry = (await store.latestIndex(cast.scribe.address, anchor.registryTopicHex)) ?? -1n
  await store.writeRef(cast.scribe, anchor.registryTopicHex, nextRegistry + 1n, unsealedRef)
  const afterScribe = await resolveAll(store, anchor)
  if (!sameAddress(afterScribe.registry.current?.entry?.steward.address, cast.ngawang.address)) throw new Error('unsealed entry was followed')
  const ignored = afterScribe.registry.entries.at(-1)
  rejectedAttempts.push({
    at: now.toISOString(),
    attempt: 'The scribe writes an entry with no seals',
    result: `Written as registry update #${ignored?.feedIndex}, ignored by every reader: ${ignored?.problems.join('; ')}`,
  })
  yield {
    id: 'refused-scribe',
    act: 'refusals',
    title: 'Even the scribe cannot do it alone',
    detail: `The scribe’s key holds the pen, not the vote. Readers skip update #${ignored?.feedIndex}: ${ignored?.problems[0]}.`,
    refused: true,
  }

  // ── act 5: the real hand-off ─────────────────────────────────────────────
  proposal = await seal(three, ['kye'])
  outcome = await performHandoff({ store, anchor, charter, proposal, incoming: cast.padma.address, scribe: cast.scribe, now })
  handoffs.push(outcome)
  yield {
    id: 'handoff',
    act: 'handoff',
    title: 'Kye adds the fourth seal. Padma becomes steward.',
    detail: `Registry update #${outcome.feedIndex}. Ngawang did not have to be reachable: he had already named Padma, so four seals were enough.`,
    seals: proposal.approvals.map((a) => a.library),
    handoff: outcome,
  }
  tick(1)
  const v3 = await publishCatalogue({ store, anchor, steward: cast.padma, seed, now })
  yield {
    id: 'successor-publishes',
    act: 'handoff',
    title: `Padma publishes v${v3.catalogue.version} on her own feed`,
    detail: `She picked up Ngawang’s v${v2.catalogue.version} through the registry, applied ${v3.applied} correction(s) and kept ${v3.proposed} as a proposal.`,
  }

  // ── act 6: and the one after that ────────────────────────────────────────
  tick(400)
  const now2 = (await readRegistry(store, anchor)).current
  proposal = draftProposal({
    charter,
    current: now2,
    incoming: { address: cast.stanzin.address, name: cast.stanzin.name, library: cast.stanzin.library },
    next: null,
    trigger: 'T1-declared',
    effectiveFrom: now.toISOString().slice(0, 10),
    now,
  })
  proposal = await seal(proposal, ['alchi', 'kye', 'tabo', 'thiksey'])
  proposal = await acceptWith(proposal, cast.stanzin.wallet)
  outcome = await performHandoff({ store, anchor, charter, proposal, incoming: cast.stanzin.address, scribe: cast.scribe, now })
  handoffs.push(outcome)
  const v4 = await publishCatalogue({ store, anchor, steward: cast.stanzin, seed, now })
  const finalView = await resolveAll(store, anchor)
  if (!sameAddress(finalView.registry.current?.entry?.steward.address, cast.stanzin.address)) throw new Error('second hand-off not followed')
  yield {
    id: 'second-handoff',
    act: 'after',
    title: 'A year later Padma steps down; Stanzin takes over',
    detail: `Same registry address, third steward, catalogue v${v4.catalogue.version}. Readers never changed the address they start from.`,
    seals: proposal.approvals.map((a) => a.library),
    handoff: outcome,
    view: finalView,
  }
  return { anchor, charter, rejectedAttempts, handoffs, finalView }
}
