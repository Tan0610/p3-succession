import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeAddress, LangEn } from 'ethers'
import { localKeyMaterial } from './keys.js'
import { ROOT } from './paths.js'

export interface AuditHit {
  file: string
  line: number
  kind: string
}

const BINARY = /\.(woff2?|ttf|otf|png|jpe?g|gif|ico|webp|pdf|zip)$/i

const PATTERNS: { kind: string; re: RegExp }[] = [
  {
    kind: 'labelled private key / secret',
    re: /(private[_\s-]?key|secret[_\s-]?key|signing[_\s-]?key|mnemonic|seed[_\s-]?phrase|gift[_\s-]?code)["'`\s]*[:=]\s*["'`]?(0x)?[0-9a-fA-F]{64}\b/i,
  },
  { kind: 'URL with embedded credentials', re: /\bhttps?:\/\/[^\s/:@"'`]+:[^\s/@"'`]+@[^\s"'`]+/i },
  { kind: 'URL with token in query string', re: /[?&](token|api[_-]?key|access[_-]?token|auth|key|secret)=[A-Za-z0-9._~-]{12,}/i },
  { kind: 'bearer token', re: /authorization["'\s:]*bearer\s+[A-Za-z0-9._~+/-]{16,}/i },
  { kind: 'PEM private key', re: /-----BEGIN (EC |RSA |OPENSSH )?PRIVATE KEY-----/ },
  {
    // any key-ish name (LSC_KEY_X=, pk:, privKey =, "key": …) holding 32 bytes of hex
    kind: '32-byte hex assigned to a key-like name',
    re: /\b[\w-]*(key|secret|priv|pk|mnemonic|seed|wallet)[\w-]*["'`]?\s*[:=]\s*["'`]?(0x)?[0-9a-fA-F]{64}\b/i,
  },
  { kind: 'ethers Wallet built from a literal key', re: /new\s+(Wallet|SigningKey|PrivateKey)\(\s*["'`](0x)?[0-9a-fA-F]{64}["'`]/ },
]

/**
 * Public addresses of the well-known development keys (Hardhat / Anvil accounts
 * #0 to #4, whose private keys are printed in every tutorial). A 32-byte hex in a
 * tracked file that derives to one of these is a copied test key.
 */
const WELL_KNOWN_DEV_ADDRESSES = new Set(
  [
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  ].map((a) => a.toLowerCase()),
)

/** Every address the project uses for a role: a tracked 32-byte hex that derives to one is that role's key. */
export function roleAddresses(): Set<string> {
  try {
    const c = JSON.parse(readFileSync(join(ROOT, 'stewardship.config.json'), 'utf8')) as {
      council?: { scribe?: { address?: string | null } }
      stewards?: { address?: string | null }[]
      libraries?: { address?: string | null }[]
    }
    const all = [c.council?.scribe?.address, ...(c.stewards ?? []).map((s) => s.address), ...(c.libraries ?? []).map((l) => l.address)]
    return new Set(all.filter((a): a is string => Boolean(a)).map((a) => a.toLowerCase()))
  } catch {
    return new Set()
  }
}

/** Does this 32-byte hex, read as a private key, belong to a role or a well-known dev account? */
function derivesToKnownAddress(hex: string, roles: Set<string>): 'role' | 'dev' | null {
  let address: string
  try {
    address = computeAddress(`0x${hex}`).toLowerCase()
  } catch {
    return null // not a valid secp256k1 scalar
  }
  if (roles.has(address)) return 'role'
  if (WELL_KNOWN_DEV_ADDRESSES.has(address)) return 'dev'
  return null
}

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\0').filter(Boolean)
}

/** 12+ consecutive BIP-39 English words looks like a recovery phrase. */
function mnemonicRuns(text: string): number[] {
  const wordlist = LangEn.wordlist()
  const hits: number[] = []
  text.split('\n').forEach((line, i) => {
    let run = 0
    for (const w of line.toLowerCase().split(/[^a-z]+/)) {
      if (!w) continue
      run = wordlist.getWordIndex(w) >= 0 ? run + 1 : 0
      if (run >= 12) {
        hits.push(i + 1)
        break
      }
    }
  })
  return hits
}

/**
 * Scans every file git tracks (or would track) for anything that looks like a
 * credential, and for the exact bytes of every local private key. Reports
 * file:line and the kind of problem, never the secret itself.
 */
export function auditSecrets(): AuditHit[] {
  const hits: AuditHit[] = []
  const keys = localKeyMaterial()
  const roles = roleAddresses()
  for (const file of trackedFiles()) {
    const norm = file.replace(/\\/g, '/')
    if (norm.startsWith('.secrets/') || norm.endsWith('.key') || /(^|\/)\.env($|\.)/.test(norm) && !norm.endsWith('.env.example')) {
      hits.push({ file, line: 0, kind: 'secret file is tracked by git' })
      continue
    }
    if (BINARY.test(file)) continue
    let text: string
    try {
      text = readFileSync(join(ROOT, file), 'utf8')
    } catch {
      continue
    }
    hits.push(...scanText(file, text, keys, roles))
  }
  return hits
}

/** The checks for one file's text. Exported so tests can feed it keys made at runtime. */
export function scanText(file: string, text: string, keys: string[], roles: Set<string>): AuditHit[] {
  const hits: AuditHit[] = []
  const lower = text.toLowerCase()
  for (const k of keys) {
    const at = lower.indexOf(k)
    if (at >= 0) hits.push({ file, line: lower.slice(0, at).split('\n').length, kind: 'contains a local private key' })
  }
  text.split('\n').forEach((line, i) => {
    for (const p of PATTERNS) if (p.re.test(line)) hits.push({ file, line: i + 1, kind: p.kind })
    for (const m of line.matchAll(/\b(?:0x)?([0-9a-fA-F]{64})\b/g)) {
      const known = derivesToKnownAddress(m[1]!, roles)
      if (known === 'role') hits.push({ file, line: i + 1, kind: 'the private key of a role address in stewardship.config.json' })
      if (known === 'dev') hits.push({ file, line: i + 1, kind: 'a well-known development private key (Hardhat/Anvil)' })
    }
  })
  for (const line of mnemonicRuns(text)) hits.push({ file, line, kind: 'looks like a 12+ word recovery phrase' })
  return hits
}
