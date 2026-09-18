import { useState, type CSSProperties } from 'react'
import { shortHex } from '../../../src/core/swarm'
import type { LibraryId } from '../../../src/core/schemas'

export const LIB: Record<LibraryId, { name: string; color: string; valley: 'Ladakh' | 'Spiti' }> = {
  diskit: { name: 'Diskit', color: 'var(--lib-diskit)', valley: 'Ladakh' },
  thiksey: { name: 'Thiksey', color: 'var(--lib-thiksey)', valley: 'Ladakh' },
  hemis: { name: 'Hemis', color: 'var(--lib-hemis)', valley: 'Ladakh' },
  alchi: { name: 'Alchi', color: 'var(--lib-alchi)', valley: 'Ladakh' },
  lamayuru: { name: 'Lamayuru', color: 'var(--lib-lamayuru)', valley: 'Ladakh' },
  kye: { name: 'Kye', color: 'var(--lib-kye)', valley: 'Spiti' },
  tabo: { name: 'Tabo', color: 'var(--lib-tabo)', valley: 'Spiti' },
}

export const LIB_ORDER: LibraryId[] = ['diskit', 'thiksey', 'hemis', 'alchi', 'lamayuru', 'kye', 'tabo']

export const libStyle = (id: LibraryId) => ({ '--c': LIB[id].color }) as CSSProperties

/** A short address you can copy in full. */
export function Hex({ value, head = 6, tail = 4 }: { value: string | null | undefined; head?: number; tail?: number }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="muted">not yet</span>
  const full = value.startsWith('0x') || value.length === 40 ? value : value
  return (
    <span>
      <span className="hex" title={full}>
        {shortHex(full, head, tail)}
      </span>
      <button
        type="button"
        className="copy"
        onClick={() => {
          void navigator.clipboard?.writeText(full).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
          })
        }}
        aria-label={`Copy ${full}`}
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </span>
  )
}

export function Dots({ counted }: { counted: LibraryId[] }) {
  return (
    <span className="dots" aria-label={`${counted.length} of 7 library seals: ${counted.map((c) => LIB[c].name).join(', ') || 'none'}`}>
      {LIB_ORDER.map((id) => (
        <span key={id} className={counted.includes(id) ? 'on' : ''} style={libStyle(id)} title={LIB[id].name} />
      ))}
    </span>
  )
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
