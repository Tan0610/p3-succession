import type { LedgerLine, StorageInfo } from '../data'
import { formatDate } from './bits'

const FLOOR = 30
const FULL = 120

/**
 * A butter lamp for the storage rent. The flame is as tall as the days of
 * storage left (full at 120 days); below 30 days it burns low and red.
 */
export function Lamp({ storage, ledger }: { storage: StorageInfo | null; ledger: LedgerLine[] }) {
  const days = storage?.ttlDays ?? 0
  const low = storage !== null && days < FLOOR
  const h = storage ? 14 + Math.min(1, days / FULL) * 86 : 6
  const flameTop = 120 - h
  // crop the empty sky above a low flame, so the lamp sits close to its heading
  const lineY = 120 - (14 + (FLOOR / FULL) * 86)
  const top = Math.max(0, Math.min(storage ? 100 - 0.95 * h : lineY, lineY) - 16)
  const outer = `M60 120 C 38 ${120 - h * 0.35}, 52 ${flameTop + h * 0.3}, 60 ${flameTop} C 68 ${flameTop + h * 0.3}, 82 ${120 - h * 0.35}, 60 120 Z`
  const inner = `M60 120 C 50 ${120 - h * 0.25}, 56 ${flameTop + h * 0.45}, 60 ${flameTop + h * 0.25} C 64 ${flameTop + h * 0.45}, 70 ${120 - h * 0.25}, 60 120 Z`

  return (
    <div className="lamp-wrap">
      <div className="lamp">
        <svg viewBox={`0 ${top} 120 ${210 - top}`} role="img" aria-label={storage ? `Butter lamp: ${Math.round(days)} days of storage left` : 'Butter lamp: storage unknown'}>
          <defs>
            <radialGradient id="glow" cx="50%" cy="60%" r="50%">
              <stop offset="0%" stopColor="#f2b53a" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#f2b53a" stopOpacity="0" />
            </radialGradient>
          </defs>
          {storage && <circle cx="60" cy={120 - h * 0.45} r={20 + h * 0.5} fill="url(#glow)" />}
          {/* threshold mark for the 30-day floor */}
          <line x1="16" x2="104" y1={120 - (14 + (FLOOR / FULL) * 86)} y2={120 - (14 + (FLOOR / FULL) * 86)} stroke="#c23b30" strokeDasharray="3 4" strokeWidth="1.2" />
          <text x="16" y={lineY - 4} fontSize="8" fill="#c23b30" fontFamily="var(--hand)">
            30-day line
          </text>
          {storage && (
            <>
              <path className="flame" d={outer} fill={low ? '#c23b30' : '#f2b53a'} />
              <path className="flame inner" d={inner} fill={low ? '#f2b53a' : '#fff1c4'} />
            </>
          )}
          <line x1="60" y1="118" x2="60" y2="130" stroke="#1e2b35" strokeWidth="2.4" strokeLinecap="round" />
          {/* the bowl: hammered brass, drawn a little unevenly on purpose */}
          <path d="M22 128 C 24 152, 44 160, 60 160 C 78 160, 97 151, 98 128 Z" fill="#c99434" stroke="#1e2b35" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M22 128 C 40 133, 80 133, 98 128" fill="none" stroke="#1e2b35" strokeWidth="1.6" />
          <path d="M50 160 C 50 172, 42 176, 40 186 L 80 186 C 78 176, 70 172, 70 160" fill="#b88428" stroke="#1e2b35" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M30 196 C 30 186, 90 186, 90 196 Z" fill="#c99434" stroke="#1e2b35" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M34 140 q 4 3 8 0 M 70 142 q 4 3 8 0" stroke="#1e2b35" strokeWidth="1" fill="none" opacity="0.5" />
        </svg>
      </div>
      <div>
        {storage ? (
          <p className={`ttl${low ? ' low' : ''}`}>
            {days < 1 ? 'Less than a day' : `${Math.floor(days)} days`}
            <small>
              left on the storage rent, paid until about {formatDate(storage.expiresAt)}.{' '}
              {storage.basis === 'node'
                ? 'Read from the node just now.'
                : storage.basis === 'rehearsal'
                  ? 'A made-up figure for the rehearsal.'
                  : 'From the last payment in the storage log.'}
            </small>
          </p>
        ) : (
          <p className="ttl">
            Unknown
            <small>No postage batch has been bought for the catalogue yet.</small>
          </p>
        )}
        <p style={{ marginTop: '1.2rem' }}>
          Swarm storage is rent paid in advance. When it runs out, the catalogue can disappear. Anyone can add to it: topping up a batch on Gnosis
          Chain doesn’t need the owner’s permission, so any library or well-wisher can keep the lamp lit.
        </p>
        {low && <p className="warn-note">Below the 30-day line. That is trigger T3: top up now, or start a hand-off.</p>}
        {ledger.length > 0 && (
          <ul className="ledger" aria-label="Storage payments">
            {ledger.map((l, i) => (
              <li key={i}>
                {formatDate(l.at)}: {l.action === 'buy' ? 'bought' : l.action === 'extend' ? 'extended' : 'topped up'}, {l.detail}
                {l.costBzz ? ` for ${Number(l.costBzz).toFixed(4)} xBZZ` : ''}
                {l.ttlDaysBefore !== null && l.ttlDaysAfter !== null ? ` (${l.ttlDaysBefore} to ${l.ttlDaysAfter} days)` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
