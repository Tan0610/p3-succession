import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const PATHS = {
  root: ROOT,
  config: join(ROOT, 'stewardship.config.json'),
  seed: join(ROOT, 'seed', 'catalogue.seed.json'),
  // never tracked (see .gitignore): private keys
  secrets: join(ROOT, '.secrets'),
  keys: join(ROOT, '.secrets', 'keys'),
  // tracked evidence
  handoffs: join(ROOT, 'handoffs'),
  proposals: join(ROOT, 'handoffs', 'proposals'),
  rehearsals: join(ROOT, 'handoffs', 'rehearsals'),
  ledger: join(ROOT, 'ledger', 'storage.json'),
  handoffLog: join(ROOT, 'HANDOFF_LOG.md'),
  storageLog: join(ROOT, 'STORAGE_LOG.md'),
  stewardship: join(ROOT, 'STEWARDSHIP.md'),
  readme: join(ROOT, 'README.md'),
  readWithoutUs: join(ROOT, 'docs', 'READ_WITHOUT_US.md'),
} as const
