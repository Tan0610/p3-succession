import { z } from 'zod'

// ── primitives ──────────────────────────────────────────────────────────────
export const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 0x-prefixed 20-byte address')
export const Ref = z.string().regex(/^[0-9a-f]{64}$/, 'expected a 64-hex Swarm reference')
export const Hex32 = z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/)
export const Sig = z.string().regex(/^0x[0-9a-fA-F]{130}$/, 'expected a 65-byte 0x-prefixed signature')
export const IsoDate = z.string().min(10)

export const LIBRARY_IDS = ['hemis', 'thiksey', 'alchi', 'lamayuru', 'diskit', 'kye', 'tabo'] as const
export const LibraryId = z.enum(LIBRARY_IDS)
export type LibraryId = z.infer<typeof LibraryId>

// ── the charter the seven committees agree to ───────────────────────────────
export const Member = z.object({
  id: LibraryId,
  name: z.string(),
  valley: z.enum(['Ladakh', 'Spiti']),
  address: Address,
})
export type Member = z.infer<typeof Member>

export const Charter = z.object({
  schema: z.literal('lsc/charter@1'),
  catalogueId: z.string(),
  /** seals needed to hand over to the successor the previous steward named */
  threshold: z.number().int().min(1).max(7),
  /** seals needed to hand over to anyone else (removal / no successor named) */
  undesignatedThreshold: z.number().int().min(1).max(7),
  members: z.array(Member).length(7),
  triggers: z.object({
    silenceDays: z.number().int(),
    unansweredDays: z.number().int(),
    ttlFloorDays: z.number().int(),
  }),
})
export type Charter = z.infer<typeof Charter>

// ── signatures ──────────────────────────────────────────────────────────────
export const Approval = z.object({ library: LibraryId, address: Address, signature: Sig })
export type Approval = z.infer<typeof Approval>

export const Signed = z.object({ address: Address, signature: Sig })
export type Signed = z.infer<typeof Signed>

export const TriggerId = z.enum(['T0-genesis', 'T1-declared', 'T2-silence', 'T3-storage', 'T4-removal'])
export type TriggerId = z.infer<typeof TriggerId>

export const Person = z.object({ address: Address, name: z.string() })
export type Person = z.infer<typeof Person>

export const EntryPointer = z.object({ feedIndex: z.number().int().min(0), reference: Ref })
export type EntryPointer = z.infer<typeof EntryPointer>

// ── what everyone signs for a hand-off ──────────────────────────────────────
export const StatementFields = z.object({
  catalogueId: z.string(),
  charterHash: z.string(),
  epoch: z.number().int().min(0),
  previous: EntryPointer.nullable(),
  outgoing: Person.nullable(),
  incoming: Person.extend({ library: LibraryId.nullable() }),
  next: Person.nullable(),
  trigger: TriggerId,
  effectiveFrom: z.string(),
})
export type StatementFields = z.infer<typeof StatementFields>

// ── registry entry: the stable pointer readers start from ───────────────────
export const RegistryEntry = z.object({
  schema: z.literal('lsc/registry-entry@1'),
  catalogueId: z.string(),
  epoch: z.number().int().min(0),
  kind: z.enum(['genesis', 'handoff']),
  fields: StatementFields,
  statement: z.string(),
  steward: Person.extend({ library: LibraryId.nullable() }),
  catalogueTopic: z.string(),
  catalogueTopicHex: Ref,
  catalogueManifest: Ref.nullable(),
  designatedSuccessor: Person.nullable(),
  charter: Charter,
  charterHash: z.string(),
  approvals: z.array(Approval),
  acceptance: Signed,
  previousEntry: EntryPointer.nullable(),
  issuedAt: IsoDate,
  scribe: Address,
})
export type RegistryEntry = z.infer<typeof RegistryEntry>

// ── the catalogue itself ────────────────────────────────────────────────────
export const Condition = z.enum(['good', 'fragile', 'damaged', 'missing'])
export type Condition = z.infer<typeof Condition>

export const CatalogueRecord = z.object({
  id: z.string().regex(/^[A-Z]+-\d{4}$/),
  library: LibraryId,
  title: z.string(),
  collection: z.string(),
  form: z.enum(['pecha', 'bound', 'scroll']),
  folios: z.object({ total: z.number().int().min(0), present: z.number().int().min(0) }),
  condition: Condition,
  photographed: z.boolean(),
  notes: z.string(),
  updatedAt: IsoDate,
  updatedBy: z.string(),
})
export type CatalogueRecord = z.infer<typeof CatalogueRecord>

export const CorrectionChanges = z
  .object({
    condition: Condition.optional(),
    photographed: z.boolean().optional(),
    foliosPresent: z.number().int().min(0).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined), 'a correction must change something')
export type CorrectionChanges = z.infer<typeof CorrectionChanges>

export const AppliedCorrection = z.object({
  library: LibraryId,
  feedIndex: z.number().int(),
  reference: Ref,
  recordId: z.string(),
  status: z.enum(['applied', 'proposed']),
  signature: Sig,
})
export type AppliedCorrection = z.infer<typeof AppliedCorrection>

export const Catalogue = z.object({
  schema: z.literal('lsc/catalogue@1'),
  catalogueId: z.string(),
  version: z.number().int().min(1),
  epoch: z.number().int().min(0),
  publishedAt: IsoDate,
  publishedBy: Person,
  registryEntryRef: Ref.nullable(),
  previousVersion: z.object({ steward: Address, feedIndex: z.number().int(), reference: Ref }).nullable(),
  notice: z.string(),
  libraries: z.array(z.object({ id: LibraryId, name: z.string(), valley: z.enum(['Ladakh', 'Spiti']) })),
  records: z.array(CatalogueRecord),
  correctionCursor: z.record(LibraryId, z.number().int()),
  appliedCorrections: z.array(AppliedCorrection),
  changelog: z.array(z.object({ version: z.number().int(), at: IsoDate, by: z.string(), summary: z.string() })),
})
export type Catalogue = z.infer<typeof Catalogue>

export const SeedCatalogue = z.object({
  schema: z.literal('lsc/catalogue-seed@1'),
  catalogueId: z.string(),
  notice: z.string(),
  libraries: Catalogue.shape.libraries,
  records: z.array(CatalogueRecord),
})
export type SeedCatalogue = z.infer<typeof SeedCatalogue>

// ── a library's signed correction ───────────────────────────────────────────
export const Correction = z.object({
  schema: z.literal('lsc/correction@1'),
  catalogueId: z.string(),
  library: LibraryId,
  author: Address,
  seq: z.number().int().min(0),
  recordId: z.string(),
  changes: CorrectionChanges,
  observedAt: IsoDate,
  statement: z.string(),
  signature: Sig,
})
export type Correction = z.infer<typeof Correction>

// ── a hand-off being prepared (public: holds signatures, never keys) ────────
export const RejectedAttempt = z.object({ at: IsoDate, attempt: z.string(), result: z.string() })
export type RejectedAttempt = z.infer<typeof RejectedAttempt>

export const HandoffProposal = z.object({
  schema: z.literal('lsc/handoff-proposal@1'),
  catalogueId: z.string(),
  fields: StatementFields,
  statement: z.string(),
  approvals: z.array(Approval),
  acceptance: Signed.nullable(),
  rejectedAttempts: z.array(RejectedAttempt),
  createdAt: IsoDate,
})
export type HandoffProposal = z.infer<typeof HandoffProposal>
