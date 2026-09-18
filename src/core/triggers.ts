import type { Charter, TriggerId } from './schemas.js'

export interface TriggerInput {
  charter: Charter
  now: Date
  /** when the current steward last published the catalogue (from the network) */
  lastPublishedAt: string | null
  /** remaining storage time from the node, in days; null if unknown */
  ttlDays: number | null
  /** the steward has declared they are stepping down */
  declared?: boolean
  /** libraries whose written requests went unanswered for `unansweredDays` */
  unansweredLibraries?: number
  /** libraries asking for removal for cause */
  removalVotes?: number
}

export interface TriggerState {
  id: Exclude<TriggerId, 'T0-genesis'>
  label: string
  met: boolean
  detail: string
}

const DAY = 86_400_000

/**
 * The conditions in STEWARDSHIP.md §4 under which a hand-off may start.
 * These only *open the door*; the hand-off itself still needs the seals.
 */
export function evaluateTriggers(t: TriggerInput): TriggerState[] {
  const { charter, now } = t
  const silentDays = t.lastPublishedAt ? Math.floor((now.getTime() - Date.parse(t.lastPublishedAt)) / DAY) : null
  const silence = silentDays !== null && silentDays >= charter.triggers.silenceDays
  const unanswered = (t.unansweredLibraries ?? 0) >= 2
  return [
    {
      id: 'T1-declared',
      label: 'The steward says they are stepping down',
      met: Boolean(t.declared),
      detail: t.declared ? 'declared' : 'no declaration',
    },
    {
      id: 'T2-silence',
      label: `No catalogue update for ${charter.triggers.silenceDays} days and two libraries unanswered for ${charter.triggers.unansweredDays} days`,
      met: silence && unanswered,
      detail:
        silentDays === null
          ? 'the steward has never published'
          : `last update ${silentDays} day(s) ago; ${t.unansweredLibraries ?? 0} librar(ies) report no reply`,
    },
    {
      id: 'T3-storage',
      label: `Storage has less than ${charter.triggers.ttlFloorDays} days left and nobody topped it up`,
      met: t.ttlDays !== null && t.ttlDays < charter.triggers.ttlFloorDays,
      detail: t.ttlDays === null ? 'storage time unknown' : `${t.ttlDays.toFixed(1)} day(s) of storage left`,
    },
    {
      id: 'T4-removal',
      label: `Removal for cause, asked for by ${charter.undesignatedThreshold} of 7 libraries`,
      met: (t.removalVotes ?? 0) >= charter.undesignatedThreshold,
      detail: `${t.removalVotes ?? 0} librar(ies) ask for removal`,
    },
  ]
}
