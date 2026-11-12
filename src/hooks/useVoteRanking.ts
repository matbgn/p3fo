import * as React from 'react';
import type {
  VoteRankingBallot,
  VoteRankingResult,
  VoteRankingSubmission,
} from '@/lib/persistence-types';
import type { BallotParticipationSummary } from '@/lib/vote-ranking';
import { PERSISTENCE_CONFIG } from '@/lib/persistence-config';

/** The ranking endpoints live on the same server as the persistence adapter,
 * which may be configured on a different origin than the SPA (VITE_P3FO_API_URL). */
const apiPath = (path: string) => `${PERSISTENCE_CONFIG.API_URL}${path}`;

interface RankingResultsResponse {
  hidden: boolean;
  participantCount: number;
  result: VoteRankingResult | null;
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
    // Credential in the header so it stays out of access logs. An API that
    // predates header support only reads the query form, so fall back to it (and
    // only then) instead of breaking withdrawal for the whole deploy-skew
    // window.
    const send = (useQuery: boolean) =>
      fetch(useQuery ? `${url}?voterToken=${encodeURIComponent(voterToken)}` : url, {
        method: 'DELETE',
        headers: { 'X-Voter-Token': voterToken },
      });
    let response = await send(false);
    let body = response.ok ? null : await response.json().catch(() => null);
    if (response.status === 400 && body?.error === 'voterToken is required') {
      response = await send(true);
      body = response.ok ? null : await response.json().catch(() => null);
    }
    if (!response.ok) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }
    setSubmission(null);
  }, [slug, voterToken]);

  return { submission, isLoading, error, refresh, save, withdraw };
}

export function useVoteRankingResults(
  slug: string | undefined,
  enabled = true,
) {
  const [data, setData] = React.useState<RankingResultsResponse | null>(null);
  // Start in the loading state when a request is about to run, so the first
  // render does not flash a terminal "no ballots" state before the fetch.
  const [isLoading, setIsLoading] = React.useState(Boolean(slug && enabled));
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (): Promise<RankingResultsResponse | null> => {
    if (!slug || !enabled) return null;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(apiPath(`/api/votes/${slug}/ranking-results`));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as RankingResultsResponse;
      setData(payload);
      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [slug, enabled]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, isLoading, error, refresh };
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
      const request = (useQuery: boolean) => {
        const query = new URLSearchParams(params);
        // The query form exists only for an API that predates header support;
        // sending it on every poll would put the facilitator credential in
        // access/proxy logs.
        if (useQuery && moderatorToken) query.set('moderatorToken', moderatorToken);
        return fetch(`${base}?${query.toString()}`, { headers });
      };
      let response = await request(false);
      let body = response.ok ? null : await response.json().catch(() => null);
      if (response.status === 403 && moderatorToken && body?.error === 'Facilitator access required') {
        response = await request(true);
        body = response.ok ? null : await response.json().catch(() => null);
      }
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
    const timer = window.setInterval(() => {
      void refresh({ background: true });
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [refresh, pollMs]);

  return { summary, isLoading, error, refresh };
}
