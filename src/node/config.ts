import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { prettyJson } from '../core/canonical.js'
import { buildCharter, CATALOGUE_ID, LIBRARIES } from '../core/operations.js'
import { defaultAnchor, type Anchor } from '../core/resolve.js'
import { Address, LibraryId, Ref, SeedCatalogue, type Charter } from '../core/schemas.js'
import { shortHex, TOPICS, topicHex } from '../core/swarm.js'
import { PATHS } from './paths.js'

/**
 * stewardship.config.json holds PUBLIC facts only: addresses, topics, manifest
 * references, the batch id. It is tracked in git and safe to publish.
 */
const Topic = z.object({ string: z.string(), hex: Ref })

export const StewardshipConfig = z.object({
  schema: z.literal('lsc/config@1'),
  status: z.enum(['awaiting-live-ceremony', 'live']),
  catalogueId: z.string(),
  bee: z.object({ url: z.string() }),
  payer: z.object({
    role: z.string(),
    nodeAddress: Address.nullable(),
    batchId: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    batchLabel: z.string(),
  }),
  council: z.object({
    scribe: z.object({ keyName: z.string(), name: z.string(), address: Address.nullable() }),
  }),
  topics: z.object({ registry: Topic, catalogue: Topic, corrections: Topic }),
  registryManifest: Ref.nullable(),
  libraries: z.array(
    z.object({ id: LibraryId, name: z.string(), valley: z.enum(['Ladakh', 'Spiti']), keyName: z.string(), address: Address.nullable() }),
  ),
  stewards: z.array(z.object({ keyName: z.string(), name: z.string(), library: LibraryId, address: Address.nullable() })),
  currentSteward: Address.nullable(),
  designatedSuccessor: Address.nullable(),
  catalogueManifests: z.record(z.string(), Ref),
  history: z.array(
    z.object({
      epoch: z.number().int(),
      steward: Address,
      stewardName: z.string(),
      registryFeedIndex: z.number().int(),
      entryReference: Ref,
      record: z.string().nullable(),
      at: z.string(),
    }),
  ),
})
export type StewardshipConfig = z.infer<typeof StewardshipConfig>

export function defaultConfig(): StewardshipConfig {
  return {
    schema: 'lsc/config@1',
    status: 'awaiting-live-ceremony',
    catalogueId: CATALOGUE_ID,
    bee: { url: 'http://localhost:1633' },
    payer: {
      role: 'The Bee node wallet. It owns every postage batch on this shared node and pays for storage. It never signs catalogue or registry updates.',
      nodeAddress: null,
      batchId: null,
      batchLabel: 'lsc-catalogue',
    },
    council: { scribe: { keyName: 'council-scribe', name: 'Council scribe', address: null } },
    topics: {
      registry: { string: TOPICS.registry, hex: topicHex(TOPICS.registry) },
      catalogue: { string: TOPICS.catalogue, hex: topicHex(TOPICS.catalogue) },
      corrections: { string: TOPICS.corrections, hex: topicHex(TOPICS.corrections) },
    },
    registryManifest: null,
    libraries: LIBRARIES.map((l) => ({ ...l, keyName: `library-${l.id}`, address: null })),
    stewards: [
      { keyName: 'steward-ngawang', name: 'Ngawang Dorje', library: 'hemis', address: null },
      { keyName: 'steward-padma', name: 'Padma Chodon', library: 'tabo', address: null },
      { keyName: 'steward-stanzin', name: 'Stanzin Namgyal', library: 'thiksey', address: null },
    ],
    currentSteward: null,
    designatedSuccessor: null,
    catalogueManifests: {},
    history: [],
  }
}

export function loadConfig(): StewardshipConfig {
  if (!existsSync(PATHS.config)) return defaultConfig()
  return StewardshipConfig.parse(JSON.parse(readFileSync(PATHS.config, 'utf8')))
}

export function saveConfig(config: StewardshipConfig): void {
  writeFileSync(PATHS.config, prettyJson(StewardshipConfig.parse(config)))
}

export function beeUrl(config: StewardshipConfig, override?: string): string {
  return override ?? process.env.BEE_URL ?? config.bee.url
}

export function requireAnchor(config: StewardshipConfig): Anchor {
  if (!config.council.scribe.address) throw new Error('No council scribe yet. Run `npm run cli -- keys init` first.')
  return defaultAnchor(config.council.scribe.address)
}

export function charterFromConfig(config: StewardshipConfig): Charter {
  const addresses = Object.fromEntries(config.libraries.map((l) => [l.id, l.address])) as Record<string, string | null>
  if (Object.values(addresses).some((a) => !a)) throw new Error('Not every library has a key yet. Run `npm run cli -- keys init`.')
  return buildCharter(addresses as Record<(typeof config.libraries)[number]['id'], string>)
}

export function loadSeed() {
  return SeedCatalogue.parse(JSON.parse(readFileSync(PATHS.seed, 'utf8')))
}

export function stewardByKey(config: StewardshipConfig, keyName: string) {
  const s = config.stewards.find((x) => x.keyName === keyName || x.keyName === `steward-${keyName}`)
  if (!s) throw new Error(`No steward "${keyName}" in stewardship.config.json`)
  return s
}

export function personName(config: StewardshipConfig, address: string | null): string {
  if (!address) return 'nobody yet'
  const low = address.toLowerCase()
  const s = config.stewards.find((x) => x.address?.toLowerCase() === low)
  if (s) return s.name
  const l = config.libraries.find((x) => x.address?.toLowerCase() === low)
  if (l) return l.name
  if (config.council.scribe.address?.toLowerCase() === low) return config.council.scribe.name
  return shortHex(address)
}

// ── keep the human documents in step with the config ───────────────────────

const PENDING = '_(not generated yet: filled in automatically by `npm run cli -- keys init` during the live ceremony)_'

function block(name: string, body: string, text: string): string {
  const re = new RegExp(`(<!-- lsc:${name} -->)[\\s\\S]*?(<!-- /lsc:${name} -->)`)
  return re.test(text) ? text.replace(re, `$1\n${body}\n$2`) : text
}

export function renderSuccessorBlock(c: StewardshipConfig): string {
  const current = c.stewards.find((s) => s.address && s.address === c.currentSteward)
  const next = c.stewards.find((s) => s.address && s.address === c.designatedSuccessor)
  const fallback = c.stewards[1]
  if (!c.designatedSuccessor || !next) {
    return [
      `**Designated successor:** ${fallback?.name ?? 'the second steward'}, steward key ${PENDING}`,
      '',
      `**Current steward:** ${current ? `${current.name}, \`${current.address}\`` : PENDING}`,
    ].join('\n')
  }
  return [
    `**Designated successor:** ${next.name}, steward key \`${next.address}\``,
    '',
    `**Current steward:** ${current ? `${current.name}, \`${current.address}\`` : PENDING}`,
  ].join('\n')
}

export function renderIdentitiesBlock(c: StewardshipConfig): string {
  const a = (x: string | null) => (x ? `\`${x}\`` : PENDING)
  const rows = [
    '| Role | Who | Address (public) |',
    '|---|---|---|',
    `| Payer (storage custodian) | the shared Bee node's wallet | ${a(c.payer.nodeAddress)} |`,
    `| Council scribe (owns the registry feed) | held by the council secretary | ${a(c.council.scribe.address)} |`,
    ...c.stewards.map((s) => `| Steward key | ${s.name} (${s.library}) | ${a(s.address)} |`),
    ...c.libraries.map((l) => `| Library committee key | ${l.name} (${l.valley}) | ${a(l.address)} |`),
  ]
  return rows.join('\n')
}

export function renderAnchorBlock(c: StewardshipConfig): string {
  return [
    '```',
    `registry owner (council scribe) : ${c.council.scribe.address ?? '(after the live ceremony)'}`,
    `registry topic                  : ${c.topics.registry.string}`,
    `registry topic (hex)            : ${c.topics.registry.hex}`,
    `registry feed manifest          : ${c.registryManifest ?? '(after the live ceremony)'}`,
    `catalogue topic                 : ${c.topics.catalogue.string}  (${c.topics.catalogue.hex})`,
    `corrections topic               : ${c.topics.corrections.string}  (${c.topics.corrections.hex})`,
    '```',
  ].join('\n')
}

export function syncDocs(config: StewardshipConfig = loadConfig()): string[] {
  const touched: string[] = []
  for (const path of [PATHS.stewardship, PATHS.readme, PATHS.readWithoutUs]) {
    if (!existsSync(path)) continue
    const before = readFileSync(path, 'utf8')
    let after = block('successor', renderSuccessorBlock(config), before)
    after = block('identities', renderIdentitiesBlock(config), after)
    after = block('anchor', renderAnchorBlock(config), after)
    if (after !== before) {
      writeFileSync(path, after)
      touched.push(path)
    }
  }
  return touched
}
