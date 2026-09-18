import type { People } from '../data'
import { Hex } from './bits'

const ROWS: { role: string; holder: (p: People, steward: string | null) => string | null; pays: boolean; publishes: boolean; decides: string; cannot: string }[] = [
  {
    role: 'Payer',
    holder: (p) => p.payer,
    pays: true,
    publishes: false,
    decides: 'no',
    cannot: 'Sign a catalogue or a registry entry. Its key never touches either.',
  },
  {
    role: 'Steward',
    holder: (_p, steward) => steward,
    pays: false,
    publishes: true,
    decides: 'no',
    cannot: 'Name their own replacement, or move where readers look.',
  },
  {
    role: 'Seven libraries',
    holder: () => null,
    pays: false,
    publishes: false,
    decides: 'yes, 4 of 7 together (5 of 7 for anyone not designated)',
    cannot: 'Publish the whole catalogue, or act alone. Each can correct only its own shelves.',
  },
  {
    role: 'Council scribe',
    holder: (p) => p.scribe,
    pays: false,
    publishes: false,
    decides: 'no, it only writes down what the seals decided',
    cannot: 'Change the steward without the seals. Readers check them and skip entries that lack them.',
  },
  {
    role: 'Anyone at all',
    holder: () => null,
    pays: true,
    publishes: false,
    decides: 'no',
    cannot: 'Stamp uploads. But anyone can top up the storage, no permission needed.',
  },
]

export function WhoHolds({ people, steward }: { people: People; steward: string | null }) {
  return (
    <div className="holds-scroll">
      <table className="holds">
        <caption className="sr-only">Who can pay, publish and decide</caption>
        <thead>
          <tr>
            <th scope="col">Role</th>
            <th scope="col">Pays for storage</th>
            <th scope="col">Publishes</th>
            <th scope="col">Decides who publishes</th>
            <th scope="col">Cannot</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const holder = r.holder(people, steward)
            return (
              <tr key={r.role}>
                <th scope="row">
                  {r.role}
                  {holder && (
                    <div style={{ fontWeight: 400, fontSize: '0.85rem', marginTop: '0.2rem' }}>
                      <Hex value={holder} />
                    </div>
                  )}
                </th>
                <td className={r.pays ? 'yes' : 'no'}>{r.pays ? 'yes' : 'no'}</td>
                <td className={r.publishes ? 'yes' : 'no'}>{r.publishes ? 'yes, on its own feed' : 'no'}</td>
                <td className={r.decides.startsWith('yes') ? 'yes' : 'no'}>{r.decides}</td>
                <td>{r.cannot}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
