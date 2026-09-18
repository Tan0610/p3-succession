import type { CSSProperties } from 'react'

const FLAGS = ['blue', 'white', 'red', 'green', 'yellow'] as const

export interface Chapter {
  id: string
  label: string
}

/**
 * The section links hang on a string like a row of prayer flags, in the
 * traditional order: blue, white, red, green, yellow.
 */
export function FlagNav({ chapters }: { chapters: Chapter[] }) {
  const n = chapters.length
  return (
    <nav className="flags" aria-label="Chapters">
      <svg className="string" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 1 Q 50 9 100 1" fill="none" stroke="#1e2b35" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
      </svg>
      <ul>
        {chapters.map((c, i) => {
          const x = n === 1 ? 0.5 : i / (n - 1)
          const sag = 4 * x * (1 - x) * 10 // follows the curve of the string
          const flag = FLAGS[i % FLAGS.length]!
          const style = {
            '--flag': `var(--flag-${flag})`,
            '--sag': `${sag}px`,
            '--tilt': `${(x - 0.5) * -5}deg`,
          } as CSSProperties
          return (
            <li key={c.id}>
              <a href={`#${c.id}`} data-flag={flag} style={style}>
                {c.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
