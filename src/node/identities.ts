import type { StewardshipConfig } from './config.js'

export interface RoleAddress {
  role: 'payer' | 'scribe' | 'steward' | 'library'
  name: string
  address: string
}

/**
 * Paying, publishing and deciding must be different keys. This refuses to run
 * if any two roles share an address: e.g. if the node wallet were also the
 * steward, whoever runs the node could publish without anyone noticing.
 */
export function assertIdentitiesSeparated(config: StewardshipConfig, payerAddress: string | null): RoleAddress[] {
  const roles: RoleAddress[] = []
  if (payerAddress) roles.push({ role: 'payer', name: 'Bee node wallet', address: payerAddress })
  if (config.council.scribe.address) roles.push({ role: 'scribe', name: config.council.scribe.name, address: config.council.scribe.address })
  for (const s of config.stewards) if (s.address) roles.push({ role: 'steward', name: s.name, address: s.address })
  for (const l of config.libraries) if (l.address) roles.push({ role: 'library', name: l.name, address: l.address })

  const seen = new Map<string, RoleAddress>()
  for (const r of roles) {
    const key = r.address.toLowerCase()
    const other = seen.get(key)
    if (other) {
      throw new Error(`Identity overlap: ${other.name} (${other.role}) and ${r.name} (${r.role}) share ${r.address}. Every role needs its own key.`)
    }
    seen.set(key, r)
  }
  return roles
}
