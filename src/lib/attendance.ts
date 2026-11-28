import type {
  AttendanceConfig,
  AttendanceQuestion,
  AttendanceResponseData,
  VoteResponseEntity,
} from './persistence-types';
// These modules are reachable from the compiled server, which ships as ESM
// (Node resolves relative specifiers only with an explicit extension), so keep
// the `.js` suffix even though the sources are TypeScript.
import {
  EVENT_RSVP_PROPOSAL_ID,
  tallyEventRsvp,
  type EventRsvpTally,
} from './vote-tally.js';
import { getRandomUsername } from './username-generator.js';

export const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const MAX_TEXT_ANSWER_LENGTH = 500;
export const DEFAULT_MAX_PARTY_SIZE = 20;

/** Human-readable event/comment timestamp, or null when the value is invalid. */
export function formatEventMoment(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export interface SanitizeAttendanceOptions {
  isAnonymous: boolean;
  fallbackDisplayName?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isBasicEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value);
}

/**
 * The effective party-size cap for a config: a finite value >= 1 wins, else the
 * shared default. Used by both the sanitizer (server) and the RSVP dialog UI so
 * the persisted cap and the input bounds cannot disagree.
 */
export function resolveMaxPartySize(config: AttendanceConfig | undefined): number {
  const configured = Number(config?.maxPartySize);
  return Number.isFinite(configured) && configured >= 1
    ? Math.floor(configured)
    : DEFAULT_MAX_PARTY_SIZE;
}

export type AttendanceAnswerIssueKind = 'required' | 'invalid' | 'invalidOption';

export interface AttendanceAnswerIssue {
  questionId: string;
  prompt: string;
  kind: AttendanceAnswerIssueKind;
}

/**
 * The single source of truth for custom-question validation. Returns a
 * structured issue (so a localized UI can render its own message) or null when
 * the answers are acceptable. `validateAttendanceAnswers` maps this to the
 * server's English error string.
 */
export function findAttendanceAnswerIssue(
  config: AttendanceConfig | undefined,
  raw: unknown,
): AttendanceAnswerIssue | null {
  const questions = config?.customQuestions ?? [];
  if (questions.length === 0) return null;
  const answers = asRecord(asRecord(raw).answers);

  for (const question of questions) {
    const answer = answers[question.id];
    const text = trimmedString(answer);
    const issue = (kind: AttendanceAnswerIssueKind): AttendanceAnswerIssue => ({
      questionId: question.id,
      prompt: question.prompt,
      kind,
    });

    if (question.type === 'choice') {
      const options = question.options ?? [];
      // A choice question with no options has no answer a voter can supply.
      // Treat it as satisfied rather than rejecting every RSVP: an unsatisfiable
      // required question would otherwise make the whole event un-answerable.
      if (options.length === 0) continue;
      if (text === undefined) {
        if (question.required) return issue('required');
        continue;
      }
      if (typeof answer !== 'string') return issue('invalid');
      if (!options.includes(text)) return issue('invalidOption');
      continue;
    }

    if (text === undefined) {
      if (question.required) return issue('required');
      continue;
    }
    if (typeof answer !== 'string') return issue('invalid');
  }

  return null;
}

/**
 * Validate the answers a participant supplied for a config's custom questions.
 * Returns a human-readable error, or null when the payload is acceptable.
 * `sanitizeAttendanceData` assumes this validation already passed.
 */
export function validateAttendanceAnswers(
  config: AttendanceConfig | undefined,
  raw: unknown,
): string | null {
  const issue = findAttendanceAnswerIssue(config, raw);
  if (!issue) return null;
  if (issue.kind === 'required') {
    return `Answer required for question: ${issue.prompt}`;
  }
  if (issue.kind === 'invalidOption') {
    return `Invalid option for question: ${issue.prompt}`;
  }
  return `Invalid answer for question: ${issue.prompt}`;
}

function sanitizeAnswer(question: AttendanceQuestion, answer: unknown): string | undefined {
  const text = trimmedString(answer);
  if (text === undefined) return undefined;
  if (question.type === 'choice') {
    return (question.options ?? []).includes(text) ? text : undefined;
  }
  return text.slice(0, MAX_TEXT_ANSWER_LENGTH);
}

/**
 * Normalize untrusted RSVP metadata into the persisted shape. Approval state and
 * the removal token are never derived here: the caller owns those.
 */
export function sanitizeAttendanceData(
  config: AttendanceConfig | undefined,
  raw: unknown,
  opts: SanitizeAttendanceOptions,
): AttendanceResponseData {
  const source = asRecord(raw);
  const data: AttendanceResponseData = {};

  if (!opts.isAnonymous) {
    let displayName = trimmedString(source.displayName)?.slice(0, MAX_DISPLAY_NAME_LENGTH);
    if (!displayName) {
      displayName =
        trimmedString(opts.fallbackDisplayName)?.slice(0, MAX_DISPLAY_NAME_LENGTH) ??
        getRandomUsername();
    }
    data.displayName = displayName;
  }

  if (config?.askEmail) {
    const rawEmail = trimmedString(source.email)?.toLowerCase().slice(0, MAX_EMAIL_LENGTH);
    if (rawEmail && isBasicEmail(rawEmail)) {
      data.email = rawEmail;
    }
  }

  const partySizeInput = Number(source.partySize);
  let partySize = Number.isFinite(partySizeInput) ? Math.floor(partySizeInput) : 1;
  if (!config?.allowPartySize) {
    partySize = 1;
  } else {
    partySize = Math.min(Math.max(partySize, 1), resolveMaxPartySize(config));
  }
  data.partySize = partySize;

  data.visibility =
    config?.allowHiddenAttendance && source.visibility === 'hidden' ? 'hidden' : 'public';

  const rawAnswers = asRecord(source.answers);
  const answers: Record<string, string> = {};
  for (const question of config?.customQuestions ?? []) {
    const value = sanitizeAnswer(question, rawAnswers[question.id]);
    if (value !== undefined) answers[question.id] = value;
  }
  if (Object.keys(answers).length > 0) {
    data.answers = answers;
  }

  return data;
}

/** Party size of one RSVP row, defaulting to one person. */
export function attendancePartySize(data?: AttendanceResponseData): number {
  const size = Number(data?.partySize);
  return Number.isFinite(size) && size >= 1 ? Math.floor(size) : 1;
}

/**
 * Total party size of every "going" RSVP, optionally excluding one voter's row
 * (used when replacing that voter's existing response).
 */
export function attendanceGoingPartyTotal(
  responses: VoteResponseEntity[],
  excludeVoterToken?: string,
): number {
  return responses
    .filter(
      (response) =>
        response.proposalId === EVENT_RSVP_PROPOSAL_ID &&
        response.value === 1 &&
        (excludeVoterToken === undefined || response.voterToken !== excludeVoterToken),
    )
    .reduce((total, response) => total + attendancePartySize(response.attendeeData), 0);
}

/**
 * Capacity check for an incoming RSVP. `maxAttendees` of 0/undefined means the
 * event is unlimited. The voter's own current row is excluded before adding the
 * incoming party size so changing an existing RSVP does not double-count.
 */
export function attendanceCapacityError(
  config: AttendanceConfig | undefined,
  responses: VoteResponseEntity[],
  incoming: { value: number; partySize: number },
  voterToken?: string,
): string | null {
  if (incoming.value !== 1) return null;
  const currentTotal = attendanceGoingPartyTotal(responses, voterToken);
  return attendanceCapacityErrorFromTotal(config, currentTotal, incoming);
}

/**
 * Capacity check against an already-computed going-party total. Lets a caller
 * that has memoized the total (the public RSVP page) apply the same rule
 * without rescanning the response list on every render.
 */
export function attendanceCapacityErrorFromTotal(
  config: AttendanceConfig | undefined,
  currentTotal: number,
  incoming: { value: number; partySize: number },
): string | null {
  if (incoming.value !== 1) return null;
  const maxAttendees = Number(config?.maxAttendees);
  if (!Number.isFinite(maxAttendees) || maxAttendees <= 0) return null;

  const incomingPartySize = attendancePartySize({ partySize: incoming.partySize });
  if (currentTotal + incomingPartySize <= maxAttendees) return null;

  const remaining = Math.max(maxAttendees - currentTotal, 0);
  return remaining === 0
    ? 'Event is at full capacity'
    : `Event capacity exceeded: only ${remaining} spot${remaining === 1 ? '' : 's'} remaining`;
}

export interface PublicAttendanceRow {
  displayName?: string;
  /** Stable pseudonym shown when the vote is anonymous or the name is hidden. */
  alias?: string;
  partySize: number;
  visibility: 'public' | 'hidden';
}

/** Normalized visibility of one RSVP row (anything but `hidden` is public). */
export function attendanceVisibility(
  data: AttendanceResponseData | undefined,
): 'public' | 'hidden' {
  return data?.visibility === 'hidden' ? 'hidden' : 'public';
}

/**
 * Merge a renamed display name into a response's stored attendee data without
 * ever downgrading a hidden row to public. Shared by the SQLite and Postgres
 * adapters so a name edit cannot make a hidden attendee visible on only one
 * deployment.
 */
export function mergeAttendeeDisplayName(
  current: AttendanceResponseData | undefined,
  displayName: string,
  visibility: 'hidden' | 'auto',
): AttendanceResponseData {
  return {
    ...(current ?? {}),
    displayName,
    visibility:
      visibility === 'hidden' || attendanceVisibility(current) === 'hidden'
        ? 'hidden'
        : 'public',
  };
}

/**
 * The only place that decides whether an RSVP may reveal its display name.
 * Anonymous votes never do, and a hidden RSVP is never named.
 */
export function attendanceDisplayName(
  data: AttendanceResponseData | undefined,
  isAnonymous: boolean,
): string | undefined {
  return !isAnonymous && attendanceVisibility(data) === 'public'
    ? data?.displayName
    : undefined;
}

/**
 * Public projection of the going list. Hidden RSVPs still count toward the
 * total but never reveal a name; anonymous votes never reveal one at all.
 */
export function publicAttendanceRows(
  responses: VoteResponseEntity[],
  isAnonymous: boolean,
): PublicAttendanceRow[] {
  return responses
    .filter(
      (response) =>
        response.proposalId === EVENT_RSVP_PROPOSAL_ID && response.value === 1,
    )
    .map((response) => {
      const data = response.attendeeData;
      return {
        displayName: attendanceDisplayName(data, isAnonymous),
        alias: response.voterAlias,
        partySize: attendancePartySize(data),
        visibility: attendanceVisibility(data),
      };
    });
}

export interface AttendanceCommentRow {
  id: string;
  author?: string;
  body: string;
  submittedAt: string;
}

export interface AttendanceSummary {
  tally: EventRsvpTally;
  rows: PublicAttendanceRow[];
  comments: AttendanceCommentRow[];
}

/**
 * One projection of a vote's RSVP responses. Both the public page and the
 * moderator results view render from this, so the tally, the attendee rows and
 * the comment list cannot drift — and callers can memoize the result once
 * instead of rescanning the response list on every keystroke.
 */
export function summarizeAttendance(
  responses: VoteResponseEntity[],
  options: { isAnonymous: boolean; includeComments?: boolean },
): AttendanceSummary {
  const rsvpResponses = responses.filter(
    (response) => response.proposalId === EVENT_RSVP_PROPOSAL_ID,
  );
  const comments: AttendanceCommentRow[] = options.includeComments
    ? rsvpResponses
        .filter(
          (response) =>
            response.comment !== undefined && response.comment.trim().length > 0,
        )
        .map((response) => ({
          id: response.id,
          author:
            attendanceDisplayName(response.attendeeData, options.isAnonymous) ??
            response.voterAlias,
          body: response.comment!.trim(),
          submittedAt: response.submittedAt,
        }))
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    : [];
  return {
    tally: tallyEventRsvp(rsvpResponses),
    rows: publicAttendanceRows(rsvpResponses, options.isAnonymous),
    comments,
  };
}
