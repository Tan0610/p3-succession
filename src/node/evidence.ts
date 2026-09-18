import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { prettyJson } from '../core/canonical.js'
import type { HandoffOutcome } from '../core/operations.js'
import { HandoffProposal, type RejectedAttempt } from '../core/schemas.js'
import { recoverSigner } from '../core/signatures.js'
import type { RoleAddress } from './identities.js'
import { PATHS, ROOT } from './paths.js'

export const SOLO_NOTE =
  'Honest note: this hand-off was performed by a single person. All signing keys (seven library committees, three stewards, the council scribe) were generated on one machine for the demonstration and live in its git-ignored .secrets/ folder. In real use each library committee and each steward generates their own key on their own device and shares only the address. The storage is also not separated: every postage batch belongs to the one shared Bee node.'

export interface HandoffRecord {
  schema: 'lsc/handoff-record@1'
  mode: 'live'
  performedAt: string
  honesty: string
  notes: string[]
  bee: { url: string; version: string | null; apiVersion: string | null }
  payer: { nodeAddress: string; batchId: string; ttlDaysAtHandoff: number | null }
  council: { scribe: string; registryTopic: string; registryTopicHex: string; registryManifest: string | null }
  epoch: number
  kind: 'genesis' | 'handoff'
  trigger: string
  statement: string
  outgoing: { address: string; name: string; lastCatalogueFeedIndex: number | null } | null
  incoming: { address: string; name: string; acceptanceSignature: string; suppliedAs: string }
  nextDesignated: { address: string; name: string } | null
  approvals: { library: string; address: string; signature: string; recovered: string | null; valid: boolean }[]
  threshold: string
  registryUpdate: {
    feedIndex: number
    entryReference: string
    socAddress: string
    socOwner: string | null
    socSignature: string | null
    readBack: HandoffOutcome['readBack']
    readersNowFollow: string | null
  }
  catalogueManifestForIncoming: string
  identitiesSeparated: RoleAddress[]
  rejectedAttempts: RejectedAttempt[]
  successorFirstPublication: { feedIndex: number; catalogueReference: string; version: number; applied: number; proposed: number; at: string } | null
  verify: { cli: string; curl: string[] }
}

export function proposalPath(epoch: number): string {
  return join(PATHS.proposals, `epoch-${epoch}.json`)
}

export function saveProposal(p: HandoffProposal, path = proposalPath(p.fields.epoch)): string {
  mkdirSync(PATHS.proposals, { recursive: true })
  writeFileSync(path, prettyJson(HandoffProposal.parse(p)))
  writeFileSync(path.replace(/\.json$/, '.statement.txt'), p.statement + '\n')
  return relative(ROOT, path)
}

export function loadProposal(path: string): HandoffProposal {
  return HandoffProposal.parse(JSON.parse(readFileSync(path, 'utf8')))
}

export function recordFor(
  outcome: HandoffOutcome,
  ctx: {
    proposal: HandoffProposal
    beeUrl: string
    beeVersion: string | null
    apiVersion: string | null
    payer: string
    batchId: string
    ttlDays: number | null
    registryManifest: string | null
    registryTopicHex: string
    roles: RoleAddress[]
    outgoingLastIndex: number | null
    incomingSuppliedAs: string
    notes?: string[]
    now: Date
  },
): HandoffRecord {
  const { proposal } = ctx
  const f = proposal.fields
  return {
    schema: 'lsc/handoff-record@1',
    mode: 'live',
    performedAt: ctx.now.toISOString(),
    honesty: SOLO_NOTE,
    notes: ctx.notes ?? [],
    bee: { url: ctx.beeUrl, version: ctx.beeVersion, apiVersion: ctx.apiVersion },
    payer: { nodeAddress: ctx.payer, batchId: ctx.batchId, ttlDaysAtHandoff: ctx.ttlDays },
    council: {
      scribe: outcome.entry.scribe,
      registryTopic: 'lsc/registry/v1',
      registryTopicHex: ctx.registryTopicHex,
      registryManifest: ctx.registryManifest,
    },
    epoch: f.epoch,
    kind: outcome.entry.kind,
    trigger: f.trigger,
    statement: proposal.statement,
    outgoing: f.outgoing ? { ...f.outgoing, lastCatalogueFeedIndex: ctx.outgoingLastIndex } : null,
    incoming: {
      address: f.incoming.address,
      name: f.incoming.name,
      acceptanceSignature: proposal.acceptance?.signature ?? '',
      suppliedAs: ctx.incomingSuppliedAs,
    },
    nextDesignated: f.next,
    approvals: proposal.approvals.map((a) => {
      const recovered = recoverSigner(proposal.statement, a.signature)
      return { ...a, recovered, valid: outcome.quorum.counted.some((c) => c.library === a.library) }
    }),
    threshold: `${outcome.quorum.counted.length} valid of ${outcome.quorum.threshold} required (charter has 7 members)`,
    registryUpdate: {
      feedIndex: outcome.feedIndex,
      entryReference: outcome.entryReference,
      socAddress: outcome.socAddress,
      socOwner: outcome.proof?.owner ?? null,
      socSignature: outcome.proof?.signature ?? null,
      readBack: outcome.readBack,
      readersNowFollow: outcome.readerNowFollows,
    },
    catalogueManifestForIncoming: outcome.catalogueManifest,
    identitiesSeparated: ctx.roles,
    rejectedAttempts: proposal.rejectedAttempts,
    successorFirstPublication: null,
    verify: {
      cli: '',
      curl: [
        ctx.registryManifest ? `curl ${ctx.beeUrl}/bzz/${ctx.registryManifest}/` : `(registry manifest not created)`,
        `curl ${ctx.beeUrl}/bzz/${outcome.entryReference}/`,
        `curl ${ctx.beeUrl}/bzz/${outcome.catalogueManifest}/catalogue.json`,
      ],
    },
  }
}

export function writeHandoffRecord(record: HandoffRecord): string {
  mkdirSync(PATHS.handoffs, { recursive: true })
  const name = `${record.performedAt.slice(0, 10)}-epoch-${record.epoch}.json`
  const path = join(PATHS.handoffs, name)
  record.verify.cli = `npm run verify:handoff -- handoffs/${name}`
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n')
  appendHandoffLog(record, name)
  return relative(ROOT, path)
}

export function listHandoffRecords(): { path: string; record: HandoffRecord }[] {
  if (!existsSync(PATHS.handoffs)) return []
  return readdirSync(PATHS.handoffs)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-epoch-\d+\.json$/.test(f))
    .sort()
    .map((f) => ({ path: join(PATHS.handoffs, f), record: JSON.parse(readFileSync(join(PATHS.handoffs, f), 'utf8')) as HandoffRecord }))
}

/** Called after a new steward's first publication, to close the loop in the evidence. */
export function noteSuccessorPublication(stewardAddress: string, pub: NonNullable<HandoffRecord['successorFirstPublication']>): string | null {
  const match = listHandoffRecords()
    .reverse()
    .find(({ record }) => record.incoming.address.toLowerCase() === stewardAddress.toLowerCase() && !record.successorFirstPublication)
  if (!match) return null
  match.record.successorFirstPublication = pub
  writeFileSync(match.path, JSON.stringify(match.record, null, 2) + '\n')
  appendFileSync(
    PATHS.handoffLog,
    `\n> Epoch ${match.record.epoch} follow-up, ${pub.at}: ${match.record.incoming.name} published catalogue v${pub.version} ` +
      `on their own feed (update #${pub.feedIndex}, \`${pub.catalogueReference}\`), applying ${pub.applied} library correction(s) and keeping ${pub.proposed} as proposals.\n`,
  )
  return relative(ROOT, match.path)
}

function appendHandoffLog(r: HandoffRecord, file: string): void {
  const seals = r.approvals.map((a) => `| ${a.library} | \`${a.address}\` | ${a.valid ? 'counted' : 'rejected'} | \`${a.signature.slice(0, 18)}…\` |`)
  const lines = [
    '',
    `## Epoch ${r.epoch}: ${r.outgoing ? `${r.outgoing.name} → ${r.incoming.name}` : `genesis, ${r.incoming.name} named first steward`}`,
    '',
    `- **When:** ${r.performedAt}`,
    `- **Trigger:** ${r.trigger}`,
    `- **Outgoing steward key:** ${r.outgoing ? `\`${r.outgoing.address}\` (${r.outgoing.name})` : 'none (genesis)'}`,
    `- **Incoming steward key:** \`${r.incoming.address}\` (${r.incoming.name}), passed to the hand-off command as \`${r.incoming.suppliedAs}\``,
    `- **Next designated successor:** ${r.nextDesignated ? `\`${r.nextDesignated.address}\` (${r.nextDesignated.name})` : 'none named'}`,
    `- **Seals:** ${r.threshold}`,
    `- **Registry update:** feed index **#${r.registryUpdate.feedIndex}**, entry \`${r.registryUpdate.entryReference}\``,
    `- **Signed chunk (SOC):** \`${r.registryUpdate.socAddress}\`, owner \`${r.registryUpdate.socOwner ?? 'n/a'}\` (the council scribe, not the steward)`,
    `- **Read back from the node:** ${r.registryUpdate.readBack.match ? 'matches' : 'MISMATCH'}; readers now follow \`${r.registryUpdate.readersNowFollow}\``,
    `- **Paid for by:** node wallet \`${r.payer.nodeAddress}\`, batch \`${r.payer.batchId}\` (${r.payer.ttlDaysAtHandoff ?? '?'} days of storage left at the time)`,
    `- **Evidence file:** [handoffs/${file}](handoffs/${file}) · re-check with \`${r.verify.cli}\``,
    '',
    '| Library | Committee key | Seal | Signature |',
    '|---|---|---|---|',
    ...seals,
    '',
    ...r.notes.map((n) => `> ${n}`),
    '',
    r.rejectedAttempts.length ? '**Refused before this succeeded:**' : '',
    ...r.rejectedAttempts.map((a) => `- ${a.attempt}: ${a.result}`),
    '',
    `<details><summary>Exact statement everyone signed</summary>\n\n\`\`\`\n${r.statement}\n\`\`\`\n</details>`,
    '',
  ]
  appendFileSync(PATHS.handoffLog, lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n') + '\n')
}

export function rehearsalPath(now: Date): string {
  mkdirSync(PATHS.rehearsals, { recursive: true })
  return join(PATHS.rehearsals, `rehearsal-${now.toISOString().replace(/[:.]/g, '-')}.json`)
}
