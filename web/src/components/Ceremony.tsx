import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { RehearsalStep } from '../../../src/core/rehearsal'
import type { LibraryId } from '../../../src/core/schemas'
import type { HandoffRecordLite } from '../data'
import { LIB, LIB_ORDER, libStyle, formatDate } from './bits'

const ACT_TITLE: Record<RehearsalStep['act'], string> = {
  genesis: 'The register begins',
  stewardship: 'Ordinary years',
  silence: 'Silence',
  refusals: 'The wrong ways in',
  handoff: 'The hand-off',
  after: 'And the one after that',
}

/**
 * Seven seal slots. The seals stamp in one after another the first time the
 * row scrolls into view; a seal added later (in the rehearsal) stamps at once.
 */
export function SealRow({ sealed, needed }: { sealed: LibraryId[]; needed: number }) {
  const row = useRef<HTMLDivElement>(null)
  const [firstBatch, setFirstBatch] = useState<LibraryId[] | null>(null)
  useEffect(() => {
    if (firstBatch) return
    const el = row.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => setFirstBatch(sealed))
      return
    }
    const io = new IntersectionObserver(
      (seen) => {
        if (seen.some((s) => s.isIntersecting)) {
          setFirstBatch(sealed)
          io.disconnect()
        }
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [firstBatch, sealed])

  const shown = firstBatch ? sealed : []
  return (
    <>
      <div ref={row} className={`seal-row${firstBatch ? ' seen' : ''}`} role="list" aria-label={`${sealed.length} of ${needed} needed seals`}>
        {LIB_ORDER.map((id) => {
          const on = shown.includes(id)
          const order = firstBatch?.indexOf(id) ?? -1
          const style = { ...libStyle(id), '--delay': `${order > 0 ? order * 260 : 0}ms` } as CSSProperties
          return (
            <div key={id} role="listitem" className={`slot${on ? ' sealed' : ''}`} style={style}>
              <span className="ring" aria-hidden="true">
                {on ? '༄' : ''}
              </span>
              <span className="name">{LIB[id].name}</span>
              <span className="sr-only">{sealed.includes(id) ? 'sealed' : 'not sealed'}</span>
            </div>
          )
        })}
      </div>
      <p className="tally" aria-live="polite" style={{ '--n': firstBatch?.length ?? 0 } as CSSProperties}>
        {sealed.length >= needed
          ? `${sealed.length} seals: enough.`
          : sealed.length === 0
            ? `No seals yet. ${needed} are needed.`
            : `${sealed.length} of the ${needed} needed.`}
      </p>
    </>
  )
}

export function RehearsalCeremony({
  steps,
  done,
  busy,
  onNext,
  onRunAll,
  onRestart,
}: {
  steps: RehearsalStep[]
  done: boolean
  busy: boolean
  onNext: () => void
  onRunAll: () => void
  onRestart: () => void
}) {
  const last = steps.at(-1)
  const lastWithSeals = [...steps].reverse().find((s) => s.seals)
  const listEnd = useRef<HTMLLIElement>(null)
  const shownBefore = useRef(steps.length)
  useEffect(() => {
    // follow the story one step at a time; don't yank the page when it's played all at once
    if (steps.length === shownBefore.current + 1) listEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    shownBefore.current = steps.length
  }, [steps.length])

  return (
    <div className="ceremony">
      <div>
        <p>
          Everything here runs in your browser with throwaway keys and an in-memory stand-in for Swarm. It is the same code the command line
          uses against a real node. Nothing leaves this page.
        </p>
        <SealRow sealed={lastWithSeals?.seals ?? []} needed={4} />
        <div className="controls">
          <button type="button" className="btn primary" onClick={onNext} disabled={busy || done}>
            {steps.length === 0 ? 'Begin the story' : done ? 'The story is told' : 'Next step'}
          </button>
          <button type="button" className="btn" onClick={onRunAll} disabled={busy || done}>
            Play to the end
          </button>
          {steps.length > 0 && (
            <button type="button" className="btn quiet" onClick={onRestart} disabled={busy}>
              Start again with new keys
            </button>
          )}
        </div>
        {last?.triggers && (
          <ul className="muted" style={{ marginTop: '1.2rem', paddingLeft: '1.1rem' }}>
            {last.triggers.map((t) => (
              <li key={t.id}>
                <strong style={{ color: t.met ? 'var(--flag-red)' : undefined }}>{t.met ? 'Met: ' : 'Not met: '}</strong>
                {t.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ol className="story" aria-live="polite">
        {steps.length === 0 && (
          <li>
            <h3>Seven libraries, one key holder, and a question nobody has answered</h3>
            <p>Press “Begin the story” to watch the register start, the steward go quiet, and the catalogue carry on without him.</p>
          </li>
        )}
        {steps.map((s, i) => {
          const firstOfAct = i === 0 || steps[i - 1]?.act !== s.act
          return (
            <li key={s.id} ref={i === steps.length - 1 ? listEnd : undefined} className={`${s.refused ? 'refused' : ''} ${i === steps.length - 1 ? 'current' : ''}`}>
              {firstOfAct && <span className="act">{ACT_TITLE[s.act]}</span>}
              <h3>
                {s.title}
                {s.refused && <span className="refusal">refused</span>}
              </h3>
              <p>{s.detail}</p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** On the real network: what was recorded when the hand-offs were performed. */
export function RecordedCeremony({ records }: { records: HandoffRecordLite[] }) {
  if (records.length === 0) {
    return (
      <p className="banner">
        No live hand-off has been recorded yet. Switch to “Rehearsal” to watch the whole procedure, or run{' '}
        <code>npm run ceremony -- --live --yes</code> against a funded node.
      </p>
    )
  }
  const last = records.at(-1)!
  return (
    <div className="ceremony">
      <div>
        <p>
          The most recent hand-off: {last.outgoing ? `${last.outgoing.name} to ${last.incoming.name}` : `${last.incoming.name} named first steward`},
          on {formatDate(last.performedAt)}.
        </p>
        <SealRow sealed={last.approvals.filter((a) => a.valid).map((a) => a.library)} needed={4} />
        <details className="statement">
          <summary>The exact words every seal signed</summary>
          <pre>{last.statement}</pre>
        </details>
      </div>
      <ol className="story">
        {records.map((r) => (
          <li key={r.epoch}>
            <span className="act">Epoch {r.epoch}</span>
            {r.rejectedAttempts.map((a, i) => (
              <div key={i} className="refused-attempt">
                <h3>
                  {a.attempt}
                  <span className="refusal">refused</span>
                </h3>
                <p>{a.result}</p>
              </div>
            ))}
            <h3>{r.outgoing ? `${r.incoming.name} takes over from ${r.outgoing.name}` : `${r.incoming.name} becomes the first steward`}</h3>
            <p>
              {r.threshold}. Registry update #{r.registryUpdate.feedIndex}, signed by the council scribe.
            </p>
            {r.notes.map((n, i) => (
              <p key={i} className="hand" style={{ marginTop: '0.3rem' }}>
                {n}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </div>
  )
}
