import { useMemo, useState } from 'react'
import { stats } from '../../../src/core/catalogue'
import type { CatalogueView } from '../../../src/core/resolve'
import type { Condition, LibraryId } from '../../../src/core/schemas'
import { renderChanges } from '../../../src/core/statements'
import { formatDate, LIB, LIB_ORDER, libStyle } from './bits'

const CONDITIONS: Condition[] = ['good', 'fragile', 'damaged', 'missing']
const PAGE = 12

export function Catalogue({ view }: { view: CatalogueView }) {
  const [library, setLibrary] = useState<LibraryId | 'all'>('all')
  const [condition, setCondition] = useState<Condition | 'all'>('all')
  const [shown, setShown] = useState(PAGE)

  const records = useMemo(
    () =>
      view.records
        .filter((r) => library === 'all' || r.library === library)
        .filter((r) => condition === 'all' || r.condition === condition)
        // works with a signed correction waiting come first
        .sort((a, b) => b.pending.length - a.pending.length),
    [view.records, library, condition],
  )

  if (!view.catalogue || !view.source) {
    return <p className="banner">The steward hasn’t published a catalogue yet. The first version appears here as soon as they do.</p>
  }
  const s = stats(view.records)
  const src = view.source

  return (
    <div>
      <p className="source-line">
        Version {view.catalogue.version}, published {formatDate(view.catalogue.publishedAt)} by {view.catalogue.publishedBy.name} on their own
        feed.
        {src.inherited && ' The new steward hasn’t published yet, so you’re reading the last version from before the hand-off.'}{' '}
        {view.catalogue.notice}
      </p>
      <div className="facts">
        <span>
          <strong>{s.total}</strong>works
        </span>
        <span>
          <strong>
            {s.foliosPresent.toLocaleString('en-IN')}
          </strong>
          of {s.foliosTotal.toLocaleString('en-IN')} folios on the shelf
        </span>
        <span>
          <strong>{s.photographed}</strong>photographed
        </span>
        <span>
          <strong>{s.byCondition.damaged ?? 0}</strong>damaged
        </span>
        <span>
          <strong>{s.byCondition.missing ?? 0}</strong>missing
        </span>
        <span>
          <strong>{view.pending.filter((p) => p.verified).length}</strong>signed corrections waiting
        </span>
      </div>

      <div className="cat-tools">
        <div className="chips" role="group" aria-label="Filter by library">
          <button type="button" className="chip" aria-pressed={library === 'all'} onClick={() => setLibrary('all')}>
            All libraries
          </button>
          {LIB_ORDER.map((id) => (
            <button key={id} type="button" className="chip" style={libStyle(id)} aria-pressed={library === id} onClick={() => setLibrary(id)}>
              {LIB[id].name}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Filter by condition">
          {(['all', ...CONDITIONS] as const).map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={condition === c} onClick={() => setCondition(c)}>
              {c === 'all' ? 'Any condition' : c}
            </button>
          ))}
        </div>
      </div>

      {records.length === 0 ? (
        <p className="hand" style={{ fontSize: '1.3rem' }}>
          Nothing on this shelf matches. Try another library or condition.
        </p>
      ) : (
        <ul className="shelf">
          {records.slice(0, shown).map((r) => (
            <li key={r.id} className="folio" style={libStyle(r.library)}>
              <div>
                <div className="id">
                  {r.id} <span className="muted" style={{ fontFamily: 'var(--body)', fontWeight: 500 }}>{LIB[r.library].name}</span>
                </div>
                <h3>{r.title}</h3>
              </div>
              <span className={`stamp ${r.condition}`}>{r.condition}</span>
              <div
                className="leaves"
                role="img"
                aria-label={`${r.folios.present} of ${r.folios.total} folios present`}
              >
                <span style={{ width: `${r.folios.total ? (r.folios.present / r.folios.total) * 100 : 0}%` }} />
              </div>
              <div className="meta">
                {r.folios.present} of {r.folios.total} folios, {r.form}, {r.collection.toLowerCase()}
                {r.photographed ? ', photographed' : ', not photographed yet'}
              </div>
              {r.notes && <div className="notes">{r.notes}</div>}
              {r.pending.map((p) => (
                <div key={`${p.correction.library}-${p.feedIndex}`} className="sticky" style={libStyle(p.correction.library)}>
                  <b>{LIB[p.correction.library].name} says:</b> {renderChanges(p.correction.changes)}
                  <br />
                  <span style={{ fontSize: '0.9rem' }}>
                    signed by the {LIB[p.correction.library].name} committee
                    {p.authority === 'own-shelf' ? ', applied at the next publication' : ', kept as a proposal (not their shelf)'}
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
      {records.length > shown && (
        <div className="more">
          <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, records.length - shown)} more of {records.length - shown}
          </button>
        </div>
      )}
    </div>
  )
}
