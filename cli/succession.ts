#!/usr/bin/env node
import { Command, Option } from 'commander'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditSecrets } from '../src/node/audit.js'
import {
  accept,
  cataloguePublish,
  checkTrigger,
  correctionSubmit,
  ctx,
  handoff,
  keysInit,
  keysList,
  propose,
  proposalFor,
  read,
  signExternal,
  signWithKey,
  storageBuy,
  storageCost,
  storageExtend,
  storageStatusCmd,
  storageTopup,
  storageUse,
} from '../src/node/commands.js'
import { loadConfig, syncDocs } from '../src/node/config.js'
import { newKey } from '../src/node/keys.js'
import { repoPath, ROOT } from '../src/node/paths.js'

const program = new Command()
  .name('succession')
  .description('Ladakh–Spiti shared catalogue: storage, publishing, corrections and steward succession on Swarm.')
  .option('--bee <url>', 'Bee API url (default: BEE_URL or stewardship.config.json)')

const bee = () => program.opts<{ bee?: string }>().bee
const proposalArg = (p: string | undefined, epoch: string | undefined) =>
  p ? resolve(p) : epoch !== undefined ? proposalFor(Number(epoch)) : (() => { throw new Error('give --proposal <file> or --epoch <n>') })()

// ── keys ────────────────────────────────────────────────────────────────────
const keys = program.command('keys').description('create and list signing keys (private keys stay in git-ignored .secrets/)')
keys.command('init').description('create every missing key and record the public addresses').action(() => void keysInit())
keys.command('new <name>').description('create one key, e.g. steward-yangchen').action((name: string) => {
  const k = newKey(name)
  console.log(`${k.name}: ${k.address} (private key in ${k.path}, git-ignored)`)
})
keys.command('list').description('public addresses of every role').action(() => keysList())

// ── storage: the payer ──────────────────────────────────────────────────────
const storage = program.command('storage').description('the payer: postage batch status, purchase, extension and top-up')
storage.command('status').action(async () => void (await storageStatusCmd(ctx(bee()))))
storage
  .command('buy')
  .requiredOption('--mb <n>', 'size in megabytes', Number)
  .requiredOption('--days <n>', 'duration in days', Number)
  .option('--label <label>')
  .option('--yes', 'actually spend xBZZ')
  .action(async (o) => void (await storageBuy(ctx(bee()), o)))
storage.command('use <batchId>').description('adopt an existing batch').action(async (id: string) => storageUse(ctx(bee()), id))
storage
  .command('cost')
  .requiredOption('--days <n>', 'days', Number)
  .option('--mb <n>', 'also quote a new batch of this size', Number)
  .action(async (o) => storageCost(ctx(bee()), o))
storage
  .command('extend')
  .description('extend the EXISTING batch by N days (a top-up)')
  .requiredOption('--days <n>', 'days to add', Number)
  .option('--yes', 'actually spend xBZZ')
  .action(async (o) => void (await storageExtend(ctx(bee()), o)))
storage
  .command('topup')
  .description('top up the EXISTING batch by an amount per chunk or an xBZZ budget')
  .addOption(new Option('--amount <plur>', 'PLUR per chunk').conflicts('bzz'))
  .option('--bzz <xbzz>', 'xBZZ to spend')
  .option('--yes', 'actually spend xBZZ')
  .action(async (o) => void (await storageTopup(ctx(bee()), o)))

// ── catalogue: the steward ──────────────────────────────────────────────────
const catalogue = program.command('catalogue').description('the steward publishes the catalogue on their own feed')
catalogue
  .command('publish')
  .requiredOption('--as <steward>', 'steward key name, e.g. steward-padma')
  .option('--summary <text>')
  .action(async (o) => void (await cataloguePublish(ctx(bee()), o)))
catalogue.command('show').action(async () => void (await read({ bee: bee() })))

// ── corrections: any library ────────────────────────────────────────────────
program
  .command('correction')
  .description('a library posts a signed correction to its own feed')
  .command('submit')
  .requiredOption('--as <library>', 'library id, e.g. tabo')
  .requiredOption('--record <id>', 'record id, e.g. TABO-0003')
  .option('--set <key=value...>', 'condition=damaged | photographed=true | folios=180', [])
  .option('--note <text>')
  .action(async (o) => void (await correctionSubmit(ctx(bee()), o)))

// ── reading: anyone, no keys ───────────────────────────────────────────────
program
  .command('read')
  .description('resolve registry → current steward → catalogue, with no keys at all')
  .option('--registry-owner <address>', 'council scribe address (default: from stewardship.config.json)')
  .option('--json')
  .action(async (o) => void (await read({ bee: bee(), ...o })))

program
  .command('registry')
  .description('show the registry and its stable address')
  .action(async () => {
    const c = loadConfig()
    console.log(`registry owner ${c.council.scribe.address}\ntopic ${c.topics.registry.string} (${c.topics.registry.hex})\nmanifest ${c.registryManifest ?? '(created at genesis)'}`)
    await read({ bee: bee() })
  })

// ── succession ──────────────────────────────────────────────────────────────
const succession = program.command('succession').description('propose, seal, accept and perform a steward hand-off')
succession
  .command('propose')
  .description('draft a hand-off statement for everyone to sign')
  .requiredOption('--incoming <address>', 'the incoming steward address', process.env.LSC_INCOMING)
  .option('--incoming-name <name>')
  .option('--next <address>', 'the successor the incoming steward names in turn')
  .option('--next-name <name>')
  .requiredOption('--trigger <id>', 'T0-genesis | T1-declared | T2-silence | T3-storage | T4-removal')
  .option('--effective <date>')
  .action(async (o) => void (await propose(ctx(bee()), o)))
succession
  .command('sign')
  .description('a library seals the proposal (with its local key, or paste a signature made in any wallet)')
  .option('--proposal <file>')
  .option('--epoch <n>')
  .option('--as <library>', 'use this library key from .secrets')
  .option('--library <id>', 'with --signature: which library signed')
  .option('--signature <0x…>', 'EIP-191 signature over the .statement.txt text')
  .action(async (o) => {
    const proposal = proposalArg(o.proposal, o.epoch)
    if (o.signature) signExternal({ proposal, library: o.library, signature: o.signature })
    else await signWithKey({ proposal, as: o.as })
  })
succession
  .command('accept')
  .description('the incoming steward accepts (proves they hold the key)')
  .option('--proposal <file>')
  .option('--epoch <n>')
  .option('--as <steward>')
  .option('--signature <0x…>')
  .action(async (o) => void (await accept({ proposal: proposalArg(o.proposal, o.epoch), as: o.as, signature: o.signature })))
succession
  .command('handoff')
  .description('verify seals + acceptance, then the council scribe writes the registry update')
  .option('--proposal <file>')
  .option('--epoch <n>')
  .requiredOption('--incoming <address>', 'incoming steward address; must match the signed statement', process.env.LSC_INCOMING)
  .option('--attempt <label>', 'label recorded if refused')
  .option('--dry-run')
  .action(async (o) => {
    await handoff(ctx(bee()), { proposal: proposalArg(o.proposal, o.epoch), incoming: o.incoming, dryRun: o.dryRun, attempt: o.attempt })
  })
succession
  .command('check-trigger')
  .description('evaluate the succession triggers from STEWARDSHIP.md against the network')
  .option('--unanswered <n>', 'libraries with no reply for 30 days', Number)
  .option('--declared', 'the steward has declared they are stepping down')
  .option('--removal-votes <n>', 'libraries asking for removal', Number)
  .action(async (o) => void (await checkTrigger(ctx(bee()), o)))

// ── housekeeping ────────────────────────────────────────────────────────────
program
  .command('config')
  .command('sync')
  .description('refresh the generated blocks in README, STEWARDSHIP, HANDOFF_LOG and docs/READ_WITHOUT_US from stewardship.config.json')
  .action(() => console.log(syncDocs().map(repoPath).join('\n') || 'already in sync'))

program
  .command('audit')
  .command('secrets')
  .description('fail if any private key, mnemonic, gift code or credential URL is in a tracked file')
  .action(() => {
    const hits = auditSecrets()
    if (hits.length === 0) {
      console.log('audit secrets: clean. No keys, mnemonics, gift codes or credential URLs in tracked files.')
      return
    }
    for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.kind}`)
    console.error(`audit secrets: ${hits.length} problem(s).`)
    process.exitCode = 1
  })

program.command('version').action(() => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  console.log(`bee-js ${pkg.dependencies['@ethersphere/bee-js']}, ethers ${pkg.dependencies.ethers}`)
})

program.parseAsync().catch((e: Error) => {
  console.error(`\n${e.message}`)
  process.exitCode = 1
})
