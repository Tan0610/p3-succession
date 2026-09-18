import type { CorrectionChanges, LibraryId, StatementFields } from './schemas.js'

/**
 * The exact plain-text statements people sign. They are rendered deterministically
 * from structured fields, so anyone can re-render them and check a signature with
 * any Ethereum wallet ("Sign message" / EIP-191 personal_sign).
 *
 * Epoch + previous registry entry + charter hash are inside the text, so a
 * signature for one hand-off can never be replayed for another.
 */
export const CATALOGUE_TITLE = 'Ladakh–Spiti Shared Manuscript Catalogue'

const person = (p: { address: string; name: string } | null, none: string) =>
  p ? `${p.address} (${p.name})` : none

export function renderHandoffStatement(f: StatementFields): string {
  const previous = f.previous
    ? `#${f.previous.feedIndex} ${f.previous.reference}`
    : 'none — this is the genesis of the registry'
  return [
    `${CATALOGUE_TITLE} — Succession Statement v1`,
    `Catalogue: ${f.catalogueId}`,
    `Charter: ${f.charterHash}`,
    `Epoch: ${f.epoch} (previous registry entry: ${previous})`,
    `Outgoing steward: ${person(f.outgoing, 'none')}`,
    `Incoming steward: ${person(f.incoming, 'none')}`,
    `Next designated successor: ${person(f.next, 'none named')}`,
    `Trigger: ${f.trigger}`,
    `Effective from: ${f.effectiveFrom}`,
    `We consent that readers follow the incoming steward's catalogue feed from this epoch.`,
  ].join('\n')
}

export interface CorrectionStatementFields {
  catalogueId: string
  library: LibraryId
  author: string
  seq: number
  recordId: string
  changes: CorrectionChanges
  observedAt: string
}

export function renderChanges(changes: CorrectionChanges): string {
  return Object.keys(changes)
    .sort()
    .filter((k) => changes[k as keyof CorrectionChanges] !== undefined)
    .map((k) => `${k}=${JSON.stringify(changes[k as keyof CorrectionChanges])}`)
    .join('; ')
}

export function renderCorrectionStatement(c: CorrectionStatementFields): string {
  return [
    `${CATALOGUE_TITLE} — Correction v1`,
    `Catalogue: ${c.catalogueId}`,
    `Library: ${c.library} (committee key ${c.author})`,
    `Sequence: ${c.seq}`,
    `Record: ${c.recordId}`,
    `Changes: ${renderChanges(c.changes)}`,
    `Observed: ${c.observedAt}`,
  ].join('\n')
}
