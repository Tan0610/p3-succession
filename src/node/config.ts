import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { prettyJson } from '../core/canonical.js'
import { buildCharter, CATALOGUE_ID, LIBRARIES } from '../core/operations.js'
import { defaultAnchor, type Anchor } from '../core/resolve.js'
import { Address, LibraryId, Ref, SeedCatalogue, type Charter } from '../core/schemas.js'
import { sameAddress, shortHex, TOPICS, topicHex } from '../core/swarm.js'
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

const PENDING_KEY = '_(key not made yet: `npm run cli -- keys init` fills this in at the start of the live ceremony)_'
const PENDING_PAYER = '_(no batch yet: `npm run cli -- storage buy` or `storage use` fills this in)_'
const PENDING_REGISTRY = '(created by the first live hand-off)'

function block(name: string, body: string, text: string): string {
  const re = new RegExp(`(<!-- lsc:${name} -->)[\\s\\S]*?(<!-- /lsc:${name} -->)`)
  return re.test(text) ? text.replace(re, (_m, open: string, close: string) => `${open}\n${body}\n${close}`) : text
}

const TRIGGERS_IN_BRIEF =
  'T1 they step down; T2 no catalogue update for 60 days and two libraries unanswered for 30; T3 under 30 days of storage left; T4 five of the seven libraries ask for removal'

/**
 * The successor block of STEWARDSHIP.md: the named successor, their key, and the
 * conditions under which they take over, all in one place. Before the live
 * ceremony it says plainly that it is a plan; afterwards every name has an address.
 */
export function renderSuccessorBlock(c: StewardshipConfig): string {
  const find = (a: string | null) => (a ? c.stewards.find((s) => sameAddress(s.address, a)) : undefined)
  const current = find(c.currentSteward)
  const next = find(c.designatedSuccessor)
  const last = c.history.at(-1)
  const key = (a: string | null | undefined) => (a ? `\`${a}\`` : PENDING_KEY)

  if (!current || !next) {
    const [planFirst, planNext] = c.stewards
    return [
      '**Status: planned, not yet in force.** The live ceremony has not run yet, so nobody has signed anything.',
      '',
      `**First steward:** ${planFirst?.name ?? 'the first steward'}, key ${key(planFirst?.address)}`,
      '',
      `**Designated successor:** ${planNext?.name ?? 'the second steward'}, key ${key(planNext?.address)}. This becomes binding when ${planFirst?.name ?? 'the first steward'} signs the genesis statement that names them.`,
      '',
      `**When the successor takes over:** when any trigger in §4 is met (${TRIGGERS_IN_BRIEF}), with 4 of the 7 library seals.`,
    ].join('\n')
  }
  return [
    `**Current steward:** ${current.name}, key \`${current.address}\`${last ? ` (since epoch ${last.epoch}, ${last.at.slice(0, 10)}; register update #${last.registryFeedIndex}${last.record ? `; evidence in [${last.record}](${last.record})` : ''})` : ''}`,
    '',
    `**Designated successor:** ${next.name}, key \`${next.address}\`. ${current.name} named ${next.name} in the acceptance they signed with their own key when they took over.`,
    '',
    `**When ${next.name} takes over:** as soon as any trigger in §4 is met (${TRIGGERS_IN_BRIEF}). Handing over to ${next.name} needs 4 of the 7 library seals; handing over to anyone else needs 5 of 7. ${current.name}'s own key is not needed.`,
  ].join('\n')
}

export function renderIdentitiesBlock(c: StewardshipConfig): string {
  const a = (x: string | null, pending = PENDING_KEY) => (x ? `\`${x}\`` : pending)
  const rows = [
    '| Role | Who | Address (public) |',
    '|---|---|---|',
    `| Payer (storage custodian) | the shared Bee node's wallet | ${a(c.payer.nodeAddress, PENDING_PAYER)} |`,
    `| Council scribe (owns the registry feed) | held by the council secretary | ${a(c.council.scribe.address)} |`,
    ...c.stewards.map((s) => `| Steward key | ${s.name} (${s.library}) | ${a(s.address)} |`),
    ...c.libraries.map((l) => `| Library committee key | ${l.name} (${l.valley}) | ${a(l.address)} |`),
  ]
  return rows.join('\n')
}

export function renderAnchorBlock(c: StewardshipConfig): string {
  return [
    '```',
    `registry owner (council scribe) : ${c.council.scribe.address ?? '(made by keys init at the start of the live ceremony)'}`,
    `registry topic                  : ${c.topics.registry.string}`,
    `registry topic (hex)            : ${c.topics.registry.hex}`,
    `registry feed manifest          : ${c.registryManifest ?? PENDING_REGISTRY}`,
    `catalogue topic                 : ${c.topics.catalogue.string}  (${c.topics.catalogue.hex})`,
    `corrections topic               : ${c.topics.corrections.string}  (${c.topics.corrections.hex})`,
    '```',
  ].join('\n')
}

/** One line for the README: has a real hand-off happened yet, and where is the proof. */
export function renderStatusBlock(c: StewardshipConfig): string {
  const handoffs = c.history.filter((h) => h.epoch > 0)
  if (!handoffs.length) {
    return '**Status:** rehearsed, not yet performed live. `npm run ceremony -- --live --yes` performs it on a Bee node and writes the evidence into `handoffs/` and [HANDOFF_LOG.md](HANDOFF_LOG.md).'
  }
  const lines = handoffs.map((h) => {
    const prev = c.history.find((x) => x.epoch === h.epoch - 1)
    return `- Epoch ${h.epoch}, ${h.at.slice(0, 10)}: ${prev?.stewardName ?? 'previous steward'} → **${h.stewardName}** \`${h.steward}\`, register update #${h.registryFeedIndex}${h.record ? `, evidence [${h.record}](${h.record})` : ''}`
  })
  return ['**Status:** performed live on a Bee node, not only rehearsed.', '', ...lines].join('\n')
}

/** Every document with generated blocks. */
export const SYNCED_DOCS = [PATHS.stewardship, PATHS.readme, PATHS.readWithoutUs, PATHS.handoffLog] as const

/** Words that only appear in a generated block before the live ceremony has filled it in. */
export const PENDING_MARKERS = /not made yet|no batch yet|created by the first live hand-off|made by keys init|not yet in force|not yet performed|bought before the live ceremony/

/** Fills every generated block in one document's text. Pure, so tests can run it on the real files. */
export function renderDocs(text: string, config: StewardshipConfig): string {
  let out = block('successor', renderSuccessorBlock(config), text)
  out = block('identities', renderIdentitiesBlock(config), out)
  out = block('anchor', renderAnchorBlock(config), out)
  out = block('status', renderStatusBlock(config), out)
  return out
}

export function syncDocs(config: StewardshipConfig = loadConfig()): string[] {
  const touched: string[] = []
  for (const path of SYNCED_DOCS) {
    if (!existsSync(path)) continue
    const before = readFileSync(path, 'utf8')
    const after = renderDocs(before, config)
    if (after !== before) {
      writeFileSync(path, after)
      touched.push(path)
    }
  }
  return touched
}
