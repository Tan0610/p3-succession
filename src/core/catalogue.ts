import type { PendingCorrection } from './resolve.js'
import {
  Catalogue,
  LIBRARY_IDS,
  type AppliedCorrection,
  type CatalogueRecord,
  type LibraryId,
  type Person,
  type SeedCatalogue,
} from './schemas.js'

export interface NextCatalogueInput {
  base: Catalogue | null
  seed: SeedCatalogue
  steward: Person
  epoch: number
  registryEntryRef: string | null
  previous: Catalogue['previousVersion']
  pending: PendingCorrection[]
  now: Date
  summary?: string
}

/**
 * Builds the next catalogue version. Verified corrections are folded in, in feed
 * order, per library. A library's correction to its *own* shelf is applied; a
 * correction about another library's shelf is recorded as "proposed" and left
 * for that library or the steward, because each committee speaks for its own
 * collection.
 */
export function nextCatalogue(input: NextCatalogueInput): { catalogue: Catalogue; applied: AppliedCorrection[] } {
  const { base, seed, steward, now } = input
  const at = now.toISOString()
  const records: CatalogueRecord[] = structuredClone(base?.records ?? seed.records)
  const cursor = { ...emptyCursor(), ...(base?.correctionCursor ?? {}) }
  const applied: AppliedCorrection[] = []

  const ordered = [...input.pending]
    .filter((p) => p.verified)
    .sort((a, b) => a.correction.library.localeCompare(b.correction.library) || a.feedIndex - b.feedIndex)

  for (const p of ordered) {
    const c = p.correction
    if (p.feedIndex <= (cursor[c.library] ?? -1)) continue
    const record = records.find((r) => r.id === c.recordId)
    const own = record?.library === c.library
    if (record && own) {
      if (c.changes.condition !== undefined) record.condition = c.changes.condition
      if (c.changes.photographed !== undefined) record.photographed = c.changes.photographed
      if (c.changes.foliosPresent !== undefined) record.folios.present = Math.min(c.changes.foliosPresent, record.folios.total)
      if (c.changes.notes !== undefined) record.notes = c.changes.notes
      record.updatedAt = c.observedAt
      record.updatedBy = `library:${c.library}`
    }
    cursor[c.library] = p.feedIndex
    applied.push({
      library: c.library,
      feedIndex: p.feedIndex,
      reference: p.reference,
      recordId: c.recordId,
      status: record && own ? 'applied' : 'proposed',
      signature: c.signature,
    })
  }

  const version = (base?.version ?? 0) + 1
  const summary =
    input.summary ??
    (applied.length
      ? `${applied.filter((a) => a.status === 'applied').length} correction(s) applied, ${applied.filter((a) => a.status === 'proposed').length} proposed`
      : version === 1
        ? 'first publication from the seed inventory'
        : 'heartbeat: no changes, the steward is still here')

  const catalogue = Catalogue.parse({
    schema: 'lsc/catalogue@1',
    catalogueId: seed.catalogueId,
    version,
    epoch: input.epoch,
    publishedAt: at,
    publishedBy: { address: steward.address, name: steward.name },
    registryEntryRef: input.registryEntryRef,
    previousVersion: input.previous,
    notice: seed.notice,
    libraries: seed.libraries,
    records,
    correctionCursor: cursor,
    appliedCorrections: [...(base?.appliedCorrections ?? []), ...applied],
    changelog: [...(base?.changelog ?? []), { version, at, by: steward.name, summary }],
  })
  return { catalogue, applied }
}

function emptyCursor(): Record<LibraryId, number> {
  return Object.fromEntries(LIBRARY_IDS.map((id) => [id, -1])) as Record<LibraryId, number>
}

export interface CatalogueStats {
  total: number
  byCondition: Record<string, number>
  photographed: number
  foliosPresent: number
  foliosTotal: number
}

export function stats(records: CatalogueRecord[]): CatalogueStats {
  const byCondition: Record<string, number> = { good: 0, fragile: 0, damaged: 0, missing: 0 }
  let photographed = 0
  let foliosPresent = 0
  let foliosTotal = 0
  for (const r of records) {
    byCondition[r.condition] = (byCondition[r.condition] ?? 0) + 1
    if (r.photographed) photographed++
    foliosPresent += r.folios.present
    foliosTotal += r.folios.total
  }
  return { total: records.length, byCondition, photographed, foliosPresent, foliosTotal }
}

// ── static renderings published next to catalogue.json ──────────────────────

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function renderCatalogueCsv(c: Catalogue): string {
  const head = ['id', 'library', 'title', 'collection', 'form', 'folios_present', 'folios_total', 'condition', 'photographed', 'notes', 'updated_at', 'updated_by']
  const cell = (v: string | number | boolean) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = c.records.map((r) =>
    [r.id, r.library, r.title, r.collection, r.form, r.folios.present, r.folios.total, r.condition, r.photographed, r.notes, r.updatedAt, r.updatedBy]
      .map(cell)
      .join(','),
  )
  return [head.join(','), ...rows].join('\n') + '\n'
}

/**
 * A no-JavaScript page, so the catalogue is readable in any browser straight
 * from `/bzz/<catalogue feed manifest>/` even if every app we wrote is gone.
 */
export function renderCatalogueHtml(c: Catalogue): string {
  const s = stats(c.records)
  const byLib = new Map<string, CatalogueRecord[]>()
  for (const r of c.records) byLib.set(r.library, [...(byLib.get(r.library) ?? []), r])
  const sections = c.libraries
    .map((lib) => {
      const rows = (byLib.get(lib.id) ?? [])
        .map(
          (r) =>
            `<tr><td>${esc(r.id)}</td><td>${esc(r.title)}</td><td>${esc(r.form)}</td><td>${r.folios.present}/${r.folios.total}</td><td class="${r.condition}">${r.condition}</td><td>${r.photographed ? 'yes' : 'not yet'}</td><td>${esc(r.notes)}</td></tr>`,
        )
        .join('\n')
      return `<h2>${esc(lib.name)} <small>${lib.valley}</small></h2>\n<table><thead><tr><th>id</th><th>title</th><th>form</th><th>folios</th><th>condition</th><th>photographed</th><th>notes</th></tr></thead><tbody>\n${rows}\n</tbody></table>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ladakh–Spiti shared catalogue v${c.version}</title>
<style>
body{font:16px/1.5 Georgia,serif;background:#f3e9d2;color:#1b1612;max-width:70rem;margin:2rem auto;padding:0 1rem}
h1{font-weight:normal;margin-bottom:.2rem}h2{margin-top:2.5rem;border-bottom:2px solid #6b1e1e}small{color:#6b5b4b;font-size:.7em}
table{border-collapse:collapse;width:100%;font-size:.92rem}td,th{border-bottom:1px solid #d8c7a4;padding:.3rem .4rem;text-align:left;vertical-align:top}
.damaged{color:#8f2a1e;font-weight:bold}.missing{color:#8f2a1e;text-decoration:line-through}.fragile{color:#a35d12}
.note{background:#fff8e6;border-left:4px solid #c8741e;padding:.6rem 1rem}code{font-size:.85em}
</style></head><body>
<h1>Ladakh–Spiti Shared Manuscript Catalogue</h1>
<p>Version ${c.version} · epoch ${c.epoch} · published ${esc(c.publishedAt)} by ${esc(c.publishedBy.name)} <code>${c.publishedBy.address}</code></p>
<p>${s.total} works · ${s.foliosPresent} of ${s.foliosTotal} folios present · ${s.photographed} photographed · ${s.byCondition.damaged ?? 0} damaged · ${s.byCondition.missing ?? 0} missing</p>
<p class="note">${esc(c.notice)} Machine-readable: <a href="catalogue.json">catalogue.json</a> · <a href="catalogue.csv">catalogue.csv</a></p>
${sections}
</body></html>
`
}
