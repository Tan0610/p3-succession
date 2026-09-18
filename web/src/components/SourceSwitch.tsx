import type { Source } from '../data'

const OPTIONS: { value: Source; label: string; hint: string }[] = [
  { value: 'node', label: 'My node', hint: 'Read the real registry through the Bee node on this computer' },
  { value: 'gateway', label: 'Public gateway', hint: 'Read the real registry through api.gateway.ethswarm.org' },
  { value: 'rehearsal', label: 'Rehearsal', hint: 'Play the whole succession story in your browser with throwaway keys' },
]

export function SourceSwitch({ value, onChange }: { value: Source; onChange: (s: Source) => void }) {
  return (
    <fieldset className="source" style={{ margin: 0 }}>
      <legend className="sr-only">Where to read the catalogue from</legend>
      {OPTIONS.map((o) => (
        <label key={o.value} title={o.hint}>
          <input type="radio" name="source" value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </fieldset>
  )
}
