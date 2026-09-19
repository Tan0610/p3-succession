import type { CSSProperties } from 'react'
import type { CatalogueView } from '../../../src/core/resolve'
import type { TriggerId } from '../../../src/core/schemas'
import type { Source } from '../data'
import { Dots, formatDate } from './bits'
import { Seal } from './Seal'

export const TRIGGER_TEXT: Record<TriggerId, string> = {
  'T0-genesis': 'named when the register began',
  'T1-declared': 'after the previous steward stepped down',
  'T2-silence': 'after the previous steward fell silent',
  'T3-storage': 'when the storage was running out',
  'T4-removal': 'after a removal for cause',
}

/** The line of custodians, read straight from the registry feed. */
export function Lineage({ view }: { view: CatalogueView }) {
  const entries = view.registry.entries
  const current = view.registry.current
  if (entries.length === 0) {
    return (
      <div className="lineage">
        <ol>
          <li className="keeper empty">
            <p>
              Nobody has been named yet. The register begins when four libraries seal the first steward.
            </p>
          </li>
        </ol>
      </div>
    )
  }
  return (
    <div className="lineage drawn">
      <p className="lineage-caption hand">The keepers so far, read from the register</p>
      <svg className="path" viewBox="0 0 30 100" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M15 0 C 4 12, 26 22, 15 34 S 4 56, 15 68 S 27 88, 15 100"
          fill="none"
          stroke="#1e2b35"
          strokeWidth="1.6"
          strokeDasharray="0.5 3.2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <ol aria-label="Stewards in order">
        {entries.map((e, k) => {
          const order = { '--k': k } as CSSProperties
          const entry = e.entry
          const isNow = current?.feedIndex === e.feedIndex
          const counted = e.quorum?.counted.map((c) => c.library) ?? []
          if (!entry || !e.ok) {
            return (
              <li key={e.feedIndex} className="keeper ignored" style={order}>
                {entry ? <Seal address={entry.steward.address} faded label={`Unsealed entry naming ${entry.steward.name}`} /> : <span />}
                <div>
                  <div className="who">{entry ? entry.steward.name : 'Unreadable entry'}</div>
                  <div className="why">Ignored by every reader: {e.problems[0]}</div>
                  <Dots counted={counted} />
                </div>
              </li>
            )
          }
          return (
            <li key={e.feedIndex} className={`keeper${isNow ? ' now' : ''}`} style={order} aria-current={isNow ? 'true' : undefined}>
              <Seal address={entry.steward.address} label={`Seal of ${entry.steward.name}`} />
              <div>
                <div className="who">{entry.steward.name}</div>
                <div className="when">
                  Steward from {formatDate(entry.fields.effectiveFrom)}, {TRIGGER_TEXT[entry.fields.trigger]}
                </div>
                <Dots counted={counted} />{' '}
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  {counted.length} of 7 libraries sealed it
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const WAIT: Record<Source, string> = {
  node: 'Reading the register from your Bee node. Each library’s corrections are checked too, so this can take a minute.',
  gateway: 'Reading the register through the public gateway. Each library’s corrections are checked too, so this can take a minute.',
  rehearsal: 'Setting up the rehearsal…',
}

/** Two ghost keepers while the register is read. */
export function LineageSkeleton({ source }: { source: Source }) {
  return (
    <div className="lineage is-loading" aria-busy="true">
      <p className="lineage-caption hand" role="status">
        {WAIT[source]}
      </p>
      <ol aria-hidden="true">
        {[0, 1].map((k) => (
          <li key={k} className="keeper ghost">
            <span className="ghost-seal" />
            <div>
              <span className="ghost-line" />
              <span className="ghost-line short" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
