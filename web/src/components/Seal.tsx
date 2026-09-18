import { getBytes } from 'ethers'

const INKS = ['#8c2332', '#2b4c9b', '#2f7d5b', '#b87812', '#17807f', '#5b4b8a', '#7d6440']

/**
 * A steward's seal, drawn from the bytes of their address: the same key always
 * makes the same seal, and a different key can't make it. A rosette of petals
 * around a ring, like the carved wooden stamps libraries still use.
 */
export function Seal({ address, size = 84, faded = false, label }: { address: string; size?: number; faded?: boolean; label: string }) {
  const b = getBytes(address.startsWith('0x') ? address : `0x${address}`)
  const at = (i: number) => b[i % b.length] ?? 0
  const petals = 6 + (at(0) % 7)
  const ink = INKS[at(1) % INKS.length]!
  const turn = (at(2) / 255) * 360
  const long = 30 + (at(3) % 8)
  const wide = 7 + (at(4) % 6)
  const ring = 14 + (at(5) % 6)
  const dots = 8 + (at(6) % 9)
  const c = 50
  return (
    <svg className="seal" viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label} style={{ opacity: faded ? 0.45 : 1 }}>
      <circle cx={c} cy={c} r={47} fill="#f8f9f5" stroke={ink} strokeWidth={3} />
      <circle cx={c} cy={c} r={42} fill="none" stroke={ink} strokeWidth={1} strokeDasharray="2 3" />
      <g transform={`rotate(${turn} ${c} ${c})`}>
        {Array.from({ length: petals }, (_, i) => (
          <ellipse
            key={i}
            cx={c}
            cy={c - long / 2 - 4}
            rx={wide / 2}
            ry={long / 2}
            fill={i % 2 ? ink : 'none'}
            stroke={ink}
            strokeWidth={1.6}
            transform={`rotate(${(360 / petals) * i} ${c} ${c})`}
          />
        ))}
        {Array.from({ length: dots }, (_, i) => {
          const a = ((Math.PI * 2) / dots) * i
          return <circle key={i} cx={c + Math.cos(a) * 38} cy={c + Math.sin(a) * 38} r={1.6} fill={ink} />
        })}
      </g>
      <circle cx={c} cy={c} r={ring / 2 + 3} fill={ink} />
      <circle cx={c} cy={c} r={ring / 4} fill="#f8f9f5" />
    </svg>
  )
}
