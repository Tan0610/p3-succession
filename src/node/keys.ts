import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Wallet } from 'ethers'
import type { Identity } from '../core/feedstore.js'
import { PATHS, repoPath, ROOT } from './paths.js'

/**
 * Where private keys live. In order of preference:
 *   1. an environment variable  LSC_KEY_<NAME>  (e.g. LSC_KEY_STEWARD_PADMA)
 *   2. an explicit --key-file path
 *   3. .secrets/keys/<name>.key   (git-ignored; checked before anything is written)
 * Keys are never printed, logged, or written into evidence. Only addresses are.
 */
export function keyEnvName(name: string): string {
  return `LSC_KEY_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
}

export function keyPath(name: string): string {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`bad key name "${name}"`)
  return join(PATHS.keys, `${name}.key`)
}

export function hasKey(name: string): boolean {
  return Boolean(process.env[keyEnvName(name)]) || existsSync(keyPath(name))
}

/** Refuses to write a key anywhere git would track it. */
export function assertIgnored(path: string): void {
  const rel = relative(ROOT, path).replace(/\\/g, '/')
  try {
    execFileSync('git', ['check-ignore', '-q', rel], { cwd: ROOT, stdio: 'ignore' })
  } catch {
    throw new Error(`Refusing to write a private key to ${rel}: git does not ignore it. Check .gitignore first.`)
  }
}

export function newKey(name: string): { name: string; address: string; path: string } {
  const path = keyPath(name)
  if (existsSync(path)) throw new Error(`${name} already has a key at ${repoPath(path)}; not overwriting it.`)
  mkdirSync(PATHS.keys, { recursive: true })
  assertIgnored(path)
  const hex = `0x${randomBytes(32).toString('hex')}`
  const wallet = new Wallet(hex)
  writeFileSync(path, `${hex}\n`, { mode: 0o600 })
  return { name, address: wallet.address, path: repoPath(path) }
}

export function loadIdentity(name: string, displayName: string, keyFile?: string): Identity {
  const fromEnv = process.env[keyEnvName(name)]
  let hex: string | undefined = fromEnv?.trim()
  if (!hex && keyFile) hex = readFileSync(keyFile, 'utf8').trim()
  if (!hex && existsSync(keyPath(name))) hex = readFileSync(keyPath(name), 'utf8').trim()
  if (!hex) {
    throw new Error(`No key for ${name}. Set ${keyEnvName(name)}, pass --key-file, or run: npm run cli -- keys new ${name}`)
  }
  const wallet = new Wallet(hex.startsWith('0x') ? hex : `0x${hex}`)
  return { name: displayName, address: wallet.address, wallet }
}

export function listKeyFiles(): string[] {
  if (!existsSync(PATHS.keys)) return []
  return readdirSync(PATHS.keys).filter((f) => f.endsWith('.key'))
}

/** Hex of every local key, for the secret audit only. Never returned anywhere else. */
export function localKeyMaterial(): string[] {
  const out = listKeyFiles().map((f) => readFileSync(join(PATHS.keys, f), 'utf8').trim())
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith('LSC_KEY_') && v) out.push(v.trim())
  return out.map((h) => h.replace(/^0x/, '').toLowerCase()).filter((h) => h.length === 64)
}
