import { useState } from 'react'
import type { CatalogueView } from '../../../src/core/resolve'
import type { LibraryId } from '../../../src/core/schemas'
import type { People } from '../data'
import { Hex, LIB, LIB_ORDER, libStyle } from './bits'

/** Rough relative positions. Not to scale: a doodle, not a survey. */
const PINS: Record<LibraryId, { x: number; y: number; dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }> = {
  diskit: { x: 330, y: 70, dx: 18, dy: 6, anchor: 'start' },
  lamayuru: { x: 118, y: 196, dx: 0, dy: 34, anchor: 'middle' },
  alchi: { x: 212, y: 190, dx: 0, dy: -20, anchor: 'middle' },
  thiksey: { x: 348, y: 196, dx: 16, dy: -12, anchor: 'start' },
  hemis: { x: 384, y: 236, dx: 18, dy: 20, anchor: 'start' },
  kye: { x: 520, y: 430, dx: -18, dy: 6, anchor: 'end' },
  tabo: { x: 596, y: 480, dx: -22, dy: 24, anchor: 'end' },
}

export function LibraryMap({ view, people }: { view: CatalogueView; people: People }) {
  const [picked, setPicked] = useState<LibraryId>('tabo')
  const lib = people.libraries.find((l) => l.id === picked)
  const records = view.records.filter((r) => r.library === picked)
  const corrections = view.catalogue?.appliedCorrections.filter((c) => c.library === picked).length ?? 0
  const pending = view.pending.filter((p) => p.correction.library === picked).length

  return (
    <div className="map-wrap">
      <div className="map">
        <svg viewBox="0 0 680 540" role="group" aria-label="Map of the seven libraries">
          {/* ridgelines */}
          <path d="M20 130 l40 -40 l30 25 l45 -60 l38 42 l30 -22 l50 55" fill="none" stroke="#bcc7bf" strokeWidth="2" strokeLinejoin="round" />
          <path d="M420 300 l35 -38 l28 20 l40 -52 l34 40 l30 -24 l52 58" fill="none" stroke="#bcc7bf" strokeWidth="2" strokeLinejoin="round" />
          <path d="M160 400 l28 -30 l24 18 l34 -44 l30 34" fill="none" stroke="#bcc7bf" strokeWidth="2" strokeLinejoin="round" />
          {/* the Indus, and the Shyok up to Nubra */}
          <path d="M40 250 C 110 220, 160 215, 212 204 S 320 212, 350 208 S 430 250, 470 262 S 560 250, 640 300" fill="none" stroke="#2b5fae" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
          <path d="M300 30 C 320 60, 312 80, 336 100 S 352 150, 368 170" fill="none" stroke="#2b5fae" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
          {/* the Spiti river */}
          <path d="M470 380 C 510 400, 540 440, 580 470 S 630 500, 660 520" fill="none" stroke="#2b5fae" strokeWidth="2.6" strokeLinecap="round" opacity="0.5" />
          <text className="river" x="52" y="272" fontFamily="var(--hand)" fontSize="16" fill="#2b5fae">
            Indus
          </text>
          <text className="river" x="610" y="520" fontFamily="var(--hand)" fontSize="15" fill="#2b5fae">
            Spiti
          </text>
          <text className="region" x="40" y="44" fontFamily="var(--hand)" fontSize="22" fill="#1e2b35">
            Ladakh
          </text>
          <text className="region" x="470" y="360" fontFamily="var(--hand)" fontSize="22" fill="#1e2b35">
            Spiti valley
          </text>
          <text className="note" x="40" y="520" fontFamily="var(--hand)" fontSize="14" fill="#4f5d67">
            not to scale, and not a survey
          </text>
          {/* dotted track from Ladakh down to Spiti */}
          <path d="M392 246 C 420 300, 440 330, 470 360 S 505 410, 518 424" fill="none" stroke="#4f5d67" strokeWidth="1.6" strokeDasharray="2 6" strokeLinecap="round" />
          {LIB_ORDER.map((id) => {
            const p = PINS[id]
            return (
              <g
                key={id}
                className="pin"
                role="button"
                tabIndex={0}
                aria-pressed={picked === id}
                aria-label={`${LIB[id].name} library`}
                onClick={() => setPicked(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setPicked(id)
                  }
                }}
                style={libStyle(id)}
              >
                <circle className="halo" cx={p.x} cy={p.y} r={picked === id ? 17 : 13} fill="#f8f9f5" stroke="transparent" />
                <circle cx={p.x} cy={p.y} r={picked === id ? 11 : 8} fill={LIB[id].color} />
                <circle className="hit" cx={p.x} cy={p.y} r={26} fill="transparent" />
                <text className="lbl" x={p.x + p.dx} y={p.y + p.dy} textAnchor={p.anchor} fontSize="17" fontWeight="700" fill={LIB[id].color} fontFamily="var(--body)">
                  {LIB[id].name}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="lib-card" style={libStyle(picked)} aria-live="polite">
        <h3>{lib?.name ?? LIB[picked].name}</h3>
        <p className="muted" style={{ marginTop: '0.3rem' }}>
          {LIB[picked].valley}. One of seven seals on every hand-off, and the only voice on its own shelves.
        </p>
        <dl>
          <dt>Committee key</dt>
          <dd>
            <Hex value={lib?.address} />
          </dd>
          <dt>Works listed</dt>
          <dd>{records.length}</dd>
          <dt>Damaged or missing</dt>
          <dd>{records.filter((r) => r.condition === 'damaged' || r.condition === 'missing').length}</dd>
          <dt>Corrections folded in</dt>
          <dd>{corrections}</dd>
          <dt>Corrections waiting</dt>
          <dd>{pending}</dd>
        </dl>
      </div>
    </div>
  )
}
