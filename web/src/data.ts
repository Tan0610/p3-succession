import configJson from '../../stewardship.config.json'
import ledgerJson from '../../ledger/storage.json'
import seedJson from '../../seed/catalogue.seed.json'
import { HttpFeedStore } from '../../src/core/http-feedstore'
import { MemoryFeedStore } from '../../src/core/memory-feedstore'
import { makeEphemeralCast, rehearse, type Cast, type RehearsalResult, type RehearsalStep } from '../../src/core/rehearsal'
import { defaultAnchor, resolveAll, type CatalogueView } from '../../src/core/resolve'
import { SeedCatalogue, type LibraryId, type RejectedAttempt } from '../../src/core/schemas'

/** Everything here is public: addresses, topics, references. The viewer never sees a key. */
export const config = configJson as unknown as PublicConfig
export const ledger = ledgerJson as unknown as LedgerLine[]
const seed = SeedCatalogue.parse(seedJson)

const recordModules = import.meta.glob('../../handoffs/*.json', { eager: true, import: 'default' })
export const records = Object.entries(recordModules)
  .filter(([path]) => /\d{4}-\d{2}-\d{2}-epoch-\d+\.json$/.test(path))
  .map(([, r]) => r as HandoffRecordLite)
  .sort((a, b) => a.epoch - b.epoch)

export const PUBLIC_GATEWAY = 'https://api.gateway.ethswarm.org'

export type Source = 'node' | 'gateway' | 'rehearsal'

export interface PublicConfig {
  status: 'awaiting-live-ceremony' | 'live'
  bee: { url: string }
  payer: { nodeAddress: string | null; batchId: string | null; batchLabel: string }
  council: { scribe: { name: string; address: string | null } }
  topics: Record<'registry' | 'catalogue' | 'corrections', { string: string; hex: string }>
  registryManifest: string | null
  libraries: { id: LibraryId; name: string; valley: 'Ladakh' | 'Spiti'; address: string | null }[]
  stewards: { name: string; library: LibraryId; address: string | null }[]
}

export interface LedgerLine {
  at: string
  action: 'buy' | 'extend' | 'topup'
  batchId: string
  payer: string
  detail: string
  costBzz: string | null
  ttlDaysBefore: number | null
  ttlDaysAfter: number | null
  expiresAfter: string | null
}

export interface HandoffRecordLite {
  epoch: number
  performedAt: string
  trigger: string
  statement: string
  honesty: string
  notes: string[]
  outgoing: { address: string; name: string } | null
  incoming: { address: string; name: string }
  approvals: { library: LibraryId; address: string; valid: boolean }[]
  threshold: string
  registryUpdate: { feedIndex: number; entryReference: string; socAddress: string; socOwner: string | null }
  rejectedAttempts: RejectedAttempt[]
}

export interface People {
  scribe: string | null
  payer: string | null
  stewards: { name: string; library: LibraryId; address: string | null }[]
  libraries: { id: LibraryId; name: string; valley: 'Ladakh' | 'Spiti'; address: string | null }[]
}

export interface StorageInfo {
  ttlDays: number
  expiresAt: string
  batchId: string
  label: string
  /** 'node' = read live from the node now; 'recorded' = last value in the ledger */
  basis: 'node' | 'recorded' | 'rehearsal'
}

export interface Snapshot {
  source: Source
  label: string
  view: CatalogueView
  people: People
  storage: StorageInfo | null
  rejectedAttempts: RejectedAttempt[]
}

export const configuredPeople = (): People => ({
  scribe: config.council.scribe.address,
  payer: config.payer.nodeAddress,
  stewards: config.stewards,
  libraries: config.libraries,
})

export class NotYetError extends Error {}

function recordedStorage(): StorageInfo | null {
  const last = [...ledger].reverse().find((l) => l.expiresAfter)
  if (!last?.expiresAfter) return null
  const ttlDays = Math.max(0, (Date.parse(last.expiresAfter) - Date.now()) / 86_400_000)
  return { ttlDays, expiresAt: last.expiresAfter, batchId: last.batchId, label: config.payer.batchLabel, basis: 'recorded' }
}

async function nodeStorage(base: string): Promise<StorageInfo | null> {
  if (!config.payer.batchId) return null
  try {
    const res = await fetch(`${base}/stamps/${config.payer.batchId}`)
    if (!res.ok) return recordedStorage()
    const b = (await res.json()) as { batchTTL: number; label: string }
    return {
      ttlDays: b.batchTTL / 86_400,
      expiresAt: new Date(Date.now() + b.batchTTL * 1000).toISOString(),
      batchId: config.payer.batchId,
      label: b.label,
      basis: 'node',
    }
  } catch {
    return recordedStorage()
  }
}

/** Reads the real registry through a Bee node or a public gateway, with no keys. */
export async function loadFromNetwork(source: 'node' | 'gateway'): Promise<Snapshot> {
  const scribe = config.council.scribe.address
  if (!scribe) throw new NotYetError('The live ceremony has not been run yet, so there is no registry to read.')
  const base = source === 'node' ? '/bee' : PUBLIC_GATEWAY
  const view = await resolveAll(new HttpFeedStore(base), defaultAnchor(scribe))
  if (!view.registry.current) throw new NotYetError('The registry is empty on this network.')
  return {
    source,
    label: source === 'node' ? 'your Bee node (localhost:1633)' : 'the public Swarm gateway',
    view,
    people: configuredPeople(),
    storage: source === 'node' ? await nodeStorage(base) : recordedStorage(),
    rejectedAttempts: records.flatMap((r) => r.rejectedAttempts),
  }
}

/**
 * The rehearsal, played in the browser: throwaway keys, an in-memory stand-in
 * for Swarm, the same core code the CLI runs.
 */
export class Rehearsal {
  readonly store = new MemoryFeedStore()
  readonly cast: Cast = makeEphemeralCast()
  readonly anchor = defaultAnchor(this.cast.scribe.address)
  readonly steps: RehearsalStep[] = []
  private gen = rehearse({ store: this.store, cast: this.cast, seed })
  result: RehearsalResult | null = null

  get done() {
    return this.result !== null
  }

  async next(): Promise<RehearsalStep | null> {
    if (this.result) return null
    const r = await this.gen.next()
    if (r.done) {
      this.result = r.value
      return null
    }
    this.steps.push(r.value)
    return r.value
  }

  people(): People {
    const c = this.cast
    return {
      scribe: c.scribe.address,
      payer: null,
      stewards: [c.ngawang, c.padma, c.stanzin].map((s) => ({ name: s.name, library: s.library, address: s.address })),
      libraries: config.libraries.map((l) => ({ ...l, address: c.libraries[l.id].address })),
    }
  }

  async snapshot(): Promise<Snapshot> {
    const view = await resolveAll(this.store, this.anchor)
    const refused = this.steps.filter((s) => s.refused)
    return {
      source: 'rehearsal',
      label: 'a rehearsal running in your browser',
      view,
      people: this.people(),
      storage: { ttlDays: 90, expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(), batchId: '0'.repeat(64), label: 'rehearsal', basis: 'rehearsal' },
      rejectedAttempts: refused.map((s) => ({ at: '', attempt: s.title, result: s.detail })),
    }
  }
}
