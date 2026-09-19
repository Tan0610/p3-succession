import type { CatalogueView } from '../../../src/core/resolve'
import type { StorageInfo } from '../data'
import { Dots, formatDate } from './bits'
import { TRIGGER_TEXT } from './Lineage'
import { Seal } from './Seal'

const FLOOR = 30

/**
 * The four facts a visitor wants before anything else, written on one slip of
 * paper: who keeps the catalogue, since which hand-off, how many seals put
 * them there, and how long the storage is paid for.
 */
export function StorySoFar({ view, storage, loading, rehearsal }: { view: CatalogueView | null; storage: StorageInfo | null; loading: boolean; rehearsal: boolean }) {
  if (loading) {
    return (
      <aside className="slip is-loading" aria-label="The story so far" aria-busy="true">
        <div className="cell keeper-cell">
          <span className="ghost-seal" aria-hidden="true" />
          <div>
            <span className="label">Keeping it now</span>
            <span className="ghost-line" aria-hidden="true" />
          </div>
        </div>
        <div className="cell">
          <span className="label">Since</span>
          <span className="ghost-line short" aria-hidden="true" />
        </div>
        <div className="cell">
          <span className="label">Library seals</span>
          <span className="ghost-line short" aria-hidden="true" />
        </div>
        <div className="cell">
          <span className="label">Storage paid until</span>
          <span className="ghost-line short" aria-hidden="true" />
        </div>
        <p className="sr-only">Reading the register…</p>
      </aside>
    )
  }

  const current = view?.registry.current ?? null
  const entry = current?.entry ?? null
  const counted = current?.quorum?.counted.map((c) => c.library) ?? []
  const needed = current?.quorum?.threshold ?? 4
  const days = storage?.ttlDays ?? null
  const low = days !== null && days < FLOOR

  return (
    <aside className="slip" aria-label="The story so far">
      <div className="cell keeper-cell">
        {entry ? <Seal address={entry.steward.address} size={52} label={`Seal of ${entry.steward.name}`} /> : <span className="ghost-seal" aria-hidden="true" />}
        <div>
          <span className="label">Keeping it now</span>
          <strong className="value">{entry ? entry.steward.name : 'Nobody yet'}</strong>
          {!entry && rehearsal && (
            <a className="aside" href="#ceremony">
              Begin the story
            </a>
          )}
        </div>
      </div>
      <div className="cell">
        <span className="label">Since</span>
        <strong className="value">{entry ? `Epoch ${entry.epoch}` : 'No hand-off yet'}</strong>
        {entry && (
          <span className="aside">
            {formatDate(entry.fields.effectiveFrom)}, {TRIGGER_TEXT[entry.fields.trigger]}
          </span>
        )}
      </div>
      <div className="cell">
        <span className="label">Library seals</span>
        <strong className="value">{entry ? `${counted.length} of 7` : 'None yet'}</strong>
        <span className="aside">
          {entry && <Dots counted={counted} />} <span className="nowrap">{needed} needed</span>
        </span>
      </div>
      <div className={`cell${low ? ' low' : ''}`}>
        <span className="label">Storage paid until</span>
        {storage && days !== null ? (
          <>
            <strong className="value">{formatDate(storage.expiresAt)}</strong>
            <span className="aside">
              {days < 1 ? 'less than a day left' : `${Math.floor(days)} days left`}
              {low ? ', under the 30-day line' : ''}
              {storage.basis === 'rehearsal' ? ' (made up for the rehearsal)' : ''}
            </span>
          </>
        ) : (
          <strong className="value">Not paid yet</strong>
        )}
      </div>
    </aside>
  )
}
