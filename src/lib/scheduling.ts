import { Temporal } from '@js-temporal/polyfill';
import type {
  SchedulingConfig,
  VoteProposal,
  VoteResponseEntity,
} from './persistence-types';

export const DEFAULT_MAX_SLOTS = 500;

/**
 * Hard upper bound on generated scheduling slots, and therefore on the number
 * of availability rows a single voter can submit. Shared by the config
 * normalizer, the editor input and both server-side caps so a poll can never
 * accept a selection that the batch submit or the live draft write rejects.
 */
export const MAX_SCHEDULING_SLOTS = 1000;

const FALLBACK_TIME_ZONES = [
  'UTC',
  'Europe/Zurich',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  unit: 'time',
  timeZone: 'Europe/Zurich',
  granularityMinutes: 30,
  durationMinutes: 60,
  dates: [],
  dayStart: '09:00',
  dayEnd: '17:00',
  allowIfNeeded: false,
  maxSlots: DEFAULT_MAX_SLOTS,
};

export function getViewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getSchedulingTimeZones(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;
  if (typeof supported === 'function') {
    try {
      const zones = supported('timeZone');
      if (Array.isArray(zones) && zones.length > 0) return zones;
    } catch {
      // Fall through to the small, stable list below.
    }
  }
  return [...FALLBACK_TIME_ZONES];
}

function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function normalizeTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && TIME_RE.test(value.trim())
    ? value.trim()
    : fallback;
}

export function normalizeSchedulingGranularity(value: unknown): 15 | 30 | 60 {
  const minutes = Number(value);
  return minutes === 15 || minutes === 30 || minutes === 60 ? minutes : 30;
}

/**
 * Round a meeting duration to the slot granularity, never shorter than one
 * slot and optionally capped (the editor caps it at a day so the input cannot
 * request an unschedulable meeting). Shared with the editor so a change to the
 * rounding rule cannot diverge between the saved config and the form.
 */
export function roundSchedulingDuration(
  value: unknown,
  granularity: 15 | 30 | 60,
  maxMinutes: number = Number.POSITIVE_INFINITY,
): number {
  const numeric = Number(value);
  const rounded =
    Math.round(
      (Number.isFinite(numeric) ? numeric : granularity) / granularity,
    ) * granularity;
  return Math.min(maxMinutes, Math.max(granularity, rounded));
}

/**
 * De-duplicate and sort local dates, optionally capped. The editor caps how
 * many dates its range picker may add; the config normalizer does not.
 */
export function mergeSchedulingDates(
  existing: string[],
  additions: string[],
  maxDates: number = Number.POSITIVE_INFINITY,
): string[] {
  return Array.from(new Set([...existing, ...additions]))
    .sort()
    .slice(0, maxDates);
}

function normalizeDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  // Bound the work an untrusted request can force. A valid poll can never use
  // more than `MAX_SCHEDULING_SLOTS` dates (the slot cap rejects anything
  // larger), so parsing, sorting and de-duplicating the tail of a multi-megabyte
  // `dates` array is pure waste. Keep one extra entry so an oversized list still
  // fails the `generatedCount > maxSlots` check instead of silently passing as a
  // truncated valid config.
  const entries =
    value.length > MAX_SCHEDULING_SLOTS + 1
      ? value.slice(0, MAX_SCHEDULING_SLOTS + 1)
      : value;
  const valid: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'string') continue;
    const date = entry.trim();
    if (!DATE_RE.test(date)) continue;
    try {
      Temporal.PlainDate.from(date);
    } catch {
      continue;
    }
    valid.push(date);
  }
  return mergeSchedulingDates([], valid);
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function normalizeSchedulingConfig(
  input: Partial<SchedulingConfig> | undefined,
): SchedulingConfig {
  const source = input ?? {};
  const timeZone =
    typeof source.timeZone === 'string' && source.timeZone.trim() !== ''
      ? source.timeZone.trim()
      : DEFAULT_SCHEDULING_CONFIG.timeZone;

  const granularityMinutes = normalizeSchedulingGranularity(
    source.granularityMinutes,
  );

  const requestedDuration = Number(source.durationMinutes);
  const durationMinutes = roundSchedulingDuration(
    Number.isFinite(requestedDuration)
      ? requestedDuration
      : DEFAULT_SCHEDULING_CONFIG.durationMinutes,
    granularityMinutes,
  );

  let maxSlots = Math.floor(Number(source.maxSlots));
  if (!Number.isFinite(maxSlots)) maxSlots = DEFAULT_MAX_SLOTS;
  maxSlots = Math.min(Math.max(maxSlots, 1), MAX_SCHEDULING_SLOTS);

  return {
    unit: source.unit === 'day' ? 'day' : 'time',
    timeZone,
    granularityMinutes,
    durationMinutes,
    dates: normalizeDates(source.dates),
    dayStart: normalizeTime(source.dayStart, DEFAULT_SCHEDULING_CONFIG.dayStart),
    dayEnd: normalizeTime(source.dayEnd, DEFAULT_SCHEDULING_CONFIG.dayEnd),
    allowIfNeeded: source.allowIfNeeded === true,
    maxSlots,
  };
}

function isValidInstant(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  return !Number.isNaN(Date.parse(value));
}

function slotsPerDay(config: SchedulingConfig): number {
  return Math.floor(
    (timeToMinutes(config.dayEnd) - timeToMinutes(config.dayStart)) /
      config.granularityMinutes,
  );
}

/** Validity that does not depend on `maxSlots`, shared by validate/generate. */
function validateSchedulingBasics(
  normalized: SchedulingConfig,
): string | null {
  if (!isValidTimeZone(normalized.timeZone)) {
    return `Invalid time zone: ${normalized.timeZone}`;
  }
  if (normalized.dates.length === 0) {
    return 'At least one date is required';
  }
  if (normalized.unit === 'day') {
    // Whole-day scheduling has no daily window, granularity or duration.
    return null;
  }
  if (timeToMinutes(normalized.dayStart) >= timeToMinutes(normalized.dayEnd)) {
    return 'Daily end time must be after the daily start time';
  }
  if (slotsPerDay(normalized) <= 0) {
    return 'No slots fit between the daily start and end times';
  }
  // A meeting longer than the daily window can never form a contiguous run, so
  // the poll would accept availability but never produce a candidate time.
  if (slotsPerDay(normalized) < schedulingRunLength(normalized)) {
    return 'The daily window is too short for the meeting duration';
  }
  return null;
}

/**
 * Indices into a start-ordered instant list at which `runLength` consecutive
 * slots are exactly `granularityMs` apart. The single implementation of the
 * contiguity invariant shared by validation and tallying, so a change to the
 * run length or granularity rule cannot accept a set one rejects.
 */
function contiguousRunStartIndices(
  startsMs: number[],
  runLength: number,
  granularityMs: number,
): number[] {
  if (runLength <= 1) return startsMs.map((_, index) => index);
  const indices: number[] = [];
  for (let start = 0; start <= startsMs.length - runLength; start += 1) {
    let contiguous = true;
    for (let offset = 1; offset < runLength; offset += 1) {
      if (
        startsMs[start + offset] - startsMs[start + offset - 1] !==
        granularityMs
      ) {
        contiguous = false;
        break;
      }
    }
    if (contiguous) indices.push(start);
  }
  return indices;
}

export function validateSchedulingConfig(
  config: Partial<SchedulingConfig> | undefined,
  proposals?: VoteProposal[],
): string | null {
  const normalized = normalizeSchedulingConfig(config);
  const basicError = validateSchedulingBasics(normalized);
  if (basicError) return basicError;

  // When the caller supplies the actual slot set, count the slots that will be
  // stored instead of the theoretical grid. `generateSchedulingSlots` skips DST
  // spring-forward positions, so the theoretical count exceeds the generated
  // one on those days and would reject a config the generator just accepted.
  const generatedCount =
    proposals !== undefined
      ? proposals.filter((proposal) => proposal.active).length
      : normalized.unit === 'day'
        ? normalized.dates.length
        : slotsPerDay(normalized) * normalized.dates.length;
  if (generatedCount > normalized.maxSlots) {
    return `Scheduling would generate ${generatedCount} slots, which exceeds the maximum of ${normalized.maxSlots}`;
  }

  const activeStarts: number[] = [];
  for (const proposal of proposals ?? []) {
    if (!proposal.active) continue;
    const slot = proposal.timeSlot;
    if (!slot) {
      return 'Every active scheduling proposal needs a time slot';
    }
    if (!isValidInstant(slot.startAt) || !isValidInstant(slot.endAt)) {
      return 'Scheduling slot start and end must be valid ISO instants';
    }
    if (Date.parse(slot.startAt) >= Date.parse(slot.endAt)) {
      return 'Scheduling slot start must be before its end';
    }
    activeStarts.push(Date.parse(slot.startAt));
  }

  // `generateSchedulingSlots` always yields a contiguous grid, but the editor
  // lets a moderator drop individual preview slots. Without this check a pruned
  // set (no `runLength` consecutive slots) saves cleanly, the slots then lock
  // when the poll opens, and `tallyScheduling` can never produce a run, leaving
  // the poll permanently unfinalizable.
  if (proposals !== undefined) {
    if (activeStarts.length === 0) {
      return 'Scheduling requires at least one active time slot';
    }
    const runLength = schedulingRunLength(normalized);
    if (activeStarts.length < runLength) {
      return 'The selected slots cannot fit the meeting duration';
    }
    const granularityMs =
      normalized.unit === 'day' ? 0 : normalized.granularityMinutes * 60_000;
    activeStarts.sort((a, b) => a - b);
    if (
      contiguousRunStartIndices(activeStarts, runLength, granularityMs)
        .length === 0
    ) {
      return 'The selected slots cannot fit the meeting duration';
    }
  }

  return null;
}

export function schedulingRunLength(config: SchedulingConfig): number {
  const normalized = normalizeSchedulingConfig(config);
  if (normalized.unit === 'day') return 1;
  return Math.max(
    1,
    Math.round(
      normalized.durationMinutes / normalized.granularityMinutes,
    ),
  );
}

/** Local midnight (compatible DST resolution) of a calendar date in a zone. */
function localMidnightInstant(
  date: Temporal.PlainDate,
  timeZone: string,
): string {
  return date
    .toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from('00:00') })
    .toInstant()
    .toString();
}

/**
 * Sort generated slots by start, reindex positions and apply the `maxSlots`
 * cap. Shared by the time and day generators so the overflow rule and its
 * message cannot diverge between the two modes.
 */
function finalizeGeneratedSlots(
  proposals: VoteProposal[],
  maxSlots: number,
  overflow: boolean,
): { proposals: VoteProposal[]; error: string | null } {
  proposals.sort(
    (a, b) =>
      Date.parse(a.timeSlot?.startAt ?? '') -
      Date.parse(b.timeSlot?.startAt ?? ''),
  );
  proposals.forEach((proposal, index) => {
    proposal.position = index;
  });

  if (overflow) {
    return {
      proposals: proposals.slice(0, maxSlots),
      error: `Scheduling generated more than the maximum of ${maxSlots} slots`,
    };
  }

  return { proposals, error: null };
}

function generateDaySchedulingSlots(
  normalized: SchedulingConfig,
): { proposals: VoteProposal[]; error: string | null } {
  const proposals: VoteProposal[] = [];
  const seen = new Set<string>();
  let overflow = false;

  for (const dateString of normalized.dates) {
    const date = Temporal.PlainDate.from(dateString);
    const startAt = localMidnightInstant(date, normalized.timeZone);
    if (seen.has(startAt)) continue;
    seen.add(startAt);
    const endAt = localMidnightInstant(
      date.add({ days: 1 }),
      normalized.timeZone,
    );
    proposals.push({
      id: `day-${dateString}`,
      content: '',
      description: '',
      position: proposals.length,
      active: true,
      timeSlot: { startAt, endAt },
    });
    if (proposals.length > normalized.maxSlots) {
      overflow = true;
      break;
    }
  }

  return finalizeGeneratedSlots(proposals, normalized.maxSlots, overflow);
}

export function generateSchedulingSlots(
  config: SchedulingConfig,
): { proposals: VoteProposal[]; error: string | null } {
  const normalized = normalizeSchedulingConfig(config);
  const validationError = validateSchedulingBasics(normalized);
  if (validationError) {
    return { proposals: [], error: validationError };
  }

  if (normalized.unit === 'day') {
    return generateDaySchedulingSlots(normalized);
  }

  const granularity = normalized.granularityMinutes;
  const granularityMs = granularity * 60_000;
  const dayStart = Temporal.PlainTime.from(normalized.dayStart);
  const dayEnd = Temporal.PlainTime.from(normalized.dayEnd);
  const proposals: VoteProposal[] = [];
  const seen = new Set<string>();
  let overflow = false;

  outer: for (const dateString of normalized.dates) {
    const date = Temporal.PlainDate.from(dateString);
    const endBoundary = date.toPlainDateTime(dayEnd);
    let cursor = date.toPlainDateTime(dayStart);

    while (
      Temporal.PlainDateTime.compare(
        cursor.add({ minutes: granularity }),
        endBoundary,
      ) <= 0
    ) {
      let startMs: number;
      try {
        const zoned = cursor.toZonedDateTime(normalized.timeZone, {
          disambiguation: 'compatible',
        });
        // A spring-forward gap resolves to a different local time; skip it.
        // A fall-back overlap keeps the earlier instant and is valid.
        if (Temporal.PlainDateTime.compare(zoned.toPlainDateTime(), cursor) !== 0) {
          cursor = cursor.add({ minutes: granularity });
          continue;
        }
        startMs = zoned.epochMilliseconds;
      } catch {
        cursor = cursor.add({ minutes: granularity });
        continue;
      }

      const startAt = Temporal.Instant.fromEpochMilliseconds(
        startMs,
      ).toString();
      if (!seen.has(startAt)) {
        seen.add(startAt);
        const endAt = Temporal.Instant.fromEpochMilliseconds(
          startMs + granularityMs,
        ).toString();
        proposals.push({
          id: `slot-${startAt}`,
          content: '',
          description: '',
          position: proposals.length,
          active: true,
          timeSlot: { startAt, endAt },
        });
        if (proposals.length > normalized.maxSlots) {
          overflow = true;
          break outer;
        }
      }

      cursor = cursor.add({ minutes: granularity });
    }
  }

  return finalizeGeneratedSlots(proposals, normalized.maxSlots, overflow);
}

/**
 * Intl formatters are expensive to construct and the calendars format one
 * label per cell on every render (including each painted cell during a drag).
 * Cache them by locale and options; the key space is the handful of option
 * shapes used here times the configured time zone.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();
const FORMATTER_CACHE_LIMIT = 200;

export function getFormatter(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat | null {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat(locale, options);
    if (formatterCache.size >= FORMATTER_CACHE_LIMIT) formatterCache.clear();
    formatterCache.set(key, formatter);
    return formatter;
  } catch {
    return null;
  }
}

export function formatSchedulingInstant(
  iso: string,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const options: Intl.DateTimeFormatOptions =
    Object.keys(opts).length > 0
      ? opts
      : { dateStyle: 'medium', timeStyle: 'short' };
  const formatter = getFormatter(undefined, { timeZone, ...options });
  return formatter ? formatter.format(date) : iso;
}

export function formatSchedulingDateKey(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const formatter = getFormatter('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  if (!formatter) return '';
  const parts = formatter.formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * Stable 24-hour clock label for the availability grid. Uses the shared
 * formatter cache so building one column label per slot does not construct an
 * `Intl.DateTimeFormat` per slot on every slot-set change.
 */
export function formatSchedulingTimeKey(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const formatter = getFormatter('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter ? formatter.format(date) : '';
}

export function formatSchedulingRange(
  startAt: string,
  endAt: string,
  timeZone: string,
): string {
  const startKey = formatSchedulingDateKey(startAt, timeZone);
  const endKey = formatSchedulingDateKey(endAt, timeZone);
  const startTime = formatSchedulingInstant(startAt, timeZone, {
    timeStyle: 'short',
  });
  const endTime = formatSchedulingInstant(endAt, timeZone, {
    timeStyle: 'short',
  });

  if (!startKey || !endKey) {
    return `${formatSchedulingInstant(startAt, timeZone)} – ${formatSchedulingInstant(endAt, timeZone)}`;
  }
  if (startKey === endKey) {
    // A DST fall-back makes the wall clock jump backwards inside a single slot
    // (02:30 CEST ends at 02:00 CET), so the local end reads at or before the
    // local start even though the instants are correctly ordered. Printing just
    // the two clock times would invert the range and persist that inverted text
    // as the finalized summary; disambiguate with the UTC offset instead.
    const startClock = formatSchedulingTimeKey(startAt, timeZone);
    const endClock = formatSchedulingTimeKey(endAt, timeZone);
    if (startClock && endClock && startClock >= endClock) {
      return formatSchedulingZonedRange(startAt, endAt, timeZone);
    }
    const dateLabel = formatSchedulingInstant(startAt, timeZone, {
      dateStyle: 'medium',
    });
    return `${dateLabel} ${startTime} – ${endTime}`;
  }
  return `${formatSchedulingInstant(startAt, timeZone)} – ${formatSchedulingInstant(endAt, timeZone)}`;
}

/**
 * Range label that carries each end's UTC offset, so a range crossing a DST
 * fall-back reads correctly even though the local clock runs backwards.
 */
function formatSchedulingZonedRange(
  startAt: string,
  endAt: string,
  timeZone: string,
): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  };
  return `${formatSchedulingInstant(startAt, timeZone, options)} – ${formatSchedulingInstant(endAt, timeZone, options)}`;
}

export interface SchedulingDayFormatOptions {
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
}

/** Format an instant as the local calendar day in the explicit time zone. */
export function formatSchedulingDay(
  iso: string,
  timeZone: string,
  opts: SchedulingDayFormatOptions = {},
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const dateStyle = opts.dateStyle ?? 'long';
  const month =
    dateStyle === 'short'
      ? '2-digit'
      : dateStyle === 'medium'
        ? 'short'
        : 'long';
  const day = dateStyle === 'short' ? '2-digit' : 'numeric';
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month,
    day,
  };
  const formatter = getFormatter(undefined, options);
  return formatter ? formatter.format(date) : iso;
}

/**
 * Label for a candidate run: a plain day for whole-day scheduling, otherwise
 * the existing start–end range in the configured time zone.
 */
export function formatNormalizedSchedulingRunLabel(
  run: { startAt: string; endAt: string },
  normalized: SchedulingConfig,
  opts: SchedulingDayFormatOptions = {},
): string {
  const timeZone =
    normalized.timeZone ?? DEFAULT_SCHEDULING_CONFIG.timeZone ?? 'UTC';
  if (normalized.unit === 'day') {
    return formatSchedulingDay(run.startAt, timeZone, opts);
  }
  return formatSchedulingRange(run.startAt, run.endAt, timeZone);
}

/**
 * Stable identity of a slot the moderator pruned from the generated grid.
 * Time slots are keyed by local date and wall-clock start in the configured
 * zone, not by their absolute instant: changing the poll's time zone changes
 * every instant, so an instant-based key would no longer match after
 * regeneration and silently restore the pruned slot. Day slots already carry a
 * date-based id.
 */
export function schedulingSlotIdentity(
  proposal: Pick<VoteProposal, 'id' | 'timeSlot'>,
  unit: 'time' | 'day',
  timeZone: string,
): string {
  if (unit === 'day') return proposal.id;
  const startAt = proposal.timeSlot?.startAt;
  if (!startAt) return proposal.id;
  const dateKey = formatSchedulingDateKey(startAt, timeZone);
  const timeKey = formatSchedulingTimeKey(startAt, timeZone);
  return dateKey && timeKey ? `slot-${dateKey}T${timeKey}` : proposal.id;
}

export interface SchedulingSlotTally {
  proposalId: string;
  startAt: string;
  endAt: string;
  available: number;
  ifNeeded: number;
  unavailable: number;
  coverage: number;
}

export interface SchedulingRunTally {
  startAt: string;
  endAt: string;
  slotIds: string[];
  available: number;
  ifNeeded: number;
  unavailable: number;
  coverage: number;
}

export interface SchedulingParticipantTally {
  /**
   * Collision-resistant identity used to group rows. Prefers the moderator-only
   * `participantId` digest and falls back to the public alias on a projection
   * that does not carry it.
   */
  key: string;
  /** Human-facing short label; never used to decide which rows are one voter. */
  alias: string;
  displayName?: string;
  values: Record<string, number>;
}

export interface SchedulingTally {
  slots: SchedulingSlotTally[];
  runs: SchedulingRunTally[];
  participants: SchedulingParticipantTally[];
  totalVoters: number;
}

export interface SchedulingHeatmapCell {
  available: number;
  ifNeeded: number;
  unavailable: number;
  coverage: number;
}

export interface SchedulingHeatmap {
  bySlot: Map<string, SchedulingHeatmapCell>;
  totalVoters: number;
}

/**
 * Stable identity for a scheduling participant. Shared by the tally and the
 * cheap voter count, so the two cannot disagree on when two rows are the same
 * voter.
 *
 * Prefer the moderator-only `participantId` digest when the response carries
 * it: the public `voterAlias` is a short, collision-prone hash, so grouping on
 * it would merge two distinct voters (and let one overwrite the other's
 * per-slot availability) whenever their aliases collide. The alias remains the
 * fallback for the public projection, which deliberately strips the digest.
 */
export function schedulingParticipantKey(
  response: VoteResponseEntity,
): string {
  return (
    response.participantId ??
    response.voterAlias ??
    response.voterToken ??
    response.id ??
    ''
  );
}

/**
 * Human-facing label for a scheduling participant. Kept separate from
 * `schedulingParticipantKey`: a moderator row is grouped by its 64-char digest
 * but must still display the short public alias when no name is claimed.
 */
function schedulingParticipantAlias(response: VoteResponseEntity): string {
  return response.voterAlias ?? response.voterToken ?? response.id ?? '';
}

/**
 * Slot identities a moderator pruned from a saved grid. The removal set lives
 * only in editor session state, so reopening the editor must rebuild it by
 * comparing the grid the saved config would generate with the slots that were
 * actually saved. Without this, editing an unrelated setting triggers
 * regeneration and silently restores the pruned slots (and pruned days).
 */
export function prunedSchedulingSlotKeys(
  config: SchedulingConfig | undefined,
  storedProposals: VoteProposal[],
): string[] {
  if (storedProposals.length === 0) return [];
  const normalized = normalizeSchedulingConfig(config);
  const unit = normalized.unit === 'day' ? 'day' : 'time';
  const timeZone =
    normalized.timeZone ?? DEFAULT_SCHEDULING_CONFIG.timeZone ?? 'UTC';
  const generated = generateSchedulingSlots(normalized);
  if (generated.error) return [];
  const kept = new Set(
    storedProposals.map((proposal) =>
      schedulingSlotIdentity(proposal, unit, timeZone),
    ),
  );
  return generated.proposals
    .map((proposal) => schedulingSlotIdentity(proposal, unit, timeZone))
    .filter((key) => !kept.has(key));
}

/**
 * Active scheduling slots in chronological order. The time/month calendars, the
 * public page and the tally all render or select the same set, so the predicate
 * and ordering live here instead of being re-implemented at each call site. A
 * change to "which slots count" must not leave the grid and the tally
 * disagreeing.
 */
export function activeSchedulingSlots(
  proposals: VoteProposal[],
): VoteProposal[] {
  return proposals
    .filter((proposal) => proposal.active && proposal.timeSlot)
    .slice()
    .sort(
      (a, b) =>
        Date.parse(a.timeSlot?.startAt ?? '') -
        Date.parse(b.timeSlot?.startAt ?? ''),
    );
}

/**
 * Resolve the active slot a response targets, or `undefined` when the id names
 * an unknown or inactive slot. Every route that accepts availability resolves
 * its target through this helper (and therefore through
 * `activeSchedulingSlots`), so the single-slot, batch and finalize paths cannot
 * disagree about which slots are answerable.
 */
export function findActiveSchedulingSlot(
  proposals: VoteProposal[],
  proposalId: string | null | undefined,
): VoteProposal | undefined {
  if (!proposalId) return undefined;
  return activeSchedulingSlots(proposals).find(
    (proposal) => proposal.id === proposalId,
  );
}

/**
 * Count distinct voters without building the per-participant value matrix or
 * searching for contiguous runs. Used when results are hidden and the only
 * visible aggregate is the voter count.
 */
export function countSchedulingParticipants(
  responses: VoteResponseEntity[],
  proposals: VoteProposal[],
): number {
  const activeSlotIds = new Set(
    activeSchedulingSlots(proposals).map((proposal) => proposal.id),
  );
  const keys = new Set<string>();
  for (const response of responses) {
    if (!response.proposalId || !activeSlotIds.has(response.proposalId)) {
      continue;
    }
    keys.add(schedulingParticipantKey(response));
  }
  return keys.size;
}

/** Project a tally into the per-slot heatmap shape both result views render. */
export function buildSchedulingHeatmap(
  tally: SchedulingTally,
): SchedulingHeatmap {
  const bySlot = new Map<string, SchedulingHeatmapCell>();
  for (const slot of tally.slots) {
    bySlot.set(slot.proposalId, {
      available: slot.available,
      ifNeeded: slot.ifNeeded,
      unavailable: slot.unavailable,
      coverage: slot.coverage,
    });
  }
  return { bySlot, totalVoters: tally.totalVoters };
}

/**
 * Run order for the scheduling results. Fully available participants are the
 * primary preference; coverage is displayed as a separate signal and must not
 * silently reorder runs that are tied on availability.
 */
export function compareSchedulingRuns(
  a: SchedulingRunTally,
  b: SchedulingRunTally,
): number {
  return (
    b.available - a.available ||
    Date.parse(a.startAt) - Date.parse(b.startAt)
  );
}

export function tallyScheduling(
  responses: VoteResponseEntity[],
  proposals: VoteProposal[],
  config: SchedulingConfig,
): SchedulingTally {
  const normalized = normalizeSchedulingConfig(config);
  const activeSlots = activeSchedulingSlots(proposals);

  const slotIds = new Set(activeSlots.map((proposal) => proposal.id));
  const participantsByKey = new Map<string, SchedulingParticipantTally>();
  const participantOrder: string[] = [];

  for (const response of responses) {
    if (!response.proposalId || !slotIds.has(response.proposalId)) continue;
    const key = schedulingParticipantKey(response);
    let participant = participantsByKey.get(key);
    if (!participant) {
      participant = {
        key,
        alias: schedulingParticipantAlias(response),
        values: {},
      };
      participantsByKey.set(key, participant);
      participantOrder.push(key);
    }
    if (!participant.displayName && response.attendeeData?.displayName) {
      participant.displayName = response.attendeeData.displayName;
    }
    participant.values[response.proposalId] = response.value;
  }

  const participants = participantOrder.map(
    (key) => participantsByKey.get(key) as SchedulingParticipantTally,
  );

  const slots: SchedulingSlotTally[] = activeSlots.map((proposal) => {
    let available = 0;
    let ifNeeded = 0;
    for (const participant of participants) {
      const value = participant.values[proposal.id];
      if (value === 1) available += 1;
      else if (value === 0) ifNeeded += 1;
    }
    const coverage = available + ifNeeded;
    return {
      proposalId: proposal.id,
      startAt: proposal.timeSlot?.startAt ?? '',
      endAt: proposal.timeSlot?.endAt ?? '',
      available,
      ifNeeded,
      // A participant who did not answer this slot cannot attend it; fold the
      // missing answer into unavailable so the heatmap and run tally agree.
      unavailable: participants.length - coverage,
      coverage,
    };
  });

  const runLength = schedulingRunLength(normalized);
  const granularityMs =
    normalized.unit === 'day' ? 0 : normalized.granularityMinutes * 60_000;
  const startsMs = activeSlots.map((proposal) =>
    Date.parse(proposal.timeSlot?.startAt ?? ''),
  );
  const runs: SchedulingRunTally[] = [];

  for (const startIndex of contiguousRunStartIndices(
    startsMs,
    runLength,
    granularityMs,
  )) {
    const window = activeSlots.slice(startIndex, startIndex + runLength);

    let available = 0;
    let ifNeeded = 0;
    let unavailable = 0;
    for (const participant of participants) {
      // Scan the window once without materializing a per-participant array;
      // tallying runs on every response update, so an allocation per
      // participant per window turns a poll refresh into GC pressure.
      let allAvailable = true;
      let allAnswering = true;
      let anyIfNeeded = false;
      for (let index = 0; index < window.length; index += 1) {
        const value = participant.values[window[index].id];
        if (value !== 1) allAvailable = false;
        if (!(typeof value === 'number' && value >= 0)) {
          allAnswering = false;
        } else if (value === 0) {
          anyIfNeeded = true;
        }
      }
      if (allAvailable) {
        available += 1;
      } else if (allAnswering && anyIfNeeded) {
        ifNeeded += 1;
      } else {
        unavailable += 1;
      }
    }

    runs.push({
      startAt: window[0].timeSlot?.startAt ?? '',
      endAt: window[window.length - 1].timeSlot?.endAt ?? '',
      slotIds: window.map((proposal) => proposal.id),
      available,
      ifNeeded,
      unavailable,
      coverage: available + ifNeeded,
    });
  }

  runs.sort(compareSchedulingRuns);

  return {
    slots,
    runs,
    participants,
    totalVoters: participants.length,
  };
}

/**
 * A run is a finalizable decision only when at least one participant can
 * attend it or marked it as needed. The dialog, the results helper and the
 * finalize route all key "no common time" off this predicate, so a policy
 * change cannot make one offer a run another rejects.
 */
export function schedulingRunHasAvailability(
  run: Pick<SchedulingRunTally, 'coverage'>,
): boolean {
  return run.coverage > 0;
}

/**
 * Best-run candidates in two tiers.
 *
 * 1. The fully-available tier: every finalizable run at `maxAvailable`.
 * 2. The coverage tier: every finalizable run at `maxCoverage` that is not
 *    already in the first tier (`available < maxAvailable`).
 *
 * Coverage is displayed, not used to reorder the first tier. The second tier
 * follows the first so a day where everyone can attend only if needed remains
 * visible as an alternative. `limit` applies per tier.
 */
export function topSchedulingRuns(
  tally: SchedulingTally,
  limit = 5,
): SchedulingRunTally[] {
  const finalizable = tally.runs.filter(schedulingRunHasAvailability);
  if (finalizable.length === 0) return [];
  const maxAvailable = Math.max(...finalizable.map((run) => run.available));
  const maxCoverage = Math.max(...finalizable.map((run) => run.coverage));
  const perTierLimit = Math.max(0, limit);
  const availableTier = finalizable
    .filter((run) => run.available === maxAvailable)
    .sort(compareSchedulingRuns)
    .slice(0, perTierLimit);
  const coverageTier = finalizable
    .filter(
      (run) => run.available < maxAvailable && run.coverage === maxCoverage,
    )
    .sort(compareSchedulingRuns)
    .slice(0, perTierLimit);
  return [...availableTier, ...coverageTier];
}

export function schedulingBestSlotIds(tally: SchedulingTally): string[] {
  return topSchedulingRuns(tally, Number.POSITIVE_INFINITY).flatMap(
    (run) => run.slotIds,
  );
}
