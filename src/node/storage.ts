import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { BZZ, Duration, Size, type Bee } from '@ethersphere/bee-js'
import { PATHS } from './paths.js'

/**
 * Storage is a subscription: a postage batch is prepaid rent that runs out.
 * Here is what each on-chain mechanism can actually do (see docs/MECHANISMS.md):
 *   buy      - the node wallet creates a batch it owns.
 *   topUp    - adds rent to an existing batch. On-chain this is permissionless:
 *              any wallet with xBZZ may call PostageStamp.topUp for any live batch.
 *   extend   - bee-js helper that tops up by the amount for N more days.
 *   dilute   - owner only. Stamping uploads - owner only (it's the node's key).
 */
export interface StorageStatus {
  payer: string
  batchId: string
  label: string
  usable: boolean
  depth: number
  amount: string
  ttlSeconds: number
  ttlDays: number
  expiresAt: string
  usage: number
  usageText: string
}

export async function payerAddress(bee: Bee): Promise<string> {
  const addresses = await bee.connectivity.getNodeAddresses()
  return addresses.ethereum.toChecksum()
}

export async function storageStatus(bee: Bee, batchId: string): Promise<StorageStatus> {
  const [batch, payer] = await Promise.all([bee.stamp.get(batchId), payerAddress(bee)])
  const ttlSeconds = batch.duration.toSeconds()
  return {
    payer,
    batchId: batch.batchID.toHex(),
    label: batch.label,
    usable: batch.usable,
    depth: batch.depth,
    amount: String(batch.amount),
    ttlSeconds,
    ttlDays: Math.round((ttlSeconds / 86_400) * 10) / 10,
    expiresAt: batch.duration.toEndDate().toISOString(),
    usage: batch.usage,
    usageText: batch.usageText,
  }
}

export async function listBatches(bee: Bee) {
  const all = await bee.stamp.getAll()
  return all.map((b) => ({
    batchId: b.batchID.toHex(),
    label: b.label,
    usable: b.usable,
    depth: b.depth,
    ttlDays: Math.round((b.duration.toSeconds() / 86_400) * 10) / 10,
    usage: b.usageText,
  }))
}

export async function quoteBuy(bee: Bee, megabytes: number, days: number): Promise<string> {
  const cost = await bee.storage.getCost(Size.fromMegabytes(megabytes), Duration.fromDays(days))
  return cost.toDecimalString()
}

export async function quoteExtend(bee: Bee, batchId: string, days: number): Promise<string> {
  const cost = await bee.storage.getDurationExtensionCost(batchId, Duration.fromDays(days))
  return cost.toDecimalString()
}

export async function buyBatch(bee: Bee, megabytes: number, days: number, label: string): Promise<string> {
  const id = await bee.storage.buy(Size.fromMegabytes(megabytes), Duration.fromDays(days), { label })
  return id.toHex()
}

/** Extends an EXISTING batch by N days (a top-up under the hood). */
export async function extendBatch(bee: Bee, batchId: string, days: number) {
  const before = await storageStatus(bee, batchId)
  const cost = await quoteExtend(bee, batchId, days)
  await bee.storage.extendDuration(batchId, Duration.fromDays(days))
  const after = await waitForTtlChange(bee, batchId, before.ttlSeconds)
  return { before, after, cost }
}

/** Tops up an EXISTING batch with a per-chunk amount, or with an xBZZ budget. */
export async function topUpBatch(bee: Bee, batchId: string, opts: { amountPerChunk?: string; bzz?: string }) {
  const before = await storageStatus(bee, batchId)
  let amount = opts.amountPerChunk
  if (!amount && opts.bzz) {
    const calc = await bee.stamp.calculateTopUpForBZZ(before.depth, BZZ.fromDecimalString(opts.bzz))
    amount = String(calc.amount)
  }
  if (!amount) throw new Error('Give --amount <PLUR per chunk> or --bzz <xBZZ budget>.')
  await bee.stamp.topUp(batchId, amount)
  const after = await waitForTtlChange(bee, batchId, before.ttlSeconds)
  return { before, after, amountPerChunk: amount }
}

async function waitForTtlChange(bee: Bee, batchId: string, beforeSeconds: number, timeoutMs = 120_000): Promise<StorageStatus> {
  const started = Date.now()
  let last = await storageStatus(bee, batchId)
  while (last.ttlSeconds <= beforeSeconds + 60 && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5_000))
    last = await storageStatus(bee, batchId)
  }
  return last
}

// ── ledger: every purchase / extension / top-up is written down ────────────

export interface LedgerEntry {
  at: string
  action: 'buy' | 'extend' | 'topup'
  batchId: string
  payer: string
  detail: string
  costBzz: string | null
  ttlDaysBefore: number | null
  ttlDaysAfter: number | null
  expiresAfter: string | null
}

export function readLedger(): LedgerEntry[] {
  return existsSync(PATHS.ledger) ? (JSON.parse(readFileSync(PATHS.ledger, 'utf8')) as LedgerEntry[]) : []
}

export function recordLedger(entry: LedgerEntry): void {
  mkdirSync(dirname(PATHS.ledger), { recursive: true })
  writeFileSync(PATHS.ledger, JSON.stringify([...readLedger(), entry], null, 2) + '\n')
  const line =
    `| ${entry.at.slice(0, 16).replace('T', ' ')} | ${entry.action} | \`${entry.batchId.slice(0, 12)}…\` | \`${entry.payer}\` | ${entry.detail} | ` +
    `${entry.costBzz ?? '—'} | ${entry.ttlDaysBefore ?? '—'} → ${entry.ttlDaysAfter ?? '—'} |\n`
  appendFileSync(PATHS.storageLog, line)
}
