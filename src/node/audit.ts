import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LangEn } from 'ethers'
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
]

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
    const lower = text.toLowerCase()
    for (const k of keys) {
      const at = lower.indexOf(k)
      if (at >= 0) hits.push({ file, line: lower.slice(0, at).split('\n').length, kind: 'contains a local private key' })
    }
    text.split('\n').forEach((line, i) => {
      for (const p of PATTERNS) if (p.re.test(line)) hits.push({ file, line: i + 1, kind: p.kind })
    })
    for (const line of mnemonicRuns(text)) hits.push({ file, line, kind: 'looks like a 12+ word recovery phrase' })
  }
  return hits
}
