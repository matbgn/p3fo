import * as React from 'react';
import type {
  VoteRankingBallot,
  VoteRankingResult,
  VoteRankingSubmission,
} from '@/lib/persistence-types';
import type { BallotParticipationSummary } from '@/lib/vote-ranking';
import { PERSISTENCE_CONFIG } from '@/lib/persistence-config';
import {
  yVoteRankingState,
  initializeCollaboration,
  isCollaborationEnabled,
  isCollaborationConnected,
} from '@/lib/collaboration';

if (!PERSISTENCE_CONFIG.FORCE_BROWSER) {
  initializeCollaboration();
}

/** The ranking endpoints live on the same server as the persistence adapter,
 * which may be configured on a different origin than the SPA (VITE_P3FO_API_URL). */
const apiPath = (path: string) => `${PERSISTENCE_CONFIG.API_URL}${path}`;

/** The lightweight live signal the server broadcasts on the shared Yjs doc. */
interface VoteRankingLiveState {
  voteId: string;
  participationRevision: number;
  resultsRevision: number;
  participantCount: number;
}

function parseRankingLiveState(value: unknown): VoteRankingLiveState | null {
  if (!value) return null;
  let parsed: unknown = value;
  if (typeof value === 'object' && 'toJSON' in (value as object)) {
    parsed = (value as { toJSON: () => unknown }).toJSON();
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const state = parsed as Partial<VoteRankingLiveState>;
  if (typeof state.voteId !== 'string') return null;
  return {
    voteId: state.voteId,
    participationRevision: Number(state.participationRevision) || 0,
    resultsRevision: Number(state.resultsRevision) || 0,
    participantCount: Number(state.participantCount) || 0,
  };
}

/** Cheap identity check so an unchanged republish does not re-render the view. */
function sameRankingLiveState(
  previous: VoteRankingLiveState | null,
  next: VoteRankingLiveState | null,
): boolean {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return (
    previous.voteId === next.voteId &&
    previous.participationRevision === next.participationRevision &&
    previous.resultsRevision === next.resultsRevision &&
    previous.participantCount === next.participantCount
  );
}

/**
 * Subscribe to the Yjs live signal for one comparative vote. Returns null when
 * collaboration is unavailable or the server has not published a state yet.
 */
function useVoteRankingLiveState(voteId: string | undefined) {
  const [state, setState] = React.useState<VoteRankingLiveState | null>(null);

  React.useEffect(() => {
    if (!voteId) {
      setState(null);
      return;
    }
    if (!isCollaborationEnabled()) {
      setState(null);
      return;
    }
    const id = voteId;
    const read = () => {
      const next = parseRankingLiveState(yVoteRankingState.get(id));
      setState((previous) => (sameRankingLiveState(previous, next) ? previous : next));
    };
    // `voteRankingState` is one room-wide map keyed by vote id, and the server
    // bumps it on every comparative autosave for any vote. Ignore events that
    // did not touch this vote instead of re-parsing and re-rendering for them.
    const observer = (
      event: { keysChanged: Set<string> },
      transaction: { local: boolean },
    ) => {
      if (transaction.local) return;
      if (!event.keysChanged.has(id)) return;
      read();
    };
    read();
    yVoteRankingState.observe(observer);
    return () => yVoteRankingState.unobserve(observer);
  }, [voteId]);

  return state;
}

interface RankingResultsResponse {
  hidden: boolean;
  participantCount: number;
  result: VoteRankingResult | null;
  /** Provisional ranking from in-progress drafts; facilitator views only. */
  draftResult?: VoteRankingResult | null;
}

/** The POST response echoes canonical metadata, never the ballot payload the
 * client just uploaded (which can hold up to 20k comparisons). */
interface RankingSubmissionMeta {
  id: string;
  voteId: string;
  submitted: boolean;
  submittedAt: string | null;
  draftUpdatedAt: string | null;
  lastSeenAt: string;
}

export function useMyVoteRankingSubmission(
  slug: string | undefined,
  voterToken: string,
) {
  const [submission, setSubmission] = React.useState<VoteRankingSubmission | null>(null);
  const [isLoading, setIsLoading] = React.useState(Boolean(slug && voterToken));
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!slug || !voterToken) return;
    setIsLoading(true);
    setError(null);
    try {
      // Send the participant credential in a header: URL query strings are
      // captured by access/proxy logs and browser history.
      const response = await fetch(apiPath(`/api/votes/${slug}/ranking-submissions`), {
        headers: { 'X-Voter-Token': voterToken },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as {
        /** Present only when the server honored the X-Voter-Token header and
         * returned this caller's own ballot. */
        scope?: 'self';
        submissions?: VoteRankingSubmission[];
      };
      // Only hydrate a ballot this participant provably owns. If the API does
      // not recognize the header (a version-skewed or separately hosted
      // deploy), the request falls into the bulk-read branch and returns other
      // participants' ballots; hydrating one would show another voter's ballot
      // and let this voter save it under their own token.
      const submissions = data.submissions ?? [];
      setSubmission(
        submissions.length === 1 && data.scope === 'self' ? submissions[0] : null,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }, [slug, voterToken]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = React.useCallback(
    async (
      ballot: VoteRankingBallot,
      status: 'in_progress' | 'submitted',
      meta: { userId?: string | null; displayName?: string | null } = {},
    ): Promise<void> => {
      if (!slug || !voterToken) return;
      // Do not reuse the load `error` state here: a failed background save must
      // not replace the ballot with a fatal error view. The caller surfaces
      // save failures non-blockingly.
      const response = await fetch(apiPath(`/api/votes/${slug}/ranking-submissions`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterToken,
          userId: meta.userId ?? null,
          displayName: meta.displayName ?? null,
          status,
          ...ballot,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error || `HTTP ${response.status}`;
        throw new Error(message);
      }
      const saved = (await response.json()) as RankingSubmissionMeta;
      // The endpoint returns metadata, not a ballot, so merge it into the
      // loaded submission instead of replacing it. Assigning the projection
      // would put `submitted: boolean` where consumers expect a ballot and drop
      // the draft/submitted payloads the loader returned.
      setSubmission((previous) => {
        // A first-time participant has no loaded submission to merge into.
        // Build the row from the POST metadata so local state stops being null;
        // returning `previous` (null) here would drop the row the server just
        // created, so a later withdraw would not change `submission` and the
        // hydration effect could never re-run, leaving the ballot UI empty.
        const base: VoteRankingSubmission =
          previous ?? {
            id: saved.id,
            voteId: saved.voteId,
            voterToken,
            userId: meta.userId ?? null,
            displayName: meta.displayName ?? null,
            draft: null,
            submitted: null,
            draftUpdatedAt: null,
            submittedAt: null,
            lastSeenAt: saved.lastSeenAt,
          };
        return {
          ...base,
          draft: ballot,
          // An explicit submit stores this ballot; an autosave never changes
          // the last submitted payload.
          submitted: status === 'submitted' ? ballot : base.submitted,
          draftUpdatedAt: saved.draftUpdatedAt,
          submittedAt: saved.submittedAt,
          lastSeenAt: saved.lastSeenAt,
        };
      });
    },
    [slug, voterToken],
  );

  const withdraw = React.useCallback(async () => {
    if (!slug || !voterToken) return;
    const url = apiPath(`/api/votes/${slug}/ranking-submissions`);
    // Header-only: the bearer withdrawal credential must never travel in a URL
    // that access logs, proxies and browser history record. The API in this
    // repository reads the header, so no query fallback is needed.
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'X-Voter-Token': voterToken },
    });
    const body = response.ok ? null : await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }
    setSubmission(null);
  }, [slug, voterToken]);

  return { submission, isLoading, error, refresh, save, withdraw };
}

/**
 * Re-run `refresh` whenever a live revision advances, coalesced to at most once
 * per `minIntervalMs`. Both ranking views (results and participation) need the
 * same throttle, so the state machine lives here once instead of being copied
 * into each hook.
 */
function useLiveRevisionRefetch(
  revision: number | null,
  minIntervalMs: number,
  refresh: (options?: { background?: boolean }) => void,
): void {
  const lastRevision = React.useRef<number | null>(null);
  const lastRefetchAt = React.useRef(0);
  const pendingRefetch = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (revision === null) return;
    // The initial fetch already covered this revision.
    if (lastRevision.current === null) {
      lastRevision.current = revision;
      return;
    }
    if (revision === lastRevision.current) return;
    lastRevision.current = revision;
    // A run is already scheduled; it will pick up this revision.
    if (pendingRefetch.current !== null) return;
    const elapsed = Date.now() - lastRefetchAt.current;
    const delay = Math.max(0, minIntervalMs - elapsed);
    pendingRefetch.current = window.setTimeout(() => {
      pendingRefetch.current = null;
      lastRefetchAt.current = Date.now();
      refresh({ background: true });
    }, delay);
  }, [revision, refresh, minIntervalMs]);
  React.useEffect(
    () => () => {
      if (pendingRefetch.current !== null) {
        window.clearTimeout(pendingRefetch.current);
        pendingRefetch.current = null;
      }
    },
    [],
  );
}

export function useVoteRankingResults(
  slug: string | undefined,
  enabled = true,
  moderatorToken?: string,
  voteId?: string,
  includeHidden = false,
) {
  const [data, setData] = React.useState<RankingResultsResponse | null>(null);
  // Start in the loading state when a request is about to run, so the first
  // render does not flash a terminal "no ballots" state before the fetch.
  const [isLoading, setIsLoading] = React.useState(Boolean(slug && enabled));
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (options: { background?: boolean } = {}): Promise<RankingResultsResponse | null> => {
    if (!slug || !enabled) return null;
    if (!options.background) setIsLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (moderatorToken) headers['X-Moderator-Token'] = moderatorToken;
      // The token is the capability: the server selects the facilitator
      // projection from `canModerateVote` and does not read a client flag.
      const response = await fetch(apiPath(`/api/votes/${slug}/ranking-results`), { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as RankingResultsResponse;
      setData(payload);
      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      if (!options.background) setIsLoading(false);
    }
  }, [slug, enabled, moderatorToken]);

  React.useEffect(() => {
    if (!enabled) return;
    void refresh();
    // The Yjs revision signal is the live path. The poll is only a safety net
    // for a silently broken WebSocket or a missed broadcast, so it must stay
    // cheap: while connected it runs infrequently, and only falls back to a
    // short interval when collaboration is actually unavailable. Re-evaluate the
    // connection state before each tick instead of fixing the rate at mount.
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        void refresh({ background: true });
        schedule();
      }, isCollaborationConnected() ? 30000 : 10000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [refresh, enabled]);

  const live = useVoteRankingLiveState(voteId);
  // Facilitator views include drafts, so they must refetch whenever a draft
  // changes (participationRevision). Participant views only refetch when the
  // official submitted set changes (resultsRevision).
  const liveRevision = live
    ? (includeHidden ? live.participationRevision : live.resultsRevision)
    : null;
  // Draft autosave bumps the participation revision every couple of seconds per
  // participant, and rebuilding the draft-aware ranking is super-linear in the
  // number of ballots. Throttle facilitator refetches to a bounded cadence
  // instead of one full recomputation per autosave. Participants only see the
  // submitted revision, but every revision still triggers a request that reads
  // and parses every ballot, so a submission burst must not fan out into one
  // full-payload read per viewer per submit.
  const liveRefetchMinMs = includeHidden ? 4000 : 2000;
  useLiveRevisionRefetch(liveRevision, liveRefetchMinMs, refresh);

  return { data, isLoading, error, refresh, liveState: live };
}

/** Keep the previous summary when a poll returns identical data, so the 5s
 * refresh does not re-render the participation table for nothing. */
function participationEqual(
  previous: BallotParticipationSummary | null,
  next: BallotParticipationSummary,
): boolean {
  if (!previous) return false;
  const a = previous.counts;
  const b = next.counts;
  if (
    a.seen !== b.seen ||
    a.submitted !== b.submitted ||
    a.inProgress !== b.inProgress ||
    a.editing !== b.editing ||
    a.stalled !== b.stalled ||
    a.earlyConverged !== b.earlyConverged ||
    previous.ballots.length !== next.ballots.length
  ) {
    return false;
  }
  return previous.ballots.every((ballot, index) => {
    const candidate = next.ballots[index];
    return (
      ballot.alias === candidate.alias &&
      ballot.displayName === candidate.displayName &&
      ballot.status === candidate.status &&
      ballot.earlyConverged === candidate.earlyConverged &&
      ballot.coveragePercent === candidate.coveragePercent &&
      ballot.confidencePercent === candidate.confidencePercent &&
      ballot.lastSeenAt === candidate.lastSeenAt
    );
  });
}

/** Draft autosave bumps `participationRevision` every couple of seconds per
 * participant, and this endpoint reparses every ballot payload, so coalesce
 * live-triggered refetches to a bounded cadence. */
const PARTICIPATION_LIVE_REFETCH_MIN_MS = 4000;

export function useVoteRankingParticipation(
  voteId: string | undefined,
  ownerId: string | undefined,
  moderatorToken?: string,
  pollMs = 5000,
) {
  const [summary, setSummary] = React.useState<BallotParticipationSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(Boolean(voteId));
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (options: { background?: boolean } = {}) => {
    if (!voteId) return;
    const params = new URLSearchParams();
    if (ownerId) params.set('ownerId', ownerId);
    // The facilitator credential goes in a header rather than the URL: this
    // endpoint is polled every few seconds, so a query token would be written
    // to access/proxy logs on every poll.
    const headers: Record<string, string> = {};
    if (moderatorToken) headers['X-Moderator-Token'] = moderatorToken;
    // A background poll keeps the current table on screen instead of flipping
    // back to the loading state twice per interval.
    if (!options.background) setIsLoading(true);
    setError(null);
    try {
      const base = apiPath(`/api/votes/${voteId}/ranking-participation`);
      const query = new URLSearchParams(params);
      // Header-only: the facilitator credential is a bearer capability and must
      // not be written to access/proxy logs on every poll.
      const response = await fetch(`${base}?${query.toString()}`, { headers });
      const body = response.ok ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      const next = (await response.json()) as BallotParticipationSummary;
      setSummary((previous) => (participationEqual(previous, next) ? previous : next));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (!options.background) setIsLoading(false);
    }
  }, [voteId, ownerId, moderatorToken]);

  React.useEffect(() => {
    void refresh();
    if (!pollMs) return;
    // The Yjs participation revision is the primary trigger. The poll is only a
    // safety net for a broken WebSocket, so while collaboration is connected it
    // must not also run at the short fallback rate: that would roughly double
    // the load on an endpoint that reparses every ballot payload.
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        void refresh({ background: true });
        schedule();
      }, isCollaborationConnected() ? Math.max(pollMs, 30000) : pollMs);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [refresh, pollMs]);

  const live = useVoteRankingLiveState(voteId);
  useLiveRevisionRefetch(
    live ? live.participationRevision : null,
    PARTICIPATION_LIVE_REFETCH_MIN_MS,
    refresh,
  );

  return { summary, isLoading, error, refresh };
}
