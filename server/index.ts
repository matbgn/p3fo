import './telemetry.js';
import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import cors from 'cors';
import crypto from 'node:crypto';
import { createDbClient } from './db/index.js';
import { DbClient } from './db/index.js';
import { pokerRevealedProposalIdsSignature } from './db/index.js';
import { VoteKind, VoteLoop, VoteModerator, VoteResponseEntity, VoteRankingSubmission, PomodoroSession } from '../src/lib/persistence-types.js';
import type { TaskEntity, VoteRankingBallot, VoteEntity, VoteRankingResult } from '../src/lib/persistence-types.js';
import type { SprintStateEntity } from '../src/lib/sprint-types.js';
import {
  hasPrivateAttendeeFields,
  hidePokerValueForVote,
  isVoteAnonymous,
  pokerProposalIdIsRevealed,
  pokerProposalIsRevealed,
  pokerValuesAreHidden,
  redactRankingSubmissionForBackup,
  redactVoteResponseForVote,
  redactVoteResponsesForVote,
  shareVoteResponse,
  stripPokerValue,
  voterAlias,
  voteResponseCarriesDisplayName,
} from '../src/lib/vote-ranking.js';
import {
  WHO5_QUESTIONS,
  applyClose,
  buildScopeSnapshot,
  buildWellbeingAggregate,
  createEmptySprintState,
  isTerminalTask,
  previousClosedTargetPoints,
  startSprint,
} from '../src/lib/sprint-types.js';
import { startSprintScheduler, toSprintTasks } from './sprint-scheduler.js';
import { withSprintStateLock } from './sprint-state-lock.js';
import { z } from 'zod';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import { setupWSConnection, getYDoc } from 'y-websocket/bin/utils';
import * as Y from 'yjs';

import {
  activeProposalIds,
  areRankingResultsVisible,
  buildVoteRankingResult,
  computeBallotCoverage,
  DEFAULT_RANKING_ENGINE,
  deriveBallotParticipationFromStats,
  isDraftNewer,
  MAX_RANKED_ITEMS,
  resolveFinalizedWinner,
  voteAllowsTies,
} from '../src/lib/vote-ranking.js';
import { VOTE_SCOPED_YJS_MAPS } from '../src/lib/vote-yjs-maps.js';
import { clearVoteDrafts, deleteVoteDraft, listVoteDrafts, sweepExpiredVoteDrafts, upsertVoteDraft } from '../src/lib/vote-drafts.js';
import { clearVotePresence, listVotePresence, sweepExpiredVotePresence, touchVotePresence } from '../src/lib/vote-presence.js';
import {
  clearPokerReady,
  clearPokerReadyForParticipant,
  listPokerReady,
  markPokerReady,
  sweepExpiredPokerReady,
} from '../src/lib/poker-ready.js';
import {
  normalizePokerConfig,
  normalizeRevealedProposalIds,
  pokerBallotCoversEveryProposal,
  type PokerConfig,
  type PokerState,
} from '../src/lib/poker.js';
import { isVoteMode, validateVoteResponseValue } from '../src/lib/vote-validation.js';
import {
  applyResolvedBudgetConfig,
  budgetTotal,
  clearBudgetConfig,
  normalizeBudgetConfig,
  parseBudgetSubmission,
  resolveBudgetConfig,
  validateBudgetDraftValues,
} from '../src/lib/budget.js';
import {
  MAX_SCHEDULING_SLOTS,
  activeSchedulingSlots,
  findActiveSchedulingSlot,
  normalizeSchedulingConfig,
  schedulingRunHasAvailability,
  tallyScheduling,
  validateSchedulingConfig,
} from '../src/lib/scheduling.js';
import { EVENT_RSVP_PROPOSAL_ID } from '../src/lib/vote-tally.js';
import { MAX_DISPLAY_NAME_LENGTH, attendanceCapacityError, sanitizeAttendanceData, validateAttendanceAnswers } from '../src/lib/attendance.js';

const YJS_ROOM = 'p3fo-room';

function entityToClientTask(entity: TaskEntity): Record<string, unknown> {
  const toMillis = (value: unknown): number | undefined => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  };
  const blockedSince = (entity as TaskEntity & { blockedSince?: string | null }).blockedSince;
  const terminationDate = toMillis(entity.terminationDate);
  const triageStatus = entity.triageStatus;
  return {
    ...entity,
    createdAt: toMillis(entity.createdAt) ?? Date.now(),
    updatedAt: toMillis(entity.updatedAt) ?? Date.now(),
    terminationDate,
    // Legacy rows stored the deadline for active tasks and the completion time
    // for Done tasks in terminationDate only; mirror convertEntitiesToTasks so
    // a live Yjs broadcast does not clear the derived value.
    dueDate: toMillis(entity.dueDate)
      ?? (triageStatus !== 'Done' ? terminationDate : undefined),
    completedAt: toMillis(entity.completedAt)
      ?? (triageStatus === 'Done' ? terminationDate : undefined),
    deletedAt: toMillis(entity.deletedAt),
    blockedSince: toMillis(blockedSince),
    children: [],
  };
}

// Push a task update into the Yjs doc so connected clients receive it
// in real-time via WebSocket, without needing to reload the browser.
function broadcastTaskToYjs(task: unknown) {
  try {
    const doc = getYDoc(YJS_ROOM) as Y.Doc;
    const yTasks = doc.getMap('tasks');
    // Persistence entities store timestamps as ISO strings, while the client
    // Task shape uses epoch milliseconds. Broadcasting the raw entity made
    // consumers crash (e.g. TimePickerDialog) and could drop live updates.
    const clientTask = entityToClientTask(task as TaskEntity);
    yTasks.set(clientTask.id as string, clientTask);
  } catch {
    // Yjs doc may not exist yet (no connected clients) — safe to skip
  }
}

// Notify connected clients that a task was deleted.
function broadcastTaskDeletionToYjs(taskId: string) {
  try {
    const doc = getYDoc(YJS_ROOM) as Y.Doc;
    const yTasks = doc.getMap('tasks');
    yTasks.delete(taskId);
  } catch {
    // Yjs doc may not exist yet — safe to skip
  }
}

/** Read a value stored in a shared Y.Map as a plain object. */
function yjsValueToRecord<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === 'object' && 'toJSON' in (value as object)) {
    try {
      return (value as { toJSON: () => T }).toJSON();
    } catch {
      return null;
    }
  }
  return value as T;
}

/**
 * Unforgeable store key for the ephemeral draft/presence channels.
 *
 * The public `voterAlias` is a short label derived from a 32-bit hash, published
 * in the shared document so it can collide (accidentally, or deliberately by a
 * participant brute-forcing a token that hashes to someone else's alias). Keying
 * a store on it would let one participant overwrite another's draft or presence.
 * A server-side SHA-256 of the token is stable across requests and infeasible to
 * collide, and it never leaves the process.
 */
function voteParticipantKey(voteId: string, voterToken: string): string {
  return crypto.createHash('sha256').update(`${voteId}:${voterToken}`).digest('hex');
}

/**
 * Upsert one response into the live map. Used on create. Delegates to the batch
 * path so the anonymity/alias redaction lives in exactly one place and the two
 * submission paths cannot diverge on what reaches the shared document.
 */
function broadcastVoteResponseToYjs(vote: VoteEntity, response: VoteResponseEntity) {
  broadcastVoteResponsesToYjs(vote, [response]);
}

/**
 * Upsert many responses in a single Yjs transaction. A batch availability
 * submission can touch every active slot, so per-row `map.set` would emit one
 * update per slot to every connected client.
 */
function broadcastVoteResponsesToYjs(vote: VoteEntity, responses: VoteResponseEntity[]) {
  if (responses.length === 0) return;
  try {
    const doc = getYDoc(YJS_ROOM) as Y.Doc;
    const map = doc.getMap('voteResponses');
    doc.transact(() => {
      for (const response of responses) {
        const safeResponse = shareVoteResponse(
          vote.id,
          hidePokerValueForVote(vote, redactVoteResponseForVote(vote, response)),
        );
        map.set(safeResponse.id, safeResponse);
      }
    });
  } catch {
    // Yjs doc may not exist yet — safe to skip
  }
}

function timingSafeTokenEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Normalize a claimed display name. One rule for scheduling availability
 * submissions and the rename endpoint, so the length cap cannot drift and a
 * name cannot be accepted longer on one path than the other.
 */
function normalizeVoterDisplayName(raw: unknown): string {
  return typeof raw === 'string'
    ? raw.trim().slice(0, MAX_DISPLAY_NAME_LENGTH)
    : '';
}

/**
 * The participant credential is a client-generated UUID. Cap it well above that
 * so a public submission cannot persist an arbitrarily large value. The cap
 * matters most on the batch route, which writes the same token into one row per
 * active slot and would otherwise amplify a multi-megabyte body into gigabytes
 * of stored text.
 */
const MAX_VOTER_TOKEN_LENGTH = 256;

function isValidVoterToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_VOTER_TOKEN_LENGTH
  );
}

/**
 * Build the hidden display name for a scheduling response. One rule for the
 * single- and batch-submission paths, so the length cap and visibility cannot
 * drift and leak a name into the public projection.
 */
function schedulingAttendeeDisplayName(
  vote: VoteEntity,
  body: unknown,
): VoteResponseEntity['attendeeData'] {
  if (isVoteAnonymous(vote.config)) return undefined;
  const rawAttendeeData =
    body && typeof body === 'object'
      ? (body as { attendeeData?: unknown }).attendeeData
      : undefined;
  const rawName =
    rawAttendeeData && typeof rawAttendeeData === 'object'
      ? (rawAttendeeData as { displayName?: unknown }).displayName
      : undefined;
  const displayName = normalizeVoterDisplayName(rawName);
  return displayName ? { displayName, visibility: 'hidden' } : undefined;
}

/**
 * Attendance capacity is checked against the current RSVPs and then written in
 * a second statement. Serialize those two steps per vote inside this process so
 * two concurrent "going" submissions cannot both observe spare capacity and
 * overbook. A multi-instance deployment still needs a DB-level guard (e.g. an
 * advisory lock), which is tracked as a manual deployment step.
 */
const attendanceWriteQueues = new Map<string, Promise<void>>();

async function withVoteWriteLock<T>(voteId: string, task: () => Promise<T>): Promise<T> {
  const previous = attendanceWriteQueues.get(voteId) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  attendanceWriteQueues.set(voteId, queued);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (attendanceWriteQueues.get(voteId) === queued) {
      attendanceWriteQueues.delete(voteId);
    }
  }
}

/**
 * Evict exactly the rows a withdrawal removed. The database layer returns the
 * deleted ids, so this never re-reads or re-broadcasts the rest of the vote's
 * responses (a Y.Map.set creates a new item even for an unchanged value).
 */
function broadcastVoteResponsesRemovedFromYjs(responseIds: string[]) {
  if (responseIds.length === 0) return;
  try {
    const doc = getYDoc(YJS_ROOM) as Y.Doc;
    const map = doc.getMap('voteResponses');
    doc.transact(() => {
      for (const id of responseIds) map.delete(id);
    });
  } catch {
    // Yjs doc may not exist yet — safe to skip
  }
}

/**
 * Persisted poker config per blind vote. Membership marks a vote whose round is
 * still blind; the stored config decides which proposals a moderator revealed.
 *
 * The shared Yjs document is unauthenticated: any connected peer can write both
 * `voteProposals` (where the browser reads `config.poker.revealedAt`) and
 * `voteResponses`. Deriving the blind-reveal rule from that projection therefore
 * lets a peer claim a round is revealed and make an authorized client publish
 * every estimate. This map is derived only from the persisted vote, refreshed on
 * every server write and warmed at startup, so the response scrub below can strip
 * a value without trusting anything a client authored.
 *
 * A moderator can reveal one proposition before the round-wide `revealedAt`.
 * The shared-document scrub must publish that proposal's estimates while still
 * stripping every other proposal, so this map carries the persisted config.
 * Storing the config (not a pre-computed allow-list) lets the scrub evaluate the
 * same `pokerProposalIdIsRevealed` rule as the results projection, so a reveal
 * exception added there cannot drift here.
 */
const pokerHiddenConfigByVote = new Map<
  string,
  NonNullable<VoteEntity['config']['poker']>
>();

function trackPokerValueVisibility(
  vote: Pick<VoteEntity, 'id' | 'config'> | null | undefined,
): void {
  if (!vote) return;
  const hidden = pokerValuesAreHidden(vote);
  const poker = vote.config.poker;
  if (hidden && poker) {
    pokerHiddenConfigByVote.set(vote.id, {
      ...poker,
      revealedProposalIds: poker.revealedProposalIds
        ? [...poker.revealedProposalIds]
        : [],
    });
  } else {
    pokerHiddenConfigByVote.delete(vote.id);
  }
}

/**
 * Whether a shared-document row for this vote must lose its value. A vote that
 * is not blind reveals everything; a blind vote reveals only the proposals its
 * cached config marks revealed. No proposal id on a blind vote cannot be
 * matched against the allow-list, so it stays hidden.
 */
function isPokerValueHiddenForSharedRow(
  voteId: unknown,
  proposalId: unknown,
): boolean {
  if (typeof voteId !== 'string') return false;
  const poker = pokerHiddenConfigByVote.get(voteId);
  if (!poker) return false;
  if (typeof proposalId !== 'string' || proposalId.length === 0) return true;
  return !pokerProposalIdIsRevealed(poker, proposalId);
}

/**
 * Once the round-wide reveal stamps `revealedAt`, every estimate is public and
 * the round is frozen for response changes. Both the create and withdraw
 * response routes gate on this, so it lives in one place to keep the two
 * endpoints from disagreeing about when an estimate may still change.
 */
function pokerEstimateChangesAreFrozen(
  vote: Pick<VoteEntity, 'config'>,
): boolean {
  return (
    vote.config.mode === 'POKER_PLANNING' &&
    Boolean(vote.config.poker?.revealedAt)
  );
}

/**
 * Older clients published responses verbatim into the shared document, and a
 * stale bundle can keep doing so during a rollout. The server now normalises the
 * `/ws/<room>` name, so those clients join the same room as the redacting
 * writers. Rewrite any response that still carries a raw `voterToken` or a
 * private RSVP field (email, custom answers, removal token) as soon as it enters
 * the room, so a credential or organizer-only datum is removed from the server
 * copy and from every client that syncs after the scrub, regardless of which
 * client version produced it. A moderator client that fetched the organizer
 * projection and re-published it through `syncResponsesToYjs` is the path this
 * guards against.
 *
 * It also strips a poker estimate for any vote whose persisted round is still
 * blind, unless a moderator force-revealed that exact proposal. Both sets are
 * derived from persisted state, so a forged
 * `voteProposals.config.poker.revealedAt` cannot make a value-bearing row
 * survive the rewrite.
 */
function scrubLegacyVoteResponseTokensFromYjs() {
  try {
    const doc = getYDoc(YJS_ROOM) as Y.Doc;
    const map = doc.getMap('voteResponses');
    const scrubKeys = (keys: Iterable<string>) => {
      const stale: Array<[string, VoteResponseEntity]> = [];
      for (const key of keys) {
        const parsed = yjsValueToRecord<VoteResponseEntity>(map.get(key));
        if (!parsed) continue;
        const hasRawToken =
          typeof parsed.voterToken === 'string' && parsed.voterToken.length > 0;
        const leaksPokerValue =
          typeof parsed.value === 'number' &&
          isPokerValueHiddenForSharedRow(parsed.voteId, parsed.proposalId);
        if (
          hasRawToken ||
          hasPrivateAttendeeFields(parsed.attendeeData) ||
          leaksPokerValue
        ) {
          stale.push([key, parsed]);
        }
      }
      if (stale.length === 0) return;
      doc.transact(() => {
        for (const [key, parsed] of stale) {
          const projected = isPokerValueHiddenForSharedRow(
            parsed.voteId,
            parsed.proposalId,
          )
            ? stripPokerValue(parsed)
            : parsed;
          map.set(key, shareVoteResponse(projected.voteId, projected));
        }
      });
    };
    // A process that restarts in place may already hold rows; scan them once,
    // then only the keys each incoming update touches. The rewrite strips the
    // token and private fields, so the scrub is idempotent and cannot loop.
    scrubKeys(Array.from(map.keys()));
    map.observe((event) => scrubKeys(event.keysChanged));
  } catch {
    // Yjs doc may not exist yet — safe to skip
  }
}

/**
 * In-progress selections and presence used to live in the shared document.
 * They now travel through moderator-authenticated channels, so purge any rows
 * an earlier version left behind (the draft rows could still carry a raw voter
 * token; the presence rows expose who joined when).
 */
function purgeLegacyVoteLiveMapsFromYjs() {
  try {
    const doc = getYDoc(YJS_ROOM) as Y.Doc;
    for (const mapName of ['voteResponseDrafts', 'voteParticipation']) {
      const legacy = doc.getMap(mapName);
      const purge = () => {
        if (legacy.size === 0) return;
        doc.transact(() => legacy.clear());
      };
      // The document is empty at startup, before any client connects, so a
      // one-shot purge cannot see rows an older bundle writes later. Observe as
      // well; clearing re-enters with size 0 and is therefore idempotent.
      legacy.observe(purge);
      purge();
    }
  } catch {
    // Yjs doc may not exist yet — safe to skip
  }
}

/**
 * Tell connected clients that a vote's draft set changed. The value is only a
 * revision counter: draft content stays behind the moderator capability and is
 * fetched by the viewer after this signal arrives. A monotonic counter (not a
 * timestamp) guarantees a visible change even for two writes in the same ms.
 */
const draftRevisionCounters = new Map<string, number>();
const presenceRevisionCounters = new Map<string, number>();

function bumpVoteLiveRevision(
  mapName: 'voteDraftRevisions' | 'votePresenceRevisions',
  counters: Map<string, number>,
  voteId: string,
) {
  try {
    const next = (counters.get(voteId) ?? 0) + 1;
    counters.set(voteId, next);
    const doc = getYDoc(YJS_ROOM) as Y.Doc;
    doc.getMap(mapName).set(voteId, { voteId, revision: next });
  } catch {
    // Yjs doc may not exist yet — safe to skip
  }
}

function broadcastVoteDraftRevision(voteId: string) {
  scheduleVoteLiveRevision('voteDraftRevisions', draftRevisionCounters, voteId);
}

function broadcastVotePresenceRevision(voteId: string) {
  scheduleVoteLiveRevision('votePresenceRevisions', presenceRevisionCounters, voteId);
}

/**
 * Each revision bump is a write to the single shared room document, which the
 * WebSocket server forwards to every connected client. Draft autosave and
 * presence heartbeats are per-participant, so writing one update per request
 * fans out O(participants) broadcasts; coalesce a burst per vote into one
 * update. The counter still advances monotonically, so a viewer that refetches
 * after the coalesced write sees the latest state.
 */
const LIVE_REVISION_COALESCE_MS = 1000;
const pendingLiveRevisions = new Map<
  string,
  {
    mapName: 'voteDraftRevisions' | 'votePresenceRevisions';
    counters: Map<string, number>;
    voteId: string;
    timer: ReturnType<typeof setTimeout>;
  }
>();

function scheduleVoteLiveRevision(
  mapName: 'voteDraftRevisions' | 'votePresenceRevisions',
  counters: Map<string, number>,
  voteId: string,
) {
  const key = `${mapName}:${voteId}`;
  // Throttle, not debounce: a pending timer is not reset by later writes. Draft
  // autosave (300ms per participant) and presence heartbeats (30s per
  // participant) can overlap continuously on a busy vote, so clearing the timer
  // on every write would starve the broadcast and leave every moderator view on
  // its polling fallback. The counter is read when the timer fires, so one
  // pending write already covers every request that arrived after it.
  if (pendingLiveRevisions.has(key)) return;
  const timer = setTimeout(() => {
    pendingLiveRevisions.delete(key);
    bumpVoteLiveRevision(mapName, counters, voteId);
  }, LIVE_REVISION_COALESCE_MS);
  pendingLiveRevisions.set(key, { mapName, counters, voteId, timer });
}

/** Drop a vote's coalesced revision timers so a deleted vote cannot be bumped. */
function cancelPendingVoteLiveRevisions(voteId: string) {
  for (const [key, pending] of pendingLiveRevisions) {
    if (pending.voteId === voteId) {
      clearTimeout(pending.timer);
      pendingLiveRevisions.delete(key);
    }
  }
}

/** Remove all live data attached to a vote (reset/delete). */
function clearVoteFromYjs(voteId: string) {
  try {
    draftRevisionCounters.delete(voteId);
    presenceRevisionCounters.delete(voteId);
    cancelPendingVoteLiveRevisions(voteId);
    // A ranking broadcast scheduled by an autosave that just happened would
    // otherwise fire after this clear and resurrect `voteRankingState[voteId]`.
    const pendingRanking = pendingRankingLiveBroadcasts.get(voteId);
    if (pendingRanking) {
      clearTimeout(pendingRanking.timer);
      pendingRankingLiveBroadcasts.delete(voteId);
    }
    rankingLiveRevisions.delete(voteId);
    const doc = getYDoc(YJS_ROOM) as Y.Doc;
    // Shared registry (see src/lib/vote-yjs-maps.ts) so the client's clear path
    // and this one cannot drift.
    doc.transact(() => {
      for (const mapName of VOTE_SCOPED_YJS_MAPS) {
        const map = doc.getMap(mapName);
        const keysToDelete: string[] = [];
        map.forEach((value, key) => {
          const parsed = yjsValueToRecord<{ voteId?: string }>(value);
          if (parsed?.voteId === voteId) keysToDelete.push(key as string);
        });
        // One transaction for every map: deleting a vote with many live rows
        // must emit one update, not one per key.
        keysToDelete.forEach((key) => map.delete(key));
      }
    });
  } catch {
    // Yjs doc may not exist yet — safe to skip
  }
}

/**
 * Comparative votes need a live signal too, but broadcasting full ballots (up
 * to 20k comparisons each) or voter identities would be wasteful and unsafe.
 * Broadcast only revisions and aggregate counts; the moderator's results view
 * refetches the server-computed ranking when a revision changes.
 */
const rankingLiveRevisions = new Map<string, { participation: number; results: number }>();

async function broadcastRankingLiveState(
  vote: VoteEntity,
  options: { resultsChanged?: boolean } = {},
) {
  try {
    // The live signal only carries an aggregate count. Read it with one cheap
    // COUNT query: the full participation aggregate parses every ballot payload
    // (four `json_extract` calls per row) and this runs on the autosave write
    // path, so it must not scale with payload size.
    const seen = await db.countVoteRankingParticipants(vote.id);
    const now = Date.now();
    const previous = rankingLiveRevisions.get(vote.id) ?? { participation: 0, results: 0 };
    const next = {
      participation: now,
      results: options.resultsChanged ? now : previous.results,
    };
    rankingLiveRevisions.set(vote.id, next);
    const doc = getYDoc(YJS_ROOM) as Y.Doc;
    doc.getMap('voteRankingState').set(vote.id, {
      voteId: vote.id,
      participationRevision: next.participation,
      resultsRevision: next.results,
      participantCount: seen,
    });
  } catch {
    // Yjs doc may not exist yet — safe to skip
  }
}

/**
 * The live-state broadcast runs a full participation aggregate. Autosave is
 * debounced to ~2s per participant, so running it inline would put a full-table
 * JSON scan on every autosave. Coalesce a burst per vote and run it after the
 * request has been answered.
 */
const pendingRankingLiveBroadcasts = new Map<
  string,
  { vote: VoteEntity; resultsChanged: boolean; timer: ReturnType<typeof setTimeout> }
>();

function scheduleRankingLiveBroadcast(
  vote: VoteEntity,
  options: { resultsChanged?: boolean } = {},
) {
  const existing = pendingRankingLiveBroadcasts.get(vote.id);
  const resultsChanged = Boolean(options.resultsChanged) || Boolean(existing?.resultsChanged);
  if (existing) {
    // Throttle, not debounce: keep the pending timer so continuous autosaves
    // cannot starve the broadcast, but accumulate the latest vote/flags so the
    // pending fire still reflects every write that arrived while it waited.
    existing.vote = vote;
    existing.resultsChanged = resultsChanged;
    return;
  }
  const timer = setTimeout(() => {
    const pending = pendingRankingLiveBroadcasts.get(vote.id);
    pendingRankingLiveBroadcasts.delete(vote.id);
    if (pending) {
      void broadcastRankingLiveState(pending.vote, {
        resultsChanged: pending.resultsChanged,
      });
    }
  }, 250);
  pendingRankingLiveBroadcasts.set(vote.id, { vote, resultsChanged, timer });
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5172;

// Environment variables
const DB_CLIENT = process.env.P3FO_DB_CLIENT || 'sqlite'; // 'sqlite' or 'pg'
const DB_URL = process.env.P3FO_DB_URL;
const DB_SQLITE_FILE = process.env.P3FO_DB_SQLITE_FILE || './p3fo.db';

// Middleware
// Compress responses above 1 KiB. This is critical for the production SPA:
// without it the main index chunk ships ~2.8 MiB uncompressed on every cold
// load, which dominates first paint on slow links.
app.use(compression({ threshold: 1024 }));
app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'traceparent', 'tracestate', 'X-API-Key', 'Authorization', 'X-Voter-Token', 'X-Moderator-Token', 'X-Removal-Token'],
  exposedHeaders: ['traceparent', 'tracestate'],
}));
app.use(express.json({ limit: '10mb' }));

// --- MCP API-key auth + /mcp path rewrite ---
// Routes mounted under /mcp are protected by a shared API key (P3FO_API_KEY)
// instead of the OIDC cookie auth handled by oauth2-proxy for /api routes.
// When P3FO_API_KEY is unset the middleware is a no-op (local dev).
const P3FO_API_KEY = process.env.P3FO_API_KEY;
const MCP_PREFIX = '/mcp';

app.use((req, res, next) => {
  if (!req.path.startsWith(MCP_PREFIX + '/')) return next();

  if (P3FO_API_KEY) {
    const provided =
      req.get('X-API-Key') ||
      (req.get('Authorization')?.startsWith('Bearer ')
        ? req.get('Authorization')!.slice(7)
        : undefined);
    const providedBuf = Buffer.from(provided ?? '');
    const expectedBuf = Buffer.from(P3FO_API_KEY);
    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
    }
  }

  // Strip the /mcp prefix so existing /api routes match.
  req.url = req.url.replace(MCP_PREFIX, '');
  next();
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Serve static files from the dist directory
  // __dirname is dist/server/server
  const staticPath = path.resolve(__dirname, '../../');
  console.log(`Serving static files from: ${staticPath}`);

  const baseUrl = process.env.VITE_BASE_URL || '/';
  console.log(`Mounting static files at: ${baseUrl}`);

  const assetsDir = `${path.sep}assets${path.sep}`;
  // Vite content-hashed filenames look like `index-Cc2a6xB8.js` or
  // `calendar-vendor-DEpV2Nr3.css`. Only those may be immutable: the hash is
  // the cache key, so a new build produces a new URL and the old entry is
  // simply never requested again. Anything else under /assets falls back to
  // ETag revalidation so it cannot go stale for a year.
  const hashedAsset = /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;
  app.use(baseUrl, express.static(staticPath, {
    index: false,
    setHeaders: (res, filePath) => {
      if (!filePath.includes(assetsDir)) return;
      if (hashedAsset.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }
    },
  }));
}

// Initialize database client
let db: DbClient;

async function initializeDb() {
  console.log(`Initializing database: ${DB_CLIENT}`);
  db = await createDbClient(DB_CLIENT, DB_URL, DB_SQLITE_FILE);
  await db.initialize();
  console.log('Database initialized successfully');
}

// API Routes
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    // Test database connection
    await db.testConnection();
    res.json({
      ok: true,
      mode: DB_CLIENT,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      ok: false,
      error: 'Database connection failed',
      mode: DB_CLIENT
    });
  }
});

// Tasks routes
app.get('/api/tasks', async (req: Request, res: Response) => {
  try {
    const userId = req.query.user_id as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
    const rawExcludeStatuses = req.query.exclude_statuses;
    const excludeStatuses: string[] | undefined = rawExcludeStatuses
      ? (Array.isArray(rawExcludeStatuses)
          ? (rawExcludeStatuses as string[])
          : (rawExcludeStatuses as string).split(','))
      : undefined;

    const rawTriageStatuses = req.query.triage_statuses;
    const triageStatuses: string[] | undefined = rawTriageStatuses
      ? (Array.isArray(rawTriageStatuses)
          ? (rawTriageStatuses as string[])
          : (rawTriageStatuses as string).split(','))
      : undefined;

    // include_subtasks defaults to true for backward-compatible REST behavior.
    const includeSubtasks = req.query.include_subtasks === undefined
      ? true
      : String(req.query.include_subtasks) === 'true' || String(req.query.include_subtasks) === '1';

    // Optional text search on title (case-insensitive contains).
    const search = typeof req.query.search === 'string' && req.query.search.trim() !== ''
      ? req.query.search.trim()
      : undefined;

    // active=true sugar: restrict to actionable triage statuses only.
    const active = String(req.query.active) === 'true' || req.query.active === '1';

    // Soft-deleted tombstones are hidden by default. The app client opts in via
    // include_deleted=true because recurrence expansion needs them to suppress
    // deleted occurrences; MCP and other consumers get the live task list.
    const includeDeleted = String(req.query.include_deleted) === 'true' || String(req.query.include_deleted) === '1';

    const pagination = (limit !== undefined || offset !== undefined)
      ? { limit, offset }
      : undefined;

    const result = await db.getTasks(userId, pagination, excludeStatuses, triageStatuses, includeSubtasks, { search, active, includeDeleted });
    res.json(result);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', async (req: Request, res: Response) => {
  try {
    const task = await db.createTask(req.body);
    broadcastTaskToYjs(task as unknown);
    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.get('/api/tasks/:id', async (req: Request, res: Response) => {
  try {
    const task = await db.getTaskById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(50).json({ error: 'Failed to fetch task' });
  }
});

app.patch('/api/tasks/:id', async (req: Request, res: Response) => {
  try {
    console.log('API: Update task request received:', {
      id: req.params.id,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    const task = await db.updateTask(req.params.id, req.body);

    if (!task) {
      console.log('API: Task not found:', req.params.id);
      return res.status(404).json({ error: 'Task not found' });
    }

    console.log('API: Task updated successfully:', task);
    broadcastTaskToYjs(task as unknown);
    res.json(task);
  } catch (error) {
    console.error('API: Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task', details: (error as Error).message });
  }
});

// POST-based alias for task updates, so MCP clients behind HTTP/1.1 proxies
// that don't forward PATCH (e.g. Caddy routing HTTP/1.1 to a uvicorn backend)
// can still update tasks via POST.
app.post('/api/tasks/:id/update', async (req: Request, res: Response) => {
  try {
    const task = await db.updateTask(req.params.id, req.body);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    broadcastTaskToYjs(task as unknown);
    res.json(task);
  } catch (error) {
    console.error('API: Error updating task (POST alias):', error);
    res.status(500).json({ error: 'Failed to update task', details: (error as Error).message });
  }
});

app.delete('/api/tasks/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteTask(req.params.id);
    broadcastTaskDeletionToYjs(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task', details: (error as Error).message });
  }
});

// POST-based alias for task deletion (same rationale as the update alias).
app.post('/api/tasks/:id/delete', async (req: Request, res: Response) => {
  try {
    await db.deleteTask(req.params.id);
    broadcastTaskDeletionToYjs(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task (POST alias):', error);
    res.status(500).json({ error: 'Failed to delete task', details: (error as Error).message });
  }
});

app.post('/api/tasks/bulk-priorities', async (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    await db.bulkUpdateTaskPriorities(items);
    res.json({ success: true });
  } catch (error) {
    console.error('Error bulk updating task priorities:', error);
    res.status(500).json({ error: 'Failed to bulk update task priorities' });
  }
});

app.post('/api/tasks/bulk-sprint-targets', async (req: Request, res: Response) => {
  try {
    const items = req.body?.items;
    const valid =
      Array.isArray(items) &&
      items.every((item: unknown) => {
        const candidate = item as { id?: unknown; sprintTarget?: unknown };
        return typeof candidate.id === 'string' && typeof candidate.sprintTarget === 'boolean';
      });
    if (!valid) {
      res.status(400).json({ error: 'items must be an array of { id, sprintTarget }' });
      return;
    }
    await db.bulkUpdateSprintTargets(items);
    for (const item of items) {
      const task = await db.getTaskById(item.id);
      if (task) broadcastTaskToYjs(task);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error bulk updating sprint targets:', error);
    res.status(500).json({ error: 'Failed to bulk update sprint targets' });
  }
});

app.post('/api/tasks/import', async (req: Request, res: Response) => {
  try {
    const tasks = req.body;
    await db.importTasks(tasks);
    res.json({ success: true });
  } catch (error) {
    console.error('Error importing tasks:', error);
    res.status(500).json({ error: 'Failed to import tasks' });
  }
});

app.post('/api/tasks/clear', async (req: Request, res: Response) => {
  try {
    await db.clearAllTasks();
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing tasks:', error);
    res.status(500).json({ error: 'Failed to clear tasks' });
  }
});

app.post('/api/tasks/init-defaults', async (req: Request, res: Response) => {
  try {
    // This endpoint will be called from the frontend if no tasks exist.
    // The actual creation of default tasks is handled by the `useTasks` hook.
    console.log('API: Initialize default tasks endpoint hit');
    res.json({ success: true, message: 'Default tasks initialization triggered' });
  } catch (error) {
    console.error('Error triggering default tasks initialization:', error);
    res.status(500).json({ error: 'Failed to trigger default tasks initialization' });
  }
});

// User settings
app.get('/api/users', async (req: Request, res: Response) => {
  try {
    const users = await db.listUsers();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/user-settings/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const settings = await db.getUserSettings(userId);
    if (settings) {
      res.json(settings);
    } else {
      res.status(404).json({ error: 'User settings not found' });
    }
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

app.post('/api/user-settings/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const settings = await db.updateUserSettings(userId, req.body);
    res.json(settings);
  } catch (error) {
    console.error('Error updating user settings:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
});

app.post('/api/users/migrate', async (req: Request, res: Response) => {
  try {
    const { oldUserId, newUserId } = req.body;
    if (!oldUserId || !newUserId) {
      return res.status(400).json({ error: 'Missing oldUserId or newUserId' });
    }
    await db.migrateUser(oldUserId, newUserId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error migrating user:', error);
    res.status(500).json({ error: 'Failed to migrate user' });
  }
});

app.delete('/api/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    await db.deleteUser(userId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.post('/api/users/clear', async (req: Request, res: Response) => {
  try {
    if (db.clearAllUsers) {
      await db.clearAllUsers();
      res.json({ success: true });
    } else {
      res.status(501).json({ error: 'Not implemented' });
    }
  } catch (error) {
    console.error('Error clearing users:', error);
    res.status(500).json({ error: 'Failed to clear users' });
  }
});

app.post('/api/admin/clear-all-data', async (req: Request, res: Response) => {
  try {
    if (db.clearAllData) {
      await db.clearAllData();
      res.json({ success: true });
    } else {
      res.status(501).json({ error: 'Not implemented' });
    }
  } catch (error) {
    console.error('Error clearing all data:', error);
    res.status(500).json({ error: 'Failed to clear all data' });
  }
});

// App settings routes
app.get('/api/settings', async (req: Request, res: Response) => {
  try {
    const settings = await db.getAppSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching app settings:', error);
    res.status(500).json({ error: 'Failed to fetch app settings' });
  }
});

app.patch('/api/settings', async (req: Request, res: Response) => {
  try {
    const settings = await db.updateAppSettings(req.body);
    res.json(settings);
  } catch (error) {
    console.error('Error updating app settings:', error);
    res.status(500).json({ error: 'Failed to update app settings' });
  }
});

// QoL survey routes
app.get('/api/qol/all', async (req: Request, res: Response) => {
  try {
    if (db.getAllQolSurveyResponses) {
      const responses = await db.getAllQolSurveyResponses();
      res.json(responses);
    } else {
      res.status(501).json({ error: 'Not implemented' });
    }
  } catch (error) {
    console.error('Error fetching all QoL survey responses:', error);
    res.status(500).json({ error: 'Failed to fetch all QoL survey responses' });
  }
});

app.get('/api/qol/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const response = await db.getQolSurveyResponse(userId);
    res.json(response);
  } catch (error) {
    console.error('Error fetching QoL survey response:', error);
    res.status(500).json({ error: 'Failed to fetch QoL survey response' });
  }
});

app.put('/api/qol/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    await db.saveQolSurveyResponse(userId, req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving QoL survey response:', error);
    res.status(500).json({ error: 'Failed to save QoL survey response' });
  }
});

// Filters routes
app.get('/api/filters', async (req: Request, res: Response) => {
  try {
    const filters = await db.getFilters();
    res.json(filters);
  } catch (error) {
    console.error('Error fetching filters:', error);
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
});

app.put('/api/filters', async (req: Request, res: Response) => {
  try {
    await db.saveFilters(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving filters:', error);
    res.status(500).json({ error: 'Failed to save filters' });
  }
});

app.delete('/api/filters', async (req: Request, res: Response) => {
  try {
    await db.clearFilters();
    res.status(204).send();
  } catch (error) {
    console.error('Error clearing filters:', error);
    res.status(500).json({ error: 'Failed to clear filters' });
  }
});

// Fertilization Board routes
app.get('/api/fertilization-board', async (req: Request, res: Response) => {
  try {
    const state = await db.getFertilizationBoardState();
    res.json(state);
  } catch (error: unknown) {
    console.error('Error fetching fertilization board state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch fertilization board state', details: message });
  }
});

app.put('/api/fertilization-board', async (req: Request, res: Response) => {
  try {
    await db.updateFertilizationBoardState(req.body);
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating fertilization board state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update fertilization board state', details: message });
  }
});

// Dream Board routes
app.get('/api/dream-board', async (req: Request, res: Response) => {
  try {
    const state = await db.getDreamBoardState();
    res.json(state);
  } catch (error: unknown) {
    console.error('Error fetching dream board state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch dream board state', details: message });
  }
});

app.put('/api/dream-board', async (req: Request, res: Response) => {
  try {
    await db.updateDreamBoardState(req.body);
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating dream board state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update dream board state', details: message });
  }
});

// Salary Board routes
app.get('/api/salary-board', async (req: Request, res: Response) => {
  try {
    const state = await db.getSalaryBoardState();
    res.json(state);
  } catch (error: unknown) {
    console.error('Error fetching salary board state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch salary board state', details: message });
  }
});

app.put('/api/salary-board', async (req: Request, res: Response) => {
  try {
    await db.updateSalaryBoardState(req.body);
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating salary board state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update salary board state', details: message });
  }
});

// Sprint ceremony routes
app.get('/api/sprint-state', async (_req: Request, res: Response) => {
  try {
    const state = await db.getSprintState();
    res.json(state);
  } catch (error: unknown) {
    console.error('Error fetching sprint state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch sprint state', details: message });
  }
});

const sprintStateBodySchema = z
  .object({
    activeSprintId: z.string().nullable(),
    draftSprintId: z.string().nullable(),
    sprints: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          goal: z.string(),
          status: z.enum(['draft', 'active', 'closed']),
          scope: z.array(z.unknown()),
          startDate: z.string(),
          endDate: z.string(),
          capacity: z
            .object({
              theoreticalPoints: z.number(),
              practicePct: z.number(),
              eftCount: z.number(),
              workingDays: z.number(),
              impediments: z.array(z.unknown()),
            })
            .passthrough(),
          metrics: z
            .object({
              committedPoints: z.number(),
              scopeDonePoints: z.number(),
              openPoints: z.number(),
              carriedPoints: z.number(),
              unplannedDonePoints: z.number(),
              achievedPoints: z.number(),
              lastTheoreticalPoints: z.number(),
              errorPct: z.number(),
              velocity: z.number(),
              completionPct: z.number(),
              remainingToTarget: z.number(),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

app.put('/api/sprint-state', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const force = body.force === true;
    const baseUpdatedAt = typeof body.baseUpdatedAt === 'string' ? body.baseUpdatedAt : undefined;
    const stateBody = { ...body };
    delete stateBody.force;
    delete stateBody.baseUpdatedAt;

    const parsed = sprintStateBodySchema.safeParse(stateBody);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid sprint state', details: parsed.error.flatten() });
      return;
    }
    const incoming = parsed.data as unknown as SprintStateEntity;

    await withSprintStateLock(async () => {
      const current = await db.getSprintState();
      if (current && !force) {
        if (current.updatedAt && baseUpdatedAt !== current.updatedAt) {
          res.status(409).json({ error: 'Sprint state changed since it was loaded' });
          return;
        }

        const currentIds = new Set(current.sprints.map((sprint) => sprint.id));
        const incomingById = new Map(incoming.sprints.map((sprint) => [sprint.id, sprint]));

        // Never let a stale client erase a sprint the scheduler just created.
        const missing = current.sprints.find((sprint) => !incomingById.has(sprint.id));
        if (missing) {
          res.status(409).json({ error: `Sprint ${missing.id} is missing from the incoming state` });
          return;
        }

        for (const sprint of incoming.sprints) {
          if (!currentIds.has(sprint.id) && sprint.status !== 'draft') {
            res.status(409).json({ error: `Sprint ${sprint.id} must be created as a draft` });
            return;
          }
        }

        for (const stored of current.sprints) {
          const next = incomingById.get(stored.id);
          if (!next) continue;
          if (next.status !== stored.status) {
            res.status(409).json({
              error: `Sprint ${stored.id} status can only change through the start/close endpoints`,
            });
            return;
          }
        }

        const activeSprints = incoming.sprints.filter((sprint) => sprint.status === 'active');
        if (activeSprints.length > 1) {
          res.status(409).json({ error: 'Only one sprint can be active at a time' });
          return;
        }
        if (incoming.activeSprintId && activeSprints[0]?.id !== incoming.activeSprintId) {
          res.status(409).json({ error: 'activeSprintId must reference the active sprint' });
          return;
        }
        if (!incoming.activeSprintId && activeSprints.length > 0) {
          res.status(409).json({ error: 'An active sprint must be referenced by activeSprintId' });
          return;
        }
        if (incoming.draftSprintId) {
          const draft = incoming.sprints.find((sprint) => sprint.id === incoming.draftSprintId);
          if (!draft || draft.status !== 'draft') {
            res.status(409).json({ error: 'draftSprintId must reference a draft sprint' });
            return;
          }
        }
      }

      await db.updateSprintState(incoming);
      res.json({ success: true });
    });
  } catch (error: unknown) {
    console.error('Error updating sprint state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update sprint state', details: message });
  }
});

app.post('/api/sprint-state/close', async (req: Request, res: Response) => {
  try {
    await withSprintStateLock(async () => {
      const state: SprintStateEntity = (await db.getSprintState()) ?? createEmptySprintState();
      const { sprintId, outcomes = {} } = req.body as {
        sprintId?: string;
        outcomes?: Record<string, 'done' | 'carried' | 'backlog' | 'dropped'>;
      };
      const sprint = state.sprints.find((candidate) => candidate.id === sprintId);
      if (!sprint) {
        res.status(404).json({ error: 'Sprint not found' });
        return;
      }
      if (sprint.status !== 'active') {
        res.status(409).json({ error: 'Only an active sprint can be closed' });
        return;
      }
      const entities = (await db.getTasks()).data;
      const tasks = toSprintTasks(entities);
      const appSettings = await db.getAppSettings();
      const timeZone = appSettings?.timezone ?? 'Europe/Zurich';
      const closed = applyClose(
        sprint,
        tasks,
        outcomes,
        previousClosedTargetPoints(state, sprint),
        'manual',
        new Date().toISOString(),
        timeZone,
      );
      const next: SprintStateEntity = {
        ...state,
        sprints: state.sprints.map((candidate) => (candidate.id === sprint.id ? closed : candidate)),
        activeSprintId: state.activeSprintId === sprint.id ? null : state.activeSprintId,
        updatedAt: new Date().toISOString(),
      };
      const byId = new Map(entities.map((entity) => [entity.id, entity]));
      const updates = closed.scope
        .map((item) => ({
          id: item.taskId,
          sprintTarget: item.outcome === 'carried',
        }))
        .filter((update) => Boolean(byId.get(update.id)?.sprintTarget) !== update.sprintTarget);
      if (updates.length > 0) {
        await db.bulkUpdateSprintTargets(updates);
        for (const update of updates) {
          const entity = byId.get(update.id);
          if (entity) broadcastTaskToYjs({ ...entity, sprintTarget: update.sprintTarget });
        }
      }
      await db.updateSprintState(next);
      res.json(next);
    });
  } catch (error: unknown) {
    console.error('Error closing sprint:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to close sprint', details: message });
  }
});

app.get('/api/sprint-wellbeing/:sprintId', async (req: Request, res: Response) => {
  try {
    const { sprintId } = req.params;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    const state = await db.getSprintState();
    if (!state?.sprints.some((sprint) => sprint.id === sprintId)) {
      res.status(404).json({ error: 'Sprint not found' });
      return;
    }
    const answers = await db.getSprintWellbeing(sprintId);
    const answered = answers.some((entry) => entry.userId === userId);
    res.json({
      answered,
      // Small samples stay hidden so nobody can derive an individual score.
      aggregate: buildWellbeingAggregate(answers.map((entry) => entry.answers)),
    });
  } catch (error: unknown) {
    console.error('Error reading sprint well-being:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to read sprint well-being', details: message });
  }
});

app.post('/api/sprint-wellbeing/:sprintId', async (req: Request, res: Response) => {
  try {
    const { sprintId } = req.params;
    const { userId, answers } = req.body as { userId?: string; answers?: unknown };
    const resolvedUserId = typeof userId === 'string' ? userId : '';
    const valid =
      Boolean(resolvedUserId) &&
      Array.isArray(answers) &&
      answers.length === WHO5_QUESTIONS.length &&
      answers.every((value) => Number.isInteger(value) && value >= 0 && value <= 5);
    if (!valid) {
      res.status(400).json({ error: 'A userId and five integer answers between 0 and 5 are required' });
      return;
    }
    const state = await db.getSprintState();
    if (!state?.sprints.some((sprint) => sprint.id === sprintId)) {
      res.status(404).json({ error: 'Sprint not found' });
      return;
    }
    await db.submitSprintWellbeing(sprintId, resolvedUserId, answers as number[]);
    const stored = await db.getSprintWellbeing(sprintId);
    res.json({
      answered: true,
      aggregate: buildWellbeingAggregate(stored.map((entry) => entry.answers)),
    });
  } catch (error: unknown) {
    console.error('Error submitting sprint well-being:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to submit sprint well-being', details: message });
  }
});

app.post('/api/sprint-state/start', async (req: Request, res: Response) => {
  try {
    await withSprintStateLock(async () => {
      const state: SprintStateEntity = (await db.getSprintState()) ?? createEmptySprintState();
      const { sprintId, taskIds } = req.body as { sprintId?: string; taskIds?: string[] };
      const sprint = state.sprints.find((candidate) => candidate.id === sprintId);
      if (!sprint) {
        res.status(404).json({ error: 'Sprint not found' });
        return;
      }
      if (sprint.status !== 'draft') {
        res.status(409).json({ error: 'Only a draft sprint can be started' });
        return;
      }
      if (state.activeSprintId && state.activeSprintId !== sprint.id) {
        res.status(409).json({ error: 'Another sprint is already active' });
        return;
      }
      const entities = (await db.getTasks()).data;
      const tasks = toSprintTasks(entities);
      const sprintTasksById = new Map(tasks.map((task) => [task.id, task]));
      const candidateIds = (taskIds ?? sprint.scope.map((item) => item.taskId)).filter(
        (taskId) => !isTerminalTask(sprintTasksById.get(taskId)),
      );
      const scope = buildScopeSnapshot(candidateIds, tasks);
      const appSettings = await db.getAppSettings();
      const timeZone = appSettings?.timezone ?? 'Europe/Zurich';
      const started = startSprint(
        sprint,
        scope,
        tasks,
        previousClosedTargetPoints(state, sprint),
        new Date().toISOString(),
        timeZone,
      );
      const next: SprintStateEntity = {
        ...state,
        sprints: state.sprints.map((candidate) => (candidate.id === sprint.id ? started : candidate)),
        activeSprintId: started.id,
        draftSprintId: null,
        updatedAt: new Date().toISOString(),
      };
      const scopeIds = new Set(scope.map((item) => item.taskId));
      const updates = entities
        .filter((entity) => Boolean(entity.sprintTarget) !== scopeIds.has(entity.id))
        .map((entity) => ({ id: entity.id, sprintTarget: scopeIds.has(entity.id) }));
      if (updates.length > 0) {
        await db.bulkUpdateSprintTargets(updates);
        const byId = new Map(entities.map((entity) => [entity.id, entity]));
        for (const update of updates) {
          const entity = byId.get(update.id);
          if (entity) broadcastTaskToYjs({ ...entity, sprintTarget: update.sprintTarget });
        }
      }
      await db.updateSprintState(next);
      res.json(next);
    });
  } catch (error: unknown) {
    console.error('Error starting sprint:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to start sprint', details: message });
  }
});

// Circles routes (EasyCIRCLE)
app.get('/api/circles', async (req: Request, res: Response) => {
  try {
    const circles = await db.getCircles();
    res.json(circles);
  } catch (error: unknown) {
    console.error('Error fetching circles:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch circles', details: message });
  }
});

app.post('/api/circles', async (req: Request, res: Response) => {
  try {
    const circle = await db.createCircle(req.body);
    res.status(201).json(circle);
  } catch (error: unknown) {
    console.error('Error creating circle:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to create circle', details: message });
  }
});

app.get('/api/circles/:id', async (req: Request, res: Response) => {
  try {
    const circle = await db.getCircleById(req.params.id);
    if (!circle) {
      return res.status(404).json({ error: 'Circle not found' });
    }
    res.json(circle);
  } catch (error: unknown) {
    console.error('Error fetching circle:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch circle', details: message });
  }
});

app.patch('/api/circles/:id', async (req: Request, res: Response) => {
  try {
    const circle = await db.updateCircle(req.params.id, req.body);
    if (!circle) {
      return res.status(404).json({ error: 'Circle not found' });
    }
    res.json(circle);
  } catch (error: unknown) {
    console.error('Error updating circle:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update circle', details: message });
  }
});

app.delete('/api/circles/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteCircle(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting circle:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete circle', details: message });
  }
});

app.post('/api/circles/clear', async (req: Request, res: Response) => {
  try {
    await db.clearAllCircles();
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error clearing circles:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to clear circles', details: message });
  }
});

app.post('/api/circles/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const circles = req.body;
    if (!Array.isArray(circles)) {
      return res.status(400).json({ error: 'Expected an array of circles' });
    }
    await db.importCircles(circles);
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error('Failed to import circles:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import circles', details: message });
  }
});

// Frameworks routes
app.get('/api/frameworks', async (req: Request, res: Response) => {
  try {
    const frameworkType = req.query.frameworkType as string | undefined;
    const frameworks = await db.getFrameworks(frameworkType);
    res.json(frameworks);
  } catch (error: unknown) {
    console.error('Error fetching frameworks:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch frameworks', details: message });
  }
});

app.post('/api/frameworks', async (req: Request, res: Response) => {
  try {
    const framework = await db.createFramework(req.body);
    res.status(201).json(framework);
  } catch (error: unknown) {
    console.error('Error creating framework:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to create framework', details: message });
  }
});

app.get('/api/frameworks/:id', async (req: Request, res: Response) => {
  try {
    const framework = await db.getFrameworkById(req.params.id);
    if (!framework) {
      return res.status(404).json({ error: 'Framework not found' });
    }
    res.json(framework);
  } catch (error: unknown) {
    console.error('Error fetching framework:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch framework', details: message });
  }
});

app.patch('/api/frameworks/:id', async (req: Request, res: Response) => {
  try {
    const framework = await db.updateFramework(req.params.id, req.body);
    if (!framework) {
      return res.status(404).json({ error: 'Framework not found' });
    }
    res.json(framework);
  } catch (error: unknown) {
    console.error('Error updating framework:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update framework', details: message });
  }
});

app.delete('/api/frameworks/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteFramework(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting framework:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete framework', details: message });
  }
});

app.post('/api/frameworks/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const frameworks = req.body;
    if (!Array.isArray(frameworks)) {
      return res.status(400).json({ error: 'Expected an array of frameworks' });
    }
    await db.importFrameworks(frameworks);
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error('Failed to import frameworks:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import frameworks', details: message });
  }
});

// Votes routes
app.get('/api/votes', async (req: Request, res: Response) => {
  try {
    const opts: { linkedTaskId?: string; ownerId?: string; kind?: VoteKind } = {};
    if (req.query.linkedTaskId) opts.linkedTaskId = req.query.linkedTaskId as string;
    if (req.query.ownerId) opts.ownerId = req.query.ownerId as string;
    if (req.query.kind) opts.kind = req.query.kind as VoteKind;
    const votes = await db.getVotes(opts);
    res.json(votes);
  } catch (error: unknown) {
    console.error('Error fetching votes:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch votes', details: message });
  }
});

app.post('/api/votes', async (req: Request, res: Response) => {
  try {
    const createConfig: Record<string, unknown> | null =
      req.body?.config && typeof req.body.config === 'object'
        ? (req.body.config as Record<string, unknown>)
        : null;
    if (createConfig && 'mode' in createConfig && !isVoteMode(createConfig.mode)) {
      return res.status(400).json({ error: 'Invalid vote mode' });
    }
    if (createConfig?.mode === 'POKER_PLANNING') {
      // Creation starts an unarmed, unrevealed round: the reveal is server-owned
      // and a caller must not be able to seed a round that is already visible (or
      // permanently closed to new estimates).
      createConfig.showResultsBeforeClose = false;
      createConfig.poker = clearedPokerRound(
        createConfig.poker as Partial<PokerConfig> | null,
        0,
      );
    } else if (createConfig) {
      createConfig.poker = undefined;
    }
    if (createConfig?.mode === 'POINTS') {
      // A POINTS vote's spending variation is server-normalised: built-in
      // presets are canonical, custom notes are sanitized, and the effective
      // total is pinned on `maxPointsPerUser` so every reader sees the same
      // budget. Reject a malformed block instead of silently falling back.
      const resolved = resolveBudgetConfig({
        requestedBudget: createConfig.budget,
        budgetProvided: 'budget' in createConfig,
        requestedMaxPointsPerUser: createConfig.maxPointsPerUser,
        maxProvided: 'maxPointsPerUser' in createConfig,
      });
      if (resolved.error) {
        return res.status(400).json({ error: resolved.error });
      }
      applyResolvedBudgetConfig(createConfig, resolved);
    } else if (createConfig) {
      clearBudgetConfig(createConfig);
    }
    if (req.body?.config?.mode === 'SCHEDULING') {
      const schedulingError = validateSchedulingConfig(
        req.body.config.scheduling,
        req.body.proposals,
      );
      if (schedulingError) {
        return res.status(400).json({ error: schedulingError });
      }
      // A create request has no separate open transition to validate the frozen
      // slot set (the PUT route checks the effective slots when a stored vote
      // leaves IDLE). If a caller creates the vote already out of draft without
      // proposals, `validateSchedulingConfig` above skips the per-slot checks and
      // the poll is stored open with no answerable time: the open freeze then
      // rejects every later attempt to add slots and finalize can never find a
      // run. Require the slots up front in that case.
      const requestedPhase = req.body.config.phase;
      if (
        requestedPhase !== undefined &&
        requestedPhase !== 'IDLE' &&
        req.body.proposals === undefined
      ) {
        return res.status(400).json({
          error: 'A scheduling vote created outside the draft phase requires its time slots',
        });
      }
    }
    const vote = await db.createVote(req.body);
    trackPokerValueVisibility(vote);
    res.status(201).json(vote);
  } catch (error: unknown) {
    console.error('Error creating vote:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to create vote', details: message });
  }
});

app.get('/api/votes/:idOrSlug', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    let vote = await db.getVoteById(idOrSlug);
    if (!vote) {
      vote = await db.getVoteBySlug(idOrSlug);
    }
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    res.json(vote);
  } catch (error: unknown) {
    console.error('Error fetching vote:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch vote', details: message });
  }
});

app.put('/api/votes/:id', async (req: Request, res: Response) => {
  try {
    const existing = await db.getVoteById(req.params.id);
    // `updateVote` shallow-merges `config`, so a partial update inherits the
    // stored scheduling block and proposal list. Resolve them once: the
    // "mode is SCHEDULING" check and the "open transition" check below must
    // validate the exact same effective values, or a change applied to one
    // leaves the other accepting a slot set the first rejects. An explicit
    // `scheduling: null` is still honoured as a drop.
    const requestedConfig: Record<string, unknown> =
      req.body?.config && typeof req.body.config === 'object'
        ? (req.body.config as Record<string, unknown>)
        : {};
    // `config` is shallow-merged and persisted as sent. Reject a present but
    // unknown mode (notably `null`): `??` below would keep the stored mode for
    // the guard checks while `null` is written to the row, silently disabling
    // every mode-keyed rule including the poker blind reveal.
    if ('mode' in requestedConfig && !isVoteMode(requestedConfig.mode)) {
      return res.status(400).json({ error: 'Invalid vote mode' });
    }
    const effectiveScheduling = (
      'scheduling' in requestedConfig
        ? requestedConfig.scheduling
        : existing?.config.scheduling
    ) as Parameters<typeof validateSchedulingConfig>[0];
    const effectiveProposals = req.body?.proposals ?? existing?.proposals;
    if (req.body?.config?.mode === 'SCHEDULING') {
      const schedulingError = validateSchedulingConfig(
        effectiveScheduling,
        effectiveProposals,
      );
      if (schedulingError) {
        return res.status(400).json({ error: schedulingError });
      }
    }
    if (existing) {
      // `updateVote` shallow-merges `config`, so the effective values are the
      // requested ones when present and the stored ones otherwise.
      const effectiveMode = requestedConfig.mode ?? existing.config.mode;
      const effectivePhase = requestedConfig.phase ?? existing.config.phase;
      // A mode switch while the vote is out of draft reinterprets every stored
      // response under the new mode's semantics: a thumbs-up/down value becomes
      // schedule availability, or availability rows become ordinary votes. The
      // editor already disables the mode picker once a vote has started; enforce
      // the same rule server-side so the API cannot leave the vote uneditable.
      if (
        effectiveMode !== existing.config.mode &&
        existing.config.phase !== 'IDLE'
      ) {
        return res.status(400).json({
          error: 'Vote mode is locked once the vote is open',
        });
      }
      // A live poker round's phase and mode are server-owned. The mode lock
      // above only applies while the vote is not a draft, so rewinding the
      // phase to IDLE would re-enable the switch — and a mode change stops
      // `pokerValuesAreHidden` recognising the round, exposing every unrevealed
      // estimate. The dedicated reset route is the only way to reopen a round.
      if (
        existing.config.mode === 'POKER_PLANNING' &&
        existing.config.phase !== 'IDLE' &&
        effectivePhase === 'IDLE'
      ) {
        return res.status(400).json({
          error: 'A poker round cannot be rewound to the draft phase',
        });
      }
      // A POINTS vote's spending variation changes what every stored value
      // means. Rewinding to IDLE would re-enable a budget change on a vote that
      // already has responses, so use the dedicated reset route (which clears
      // them) instead of a two-step phase rewind.
      if (
        existing.config.mode === 'POINTS' &&
        existing.config.phase !== 'IDLE' &&
        effectivePhase === 'IDLE'
      ) {
        return res.status(400).json({
          error: 'A points vote cannot be rewound to the draft phase',
        });
      }
      // A round whose state predates the guard above (or was restored from a
      // backup) must still not be reinterpreted as another mode. Round markers
      // are server-owned; persisted estimates prove the round collected votes
      // even when it was already rewound to IDLE without a marker.
      if (
        existing.config.mode === 'POKER_PLANNING' &&
        effectiveMode !== 'POKER_PLANNING' &&
        existing.config.phase === 'IDLE'
      ) {
        const storedPoker = normalizePokerConfig(existing.config.poker);
        const hasRoundState = Boolean(
          storedPoker.round > 0 ||
            storedPoker.armedAt ||
            storedPoker.revealAt ||
            storedPoker.revealedAt,
        );
        const hasEstimates =
          !hasRoundState && (await db.getVoteResponses(existing.id)).length > 0;
        if (hasRoundState || hasEstimates) {
          return res.status(400).json({
            error: 'Vote mode is locked once a poker round has started',
          });
        }
      }
      if (effectiveMode === 'POKER_PLANNING') {
        // A poker round is blind until the server-owned reveal. The editor hides
        // this toggle for the mode, and the projection ignores the flag anyway,
        // but never persist it: a later mode-independent read should not inherit
        // a setting that means "publish every unrevealed estimate".
        requestedConfig.showResultsBeforeClose = false;
        if (existing.config.mode !== 'POKER_PLANNING') {
          // Switching into the mode (or saving a draft that was never poker)
          // starts a fresh round. Only the deck choice is caller-owned: seeding
          // `revealedAt`/`revealAt`/`armedAt`/`round` here would create an
          // already-revealed round that hides nothing and rejects every estimate.
          const requestedScale = normalizePokerConfig(
            'poker' in requestedConfig
              ? (requestedConfig.poker as Partial<PokerConfig> | null)
              : existing.config.poker,
          ).scale;
          requestedConfig.poker = clearedPokerRound({ scale: requestedScale }, 0);
        } else if ('poker' in requestedConfig) {
          const requestedPoker = requestedConfig.poker;
          const requestedScale = normalizePokerConfig(
            requestedPoker as Partial<PokerConfig> | null,
          ).scale;
          const existingScale = normalizePokerConfig(existing.config.poker).scale;
          if (
            requestedPoker == null ||
            typeof requestedPoker !== 'object' ||
            (existing.config.phase !== 'IDLE' && requestedScale !== existingScale)
          ) {
            return res.status(400).json({
              error: 'Poker deck is locked once the vote is open',
            });
          }
          // The round/reveal state is always server-owned. A draft save may pick
          // the deck, but no caller of this unauthenticated route may set
          // `revealedAt`, `revealAt`, `armedAt` or rewind `round` — either
          // directly or by first rewinding the phase to IDLE, which would let any
          // holder of the public link unblind a live round.
          requestedConfig.poker = {
            ...existing.config.poker,
            ...(existing.config.phase === 'IDLE' ? { scale: requestedScale } : {}),
          };
        }
      } else {
        // A non-poker vote has no round state. Clearing the block on every save
        // (not only when the caller sent one) removes a deck left behind by a
        // mode switch, so `pokerValuesAreHidden` can treat any persisted deck as
        // a real round without mistaking a former poker draft for a blind vote.
        requestedConfig.poker = undefined;
      }
      if (effectiveMode === 'POINTS') {
        const requestedBudgetProvided = 'budget' in requestedConfig;
        const requestedMaxProvided = 'maxPointsPerUser' in requestedConfig;
        const resolved = resolveBudgetConfig({
          requestedBudget: requestedConfig.budget,
          budgetProvided: requestedBudgetProvided,
          requestedMaxPointsPerUser: requestedConfig.maxPointsPerUser,
          maxProvided: requestedMaxProvided,
          fallbackBudget: existing.config.budget,
          fallbackMaxPointsPerUser: existing.config.maxPointsPerUser,
        });
        if (resolved.error) {
          return res.status(400).json({ error: resolved.error });
        }
        const effectiveBudget = resolved.budget;
        const effectiveMax = resolved.maxPointsPerUser;
        // The spending variation changes what a stored value means, so freeze
        // it once the vote leaves draft just like the scheduling slot set and
        // the poker deck.
        if (existing.config.phase !== 'IDLE') {
          const budgetChanged =
            requestedBudgetProvided &&
            JSON.stringify(effectiveBudget) !==
              JSON.stringify(normalizeBudgetConfig(existing.config.budget));
          const maxChanged =
            requestedMaxProvided &&
            effectiveMax !== budgetTotal(existing.config);
          const allowMultipleChanged =
            'allowMultiple' in requestedConfig &&
            // Absent and explicit `false` are the same behaviour: older votes
            // (and linked-vote creation) may not store the key at all, so a raw
            // comparison would lock every save of an already-started vote.
            (requestedConfig.allowMultiple ?? false) !==
              (existing.config.allowMultiple ?? false);
          if (budgetChanged || maxChanged || allowMultipleChanged) {
            return res.status(400).json({
              error: 'Budget settings are locked once the vote is open',
            });
          }
        }
        applyResolvedBudgetConfig(requestedConfig, resolved);
      } else {
        // Leaving POINTS (or saving another mode over a former draft) must not
        // leave a budget block behind that a later mode-independent read would
        // mistake for a real points vote.
        clearBudgetConfig(requestedConfig);
      }
      // Opening a scheduling poll freezes its slot set, so validate the set that
      // will actually be stored: a pruned grid (or a dropped config) can never
      // produce a candidate time once the poll can no longer be edited. Also
      // covers switching a draft into SCHEDULING and opening it in one request,
      // which would otherwise store an open poll whose slots were never checked.
      if (
        effectiveMode === 'SCHEDULING' &&
        effectivePhase !== 'IDLE' &&
        (existing.config.mode !== 'SCHEDULING' ||
          existing.config.phase === 'IDLE')
      ) {
        const openError = validateSchedulingConfig(
          effectiveScheduling,
          effectiveProposals,
        );
        if (openError) {
          return res.status(400).json({ error: openError });
        }
      }
    }
    if (existing?.config.mode === 'SCHEDULING' && existing.config.phase !== 'IDLE') {
      // Availability is only comparable while every voter sees the same slots.
      // Freeze the slot set and its config as soon as the poll leaves draft.
      const normalizeSlots = (proposals: VoteEntity['proposals'] | undefined) =>
        activeSchedulingSlots(proposals ?? [])
          .map((proposal) => ({
            id: proposal.id,
            startAt: proposal.timeSlot?.startAt ?? '',
            endAt: proposal.timeSlot?.endAt ?? '',
          }))
          .sort(
            (a, b) =>
              a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id),
          );
      const proposalsChanged =
        req.body?.proposals !== undefined &&
        JSON.stringify(normalizeSlots(req.body.proposals)) !==
          JSON.stringify(normalizeSlots(existing.proposals));
      const schedulingChanged =
        req.body?.config?.scheduling !== undefined &&
        JSON.stringify(
          normalizeSchedulingConfig(req.body.config.scheduling),
        ) !== JSON.stringify(normalizeSchedulingConfig(existing.config.scheduling));
      // Shallow-merge means `config.scheduling: null` would erase the stored
      // slots while the mode stays SCHEDULING; normalize(null) equals the
      // defaults, so the value comparison above can miss it. Reject explicitly.
      // (A mode change is already rejected above for every open vote.)
      const schedulingDropped =
        typeof req.body?.config === 'object' &&
        req.body.config !== null &&
        'scheduling' in req.body.config &&
        req.body.config.scheduling === null;
      if (proposalsChanged || schedulingChanged || schedulingDropped) {
        return res.status(400).json({
          error: 'Scheduling slots and mode are locked once the vote is open',
        });
      }
    }
    let vote = await db.updateVote(req.params.id, req.body);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    // Closing the vote during the arming window must tear the reveal down, not
    // leave a persisted deadline the reveal timer can never honour.
    vote = await settlePokerRevealForPhase(vote);
    // A save can clear the poker deck (mode switch) or start a new round; the
    // shared-document blind-reveal rule must follow the persisted state.
    trackPokerValueVisibility(vote);
    // Turning anonymity on must also scrub identities captured while the vote
    // was non-anonymous. The decision is state-based, not transition-based, and
    // runs only after the anonymity change is persisted, so a failed update can
    // never irreversibly destroy identities while the vote stays non-anonymous.
    // Deriving it from the stored state means a failed scrub (or a crash between
    // the two statements) is repaired by the next save instead of never running
    // again, and the existence check keeps the table-wide scrub off the
    // per-keystroke save path because it is false once identities are gone.
    if (
      isVoteAnonymous(vote.config) &&
      (await db.hasVoteRankingSubmissionIdentities(vote.id))
    ) {
      try {
        await db.scrubVoteRankingSubmissionIdentities(vote.id);
      } catch (error: unknown) {
        console.error('Error scrubbing vote ranking identities:', error);
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({
          error: 'Vote was updated but ballot identities could not be scrubbed',
          details: message,
        });
      }
    }
    res.json(vote);
  } catch (error: unknown) {
    console.error('Error updating vote:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update vote', details: message });
  }
});

app.post('/api/votes/:id/finalize', async (req: Request, res: Response) => {
  try {
    const vote = await db.getVoteById(req.params.id);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    if (vote.config.kind !== 'decision') {
      return res.status(400).json({ error: 'Only decision votes can be finalized' });
    }

    let outcome = req.body;
    if (vote.config.mode === 'COMPARATIVE_PRIORITIZATION') {
      // Finalizing requires naming the ranking's winner, but a hidden vote's
      // results are not readable yet, so the moderator could not know it. The
      // only way out of that dead end is to close the vote (results become
      // visible) or to have opted into showing results before close.
      if (!areRankingResultsVisible(vote)) {
        return res.status(400).json({
          error: 'Close the vote before finalizing so the ranking winner is available',
        });
      }
      const submissions = await db.getVoteRankingSubmittedBallots(vote.id);
      const ranking = getVoteRankingResult(vote, submissions);
      if (!ranking || ranking.groups.length === 0) {
        return res.status(400).json({ error: 'No submitted ballots to finalize' });
      }
      const topGroup = ranking.groups[0].proposalIds;
      const allowTies = voteAllowsTies(vote.config);
      const requestedWinner = typeof req.body?.winningProposalId === 'string'
        ? req.body.winningProposalId
        : null;

      const resolution = resolveFinalizedWinner(topGroup, allowTies, requestedWinner);
      if (resolution.error) {
        return res.status(400).json({
          error: resolution.error === 'tied-requires-tie'
            ? 'Top group is tied; finalize as a tie or disable allowTies'
            : 'Top group is tied; select one proposal from the top group',
        });
      }
      // The client writes `summary` from its own selection, so persisting a
      // server-derived winner that differs from that selection would store an
      // outcome whose text contradicts `winningProposalId`. Require the
      // moderator to confirm the ranking's winner instead of silently
      // overriding the request (the dialog defaults to "tie").
      if (resolution.winningProposalId !== requestedWinner) {
        return res.status(400).json({
          error: requestedWinner === null
            ? 'The ranking has a winner; select it in the finalize dialog'
            : 'The selected proposal is not the ranking winner',
        });
      }
      const winningProposalId = resolution.winningProposalId;

      outcome = {
        ...req.body,
        winningProposalId,
        ranking,
        finalizedAt: req.body?.finalizedAt || new Date().toISOString(),
        finalizedByUserId: req.body?.finalizedByUserId || vote.ownerId,
      };
    }

    if (vote.config.mode === 'SCHEDULING') {
      const requestedWinner = typeof req.body?.winningProposalId === 'string'
        ? req.body.winningProposalId
        : null;
      const activeSlotIds = new Set(
        activeSchedulingSlots(vote.proposals).map((proposal) => proposal.id),
      );
      // A scheduling decision with no availability is not a decision. The
      // dialog's best-run default would otherwise record the earliest slot even
      // though nobody answered, so reject it server-side too instead of
      // trusting the client's guard.
      const responses = await db.getVoteResponses(vote.id);
      const hasBallot = responses.some(
        (response) =>
          response.proposalId !== null && activeSlotIds.has(response.proposalId),
      );
      if (!hasBallot) {
        return res.status(400).json({ error: 'No submitted availability to finalize' });
      }
      if (!requestedWinner || !activeSlotIds.has(requestedWinner)) {
        return res.status(400).json({
          error: "Select one of the scheduling vote's active time slots to finalize",
        });
      }
      // Every participant answering "unavailable" still leaves runs in the
      // tally, but none of them is a time anyone can attend. The results view
      // reports "no common time" for that data, so the stored outcome must not
      // announce one. A run is finalizable only with an available or
      // "if needed" answer, matching the dialog's candidate list.
      const tally = tallyScheduling(
        responses,
        vote.proposals,
        normalizeSchedulingConfig(vote.config.scheduling),
      );
      // Pick the run the moderator actually chose. The dialog names the run's
      // first slot, so an exact start match must win: several runs overlap, and
      // a ranking-order `includes` lookup can resolve that start to an earlier
      // window, storing a winner that contradicts the confirmed summary. Fall
      // back to `includes` only for a client that names a middle slot.
      const chosenRun =
        tally.runs.find((run) => run.slotIds[0] === requestedWinner) ??
        tally.runs.find((run) => run.slotIds.includes(requestedWinner));
      if (!chosenRun || !schedulingRunHasAvailability(chosenRun)) {
        return res.status(400).json({
          error: 'The selected time has no availability; there is no common time to finalize',
        });
      }
      // Canonicalize to the run's first slot so a client that names a middle
      // slot still stores the start of the chosen window.
      outcome = { ...req.body, winningProposalId: chosenRun.slotIds[0] };
    }

    let finalized = await db.finalizeVote(req.params.id, outcome);
    // Finalizing directly from OPEN (a decision vote may) can land inside the
    // arming window; the same teardown applies so the round is not left armed.
    if (finalized) {
      finalized = await settlePokerRevealForPhase(finalized);
    }
    res.json(finalized);
  } catch (error: unknown) {
    console.error('Error finalizing vote:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to finalize vote', details: message });
  }
});

app.delete('/api/votes/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteVote(req.params.id);
    teardownVoteLiveState(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting vote:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete vote', details: message });
  }
});

app.post('/api/votes/:id/reset', async (req: Request, res: Response) => {
  try {
    const existing = await db.getVoteById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Vote not found' });
      return;
    }
    // A poker reset must clear the persisted reveal state with the responses it
    // described, in the same transaction: otherwise reopening the vote keeps
    // `revealedAt`, rejects every new estimate, and has no responses left to
    // form a next round from.
    const reset =
      existing.config.mode === 'POKER_PLANNING'
        ? await db.resetVoteWithConfig(existing.id, {
            phase: 'IDLE',
            poker: clearedPokerRound(existing.config.poker, 0),
          })
        : await db.resetVote(existing.id);
    if (!reset) {
      res.status(404).json({ error: 'Vote not found' });
      return;
    }
    teardownVoteLiveState(reset.id);
    if (reset.config.mode === 'POKER_PLANNING') {
      broadcastVoteToYjs(reset);
    }
    if (reset.config.mode === 'COMPARATIVE_PRIORITIZATION') {
      scheduleRankingLiveBroadcast(reset, { resultsChanged: true });
    }
    res.json(reset);
  } catch (error: unknown) {
    console.error('Error resetting vote:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to reset vote', details: message });
  }
});

async function findVoteByIdOrSlug(idOrSlug: string) {
  return (await db.getVoteById(idOrSlug)) || (await db.getVoteBySlug(idOrSlug));
}

function requestToken(req: Request, header: string): string | undefined {
  // Bearer credentials travel only in a custom header: a query string is
  // recorded by proxies, access logs and browser history, so it is never
  // accepted as a credential source.
  return req.get(header) || undefined;
}

/**
 * A `moderatorToken` is the only real secret in this codebase. `ownerId` is
 * returned by the public vote endpoint and is not authentication, so live
 * participation data (draft progress, last-seen, editing state) must require a
 * moderator session. `ownerId` is therefore never honoured here: a public
 * caller (the backup read included) only receives submitted ballots, and only
 * once results are visible. Submitted-ballot backups must still be possible for
 * votes that have no moderator yet, which is why the visibility rule rather
 * than a credential unlocks the public read for locked votes.
 */
async function canModerateVote(req: Request, vote: { id: string }): Promise<boolean> {
  const moderatorToken = requestToken(req, 'x-moderator-token');
  if (!moderatorToken) return false;
  // Verify without stamping `lastSeenAt`: this capability check runs for every
  // live results/participation poll, including the in-app owner view that
  // reuses the vote's active moderator link. Only opening the moderation page
  // itself should count as the link being "used".
  const resolved = await db.verifyVoteModeratorToken(moderatorToken);
  return Boolean(resolved && resolved.vote.id === vote.id);
}

const POKER_REVEAL_DELAY_MS = 5000;
const pokerRevealTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pokerRevealInFlight = new Set<string>();

function broadcastVoteToYjs(vote: VoteEntity): void {
  // Keep the persisted blind-reveal state in step with the projection before any
  // client can react to it. The scrub uses this, not the client-visible vote.
  trackPokerValueVisibility(vote);
  try {
    const doc = getYDoc(YJS_ROOM) as Y.Doc;
    doc.getMap('voteProposals').set(vote.id, vote);
  } catch {
    // Yjs doc may not exist yet — safe to skip
  }
}

function clearPokerRevealTimer(voteId: string): void {
  const timer = pokerRevealTimers.get(voteId);
  if (timer) clearTimeout(timer);
  pokerRevealTimers.delete(voteId);
}

/**
 * Arm (or re-arm) the single reveal timer for a vote. The callback must never
 * surface an unhandled rejection: one transient DB error during a reveal would
 * otherwise terminate the process and drop every active vote room. The reveal is
 * idempotent, so the next poll or timer re-attempts it. Both the ready gate and
 * the startup recovery schedule through here so their error handling cannot
 * drift.
 */
function schedulePokerRevealTimer(
  voteId: string,
  delayMs: number,
  logLabel: string,
): void {
  clearPokerRevealTimer(voteId);
  pokerRevealTimers.set(
    voteId,
    setTimeout(() => {
      pokerRevealTimers.delete(voteId);
      void revealPokerIfDue(voteId).catch((error: unknown) => {
        console.error(`${logLabel} failed:`, error);
      });
    }, delayMs),
  );
}

/**
 * The reset literal shared by the moderator reset and the poker next-round
 * paths. They differ only in the new round number; every other reveal field
 * must be cleared or a reopened/advanced round inherits stale reveal state.
 */
function clearedPokerRound(
  poker: Partial<PokerConfig> | null | undefined,
  round: number,
): PokerConfig {
  return {
    ...normalizePokerConfig(poker),
    round,
    armedAt: null,
    revealAt: null,
    revealedAt: null,
    revealedProposalIds: [],
  };
}

/**
 * Clear every ephemeral, vote-scoped store a vote owns. Delete, moderator reset
 * and poker next-round all tear the same live state down; keeping the list in
 * one place stops a store added later from surviving one of those paths.
 */
function teardownVoteLiveState(voteId: string): void {
  pokerHiddenConfigByVote.delete(voteId);
  clearVoteFromYjs(voteId);
  clearVoteDrafts(voteId);
  clearVotePresence(voteId);
  clearPokerReady(voteId);
  clearPokerRevealTimer(voteId);
  invalidatePokerParticipantCache(voteId);
}

/**
 * The participant set is a DISTINCT projection of the vote's responses, and the
 * 2-second poker poll asks for it on every tick from every participant. Cache it
 * for a short window so a burst of polls costs one row scan instead of one per
 * viewer. The window is longer than the poll interval so one viewer's
 * consecutive ticks hit it; submissions and withdrawals invalidate explicitly,
 * so readiness is never decided from a set that predates them, and the TTL only
 * bounds the cost of an invalidation the server did not observe (e.g. a direct
 * DB edit).
 */
const POKER_PARTICIPANT_CACHE_TTL_MS = 3000;
const pokerParticipantCache = new Map<
  string,
  { keys: Set<string>; expiresAt: number }
>();

function invalidatePokerParticipantCache(voteId: string): void {
  pokerParticipantCache.delete(voteId);
}

/**
 * Drop cache entries whose TTL has elapsed. The TTL is already honoured on
 * read, so this only bounds memory: without it every poker vote ever polled
 * would keep its participant set until the process restarts.
 */
function sweepPokerParticipantCache(now = Date.now()): void {
  for (const [voteId, entry] of pokerParticipantCache) {
    if (entry.expiresAt <= now) pokerParticipantCache.delete(voteId);
  }
}

/**
 * The voters who have submitted a complete ballot: an estimate for every active
 * proposal. Readiness is gated on that same coverage rule, so only these voters
 * can ever satisfy the all-ready gate. Counting a voter who has filled in part
 * of a deck would put them in the readiness denominator with no way to become
 * ready, so `allReady` could never turn true and the round could only escape by
 * a destructive reset.
 */
function completePokerKeysFromCoverage(
  vote: VoteEntity,
  rows: Array<{ voterToken: string; proposalId: string | null }>,
): Set<string> {
  const activeIds = activeProposalIds(vote);
  const coveredByVoter = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.proposalId) continue;
    const key = voteParticipantKey(vote.id, row.voterToken);
    const covered = coveredByVoter.get(key);
    if (covered) {
      covered.add(row.proposalId);
    } else {
      coveredByVoter.set(key, new Set([row.proposalId]));
    }
  }
  const keys = new Set<string>();
  for (const [key, covered] of coveredByVoter) {
    if (pokerBallotCoversEveryProposal(activeIds, (id) => covered.has(id))) {
      keys.add(key);
    }
  }
  return keys;
}

function pokerCompleteParticipantKeys(
  vote: VoteEntity,
  responses: VoteResponseEntity[],
): Set<string> {
  return completePokerKeysFromCoverage(
    vote,
    responses.map((response) => ({
      voterToken: response.voterToken,
      proposalId: response.proposalId,
    })),
  );
}

async function pokerCachedCompleteParticipantKeys(
  vote: VoteEntity,
): Promise<Set<string>> {
  const cached = pokerParticipantCache.get(vote.id);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  // Read only the coverage columns: the 2-second poll runs for every viewer, and
  // the full response row (value, attendeeData JSON) is never needed to decide
  // which ballots are complete.
  const coverage = await db.getVoteParticipantCoverage(vote.id);
  const keys = completePokerKeysFromCoverage(vote, coverage);
  pokerParticipantCache.set(vote.id, {
    keys,
    expiresAt: Date.now() + POKER_PARTICIPANT_CACHE_TTL_MS,
  });
  return keys;
}

async function computePokerState(
  vote: VoteEntity,
  voterToken?: string,
  // A caller that already resolved the participant set passes it in, so one
  // request never runs the same response scan two or three times.
  knownParticipants?: Set<string>,
): Promise<PokerState> {
  // The readiness denominator is the set of complete ballots, the same set the
  // ready gate accepts. A partial ballot is excluded because it could never
  // become ready and would therefore keep `allReady` false forever. Live
  // presence is deliberately excluded too: it is an unauthenticated heartbeat
  // keyed by a client-minted token, so counting it let any viewer (or a token
  // flood) add an unreadyable participant and block the reveal indefinitely.
  const participants =
    knownParticipants ?? (await pokerCachedCompleteParticipantKeys(vote));
  const readyKeys = new Set(listPokerReady(vote.id).map((entry) => entry.participantId));
  const readyCount = [...participants].filter((key) => readyKeys.has(key)).length;
  const poker = normalizePokerConfig(vote.config.poker);
  const voterKey = voterToken ? voteParticipantKey(vote.id, voterToken) : null;
  const youAreParticipant = Boolean(voterKey && participants.has(voterKey));
  return {
    participantCount: participants.size,
    readyCount,
    allReady: participants.size > 0 && readyCount === participants.size,
    youAreParticipant,
    youAreReady: Boolean(
      youAreParticipant && voterKey && readyKeys.has(voterKey),
    ),
    armedAt: poker.armedAt ?? null,
    revealAt: poker.revealAt ?? null,
    revealedAt: poker.revealedAt ?? null,
    round: poker.round ?? 0,
    scale: poker.scale,
  };
}

/**
 * Whether a persisted reveal arm is stale and must be cancelled.
 *
 * A `revealAt` is only written once every participant was ready, and any later
 * response change disarms it. Readiness is process-local, though, so a restart
 * empties it while the deadline survives: an entirely empty ready set is that
 * recovery case, and the deadline must be allowed to reveal it. Only a ready
 * set that is present but incomplete is the anomaly the disarm is for.
 *
 * The poker poll and the reveal timer both act on this rule, so they must agree
 * on it. Whether cancelling also clears participants' ready flags is a
 * call-site decision (the poll preserves readiness; the reveal timer resets it),
 * but the predicate itself lives here so the two paths cannot drift.
 */
function pokerArmIsStale(state: PokerState): boolean {
  return Boolean(state.revealAt) && !state.allReady && state.readyCount > 0;
}

async function armPokerRevealIfReady(
  vote: VoteEntity,
  knownParticipants?: Set<string>,
): Promise<VoteEntity> {
  if (vote.config.mode !== 'POKER_PLANNING' || vote.config.phase !== 'OPEN') {
    return vote;
  }
  const poker = normalizePokerConfig(vote.config.poker);
  if (poker.revealedAt || poker.revealAt) return vote;

  const state = await computePokerState(vote, undefined, knownParticipants);
  if (!state.allReady) return vote;

  // `updateVote` shallow-merges the patch over the row it re-reads, so writing
  // this snapshot's config would put a stale `phase` (and every other key) back
  // over a concurrent change — reopening a vote a moderator just closed, or
  // rewinding one that was finalized while this request ran. Re-read inside the
  // write path, re-check the guards the snapshot may have missed, and base the
  // patch on that fresh row so only the poker fields change.
  const fresh = await db.getVoteById(vote.id);
  if (
    !fresh ||
    fresh.config.mode !== 'POKER_PLANNING' ||
    fresh.config.phase !== 'OPEN'
  ) {
    return fresh ?? vote;
  }
  const freshPoker = normalizePokerConfig(fresh.config.poker);
  if (freshPoker.revealedAt || freshPoker.revealAt) return fresh;

  const now = Date.now();
  // The arm is a guarded, poker-only write: the DB re-checks (and locks) the
  // row and aborts if a reveal or a close landed after the snapshot read, so a
  // stale `phase`/`revealedAt` from this request cannot reopen the vote or
  // un-reveal a round.
  const updated = await db.updateVotePokerConfig(
    vote.id,
    {
      armedAt: new Date(now).toISOString(),
      revealAt: new Date(now + POKER_REVEAL_DELAY_MS).toISOString(),
      revealedAt: null,
    },
    {
      phase: 'OPEN',
      pokerRevealedAt: freshPoker.revealedAt ?? null,
      pokerRevealAt: freshPoker.revealAt ?? null,
      pokerRevealedProposalIds: pokerRevealedProposalIdsSignature(
        freshPoker.revealedProposalIds,
      ),
    },
  );
  if (!updated) return (await db.getVoteById(vote.id)) ?? fresh;

  broadcastVoteToYjs(updated);
  schedulePokerRevealTimer(vote.id, POKER_REVEAL_DELAY_MS, 'Poker reveal timer');
  return updated;
}

async function cancelPokerReveal(
  vote: VoteEntity,
  options: { clearReady: boolean },
): Promise<VoteEntity> {
  clearPokerRevealTimer(vote.id);
  if (options.clearReady) clearPokerReady(vote.id);
  if (vote.config.mode !== 'POKER_PLANNING') return vote;

  // Re-read inside the write path: basing the patch on a fresh row means a
  // cancel that races a moderator close/finalize cannot rewrite `phase` or any
  // other config key from this request's older snapshot.
  const fresh = await db.getVoteById(vote.id);
  if (!fresh || fresh.config.mode !== 'POKER_PLANNING') return fresh ?? vote;
  const poker = normalizePokerConfig(fresh.config.poker);
  if (!poker.armedAt && !poker.revealAt) return fresh;

  // Cancel only clears the arm. The guarded write aborts if a reveal landed
  // after this snapshot, so it can never un-reveal a round that just revealed.
  const updated = await db.updateVotePokerConfig(
    vote.id,
    { armedAt: null, revealAt: null },
    {
      phase: fresh.config.phase,
      pokerRevealedAt: poker.revealedAt ?? null,
      pokerRevealAt: poker.revealAt ?? null,
      pokerRevealedProposalIds: pokerRevealedProposalIdsSignature(
        poker.revealedProposalIds,
      ),
    },
  );
  if (!updated) return (await db.getVoteById(vote.id)) ?? fresh;
  broadcastVoteToYjs(updated);
  return updated;
}

/**
 * A poker reveal only means something while the vote is OPEN. If a save or a
 * finalize moves the phase off OPEN while the reveal is armed (all participants
 * just consented), the persisted `armedAt`/`revealAt` would outlive the round:
 * `revealPokerIfDue` ignores a non-OPEN phase, so its timer fires with no
 * reveal and the stale deadline makes a later reopen reveal instantly from
 * readiness the participants never re-confirmed. Drop the arm and the ephemeral
 * readiness whenever the phase leaves OPEN.
 */
async function settlePokerRevealForPhase(vote: VoteEntity): Promise<VoteEntity> {
  if (vote.config.mode !== 'POKER_PLANNING' || vote.config.phase === 'OPEN') {
    return vote;
  }
  return cancelPokerReveal(vote, { clearReady: true });
}

async function revealPokerIfDue(voteId: string): Promise<VoteEntity | null> {
  if (pokerRevealInFlight.has(voteId)) return null;
  pokerRevealInFlight.add(voteId);
  try {
    const vote = await db.getVoteById(voteId);
    if (
      !vote ||
      vote.config.mode !== 'POKER_PLANNING' ||
      vote.config.phase !== 'OPEN'
    ) {
      return null;
    }
    const poker = normalizePokerConfig(vote.config.poker);
    if (!poker.revealAt || poker.revealedAt) return null;
    const dueAt = Date.parse(poker.revealAt);
    if (!Number.isFinite(dueAt) || dueAt > Date.now()) return null;
    // The deadline this call is honouring. A cancel followed by a re-arm
    // replaces `revealAt` with a new deadline; the fresh read below must match
    // this value, otherwise an arm that started after this call began would be
    // revealed instantly instead of after its own delay.
    const observedRevealAt = poker.revealAt;

    const state = await computePokerState(vote);
    if (pokerArmIsStale(state)) {
      // At the deadline an inconsistent ready set is abandoned: clear the flags
      // so the next attempt starts a fresh readiness cycle.
      await cancelPokerReveal(vote, { clearReady: true });
      return null;
    }

    // Re-read inside the write path: `vote` may be stale after the state scan,
    // and a full config from it would revive an old phase over a concurrent
    // close. Re-checking here also means a reveal cancelled between the due
    // check and this write is not resurrected.
    const fresh = await db.getVoteById(vote.id);
    if (
      !fresh ||
      fresh.config.mode !== 'POKER_PLANNING' ||
      fresh.config.phase !== 'OPEN'
    ) {
      return null;
    }
    const freshPoker = normalizePokerConfig(fresh.config.poker);
    if (!freshPoker.revealAt || freshPoker.revealedAt) return null;
    // Only reveal the arm this call observed. A cancel+re-arm during the state
    // scan leaves a different (future) deadline; revealing it now would skip
    // the new round's 5s window. Its own timer will fire instead.
    if (freshPoker.revealAt !== observedRevealAt) return null;
    const freshDueAt = Date.parse(freshPoker.revealAt);
    if (!Number.isFinite(freshDueAt) || freshDueAt > Date.now()) return null;

    // Reveal is a guarded, poker-only write: the DB re-checks the row and
    // aborts if a close landed after the snapshot, if a competing reveal that
    // already stamped `revealedAt` wins, or if a participant cancelled the arm
    // (clearing `revealAt`) between this read and the write. Only the reveal
    // fields change, so `phase` stays authoritative.
    const updated = await db.updateVotePokerConfig(
      vote.id,
      {
        armedAt: null,
        revealAt: null,
        revealedAt: new Date().toISOString(),
        revealedProposalIds: [],
      },
      {
        phase: 'OPEN',
        pokerRevealedAt: freshPoker.revealedAt ?? null,
        pokerRevealAt: freshPoker.revealAt ?? null,
        pokerRevealedProposalIds: pokerRevealedProposalIdsSignature(
          freshPoker.revealedProposalIds,
        ),
      },
    );
    // A rejected write means this call did not reveal: a cancel or a competing
    // reveal already tore the arm down. Clearing the ready flags here would
    // wipe a round that has since re-armed and delete its fresh timer, so only
    // the call that actually stamped `revealedAt` clears the live state.
    if (!updated) return null;
    clearPokerRevealTimer(vote.id);
    clearPokerReady(vote.id);
    broadcastVoteToYjs(updated);
    return updated;
  } finally {
    pokerRevealInFlight.delete(voteId);
  }
}

/**
 * Re-arm poker reveal deadlines after a restart.
 *
 * The reveal timer and the ready store are process-local, but an armed
 * `revealAt` is persisted. A redeploy therefore drops both timers and
 * readiness while the deadline survives, and without re-arming, the next poll
 * would cancel the round. Re-arming (or firing an already-overdue deadline)
 * makes the persisted arm authoritative again; a response change still
 * disarms it through `handlePokerResponseChange`.
 *
 * Only armed poker votes are loaded: this runs before `app.listen`, so it must
 * not pull the whole vote history into memory and delay startup.
 */
async function recoverPokerReveals(): Promise<void> {
  let votes: VoteEntity[];
  try {
    votes = await db.getPokerVotesAwaitingReveal();
  } catch (error: unknown) {
    console.error('Failed to scan votes for pending poker reveals:', error);
    return;
  }
  const now = Date.now();
  for (const vote of votes) {
    if (vote.config.mode !== 'POKER_PLANNING' || vote.config.phase !== 'OPEN') {
      continue;
    }
    const poker = normalizePokerConfig(vote.config.poker);
    if (!poker.revealAt || poker.revealedAt) continue;
    const dueAt = Date.parse(poker.revealAt);
    if (!Number.isFinite(dueAt)) continue;
    schedulePokerRevealTimer(
      vote.id,
      Math.max(0, dueAt - now),
      'Poker reveal recovery timer',
    );
  }
}

async function handlePokerResponseChange(
  vote: VoteEntity,
  voterToken: string,
): Promise<VoteEntity> {
  if (vote.config.mode !== 'POKER_PLANNING') return vote;
  // A submission or withdrawal just changed the participant set; the next
  // readiness read must not reuse the set cached before it.
  invalidatePokerParticipantCache(vote.id);
  let current = (await db.getVoteById(vote.id)) ?? vote;
  // The startup warm only includes rounds that already had a response, so a
  // round that was empty when the process started would never enter the
  // blind-reveal scrub set once estimates begin to arrive. Track it from the
  // persisted vote on every response change (submission, batch or withdrawal)
  // before any row can be republished by a stale client.
  trackPokerValueVisibility(current);
  const participantKey = voteParticipantKey(current.id, voterToken);
  clearPokerReadyForParticipant(current.id, participantKey);
  const poker = normalizePokerConfig(current.config.poker);
  if (poker.armedAt || poker.revealAt) {
    // Disarm only when the change came from a complete participant. Readiness is
    // derived from complete ballots, so a partial estimate from a non-participant
    // alters nothing in the gate; letting it cancel the arm would let any visitor
    // who knows the public link hold the round open forever by alternating one
    // partial submit/withdraw. This check runs only while an arm is pending, so
    // the extra response scan is confined to the short reveal window.
    const participants = await pokerCachedCompleteParticipantKeys(current);
    if (participants.has(participantKey)) {
      current = await cancelPokerReveal(current, { clearReady: false });
    }
  }
  return current;
}

const RANKING_RESULT_CACHE_LIMIT = 32;
const rankingResultCache = new Map<string, { signature: string; result: VoteRankingResult | null }>();

/**
 * Version the inputs that change a ranking result. `includeDrafts` also feeds
 * `draftUpdatedAt` and draft sizes, because the submitted-only signature
 * deliberately ignores drafts (it must not invalidate the official ranking when
 * a draft changes).
 */
function rankingSignature(
  vote: VoteEntity,
  submissions: VoteRankingSubmission[],
  includeDrafts = false,
): string {
  let hash = 2166136261 >>> 0;
  const feed = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  };
  feed(vote.id);
  for (const proposal of vote.proposals) {
    feed(`${proposal.id}:${proposal.active ? 1 : 0}:${proposal.position};`);
  }
  for (const submission of submissions) {
    if (includeDrafts) {
      feed(
        `${submission.voterToken}:${submission.draftUpdatedAt ?? ''}:` +
        `${submission.submittedAt ?? ''}:` +
        `${submission.draft?.comparisons.length ?? 0}:` +
        `${submission.submitted?.comparisons.length ?? 0}:` +
        `${submission.draft?.batchCount ?? 0}:${submission.submitted?.batchCount ?? 0};`,
      );
      continue;
    }
    if (!submission.submitted) continue;
    // `submittedAt` is rewritten on every submit, so it versions the payload
    // without hashing (potentially large) ballot JSON on each request.
    feed(
      `${submission.voterToken}:${submission.submittedAt ?? ''}:` +
      `${submission.submitted.comparisons.length}:${submission.submitted.batchCount};`,
    );
  }
  return hash.toString(36);
}

/**
 * `estimatePartialRanking` is super-linear in the number of ranked proposals,
 * so the same submission set must not be recomputed on every results request.
 * Invalidate implicitly by hashing the inputs that affect the result. One
 * implementation owns the cache lookup and LRU eviction for every ranking
 * projection.
 */
function cachedRankingResult(
  cache: Map<string, { signature: string; result: VoteRankingResult | null }>,
  vote: VoteEntity,
  submissions: VoteRankingSubmission[],
  signatureOf: (vote: VoteEntity, submissions: VoteRankingSubmission[]) => string,
  build: (vote: VoteEntity, submissions: VoteRankingSubmission[]) => VoteRankingResult | null,
): VoteRankingResult | null {
  const signature = signatureOf(vote, submissions);
  const cached = cache.get(vote.id);
  if (cached && cached.signature === signature) return cached.result;
  const result = build(vote, submissions);
  if (cache.size >= RANKING_RESULT_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(vote.id, { signature, result });
  return result;
}

function getVoteRankingResult(
  vote: VoteEntity,
  submissions: VoteRankingSubmission[],
): VoteRankingResult | null {
  return cachedRankingResult(
    rankingResultCache,
    vote,
    submissions,
    rankingSignature,
    buildVoteRankingResult,
  );
}

/**
 * The ballot a facilitator sees as "in progress": the newest draft when the
 * participant is editing, otherwise the last submission. Used only for the
 * provisional ranking shown before any ballot has been submitted.
 */
function effectiveRankingBallot(
  submission: VoteRankingSubmission,
): VoteRankingBallot | null {
  const draftIsNewer = isDraftNewer(
    submission.draft !== null,
    submission.draftUpdatedAt,
    submission.submittedAt,
  );
  if (draftIsNewer && submission.draft) return submission.draft;
  return submission.submitted ?? submission.draft;
}

/**
 * Provisional ranking built from every participant's current ballot, including
 * drafts. Cached against a draft-aware signature: the facilitator view refetches
 * on every participation change, and most of those do not alter a draft.
 */
function buildDraftRankingResult(
  vote: VoteEntity,
  submissions: VoteRankingSubmission[],
): VoteRankingResult | null {
  if (activeProposalIds(vote).length === 0) return null;
  const effective: VoteRankingSubmission[] = [];
  for (const submission of submissions) {
    const ballot = effectiveRankingBallot(submission);
    // A participant who joined but has not compared anything yet shows up in
    // the participation counts, but must not dilute the provisional ranking's
    // coverage/participant count.
    if (ballot && ballot.comparisons.length > 0) {
      effective.push({ ...submission, submitted: ballot });
    }
  }
  if (effective.length === 0) return null;
  return buildVoteRankingResult(vote, effective);
}

const draftRankingResultCache = new Map<
  string,
  { signature: string; result: VoteRankingResult | null }
>();

function getDraftRankingResult(
  vote: VoteEntity,
  submissions: VoteRankingSubmission[],
): VoteRankingResult | null {
  return cachedRankingResult(
    draftRankingResultCache,
    vote,
    submissions,
    (v, s) => rankingSignature(v, s, true),
    buildDraftRankingResult,
  );
}

type RankingBallotShapeError =
  | 'invalid-item-ids'
  | 'too-few-item-ids'
  | 'invalid-comparisons'
  | 'invalid-comparison-entry'
  | 'invalid-comparison-types'
  | 'invalid-comparison-pair'
  | 'invalid-comparison-winner';

const RANKING_BALLOT_SHAPE_ERRORS: Record<RankingBallotShapeError, string> = {
  'invalid-item-ids': 'itemIds must be an array of at most 100 ids',
  'too-few-item-ids': 'At least two item ids are required',
  'invalid-comparisons': 'comparisons must be an array of at most 20000 entries',
  'invalid-comparison-entry': 'Invalid comparison entry',
  'invalid-comparison-types': 'Comparison a, b and winner must be strings',
  'invalid-comparison-pair': 'Comparison contains an invalid proposal pair',
  'invalid-comparison-winner': 'Comparison winner must be one of the compared proposals',
};

/**
 * Shared shape validation for the two ballot ingest paths (participant submit
 * and backup import). Both must apply the same itemIds cap/stale-filter and the
 * same a/b/winner comparison rules; only the surrounding requirements differ
 * (status and a minimum item count when submitting, a required coverage summary
 * on import). Error codes let each route keep its own message text.
 */
function sanitizeRankingBallotShape(
  rawItemIds: unknown,
  rawComparisons: unknown,
  proposalIds: Set<string>,
  options: { minItemIds?: number; requireStringItemIds?: boolean } = {},
): {
  itemIds?: string[];
  comparisons?: VoteRankingBallot['comparisons'];
  error?: RankingBallotShapeError;
} {
  if (!Array.isArray(rawItemIds) || rawItemIds.length > MAX_RANKED_ITEMS) {
    return { error: 'invalid-item-ids' };
  }
  if (options.requireStringItemIds && !rawItemIds.every((id) => typeof id === 'string')) {
    return { error: 'invalid-item-ids' };
  }
  // A ballot is a snapshot: a proposal can be removed from the vote while it is
  // still OPEN, so an in-flight ballot may legitimately reference an id that no
  // longer exists. Drop those stale references (aggregation already ignores
  // them) instead of rejecting every subsequent autosave and submit.
  const itemIds = Array.from(
    new Set(rawItemIds.filter((id): id is string => typeof id === 'string')),
  ).filter((id) => proposalIds.has(id));
  if (options.minItemIds !== undefined && itemIds.length < options.minItemIds) {
    return { error: 'too-few-item-ids' };
  }
  if (!Array.isArray(rawComparisons) || rawComparisons.length > 20000) {
    return { error: 'invalid-comparisons' };
  }

  const comparisons: VoteRankingBallot['comparisons'] = [];
  for (const raw of rawComparisons) {
    if (!raw || typeof raw !== 'object') {
      return { error: 'invalid-comparison-entry' };
    }
    const entry = raw as Record<string, unknown>;
    const a = entry.a;
    const b = entry.b;
    const winner = entry.winner;
    if (typeof a !== 'string' || typeof b !== 'string' || typeof winner !== 'string') {
      return { error: 'invalid-comparison-types' };
    }
    if (a === b) {
      return { error: 'invalid-comparison-pair' };
    }
    if (!proposalIds.has(a) || !proposalIds.has(b)) {
      continue;
    }
    if (winner !== a && winner !== b) {
      return { error: 'invalid-comparison-winner' };
    }
    comparisons.push({ a, b, winner });
  }

  return { itemIds, comparisons };
}

function validateRankingBallot(
  vote: VoteEntity,
  body: Record<string, unknown>,
): { ballot?: VoteRankingBallot; status?: 'in_progress' | 'submitted'; error?: string } {
  const status = body.status;
  if (status !== 'in_progress' && status !== 'submitted') {
    return { error: 'status must be in_progress or submitted' };
  }
  if (typeof body.voterToken !== 'string' || body.voterToken.trim() === '') {
    return { error: 'voterToken is required' };
  }
  const proposalIds = new Set(vote.proposals.map((proposal) => proposal.id));
  const shape = sanitizeRankingBallotShape(body.itemIds, body.comparisons, proposalIds, {
    minItemIds: 2,
  });
  if (shape.error) {
    return { error: RANKING_BALLOT_SHAPE_ERRORS[shape.error] };
  }
  const itemIds = shape.itemIds!;
  const comparisons = shape.comparisons!;

  const engine = vote.config.rankingEngine ?? DEFAULT_RANKING_ENGINE;
  if (body.engine !== undefined && body.engine !== engine) {
    return { error: `This vote uses ${engine}` };
  }

  // A comment travels inside the ballot payload. Only accept it when the vote
  // allows free text, and bound it like the other public text fields.
  const comment =
    vote.config.allowFreeText === true && typeof body.comment === 'string'
      ? body.comment.trim().slice(0, 2000) || null
      : null;

  // Coverage must be measured against the server-known active proposal set, not
  // the client-supplied itemIds, otherwise a ballot can inflate its reported
  // coverage by declaring a tiny denominator. Reuse `activeProposalIds` so this
  // denominator cannot drift from the set result aggregation ranks.
  const activeIds = activeProposalIds(vote);
  const denominatorIds = activeIds.length >= 2 ? activeIds : itemIds;

  return {
    status,
    ballot: {
      itemIds,
      comparisons,
      batchCount: Number.isFinite(body.batchCount) ? Number(body.batchCount) : 0,
      coverage: computeBallotCoverage({ itemIds: denominatorIds, comparisons }),
      confidencePercent: Math.max(0, Math.min(100, Number(body.confidencePercent) || 0)),
      stopReason: typeof body.stopReason === 'string' ? body.stopReason : null,
      engine,
      engineVersion: typeof body.engineVersion === 'string' ? body.engineVersion : 'unknown',
      comment,
    },
  };
}

// Comparative prioritization ballots (participant self-read + bulk backup read)
app.get('/api/votes/:idOrSlug/ranking-submissions', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    // The credential travels in a header, so the response body varies by that
    // header even though the URL does not. Without no-store a shared cache
    // could serve one participant's ballot to a different voter requesting the
    // same URL.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'X-Voter-Token, X-Moderator-Token');
    const voterToken = requestToken(req, 'x-voter-token');
    if (voterToken) {
      // A participant reads back their own ballot with their bearer token.
      const submission = await db.getVoteRankingSubmission(vote.id, voterToken);
      // Do not echo the bearer credential back in the body; the caller already
      // holds it and the ballot payload is all it needs. `scope` proves the
      // header was honored so a client can distinguish this own-ballot read
      // from the tokenless bulk branch (e.g. an older server during rollout).
      return res.json({
        scope: 'self',
        submissions: submission ? [{ ...submission, voterToken: undefined }] : [],
      });
    }
    // Bulk read: the workspace backup path. Never expose the participant
    // credential and never leak per-ballot identities on anonymous votes; an
    // absent `isAnonymous` flag means anonymous, matching the rest of the app.
    // A hidden (OPEN) vote's ballots are its results, so they must not be
    // readable through a public value: only a moderator session may read them
    // before the results are visible, exactly like `/ranking-results`. Drafts
    // are live participation data and therefore also moderator-only; the public
    // path receives submitted ballots only and skips loading draft payloads.
    const isModerator = await canModerateVote(req, vote);
    if (!isModerator && !areRankingResultsVisible(vote)) {
      return res.json({ submissions: [] });
    }
    const submissions = isModerator
      ? await db.getVoteRankingSubmissions(vote.id)
      : await db.getVoteRankingSubmittedBallots(vote.id);
    const anonymous = isVoteAnonymous(vote.config);
    res.json({
      submissions: submissions.map((submission) =>
        redactRankingSubmissionForBackup(submission, anonymous),
      ),
    });
  } catch (error: unknown) {
    console.error('Error fetching ranking submissions:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch ranking submissions', details: message });
  }
});

app.post('/api/votes/:idOrSlug/ranking-submissions', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    if (vote.config.mode !== 'COMPARATIVE_PRIORITIZATION') {
      return res.status(400).json({ error: 'Vote is not in comparative prioritization mode' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open for ballots' });
    }

    const validation = validateRankingBallot(vote, req.body ?? {});
    if (!validation.ballot || !validation.status) {
      return res.status(400).json({ error: validation.error ?? 'Invalid ballot' });
    }

    // Only a vote that locks ballots needs the stored submission. The default
    // allows changes, and loading the full ballot on every autosave is costly.
    if (vote.config.allowVoteChangeUntilClose === false) {
      const existing = await db.getVoteRankingSubmission(vote.id, req.body.voterToken);
      if (existing?.submitted) {
        return res.status(400).json({ error: 'Ballot already submitted' });
      }
    }

    const now = new Date().toISOString();
    const isAnonymous = isVoteAnonymous(vote.config);
    const submission = await db.upsertVoteRankingSubmission(vote.id, {
      voterToken: req.body.voterToken,
      // Anonymous votes must not persist who cast the ballot.
      userId: isAnonymous ? null : (typeof req.body.userId === 'string' ? req.body.userId : null),
      // Same shared rule as the response paths: never trust the raw length, so a
      // public ballot cannot store an arbitrarily long name in the participation
      // view. An empty normalized value becomes null instead of an empty string.
      displayName: isAnonymous
        ? null
        : normalizeVoterDisplayName(req.body.displayName) || null,
      draft: validation.ballot,
      draftUpdatedAt: now,
      submitted: validation.status === 'submitted' ? validation.ballot : undefined,
      submittedAt: validation.status === 'submitted' ? now : undefined,
      lastSeenAt: now,
    });
    // Mark the public live channel even though the ballot payload itself stays
    // private. Draft autosaves only move participation; an explicit submit also
    // changes the aggregate ranking.
    scheduleRankingLiveBroadcast(vote, {
      resultsChanged: validation.status === 'submitted',
    });
    // The client already holds the ballot it just uploaded; echo only the
    // canonical metadata instead of the full (up to 20k comparison) payload.
    res.status(201).json({
      id: submission.id,
      voteId: submission.voteId,
      submitted: submission.submitted !== null,
      submittedAt: submission.submittedAt,
      draftUpdatedAt: submission.draftUpdatedAt,
      lastSeenAt: submission.lastSeenAt,
    });
  } catch (error: unknown) {
    console.error('Error upserting ranking submission:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to save ranking ballot', details: message });
  }
});

app.delete('/api/votes/:idOrSlug/ranking-submissions', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    const voterToken = requestToken(req, 'x-voter-token');
    if (!voterToken) return res.status(400).json({ error: 'voterToken is required' });
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open for ballots' });
    }
    // Mirror the submit-side lock: a submitted ballot cannot be withdrawn when
    // the vote disallows changes until close.
    const existing = await db.getVoteRankingSubmission(vote.id, voterToken);
    if (existing?.submitted && vote.config.allowVoteChangeUntilClose === false) {
      return res.status(400).json({ error: 'Ballot already submitted' });
    }
    await db.deleteVoteRankingSubmission(vote.id, voterToken);
    scheduleRankingLiveBroadcast(vote, { resultsChanged: true });
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting ranking submission:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete ranking ballot', details: message });
  }
});

app.get('/api/votes/:idOrSlug/ranking-participation', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    // Moderator-authenticated payload selected by a header, not the URL: keep
    // shared caches from returning one facilitator's response to another.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'X-Moderator-Token');
    // `ownerId` is public and a query flag is caller-controlled, so neither can
    // grant the live participation table. Only a moderator session may read
    // draft progress, last-seen and editing state (see `canModerateVote`).
    if (!(await canModerateVote(req, vote))) {
      return res.status(403).json({ error: 'Facilitator access required' });
    }
    // Read only the summary fields: this endpoint is polled every few seconds and
    // deriving participation does not need each ballot's full comparison JSON.
    const stats = await db.getVoteRankingParticipationStats(vote.id);
    res.json(deriveBallotParticipationFromStats(vote.id, stats, isVoteAnonymous(vote.config)));
  } catch (error: unknown) {
    console.error('Error fetching ranking participation:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch ranking participation', details: message });
  }
});

app.get('/api/votes/:idOrSlug/ranking-results', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    // The standalone moderation popout and the in-app owner view both send the
    // vote's moderator token; the token, not the `includeHidden` query flag, is
    // the capability. The flag only tells a caller that already holds the
    // capability whether to request the facilitator projection.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'X-Moderator-Token');
    const isModerator = await canModerateVote(req, vote);
    if (!isModerator && !areRankingResultsVisible(vote)) {
      // Hidden results only need a participation count, not every ballot's
      // full comparison JSON (which can hold up to 20,000 entries each).
      const submittedCount = await db.countVoteRankingSubmittedBallots(vote.id);
      return res.json({ hidden: true, participantCount: submittedCount, result: null });
    }
    // The official ranking consumes submitted ballots only. Facilitator views
    // additionally get a provisional ranking built from drafts, so the
    // moderator sees the ranking take shape as soon as participants start
    // comparing, instead of an empty result until the first submission.
    // A facilitator needs both the submitted payloads and the drafts, so read
    // every row once and derive the submitted set instead of issuing a second
    // full-table query for the same vote.
    let submissions: VoteRankingSubmission[];
    let draftResult: VoteRankingResult | null = null;
    // Only an open vote can have a provisional draft ranking. Drafts can no
    // longer be submitted once the vote closes, so a closed vote — like every
    // public view — reads the lean submitted-only projection instead of
    // fetching and JSON-parsing every draft payload just to discard it.
    if (isModerator && vote.config.phase === 'OPEN') {
      const allSubmissions = await db.getVoteRankingSubmissions(vote.id);
      submissions = allSubmissions.filter((submission) => submission.submitted !== null);
      draftResult = getDraftRankingResult(vote, allSubmissions);
    } else {
      submissions = await db.getVoteRankingSubmittedBallots(vote.id);
    }
    const submittedCount = submissions.length;
    const result = getVoteRankingResult(vote, submissions);
    // Comments live inside the submitted ballot payload. Deduplicate so a
    // comment is not repeated per ballot revision, and never expose them when
    // the results themselves are hidden (the early return above covers that).
    const anonymous = isVoteAnonymous(vote.config);
    const comments =
      vote.config.allowFreeText === true
        ? Array.from(
            new Map(
              submissions.flatMap((submission) => {
                const comment = submission.submitted?.comment?.trim();
                if (!comment) return [];
                const name = anonymous
                  ? null
                  : submission.displayName ?? submission.userId ?? null;
                return [[`${name ?? ''}\u0000${comment}`, { comment, name }] as const];
              }),
            ).values(),
          )
        : [];
    res.json({ hidden: false, participantCount: submittedCount, result, draftResult, comments });
  } catch (error: unknown) {
    console.error('Error computing ranking results:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to compute ranking results', details: message });
  }
});

app.post('/api/vote-ranking-submissions/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    // The restore client sends `{ items, replaceVoteIds }` so a backup replaces
    // the covered votes' ballots instead of merging; a bare array is still
    // accepted for compatibility and is treated as a plain upsert.
    const body = req.body as
      | VoteRankingSubmission[]
      | { items?: VoteRankingSubmission[]; replaceVoteIds?: string[] };
    const rawItems = Array.isArray(body) ? body : body?.items;
    if (!Array.isArray(rawItems)) {
      return res.status(400).json({ error: 'Expected an array of ranking submissions' });
    }
    if (rawItems.length > 10000) {
      return res.status(413).json({ error: 'Too many ranking submissions in one import' });
    }
    const replaceVoteIds = Array.isArray(body) ? undefined : body?.replaceVoteIds;
    if (replaceVoteIds !== undefined && !Array.isArray(replaceVoteIds)) {
      return res.status(400).json({ error: 'replaceVoteIds must be an array' });
    }
    if (replaceVoteIds !== undefined && replaceVoteIds.length > 10000) {
      return res.status(413).json({ error: 'Too many replaceVoteIds in one import' });
    }
    // Restore data bypasses the participant submit route, so validate the
    // payload shape here to stop malformed or unbounded rows reaching the DB.
    // Restore runs after votes are imported, so resolve each referenced vote and
    // reject ballots for unknown votes or proposals instead of persisting rows
    // that could be used to tamper with an unrelated vote. Load the vote set once
    // instead of awaiting a lookup per item/replace id: both arrays are
    // user-controlled and a per-id await is an unbounded N+1.
    const votesById = new Map((await db.getVotes()).map((vote) => [vote.id, vote]));
    const resolveVote = (voteId: string): VoteEntity | null => votesById.get(voteId) ?? null;
    const items: VoteRankingSubmission[] = [];
    for (const raw of rawItems) {
      if (!raw || typeof raw !== 'object') {
        return res.status(400).json({ error: 'Invalid ranking submission entry' });
      }
      const item = raw as Partial<VoteRankingSubmission>;
      if (
        typeof item.id !== 'string' ||
        typeof item.voteId !== 'string' ||
        typeof item.lastSeenAt !== 'string'
      ) {
        return res.status(400).json({ error: 'Ranking submission is missing id, voteId or lastSeenAt' });
      }
      const vote = resolveVote(item.voteId);
      if (!vote) {
        return res.status(400).json({ error: 'Ranking submission references an unknown vote' });
      }
      // Ballots may exist for a vote that has since left COMPARATIVE_PRIORITIZATION
      // mode, and the backup exports every vote so a restore cannot delete
      // omitted ballots. Accept those rows instead of failing the whole restore;
      // they stay inert until the vote returns to ranking mode.
      const proposalIds = new Set(vote.proposals.map((proposal) => proposal.id));
      for (const ballot of [item.draft, item.submitted]) {
        if (!ballot) continue;
        // Same shape rules as the participant submit route. A backup can
        // legitimately reference a proposal that was deactivated or removed
        // after the ballot was cast, so stale references are clamped out
        // (aggregation already ignores them) instead of rejecting the restore.
        const shape = sanitizeRankingBallotShape(
          ballot.itemIds,
          ballot.comparisons,
          proposalIds,
          { requireStringItemIds: true },
        );
        if (shape.error) {
          const error = shape.error === 'invalid-item-ids'
            ? 'Imported ballot has invalid itemIds'
            : shape.error === 'invalid-comparisons'
              ? 'Imported ballot has invalid comparisons'
              : 'Imported ballot has an invalid comparison';
          return res.status(400).json({ error });
        }
        ballot.itemIds = shape.itemIds!;
        ballot.comparisons = shape.comparisons!;
        // Downstream participation/aggregation code assumes a numeric coverage
        // percentage; reject payloads that would persist a malformed row.
        if (
          !ballot.coverage ||
          typeof ballot.coverage.percent !== 'number' ||
          !Number.isFinite(ballot.coverage.percent)
        ) {
          return res.status(400).json({ error: 'Imported ballot has invalid coverage' });
        }
        // The Postgres participation projection casts confidencePercent to
        // double precision, so persist only the same finite 0-100 value the
        // participant submit path stores; a string/object here would break
        // every participation poll for the vote.
        const confidencePercent = Number(ballot.confidencePercent);
        ballot.confidencePercent = Number.isFinite(confidencePercent)
          ? Math.max(0, Math.min(100, confidencePercent))
          : 0;
      }
      // Import bypasses the participant submit route, so apply the same
      // anonymity rule: an anonymous vote must never persist who voted, even if
      // a (possibly tampered) backup supplies identities.
      if (isVoteAnonymous(vote.config)) {
        item.userId = null;
        item.displayName = null;
      }
      items.push(item as VoteRankingSubmission);
    }
    // The restore client owns the decision of which votes it could read: it
    // omits votes whose ballots the matching backup could not contain (see
    // `incompleteRankingVoteIds`), so a complete backup still converges instead
    // of leaving stale ballots behind. The server only validates that the scope
    // references known votes; it cannot infer readability from result
    // visibility because a moderator-token backup includes hidden votes.
    let effectiveReplaceVoteIds = replaceVoteIds;
    if (replaceVoteIds && replaceVoteIds.length > 0) {
      const kept: string[] = [];
      for (const voteId of replaceVoteIds) {
        if (typeof voteId !== 'string') {
          return res.status(400).json({ error: 'replaceVoteIds must contain vote ids' });
        }
        if (!resolveVote(voteId)) continue;
        kept.push(voteId);
      }
      effectiveReplaceVoteIds = kept;
    }
    await db.importVoteRankingSubmissions(items, effectiveReplaceVoteIds);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error importing ranking submissions:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import ranking submissions', details: message });
  }
});

// Vote responses (public)
// Read back the caller's own comment, so a reload shows what they wrote.
app.get('/api/votes/:idOrSlug/comment', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    res.setHeader('Cache-Control', 'no-store');
    const voterToken = requestToken(req, 'x-voter-token');
    if (!isValidVoterToken(voterToken)) {
      return res.status(400).json({ error: 'voterToken is required' });
    }
    if (vote.config.allowFreeText !== true) {
      return res.json({ comment: null });
    }
    let comment: string | null = null;
    if (vote.config.mode === 'COMPARATIVE_PRIORITIZATION') {
      const submission = await db.getVoteRankingSubmission(vote.id, voterToken);
      comment = submission?.submitted?.comment ?? submission?.draft?.comment ?? null;
    } else {
      const responses = await db.getVoteResponsesForVoter(vote.id, voterToken);
      comment = responses.find((response) => response.comment)?.comment ?? null;
    }
    res.json({ comment });
  } catch (error: unknown) {
    console.error('Error reading vote comment:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to read comment', details: message });
  }
});

// Update (or clear) the voter's free-text comment without resubmitting votes.
// Every mode funnels here: response-based modes update the voter's rows, and a
// comparative vote updates the comment inside their stored ballot. This is what
// lets someone add a comment after they already voted.
app.post('/api/votes/:idOrSlug/comment', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open for comments' });
    }
    if (vote.config.allowFreeText !== true) {
      return res.status(400).json({ error: 'Comments are disabled for this vote' });
    }
    const voterToken = req.body?.voterToken;
    if (!isValidVoterToken(voterToken)) {
      return res.status(400).json({ error: 'voterToken is required' });
    }
    const rawComment = req.body?.comment;
    if (rawComment !== null && rawComment !== undefined && typeof rawComment !== 'string') {
      return res.status(400).json({ error: 'comment must be a string' });
    }
    const comment =
      typeof rawComment === 'string' ? rawComment.trim().slice(0, 2000) || null : null;

    if (vote.config.mode === 'COMPARATIVE_PRIORITIZATION') {
      const existing = await db.getVoteRankingSubmission(vote.id, voterToken);
      if (!existing || (!existing.draft && !existing.submitted)) {
        return res.status(409).json({ error: 'Submit a ballot before commenting' });
      }
      if (existing.submitted && vote.config.allowVoteChangeUntilClose === false) {
        return res.status(409).json({ error: 'This ballot is locked' });
      }
      const now = new Date().toISOString();
      const withComment = (ballot: typeof existing.draft) =>
        ballot ? { ...ballot, comment } : ballot;
      await db.upsertVoteRankingSubmission(vote.id, {
        voterToken,
        draft: withComment(existing.draft),
        submitted: existing.submitted ? withComment(existing.submitted) : undefined,
        draftUpdatedAt: existing.draft ? now : undefined,
        lastSeenAt: existing.lastSeenAt,
      });
      scheduleRankingLiveBroadcast(vote, { resultsChanged: false });
      return res.status(204).end();
    }

    const responses = await db.updateVoteResponsesComment(vote.id, voterToken, comment);
    if (responses.length === 0) {
      return res.status(409).json({ error: 'Vote before commenting' });
    }
    for (const response of responses) {
      broadcastVoteResponseToYjs(vote, response);
    }
    res.status(204).end();
  } catch (error: unknown) {
    console.error('Error updating vote comment:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to save comment', details: message });
  }
});

app.post('/api/votes/:idOrSlug/responses', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    let vote = await db.getVoteById(idOrSlug);
    if (!vote) {
      vote = await db.getVoteBySlug(idOrSlug);
    }
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open for responses' });
    }
    if (vote.config.mode === 'POINTS') {
      // A points ballot is a whole allocation, not independent rows: its total
      // budget and post-close lock can only be enforced against the complete
      // ballot. This per-row route writes one proposal at a time, so it cannot
      // enforce either invariant safely (a direct or concurrently retried call
      // could over-spend or change a locked ballot). Every points write must go
      // through the atomic /responses/budget endpoint; a client bundle cached
      // before that route existed must reload to pick up the new one.
      return res.status(400).json({
        error: 'Points ballots are submitted together; reload to continue voting',
      });
    }
    if (pokerEstimateChangesAreFrozen(vote)) {
      return res.status(400).json({
        error: 'This poker round has already been revealed',
      });
    }

    const { value } = req.body;
    const valueError = validateVoteResponseValue(vote, value);
    if (valueError) {
      return res.status(400).json({ error: valueError });
    }

    let response: VoteResponseEntity;
    if (vote.config.mode === 'ATTENDANCE') {
      const result = await withVoteWriteLock(vote.id, async () => {
        const rawAttendeeData =
          req.body?.attendeeData && typeof req.body.attendeeData === 'object'
            ? req.body.attendeeData
            : req.body;
        const voterToken = typeof req.body?.voterToken === 'string' ? req.body.voterToken : '';
        const existingResponses = await db.getVoteResponses(vote.id);
        const existingSentinel = existingResponses.find(
          (response) =>
            response.proposalId === EVENT_RSVP_PROPOSAL_ID && response.voterToken === voterToken,
        );
        const previous = existingSentinel?.attendeeData;
        // The public results projection strips email and custom answers, so the
        // edit form cannot round-trip them. Merge the stored answers into the
        // payload *before* validating: otherwise a returning attendee whose
        // required questions were already answered could never change or cancel
        // their RSVP without retyping answers the client can never receive.
        const rawAnswers =
          rawAttendeeData && typeof rawAttendeeData === 'object'
            ? (rawAttendeeData as Record<string, unknown>).answers
            : undefined;
        const incomingAnswers =
          rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)
            ? (rawAnswers as Record<string, unknown>)
            : {};
        const effectiveAttendeeData = previous
          ? {
              ...(rawAttendeeData as object),
              answers: { ...(previous.answers ?? {}), ...incomingAnswers },
            }
          : rawAttendeeData;
        const answersError = validateAttendanceAnswers(
          vote.config.attendance,
          effectiveAttendeeData,
        );
        if (answersError) {
          return { error: answersError };
        }
        const sanitized = sanitizeAttendanceData(vote.config.attendance, effectiveAttendeeData, {
          isAnonymous: isVoteAnonymous(vote.config),
        });
        const capacityError = attendanceCapacityError(
          vote.config.attendance,
          existingResponses,
          { value, partySize: sanitized.partySize ?? 1 },
          voterToken,
        );
        if (capacityError) {
          return { error: capacityError };
        }
        // The client never supplies approval state or the removal token: reuse
        // the token of an existing sentinel row (so a change keeps the private
        // link), otherwise mint a fresh one.
        const removalToken =
          existingSentinel?.attendeeData?.removalToken ??
          crypto.randomBytes(24).toString('base64url');
        const attendeeData = { ...sanitized, removalToken };
        // Email is optional, so the same carry-over applies when the edit form
        // submits an empty field it could not have prefilled.
        if (vote.config.attendance?.askEmail && !attendeeData.email && previous?.email) {
          attendeeData.email = previous.email;
        }
        const created = await db.createVoteResponse(vote.id, {
          ...req.body,
          proposalId: EVENT_RSVP_PROPOSAL_ID,
          loopId: null,
          attendeeData,
        });
        return { response: created };
      });
      if ('error' in result) {
        return res.status(400).json({ error: result.error });
      }
      response = result.response;
    } else if (vote.config.mode === 'SCHEDULING') {
      const proposalId =
        typeof req.body?.proposalId === 'string' ? req.body.proposalId : null;
      // Resolve the target through the shared slot predicate so this route
      // cannot accept a slot that the batch and finalize routes reject.
      const proposal = findActiveSchedulingSlot(vote.proposals, proposalId);
      if (!proposal) {
        return res.status(400).json({
          error:
            'Scheduling votes require a proposalId for an active time slot',
        });
      }
      const voterToken = req.body?.voterToken;
      if (!isValidVoterToken(voterToken)) {
        return res.status(400).json({ error: 'voterToken is required' });
      }
      // Build the row explicitly. A scheduling ballot is identified by
      // (voterToken, proposalId) with no loop, so the id, submittedAt and
      // userId are server-owned; accepting a client `loopId` would let one
      // voter mint unlimited rows for the same slot.
      const attendeeData = schedulingAttendeeDisplayName(vote, req.body);
      response = await db.createVoteResponse(vote.id, {
        voterToken,
        proposalId: proposal.id,
        loopId: null,
        value,
        attendeeData,
      });
    } else {
      // Only consent-loop rows are scoped to a round. For every other mode a
      // client-supplied `loopId` would mint a second row for the same
      // (voter, proposal), and the poker tally counts rows, so one voter could
      // stuff the revealed estimate. Drop it unless the mode actually uses loops.
      const loopId =
        vote.config.mode === 'CONSENT_LOOP' &&
        typeof req.body?.loopId === 'string'
          ? req.body.loopId
          : null;
      // Never persist a client-supplied `attendeeData` verbatim. The welcome-name
      // flow attaches a hidden display name to every non-anonymous ballot, but a
      // public caller could otherwise store a name on an anonymous vote or an
      // arbitrarily long one. Rebuild it with the scheduling rule, which already
      // encodes the anonymity check and the display-name length cap, so this path
      // cannot bypass either.
      const attendeeData = schedulingAttendeeDisplayName(vote, req.body);
      response = await db.createVoteResponse(vote.id, {
        ...req.body,
        loopId,
        attendeeData,
      });
    }
    broadcastVoteResponseToYjs(vote, response);
    const currentVote = await handlePokerResponseChange(
      vote,
      response.voterToken,
    );
    if (vote.config.mode === 'POKER_PLANNING' && req.body?.markReady === true) {
      // The estimate is persisted above, so a fresh read includes it. Only a
      // ballot that covers every active proposal may mark the participant ready;
      // otherwise an incomplete round could arm a reveal with blank cards.
      const pokerResponses = await db.getVoteResponses(vote.id);
      // The denominator is exactly the set of complete ballots, so membership in
      // it is the single readiness rule. Reusing it for the arm decision also
      // avoids scanning every response twice in one request.
      const completeKeys = pokerCompleteParticipantKeys(vote, pokerResponses);
      if (completeKeys.has(voteParticipantKey(vote.id, response.voterToken))) {
        markPokerReady({
          voteId: vote.id,
          participantId: voteParticipantKey(vote.id, response.voterToken),
        });
        await armPokerRevealIfReady(currentVote, completeKeys);
      }
    }
    res.status(201).json(response);
  } catch (error: unknown) {
    console.error('Error creating vote response:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to submit vote', details: message });
  }
});

// SCHEDULING sends one availability matrix, not one request per slot. The
// batch replaces the voter's whole availability for the vote so cleared slots
// are actually withdrawn.
app.post('/api/votes/:idOrSlug/responses/batch', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    if (vote.config.mode !== 'SCHEDULING') {
      return res.status(400).json({ error: 'Batch availability is only available for scheduling votes' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open for responses' });
    }
    const voterToken = req.body?.voterToken;
    if (!isValidVoterToken(voterToken)) {
      return res.status(400).json({ error: 'voterToken is required' });
    }
    const rawValues = req.body?.values;
    if (!rawValues || typeof rawValues !== 'object' || Array.isArray(rawValues)) {
      return res.status(400).json({ error: 'values must be an object keyed by slot id' });
    }
    const entries = Object.entries(rawValues as Record<string, unknown>);
    if (entries.length > MAX_SCHEDULING_SLOTS) {
      return res.status(400).json({ error: 'Too many scheduling values' });
    }

    const activeSlots = new Map(
      activeSchedulingSlots(vote.proposals).map((proposal) => [
        proposal.id,
        proposal,
      ]),
    );
    const clean: Array<{ proposalId: string; value: number }> = [];
    for (const [proposalId, rawValue] of entries) {
      if (!activeSlots.has(proposalId)) {
        return res.status(400).json({ error: 'Scheduling value references an unknown or inactive slot' });
      }
      // Do not coerce: `null`, `""` or `[]` become 0 ("if needed") and `true`
      // becomes 1, turning a malformed payload into a valid availability
      // answer instead of rejecting it.
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        return res.status(400).json({
          error: 'Scheduling values must be numbers: 1 (available), 0 (if needed) or -1 (unavailable)',
        });
      }
      const valueError = validateVoteResponseValue(vote, rawValue);
      if (valueError) {
        return res.status(400).json({ error: valueError });
      }
      clean.push({ proposalId, value: rawValue });
    }

    const attendeeData = schedulingAttendeeDisplayName(vote, req.body);

    // One comment per voter, repeated on every availability row: the batch
    // replaces the voter's whole matrix, so the comment belongs to the batch.
    const comment =
      vote.config.allowFreeText === true && typeof req.body?.comment === 'string'
        ? req.body.comment.trim().slice(0, 2000) || null
        : null;

    // No process-local vote lock here: the read-modify-write is now atomic in
    // the DB (one transaction plus a per-voter advisory lock), so holding a
    // per-vote JS lock would needlessly serialize every other voter's batch.
    const result = await db.replaceVoteResponsesForVoter(
      vote.id,
      voterToken,
      clean.map((entry) => ({
        proposalId: entry.proposalId,
        value: entry.value,
        attendeeData,
        comment,
      })),
      [...activeSlots.keys()],
    );

    if (result.removedIds.length > 0) {
      broadcastVoteResponsesRemovedFromYjs(result.removedIds);
    }
    broadcastVoteResponsesToYjs(vote, result.responses);
    // The client refreshes the aggregate matrix after a successful submit and
    // every other client receives the rows over Yjs, so echoing the whole
    // (potentially 1000-row) matrix back in the POST body is wasted work.
    res.status(204).end();
  } catch (error: unknown) {
    console.error('Error submitting scheduling availability:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to submit availability', details: message });
  }
});

// POINTS sends one allocation for the whole vote. The batch replaces the
// voter's budget rows atomically, so a race between two tabs cannot spend the
// same note twice, and the server validates the total (and, for fixed-note
// variations, the exact note counts) instead of trusting per-row values.
app.post('/api/votes/:idOrSlug/responses/budget', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    if (vote.config.mode !== 'POINTS') {
      return res.status(400).json({ error: 'Budget submissions are only available for points votes' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open for responses' });
    }
    const voterToken = req.body?.voterToken;
    if (!isValidVoterToken(voterToken)) {
      return res.status(400).json({ error: 'voterToken is required' });
    }
    // The atomic endpoint replaces the whole ballot, so it honours the ballot
    // lock the same way the comparative and comment paths do. The check is
    // evaluated inside the replacement transaction (see
    // `replaceVoteResponsesForVoter`) so two concurrent first submissions
    // cannot both pass a stale pre-read. It is scoped to active proposals,
    // matching the ballot the voter can actually see: a row left on a proposal
    // deactivated after voting does not strand an otherwise-empty ballot.
    const activeIds = activeProposalIds(vote);
    const parsed = parseBudgetSubmission(
      vote.config,
      activeIds,
      req.body ?? {},
    );
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const attendeeData = schedulingAttendeeDisplayName(vote, req.body);
    // A budget ballot is one comment per voter, repeated on every row: the
    // batch replaces the whole allocation, so the comment belongs to the batch.
    const comment =
      vote.config.allowFreeText === true && typeof req.body?.comment === 'string'
        ? req.body.comment.trim().slice(0, 2000) || null
        : null;
    // The comment rides on a response row, so an empty allocation would delete
    // every row and silently drop it while still returning success. Reject the
    // combination so the voter is told instead of losing their comment.
    if (comment && Object.keys(parsed.values).length === 0) {
      return res.status(400).json({
        error: 'Add at least one allocation before submitting a comment',
      });
    }

    // Atomic read-modify-write in the DB (one transaction plus a per-voter
    // advisory lock in Postgres); no process-local vote lock is needed and
    // holding one would only serialize unrelated voters.
    const result = await db.replaceVoteResponsesForVoter(
      vote.id,
      voterToken,
      Object.entries(parsed.values).map(([proposalId, value]) => ({
        proposalId,
        value,
        attendeeData,
        comment,
      })),
      activeIds,
      { rejectIfExisting: vote.config.allowVoteChangeUntilClose === false },
    );
    if (result.rejected === 'locked') {
      return res.status(409).json({ error: 'This ballot is locked' });
    }
    if (result.removedIds.length > 0) {
      broadcastVoteResponsesRemovedFromYjs(result.removedIds);
    }
    broadcastVoteResponsesToYjs(vote, result.responses);
    res.status(204).end();
  } catch (error: unknown) {
    console.error('Error submitting budget allocation:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to submit allocation', details: message });
  }
});

// Rename the voter's claimed display name without touching availability,
// RSVP metadata, the removal token, or the original submittedAt. The voter's
// own rows are selected by the withdrawal credential.
app.post('/api/votes/:idOrSlug/identity', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open' });
    }
    if (isVoteAnonymous(vote.config)) {
      return res.status(400).json({ error: 'This vote is anonymous' });
    }
    const voterToken = req.body?.voterToken;
    const displayName = normalizeVoterDisplayName(req.body?.displayName);
    if (!isValidVoterToken(voterToken) || !displayName) {
      return res.status(400).json({ error: 'voterToken and displayName are required' });
    }

    // The DB method reads the target rows and rewrites only `attendeeData`
    // inside one transaction that holds the same per-voter lock as the
    // availability batch. A read-modify-write from a pre-lock snapshot could
    // otherwise resurrect a slot a concurrent batch had just withdrawn.
    const updated = await withVoteWriteLock(vote.id, () =>
      db.renameVoteResponsesForVoter(vote.id, voterToken, displayName, {
        // Attendance names live on the RSVP sentinel row; scheduling names live
        // on every slot row. `auto` keeps an RSVP that was already hidden hidden.
        proposalId:
          vote.config.mode === 'ATTENDANCE' ? EVENT_RSVP_PROPOSAL_ID : null,
        visibility: vote.config.mode === 'ATTENDANCE' ? 'auto' : 'hidden',
      }),
    );

    // A comparative ballot's name lives on the ranking submission, not on
    // `voteResponses`, so the rename above matches nothing there. Update the
    // submission directly (and notify the facilitator panel) so a rename after
    // Submit is reflected in the participation view even when the vote locks
    // changes and the voter cannot re-save the ballot.
    if (vote.config.mode === 'COMPARATIVE_PRIORITIZATION') {
      const renamed = await db.renameVoteRankingSubmissionForVoter(
        vote.id,
        voterToken,
        displayName,
      );
      if (renamed) scheduleRankingLiveBroadcast(vote, { resultsChanged: false });
    }

    broadcastVoteResponsesToYjs(vote, updated);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error updating voter identity:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update name', details: message });
  }
});

// Moderator repair tools for a scheduling matrix. Participants are addressed
// by the moderator-only digest already present in the authenticated results
// projection, so no voter credential ever reaches the client.
app.patch('/api/votes/:idOrSlug/scheduling-cell', express.json(), async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    if (!(await canModerateVote(req, vote))) {
      return res.status(403).json({ error: 'Moderator access required' });
    }
    if (vote.config.mode !== 'SCHEDULING') {
      return res.status(400).json({ error: 'Not a scheduling vote' });
    }
    if (vote.config.phase === 'FINALIZED') {
      return res.status(400).json({ error: 'This vote is finalized' });
    }
    const participantId = req.body?.participantId;
    const proposalId = req.body?.proposalId;
    if (typeof participantId !== 'string' || participantId.trim() === '') {
      return res.status(400).json({ error: 'participantId is required' });
    }
    if (
      typeof proposalId !== 'string' ||
      !activeSchedulingSlots(vote.proposals).some((slot) => slot.id === proposalId)
    ) {
      return res.status(400).json({ error: 'Unknown scheduling slot' });
    }

    const responses = await db.getVoteResponses(vote.id);
    const target = responses.find(
      (response) => voteParticipantKey(vote.id, response.voterToken) === participantId,
    );
    if (!target) return res.status(404).json({ error: 'Participant not found' });

    const voterToken = target.voterToken;
    const existing =
      responses.find(
        (response) =>
          response.voterToken === voterToken && response.proposalId === proposalId,
      ) ?? null;

    // A null value clears the cell (no answer), which the matrix shows as "–".
    if (req.body?.value === null || req.body?.value === undefined) {
      if (!existing) return res.status(204).end();
      const removedIds = await db.deleteVoteResponse(vote.id, voterToken, proposalId);
      broadcastVoteResponsesRemovedFromYjs(removedIds);
      return res.status(204).end();
    }

    const value = Number(req.body.value);
    const valueError = validateVoteResponseValue(vote, value);
    if (valueError) return res.status(400).json({ error: valueError });

    const response = await db.createVoteResponse(vote.id, {
      voterToken,
      proposalId,
      loopId: null,
      userId: existing?.userId ?? null,
      value,
      comment: existing?.comment,
      attendeeData: existing?.attendeeData,
    });
    broadcastVoteResponseToYjs(vote, response);
    res.json({ response });
  } catch (error: unknown) {
    console.error('Error editing scheduling cell:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to edit availability', details: message });
  }
});

app.delete('/api/votes/:idOrSlug/scheduling-participants/:participantId', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    if (!(await canModerateVote(req, vote))) {
      return res.status(403).json({ error: 'Moderator access required' });
    }
    if (vote.config.mode !== 'SCHEDULING') {
      return res.status(400).json({ error: 'Not a scheduling vote' });
    }
    if (vote.config.phase === 'FINALIZED') {
      return res.status(400).json({ error: 'This vote is finalized' });
    }
    const participantId = req.params.participantId;
    const responses = await db.getVoteResponses(vote.id);
    const target = responses.find(
      (response) => voteParticipantKey(vote.id, response.voterToken) === participantId,
    );
    if (!target) return res.status(404).json({ error: 'Participant not found' });

    const removedIds = await db.deleteVoteResponsesForVoter(vote.id, target.voterToken);
    if (removedIds.length > 0) {
      broadcastVoteResponsesRemovedFromYjs(removedIds);
    }
    res.status(204).end();
  } catch (error: unknown) {
    console.error('Error deleting scheduling participant:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete participant', details: message });
  }
});

app.delete('/api/votes/:idOrSlug/responses', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    const { proposalId, loopId } = req.query;
    // Header-only: the withdrawal credential must not travel in a URL that
    // proxies, access logs and browser history record.
    const voterToken = requestToken(req, 'x-voter-token');
    // The private removal capability must not travel in a URL either.
    const removalToken = req.get('x-removal-token');
    let vote = await db.getVoteById(idOrSlug);
    if (!vote) {
      vote = await db.getVoteBySlug(idOrSlug);
    }
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open for responses' });
    }
    if (pokerEstimateChangesAreFrozen(vote)) {
      return res.status(400).json({
        error: 'This poker round has already been revealed',
      });
    }
    // A participant holding the private RSVP link can withdraw without the
    // withdrawal credential. Only the sentinel row carrying the matching
    // server-issued token may be removed.
    if (
      typeof removalToken === 'string' &&
      removalToken.length > 0 &&
      vote.config.mode === 'ATTENDANCE'
    ) {
      const responses = await db.getVoteResponses(vote.id);
      const row = responses.find(
        (response) =>
          response.proposalId === EVENT_RSVP_PROPOSAL_ID &&
          typeof response.attendeeData?.removalToken === 'string' &&
          timingSafeTokenEqual(response.attendeeData.removalToken, removalToken),
      );
      if (!row) {
        return res.status(404).json({ error: 'Response not found' });
      }
      const deletedResponseIds = await db.deleteVoteResponse(
        vote.id,
        row.voterToken,
        row.proposalId,
        row.loopId,
      );
      broadcastVoteResponsesRemovedFromYjs(deletedResponseIds);
      return res.status(204).send();
    }
    if (typeof voterToken !== 'string') {
      return res.status(400).json({ error: 'voterToken is required' });
    }
    // A locked points ballot cannot be withdrawn either: the submit route
    // refuses a replacement once an active row exists, so allowing the delete
    // would let a voter clear the ballot and submit again. Scope the check to
    // active proposals so a row left on a proposal deactivated after voting
    // (which the submit route no longer counts) does not block cleanup.
    if (
      vote.config.mode === 'POINTS' &&
      vote.config.allowVoteChangeUntilClose === false
    ) {
      const existing = await db.getVoteResponsesForVoter(vote.id, voterToken);
      const activeIds = new Set(activeProposalIds(vote));
      if (
        existing.some(
          (row) => row.proposalId !== null && activeIds.has(row.proposalId),
        )
      ) {
        return res.status(409).json({ error: 'This ballot is locked' });
      }
    }
    const isAttendance = vote.config.mode === 'ATTENDANCE';
    const deletedProposalId = isAttendance
      ? EVENT_RSVP_PROPOSAL_ID
      : typeof proposalId === 'string' ? proposalId : null;
    const deletedLoopId = isAttendance
      ? null
      : typeof loopId === 'string' ? loopId : null;
    const deletedResponseIds = await db.deleteVoteResponse(
      vote.id,
      voterToken,
      deletedProposalId,
      deletedLoopId,
    );
    broadcastVoteResponsesRemovedFromYjs(deletedResponseIds);
    // Only a withdrawal that actually removed a row proves this caller owned a
    // response. A no-op delete with an arbitrary token must not reach the poker
    // state: `handlePokerResponseChange` would otherwise disarm a reveal for a
    // non-participant who merely knows the public vote link.
    if (deletedResponseIds.length > 0) {
      await handlePokerResponseChange(vote, voterToken);
    }
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting vote response:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to withdraw vote', details: message });
  }
});

// Ephemeral in-progress selections (non-comparative modes).
//
// Writes are authenticated by the participant's voter token, exactly like a
// response submit; reads require a moderator session because the payload
// reveals unsubmitted choices and participation. Keeping this in memory (with a
// TTL) means nothing is persisted as a vote and no schema migration is needed.
// Match the scheduling slot cap so a voter who selects every slot of a large
// poll can still publish the same selection as a live draft. A lower cap would
// let the batch submit succeed while the draft write was rejected, leaving the
// moderator's live participation view silently stale.
const MAX_DRAFT_ENTRIES = MAX_SCHEDULING_SLOTS;

app.post('/api/votes/:idOrSlug/drafts', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open for drafts' });
    }
    if (vote.config.mode === 'COMPARATIVE_PRIORITIZATION') {
      return res.status(400).json({ error: 'Use the ranking-submissions endpoint for this vote' });
    }

    const { voterToken, values, publisherId } = req.body ?? {};
    if (typeof voterToken !== 'string' || voterToken.length === 0) {
      return res.status(400).json({ error: 'voterToken is required' });
    }
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      return res.status(400).json({ error: 'values must be an object keyed by proposal id' });
    }
    const entries = Object.entries(values as Record<string, unknown>);
    if (entries.length > MAX_DRAFT_ENTRIES) {
      return res.status(400).json({ error: 'Too many draft entries' });
    }
    // Ignore proposals that no longer exist (a stale client may still hold one)
    // but reject values the submit route would refuse, so a draft can never
    // show a state that could not be submitted.
    const proposalIds = new Set(vote.proposals.map((proposal) => proposal.id));
    const cleanValues: Record<string, number> = {};
    for (const [proposalId, value] of entries) {
      if (!proposalIds.has(proposalId)) continue;
      const valueError = validateVoteResponseValue(vote, value as number);
      if (valueError) {
        return res.status(400).json({ error: valueError });
      }
      cleanValues[proposalId] = value as number;
    }

    if (vote.config.mode === 'POINTS') {
      // The draft channel carries totals only. Reject the ones the budget
      // submit route would refuse so the live moderator matrix never shows an
      // allocation that cannot be saved.
      const draftError = validateBudgetDraftValues(vote.config, cleanValues);
      if (draftError) {
        return res.status(400).json({ error: draftError });
      }
    }

    upsertVoteDraft({
      voteId: vote.id,
      voterAlias: voterAlias(vote.id, voterToken),
      participantKey: voteParticipantKey(vote.id, voterToken),
      values: cleanValues,
      // The draft channel is moderator-only, so a non-anonymous vote can carry
      // the welcome name here before the participant submits.
      displayName: voteResponseCarriesDisplayName(vote.config)
        ? normalizeVoterDisplayName(
            (req.body as { displayName?: unknown } | undefined)?.displayName,
          ) || undefined
        : undefined,
      publisherId: typeof publisherId === 'string' ? publisherId : undefined,
    });
    broadcastVoteDraftRevision(vote.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error publishing vote draft:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to publish vote draft', details: message });
  }
});

app.delete('/api/votes/:idOrSlug/drafts', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    // Header-only: the voter token is the participant's withdrawal credential,
    // and this DELETE runs on page unload for every participant, so a query
    // token would be written to access/proxy logs.
    const voterToken = requestToken(req, 'x-voter-token');
    const publisherId = req.query.publisherId;
    if (!voterToken) {
      return res.status(400).json({ error: 'voterToken is required' });
    }
    const removed = deleteVoteDraft(
      vote.id,
      voteParticipantKey(vote.id, voterToken),
      typeof publisherId === 'string' ? publisherId : undefined,
    );
    if (removed) broadcastVoteDraftRevision(vote.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting vote draft:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete vote draft', details: message });
  }
});

app.get('/api/votes/:idOrSlug/drafts', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'X-Moderator-Token');
    if (!(await canModerateVote(req, vote))) {
      return res.status(403).json({ error: 'Facilitator access required' });
    }
    // A closed vote must show submitted ballots only, even if a dead tab's
    // draft has not expired yet.
    // A draft written before anonymity was turned on still holds its name until
    // the TTL expires. Never re-expose it, matching the results route: turning
    // anonymity on must not surface names captured while the vote was named.
    const isAnonymous = isVoteAnonymous(vote.config);
    const drafts =
      vote.config.phase === 'OPEN'
        ? listVoteDrafts(vote.id).map((draft) => ({
            voteId: draft.voteId,
            voterAlias: draft.voterAlias,
            participantId: draft.participantId,
            values: draft.values,
            // Moderator-only: names an in-progress scheduling participant.
            displayName: isAnonymous ? undefined : draft.displayName,
            updatedAt: draft.updatedAt,
          }))
        : [];
    res.json({ drafts });
  } catch (error: unknown) {
    console.error('Error fetching vote drafts:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch vote drafts', details: message });
  }
});

// Ephemeral presence: who has the public page open, before touching a ballot.
// The write is authenticated by the voter token; the read needs a moderator
// session because it reveals participation (and, for anonymous votes, that
// someone is taking part at all).
app.post('/api/votes/:idOrSlug/presence', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open' });
    }
    const { voterToken } = req.body ?? {};
    if (typeof voterToken !== 'string' || voterToken.length === 0) {
      return res.status(400).json({ error: 'voterToken is required' });
    }
    // Only a non-anonymous vote may name a presence entry. The moderator-only
    // channel can then list a participant who opened the page before casting a
    // ballot by their chosen name instead of the opaque public alias.
    const displayName = isVoteAnonymous(vote.config)
      ? undefined
      : normalizeVoterDisplayName(req.body?.displayName) || undefined;
    touchVotePresence({
      voteId: vote.id,
      voterAlias: voterAlias(vote.id, voterToken),
      participantKey: voteParticipantKey(vote.id, voterToken),
      displayName,
    });
    broadcastVotePresenceRevision(vote.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error publishing vote presence:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to publish vote presence', details: message });
  }
});

app.get('/api/votes/:idOrSlug/presence', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'X-Moderator-Token');
    if (!(await canModerateVote(req, vote))) {
      return res.status(403).json({ error: 'Facilitator access required' });
    }
    const presence =
      vote.config.phase === 'OPEN' ? listVotePresence(vote.id) : [];
    res.json({ presence });
  } catch (error: unknown) {
    console.error('Error fetching vote presence:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch vote presence', details: message });
  }
});

// Poker planning readiness/reveal. The ready signal is ephemeral and the
// participant set is derived from the same submitted-response identities the
// scheduling tally uses, so no separate participant/role model is introduced.
app.get('/api/votes/:idOrSlug/poker', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    if (vote.config.mode !== 'POKER_PLANNING') {
      return res.status(400).json({ error: 'Not a poker planning vote' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'X-Voter-Token');
    let current = vote;
    if (vote.config.poker?.revealAt) {
      // `revealPokerIfDue` returns the updated vote only when it actually
      // revealed. When the deadline has not arrived yet — the common case on
      // this 2-second poll — nothing was written, so reuse the snapshot this
      // route already loaded instead of re-reading the whole row (which
      // includes proposals) a second and third time per tick.
      current = (await revealPokerIfDue(vote.id)) ?? vote;
    }
    const voterToken = requestToken(req, 'x-voter-token');
    // Resolve the participant set once for this request. The branches below can
    // arm or cancel a reveal, but neither changes who submitted, so re-deriving
    // it for the returned state would only add another response scan per poll.
    const participants = await pokerCachedCompleteParticipantKeys(current);
    let state = await computePokerState(current, voterToken, participants);
    // Cancel a stale arm, but keep participants' ready flags (clearReady: false)
    // so they do not have to re-ready and the round can re-arm as soon as the
    // last estimate lands. The stale-vs-restart-recovery rule is in
    // `pokerArmIsStale` so it cannot drift from the reveal timer's copy.
    if (pokerArmIsStale(state)) {
      current = await cancelPokerReveal(current, { clearReady: false });
      state = { ...state, armedAt: null, revealAt: null };
    }
    if (state.allReady && !state.revealAt && !state.revealedAt) {
      const armed = await armPokerRevealIfReady(current, participants);
      if (armed !== current) {
        const armedPoker = normalizePokerConfig(armed.config.poker);
        state = {
          ...state,
          armedAt: armedPoker.armedAt ?? null,
          revealAt: armedPoker.revealAt ?? null,
          revealedAt: armedPoker.revealedAt ?? null,
        };
      }
    }
    res.json(state);
  } catch (error: unknown) {
    console.error('Error fetching poker state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch poker state', details: message });
  }
});

app.post('/api/votes/:idOrSlug/poker/ready', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    if (vote.config.mode !== 'POKER_PLANNING') {
      return res.status(400).json({ error: 'Not a poker planning vote' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open' });
    }
    if (vote.config.poker?.revealedAt) {
      return res.status(400).json({ error: 'This round has already been revealed' });
    }
    const voterToken = requestToken(req, 'x-voter-token');
    if (!voterToken) {
      return res.status(400).json({ error: 'voterToken is required' });
    }
    const responses = await db.getVoteResponses(vote.id);
    const participantId = voteParticipantKey(vote.id, voterToken);
    // The participant denominator is exactly the set of complete ballots, so
    // membership in it is the readiness rule. That keeps the gate, the arm
    // decision and the returned state on one source of truth, and it rejects a
    // partial or empty ballot before it can arm a reveal with blank cards.
    const participants = pokerCompleteParticipantKeys(vote, responses);
    if (!participants.has(participantId)) {
      return res.status(400).json({
        error: 'Estimate every proposal before marking ready',
      });
    }
    markPokerReady({ voteId: vote.id, participantId });
    const armed = await armPokerRevealIfReady(vote, participants);
    res.json(await computePokerState(armed, voterToken, participants));
  } catch (error: unknown) {
    console.error('Error marking poker ready:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to mark ready', details: message });
  }
});

app.post('/api/votes/:idOrSlug/poker/cancel', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    if (vote.config.mode !== 'POKER_PLANNING') {
      return res.status(400).json({ error: 'Not a poker planning vote' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open' });
    }
    const voterToken = requestToken(req, 'x-voter-token');
    if (!voterToken) {
      return res.status(400).json({ error: 'voterToken is required' });
    }
    const participants = await pokerCachedCompleteParticipantKeys(vote);
    if (!participants.has(voteParticipantKey(vote.id, voterToken))) {
      return res.status(403).json({ error: 'Only participants can cancel a reveal' });
    }
    // Cancel is a participant withdrawing THEIR readiness during the arming
    // window, not a group-wide reset. Clearing every participant's flag here
    // let any single participant keep the round permanently unarmable, so only
    // the caller is cleared and the now-incomplete set disarms the reveal.
    clearPokerReadyForParticipant(
      vote.id,
      voteParticipantKey(vote.id, voterToken),
    );
    const updated = await cancelPokerReveal(vote, { clearReady: false });
    res.json(await computePokerState(updated, voterToken, participants));
  } catch (error: unknown) {
    console.error('Error cancelling poker reveal:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to cancel reveal', details: message });
  }
});

app.post('/api/votes/:idOrSlug/poker/reveal', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    if (vote.config.mode !== 'POKER_PLANNING') {
      return res.status(400).json({ error: 'Not a poker planning vote' });
    }
    await revealPokerIfDue(vote.id);
    const current = (await db.getVoteById(vote.id)) ?? vote;
    res.json(
      await computePokerState(current, requestToken(req, 'x-voter-token')),
    );
  } catch (error: unknown) {
    console.error('Error revealing poker round:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to reveal round', details: message });
  }
});

app.post('/api/votes/:idOrSlug/poker/reveal-proposal', async (req: Request, res: Response) => {
  // The response depends on the moderator capability and carries the new
  // reveal state, so it must never be reused by a shared cache.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'X-Moderator-Token');
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    // Only a moderator capability may force an early reveal. Participant
    // anonymity is unchanged: this reveals the estimates, not the voters.
    if (!(await canModerateVote(req, vote))) {
      return res.status(403).json({ error: 'Moderator capability required' });
    }
    if (vote.config.mode !== 'POKER_PLANNING') {
      return res.status(400).json({ error: 'Not a poker planning vote' });
    }
    if (vote.config.phase === 'IDLE') {
      return res.status(400).json({ error: 'Vote has not started' });
    }
    const poker = normalizePokerConfig(vote.config.poker);
    if (poker.revealedAt) {
      return res.status(409).json({ error: 'This round has already been fully revealed' });
    }
    const proposalId =
      typeof req.body?.proposalId === 'string' ? req.body.proposalId : '';

    // Re-read inside the write path so the active-proposal check, the merged
    // list and the guard all describe the same row. A save or a competing
    // reveal that lands after the first read must not be clobbered.
    const fresh = await db.getVoteById(vote.id);
    if (!fresh) return res.status(404).json({ error: 'Vote not found' });
    if (fresh.config.mode !== 'POKER_PLANNING') {
      return res.status(400).json({ error: 'Not a poker planning vote' });
    }
    if (fresh.config.phase === 'IDLE') {
      return res.status(400).json({ error: 'Vote has not started' });
    }
    const freshPoker = normalizePokerConfig(fresh.config.poker);
    if (freshPoker.revealedAt) {
      return res.status(409).json({ error: 'This round has already been fully revealed' });
    }
    const proposal = fresh.proposals.find(
      (candidate) => candidate.id === proposalId && candidate.active,
    );
    if (!proposal) {
      return res.status(400).json({
        error: 'proposalId must reference an active proposal',
      });
    }

    const existingIds = freshPoker.revealedProposalIds ?? [];
    if (existingIds.includes(proposalId)) {
      // Idempotent: the proposition is already visible, and the caller still
      // gets the current projection.
      return res.json(fresh);
    }
    const nextIds =
      normalizeRevealedProposalIds([...existingIds, proposalId]) ?? [];

    const updated = await db.updateVotePokerConfig(
      fresh.id,
      { revealedProposalIds: nextIds },
      {
        phase: fresh.config.phase,
        pokerRevealedAt: freshPoker.revealedAt ?? null,
        pokerRevealAt: freshPoker.revealAt ?? null,
        pokerRevealedProposalIds: pokerRevealedProposalIdsSignature(existingIds),
      },
    );
    if (!updated) {
      // A concurrent reveal, reset or phase change won the compare-and-swap.
      return res.status(409).json({
        error: 'This round has already changed; refresh and try again',
      });
    }
    broadcastVoteToYjs(updated);
    trackPokerValueVisibility(updated);
    res.json(updated);
  } catch (error: unknown) {
    console.error('Error force-revealing poker proposal:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to reveal proposal', details: message });
  }
});

app.post('/api/votes/:idOrSlug/poker/next-round', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    if (vote.config.mode !== 'POKER_PLANNING') {
      return res.status(400).json({ error: 'Not a poker planning vote' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open' });
    }
    if (!vote.config.poker?.revealedAt) {
      return res.status(400).json({ error: 'Reveal the current round first' });
    }
    const voterToken = requestToken(req, 'x-voter-token');
    if (!voterToken) {
      return res.status(400).json({ error: 'voterToken is required' });
    }
    const participants = await pokerCachedCompleteParticipantKeys(vote);
    if (!participants.has(voteParticipantKey(vote.id, voterToken))) {
      return res.status(403).json({ error: 'Only participants can start the next round' });
    }

    const poker = normalizePokerConfig(vote.config.poker);
    // Delete the round's responses and advance to the next round in one
    // transaction. The guard makes that write a compare-and-swap against the
    // round this request read: a duplicate "next round" (two participants both
    // see the revealed round) or a concurrent close/finalize would otherwise
    // delete the estimates already submitted for the new round and reopen a
    // vote that changed underneath the request.
    const updated = await db.resetVoteWithConfig(
      vote.id,
      {
        phase: 'OPEN',
        poker: clearedPokerRound(poker, (poker.round ?? 0) + 1),
      },
      {
        phase: 'OPEN',
        pokerRound: poker.round ?? 0,
        pokerRevealedAt: poker.revealedAt ?? null,
      },
    );
    if (!updated) {
      const stillExists = await db.getVoteById(vote.id);
      return stillExists
        ? res.status(409).json({
            error: 'This round has already changed; refresh and try again',
          })
        : res.status(404).json({ error: 'Vote not found' });
    }

    // The reset removed every response: the next round's participant set is
    // empty, not the set resolved above, so the teardown must invalidate it.
    teardownVoteLiveState(vote.id);
    broadcastVoteToYjs(updated);
    res.json(await computePokerState(updated, voterToken));
  } catch (error: unknown) {
    console.error('Error starting next poker round:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to start next round', details: message });
  }
});

// Vote results (public)
app.get('/api/votes/:idOrSlug/results', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    let vote = await db.getVoteById(idOrSlug);
    if (!vote) {
      vote = await db.getVoteBySlug(idOrSlug);
    }
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    // The body depends on the caller: `X-Moderator-Token` restores private
    // attendee fields and the full tally, and `X-Voter-Token` restores that
    // voter's own pre-reveal poker estimate. A shared cache keyed only on the
    // URL must not reuse one caller's projection for another, so keep it
    // private and keyed by both capabilities. `no-cache` (not `no-store`)
    // still forces revalidation on every poll, letting this endpoint answer an
    // unchanged 5-second poll with a bodiless 304 via its ETag.
    res.setHeader('Cache-Control', 'private, no-cache');
    // Append to the `Vary: Accept-Encoding` compression already set instead of
    // replacing it.
    res.vary('X-Voter-Token');
    res.vary('X-Moderator-Token');
    const responses = await db.getVoteResponses(vote.id);
    const isModerator = await canModerateVote(req, vote);
    // Organizers need the emails and custom-question answers they asked voters
    // for; expose them only to the moderator capability. The private removal
    // token stays stripped on every path, including this one.
    const safeResponses = redactVoteResponsesForVote(vote, responses, {
      keepAttendeePrivateFields: isModerator,
    });
    // The moderator view merges in-progress drafts into these submitted rows.
    // Join on the server's unforgeable, vote-scoped participant digest rather
    // than the short public alias, which a participant can brute-force into a
    // collision and use to impersonate another participant in the live tally.
    // The digest is one-way and only returned to a caller that already holds
    // this vote's moderator capability; the public projection stays alias-only.
    if (isModerator) {
      for (let index = 0; index < safeResponses.length; index++) {
        safeResponses[index].participantId = voteParticipantKey(
          vote.id,
          responses[index].voterToken,
        );
      }
      // Non-attendance names are hidden from the public projection, so only
      // the moderator capability gets them back — and only on a non-anonymous
      // vote. Turning anonymity on after names were submitted must not
      // re-expose them, matching how `redactAttendeeDataForVote` drops the name
      // on every other path. Merge by index to keep the raw name out of every
      // other response path.
      if (voteResponseCarriesDisplayName(vote.config)) {
        for (let index = 0; index < safeResponses.length; index++) {
          const displayName = responses[index]?.attendeeData?.displayName;
          if (!displayName) continue;
          safeResponses[index].attendeeData = {
            ...(safeResponses[index].attendeeData ?? {}),
            displayName,
            visibility: 'hidden',
          };
        }
      }
    }
    // A planning-poker round is a blind simultaneous reveal: the page hides the
    // tally until the round (or a proposition) is revealed, but the projection
    // would otherwise still carry every estimate in the payload. Strip the
    // values from the public read per proposal, keeping the caller's own
    // estimate so a reload can restore their cards. `pokerProposalIsRevealed`
    // is the same per-proposal rule the live Yjs broadcast applies, so the two
    // projections cannot drift.
    if (pokerValuesAreHidden(vote) && !isModerator) {
      const viewerToken = requestToken(req, 'x-voter-token');
      for (let index = 0; index < safeResponses.length; index++) {
        if (viewerToken && responses[index]?.voterToken === viewerToken) continue;
        // Per-proposal blind reveal: only the proposals a moderator force-
        // revealed (or a round-wide reveal) keep their estimate.
        if (pokerProposalIsRevealed(vote, responses[index]?.proposalId)) continue;
        safeResponses[index] = stripPokerValue(safeResponses[index]);
      }
    }
    res.json({ vote, responses: safeResponses, totalVotes: responses.length });
  } catch (error: unknown) {
    console.error('Error fetching vote results:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch results', details: message });
  }
});

// Vote loops (CONSENT_LOOP)
app.get('/api/votes/:id/loops', async (req: Request, res: Response) => {
  try {
    const loops = await db.getVoteLoops(req.params.id);
    res.json(loops);
  } catch (error: unknown) {
    console.error('Error fetching vote loops:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch loops', details: message });
  }
});

app.post('/api/votes/:id/loops', async (req: Request, res: Response) => {
  try {
    const loop = await db.createVoteLoop(req.params.id, req.body);
    res.status(201).json(loop);
  } catch (error: unknown) {
    console.error('Error creating vote loop:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to create loop', details: message });
  }
});

app.post('/api/votes/loops/:loopId/close', async (req: Request, res: Response) => {
  try {
    const loop = await db.closeVoteLoop(req.params.loopId);
    if (!loop) {
      return res.status(404).json({ error: 'Loop not found' });
    }
    res.json(loop);
  } catch (error: unknown) {
    console.error('Error closing vote loop:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to close loop', details: message });
  }
});

app.put('/api/votes/loops/:loopId', async (req: Request, res: Response) => {
  try {
    const loop = await db.updateVoteLoop(req.params.loopId, req.body);
    if (!loop) {
      return res.status(404).json({ error: 'Loop not found' });
    }
    res.json(loop);
  } catch (error: unknown) {
    console.error('Error updating vote loop:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update loop', details: message });
  }
});

app.post('/api/vote-loops/import', async (req: Request, res: Response) => {
  try {
    const items: VoteLoop[] = req.body;
    await db.importVoteLoops(items);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error importing vote loops:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import vote loops', details: message });
  }
});

app.post('/api/vote-responses/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const items: VoteResponseEntity[] = req.body;
    await db.importVoteResponses(items);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error importing vote responses:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import vote responses', details: message });
  }
});

app.post('/api/vote-moderators/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const items: VoteModerator[] = req.body;
    await db.importVoteModerators(items);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error importing vote moderators:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import vote moderators', details: message });
  }
});

// Vote moderators
app.get('/api/votes/:id/moderators', async (req: Request, res: Response) => {
  try {
    const moderators = await db.getVoteModerators(req.params.id);
    res.json(moderators);
  } catch (error: unknown) {
    console.error('Error fetching vote moderators:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch moderators', details: message });
  }
});

app.post('/api/votes/:id/moderators', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.id);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    const body = (req.body ?? {}) as {
      displayName?: unknown;
      email?: unknown;
      addedByUserId?: unknown;
    };
    // `addedByUserId` is audit metadata, not a credential. Older clients (and
    // the one-click share-link UI) do not send it; default to the vote owner
    // instead of passing `undefined` to SQLite.
    const moderator = await db.addVoteModerator(vote.id, {
      displayName:
        typeof body.displayName === 'string' && body.displayName.trim()
          ? body.displayName.trim()
          : 'Moderator link',
      email:
        typeof body.email === 'string' && body.email.trim()
          ? body.email.trim()
          : undefined,
      addedByUserId:
        typeof body.addedByUserId === 'string' && body.addedByUserId.trim()
          ? body.addedByUserId
          : vote.ownerId,
    });
    res.status(201).json(moderator);
  } catch (error: unknown) {
    console.error('Error adding vote moderator:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to add moderator', details: message });
  }
});

app.delete('/api/votes/:id/moderators/:moderatorId', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.id);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    // Revoking a link is a privileged, destructive operation. Require a live
    // moderator capability for this vote (any active link, including the one
    // being revoked) so an unauthenticated caller cannot deactivate links.
    if (!(await canModerateVote(req, vote))) {
      return res.status(403).json({ error: 'Facilitator access required' });
    }
    // Only allow revoking a link that belongs to this vote; moderator ids are
    // otherwise globally addressable.
    const moderators = await db.getVoteModerators(vote.id);
    if (!moderators.some((moderator) => moderator.id === req.params.moderatorId)) {
      return res.status(404).json({ error: 'Moderator not found' });
    }
    await db.revokeVoteModerator(req.params.moderatorId);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error revoking vote moderator:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to revoke moderator', details: message });
  }
});

app.get('/api/votes/moderate/:token', async (req: Request, res: Response) => {
  try {
    const result = await db.resolveVoteModeratorToken(req.params.token);
    if (!result) {
      return res.status(404).json({ error: 'Invalid moderator token' });
    }
    res.json(result);
  } catch (error: unknown) {
    console.error('Error resolving moderator token:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to resolve moderator token', details: message });
  }
});

// Vote import
app.post('/api/votes/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Expected an array of votes' });
    }
    // An import upserts the entire config, so an imported vote could set
    // `config.poker.revealedAt` (or drop the deck) and unblind a live round:
    // every caller of the results projection then stops stripping estimates,
    // and `trackPokerValueVisibility` would drop the id from the hidden set.
    // The poker round is server-owned, so for an existing poker vote keep the
    // persisted mode, phase, results flag and reveal state instead of the
    // imported snapshot. A vote that does not exist yet is a plain restore and
    // has no live estimates to expose.
    // A restore payload can carry thousands of votes, so resolve the existing
    // rows in one query instead of awaiting a lookup per item. Only the ids the
    // payload names are read, so the cost follows the import size rather than
    // the whole vote table.
    const importIds = Array.from(
      new Set(
        (items as VoteEntity[])
          .map((item) => (item && typeof item.id === 'string' ? item.id : null))
          .filter((id): id is string => id !== null),
      ),
    );
    const votesById = new Map(
      (await db.getVotesByIds(importIds)).map((vote) => [vote.id, vote]),
    );
    const sanitized: VoteEntity[] = [];
    for (const item of items as VoteEntity[]) {
      const existing =
        item && typeof item.id === 'string' ? votesById.get(item.id) : undefined;
      if (existing && existing.config.mode === 'POKER_PLANNING') {
        const itemConfig =
          item?.config && typeof item.config === 'object' ? item.config : null;
        sanitized.push({
          ...item,
          config: {
            ...(itemConfig ?? existing.config),
            mode: existing.config.mode,
            phase: existing.config.phase,
            showResultsBeforeClose: existing.config.showResultsBeforeClose,
            poker: existing.config.poker,
          },
        });
      } else {
        sanitized.push(item);
      }
    }
    await db.importVotes(sanitized);
    for (const item of sanitized) trackPokerValueVisibility(item);
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error('Failed to import votes:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import votes', details: message });
  }
});

// Vote QR code endpoints
app.get('/api/votes/:slug/qr.svg', async (req: Request, res: Response) => {
  try {
    const vote = await db.getVoteBySlug(req.params.slug);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    const url = `${req.protocol}://${req.get('host')}/v/${vote.slug}`;
    const svg = await QRCode.toString(url, { type: 'svg', width: 256, margin: 2 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(svg);
  } catch (error: unknown) {
    console.error('Error generating QR SVG:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to generate QR code', details: message });
  }
});

app.get('/api/votes/:slug/qr.png', async (req: Request, res: Response) => {
  try {
    const vote = await db.getVoteBySlug(req.params.slug);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    const url = `${req.protocol}://${req.get('host')}/v/${vote.slug}`;
    const png = await QRCode.toBuffer(url, { type: 'png', width: 512, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(png);
  } catch (error: unknown) {
    console.error('Error generating QR PNG:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to generate QR code', details: message });
  }
});

// Reminders routes
app.get('/api/reminders', async (req: Request, res: Response) => {
  try {
    const userId = req.query.user_id as string | undefined;
    const reminders = await db.listReminders(userId);
    res.json(reminders);
  } catch (error: unknown) {
    console.error('Error fetching reminders:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch reminders', details: message });
  }
});

app.post('/api/reminders', async (req: Request, res: Response) => {
  try {
    const reminder = await db.createReminder(req.body);
    res.status(201).json(reminder);
  } catch (error: unknown) {
    console.error('Error creating reminder:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to create reminder', details: message });
  }
});

app.get('/api/reminders/:id', async (req: Request, res: Response) => {
  try {
    const reminder = await db.getReminderById(req.params.id);
    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }
    res.json(reminder);
  } catch (error: unknown) {
    console.error('Error fetching reminder:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch reminder', details: message });
  }
});

app.patch('/api/reminders/:id', async (req: Request, res: Response) => {
  try {
    const reminder = await db.updateReminder(req.params.id, req.body);
    res.json(reminder);
  } catch (error: unknown) {
    console.error('Error updating reminder:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update reminder', details: message });
  }
});

app.delete('/api/reminders/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteReminder(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting reminder:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete reminder', details: message });
  }
});

app.delete('/api/reminders/task/:taskId', async (req: Request, res: Response) => {
  try {
    await db.deleteRemindersByTaskId(req.params.taskId);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting reminders by task ID:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete reminders', details: message });
  }
});

app.post('/api/reminders/clear', async (req: Request, res: Response) => {
  try {
    await db.clearAllReminders();
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error clearing reminders:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to clear reminders', details: message });
  }
});

app.post('/api/reminders/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const reminders = req.body;
    if (!Array.isArray(reminders)) {
      return res.status(400).json({ error: 'Expected an array of reminders' });
    }
    await db.importReminders(reminders);
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error('Failed to import reminders:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import reminders', details: message });
  }
});

// Pomodoro session routes
app.get('/api/pomodoro-sessions', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const since = req.query.since ? Number(req.query.since) : undefined;
    const sessions = await db.listPomodoroSessions(userId, since);
    res.json({ data: sessions });
  } catch (error: unknown) {
    console.error('Error fetching pomodoro sessions:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch pomodoro sessions', details: message });
  }
});

app.post('/api/pomodoro-sessions', async (req: Request, res: Response) => {
  try {
    const session = await db.createPomodoroSession(req.body);
    res.status(201).json(session);
  } catch (error: unknown) {
    console.error('Error creating pomodoro session:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to create pomodoro session', details: message });
  }
});

app.post('/api/pomodoro-sessions/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const sessions: PomodoroSession[] = req.body;
    await db.importPomodoroSessions(sessions);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error importing pomodoro sessions:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import pomodoro sessions', details: message });
  }
});

app.delete('/api/pomodoro-sessions/:id', async (req: Request, res: Response) => {
  try {
    await db.deletePomodoroSession(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting pomodoro session:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete pomodoro session', details: message });
  }
});

app.post('/api/pomodoro-sessions/clear', async (req: Request, res: Response) => {
  try {
    await db.clearAllPomodoroSessions();
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error clearing pomodoro sessions:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to clear pomodoro sessions', details: message });
  }
});

app.delete('/api/pomodoro-sessions/user/:userId', async (req: Request, res: Response) => {
  try {
    await db.deletePomodoroSessionsByUser(req.params.userId);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting pomodoro sessions by user:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete pomodoro sessions for user', details: message });
  }
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler - serve index.html for client-side routing in production
app.use('*', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const indexPath = path.resolve(__dirname, '../../index.html');

    // Only serve index.html for routes that match the base URL
    const baseUrl = process.env.VITE_BASE_URL || '/';

    // Never fall back to index.html for files that must exist as real assets.
    // After a redeploy, stale clients request old hashed chunks; serving HTML
    // here makes dynamic imports fail with a cryptic module-load TypeError
    // (and blank screen) instead of a clean 404 the SPA can recover from.
    const isAssetPath =
      req.originalUrl.startsWith('/assets/') ||
      req.originalUrl.includes('/assets/') ||
      /\.(js|mjs|css|json|map|wasm|woff2?|ttf|png|jpe?g|svg|gif|webp|ico|mp3|ogg|wav)$/.test(
        req.originalUrl.split('?')[0]
      );

    if (isAssetPath) {
      res.status(404).json({ error: 'Asset not found (stale build?)' });
      return;
    }

    if (req.originalUrl.startsWith(baseUrl)) {
      // Prevent stale index.html (and thus stale hashed chunk references) being cached
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Route not found' });
    }
  } else {
    res.status(404).json({ error: 'Route not found' });
  }
});
// Live handles so a signal can stop accepting traffic and drain before the DB
// pool is closed. They stay null until `startServer` reaches `listen`, which
// also makes a signal during startup a no-op for the network side.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let httpServer: ReturnType<typeof app.listen> | null = null;
let wsServer: WebSocketServer | null = null;
let shuttingDown = false;

/**
 * Stop accepting new HTTP connections and drain in-flight requests, but never
 * wait longer than `SHUTDOWN_TIMEOUT_MS`. Idle keep-alive sockets are closed
 * immediately so they cannot keep the listener open; only a request that is
 * genuinely still running reaches the forced close.
 */
async function closeHttpServer(
  server: ReturnType<typeof app.listen>,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      server.closeAllConnections?.();
      resolve();
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref?.();
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
    server.closeIdleConnections?.();
  });
}

/** Terminate live WebSocket clients, then close the WS server, bounded. */
async function closeWsServer(wss: WebSocketServer): Promise<void> {
  for (const client of wss.clients) {
    try {
      client.terminate();
    } catch {
      // Already closing; nothing left to clean up.
    }
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
    timer.unref?.();
    wss.close(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// Initialize database and start server
async function startServer() {
  try {
    await initializeDb();
    // A poker reveal deadline persists on the vote, but its timer and readiness
    // set do not, so re-arm any armed round before serving traffic.
    await recoverPokerReveals();
    // The shared Yjs response map is unauthenticated, so the blind-reveal scrub
    // must know which persisted rounds are still hidden before it accepts rows.
    // A failure here only disables that extra enforcement (logged), it does not
    // prevent the server from serving traffic.
    try {
      for (const vote of await db.getUnrevealedPokerVoteStates()) {
        // Seeds both the blind vote-id set and the per-proposal allow-list so a
        // restart cannot make a force-revealed proposal's live tally stay
        // hidden until the next write.
        trackPokerValueVisibility(vote);
      }
    } catch (error: unknown) {
      console.error('Failed to load poker blind-reveal state:', error);
    }
    purgeLegacyVoteLiveMapsFromYjs();
    // Redact withdrawal tokens written by clients that predate this change (a
    // stale bundle keeps publishing raw tokens into the shared room).
    scrubLegacyVoteResponseTokensFromYjs();
    // Ephemeral live stores prune on write, but a vote nobody writes to or
    // moderates again would keep its expired drafts/presence for the life of the
    // process. Sweep on a timer so the TTL holds even then.
    setInterval(() => {
      sweepExpiredVoteDrafts();
      sweepExpiredVotePresence();
      sweepExpiredPokerReady();
      sweepPokerParticipantCache();
    }, 5 * 60 * 1000);
    startSprintScheduler(db, broadcastTaskToYjs);

    // Check if tasks exist, if not, the frontend will call the init-defaults endpoint
    const tasksResult = await db.getTasks();
    if (tasksResult.total === 0) {
      console.log('No tasks found in the database. Frontend will initialize default tasks.');
    }

    const server = app.listen(PORT, () => {
      console.log(`P3FO Server listening on port ${PORT}`);
      console.log(`Database client: ${DB_CLIENT}`);
      if (DB_CLIENT === 'sqlite') {
        console.log(`SQLite file: ${DB_SQLITE_FILE}`);
      } else if (DB_CLIENT === 'pg' && DB_URL) {
        console.log(`PostgreSQL URL: ${DB_URL.replace(/\/\/[^@]*@/, '//***@')}`); // Mask credentials
      }
    });
    httpServer = server;

    // Attach WebSocket server
    const wss = new WebSocketServer({ noServer: true });
    wsServer = wss;

    server.on('upgrade', (request, socket, head) => {
      // You can handle authentication here if needed
      const handleAuth = (ws: unknown) => {
        wss.emit('connection', ws, request);
      };
      wss.handleUpgrade(request, socket, head, handleAuth);
    });

    wss.on('connection', (ws, req) => {
      // The browser connects to <origin>/ws/<room>; a dev proxy may strip the
      // /ws prefix before forwarding. Normalize both to the bare room name so
      // the doc that clients share is also the doc server-side broadcasts use
      // (see YJS_ROOM). Without this, production writes landed in
      // "ws/p3fo-room" while getYDoc(YJS_ROOM) wrote to "p3fo-room".
      const rawDocName = req.url?.slice(1).split('?')[0] || 'default-doc';
      const docName = rawDocName.startsWith('ws/') ? rawDocName.slice(3) : rawDocName;
      setupWSConnection(ws, req, { docName });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown for both interactive stops (SIGINT) and orchestrator
// deploys (SIGTERM). The listener must stop accepting traffic and drain before
// the pool is closed: closing the DB first cut in-flight requests off (the
// SQLite client closes synchronously) or made them fail against an ended pool
// (Postgres). A skipped handler leaves connections to be killed without
// closing the DB.
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);
  const server = httpServer;
  const wss = wsServer;
  try {
    await Promise.all([
      server ? closeHttpServer(server) : Promise.resolve(),
      wss ? closeWsServer(wss) : Promise.resolve(),
    ]);
  } catch (error: unknown) {
    console.error('Error while draining connections:', error);
  }
  try {
    if (db && db.close) {
      await db.close();
    }
  } catch (error: unknown) {
    console.error('Error while closing the database:', error);
  }
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

startServer();