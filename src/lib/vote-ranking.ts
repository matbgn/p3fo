import type {
  RankingEngine,
  VoteEntity,
  VoteRankingBallot,
  VoteRankingResult,
  VoteRankingSubmission,
} from './persistence-types';
import {
  computeCondorcetDiagnostics,
  countCoveredPairs,
  estimatePartialRanking,
  poolBallots,
} from './partial-ranking.js';

export const RANKING_ENGINE_VERSION = 'weighted-pr-bt-v1';
export const DEFAULT_RANKING_ENGINE: RankingEngine = 'bt-k4';
/**
 * Ballots are capped at 100 items by the server, so the collective ranking is
 * only well defined for a similarly small set. Rank at most the most-compared
 * proposals so a vote with an unbounded proposal list cannot make the public
 * results endpoint perform an unbounded O(n^4) computation.
 */
export const MAX_RANKED_ITEMS = 100;
const STALLED_AFTER_MS = 10 * 60 * 1000;

export function rankingEngineToK(engine: RankingEngine): 2 | 4 {
  return engine === 'bt-k2' ? 2 : 4;
}

export function expectedRankingPairs(itemCount: number): number {
  return itemCount < 2 ? 0 : (itemCount * (itemCount - 1)) / 2;
}

export interface FinalizeWinnerResolution {
  winningProposalId: string | null;
  error?: 'tied-requires-tie' | 'tied-requires-selection';
}

/**
 * Single source of truth for resolving a comparative vote's finalized winner
 * from the top-ranked group. The finalize endpoint and the dialog both use it
 * so their tie/winner rules cannot drift apart.
 */
export function resolveFinalizedWinner(
  topGroup: string[],
  allowTies: boolean,
  requestedWinner: string | null,
): FinalizeWinnerResolution {
  if (topGroup.length === 1) {
    return { winningProposalId: topGroup[0] };
  }
  if (allowTies) {
    if (requestedWinner !== null) {
      return { winningProposalId: null, error: 'tied-requires-tie' };
    }
    return { winningProposalId: null };
  }
  if (!requestedWinner || !topGroup.includes(requestedWinner)) {
    return { winningProposalId: null, error: 'tied-requires-selection' };
  }
  return { winningProposalId: requestedWinner };
}

export function computeBallotCoverage(
  ballot: Pick<VoteRankingBallot, 'comparisons' | 'itemIds'>,
  activeIds?: Set<string>,
): { coveredPairs: number; totalPairs: number; percent: number } {
  // Callers computing coverage for many ballots should pass a shared set so it
  // is not rebuilt per submission.
  const ids = activeIds ?? new Set(ballot.itemIds);
  const coveredPairs = countCoveredPairs(
    { comparisons: ballot.comparisons },
    ids,
  );
  const totalPairs = expectedRankingPairs(ids.size);
  return {
    coveredPairs,
    totalPairs,
    percent: totalPairs === 0 ? 100 : (coveredPairs / totalPairs) * 100,
  };
}

export function activeProposalIds(vote: VoteEntity): string[] {
  return vote.proposals
    .filter((proposal) => proposal.active)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((proposal) => proposal.id);
}

export function buildVoteRankingResult(
  vote: VoteEntity,
  submissions: VoteRankingSubmission[],
): VoteRankingResult | null {
  const activeIds = activeProposalIds(vote);
  if (activeIds.length === 0) return null;

  const submitted = submissions
    .map((submission) => submission.submitted)
    .filter((ballot): ballot is VoteRankingBallot => ballot !== null);
  if (submitted.length === 0) return null;

  let rankedIds = activeIds;
  if (activeIds.length > MAX_RANKED_ITEMS) {
    const active = new Set(activeIds);
    const comparedCount = new Map<string, number>();
    for (const ballot of submitted) {
      for (const id of ballot.itemIds) {
        if (active.has(id)) comparedCount.set(id, (comparedCount.get(id) ?? 0) + 1);
      }
    }
    const position = new Map(
      vote.proposals.map((proposal) => [proposal.id, proposal.position]),
    );
    rankedIds = [...activeIds]
      .sort(
        (a, b) =>
          (comparedCount.get(b) ?? 0) - (comparedCount.get(a) ?? 0) ||
          (position.get(a) ?? 0) - (position.get(b) ?? 0) ||
          a.localeCompare(b),
      )
      .slice(0, MAX_RANKED_ITEMS);
  }

  const pooled = poolBallots(submitted, rankedIds);
  if (pooled.includedBallots === 0) return null;

  const partial = estimatePartialRanking(rankedIds, pooled.matrix);
  const proposalOrder = new Map(
    vote.proposals.map((proposal) => [proposal.id, proposal.position]),
  );
  let rank = 1;
  const groups = partial.groups.map((group) => {
    const proposalIds = [...group].sort(
      (a, b) =>
        (proposalOrder.get(a) ?? 0) - (proposalOrder.get(b) ?? 0) ||
        a.localeCompare(b),
    );
    const result = {
      rank,
      proposalIds,
      score: Math.log(Math.max(partial.itemStrengths[group[0]] ?? 1, 1e-9)),
    };
    rank += group.length;
    return result;
  });

  const activeSet = new Set(activeIds);
  const coverageValues = submitted.map(
    (ballot) =>
      computeBallotCoverage(
        { itemIds: activeIds, comparisons: ballot.comparisons },
        activeSet,
      ).percent,
  );
  const diagnostics = computeCondorcetDiagnostics(
    rankedIds,
    pooled.majorityMatrix,
  );

  return {
    groups,
    method: 'weighted-partial-ranking-bt',
    engine: vote.config.rankingEngine ?? DEFAULT_RANKING_ENGINE,
    participantCount: submitted.length,
    coverage: {
      mean:
        coverageValues.reduce((sum, value) => sum + value, 0) /
        Math.max(coverageValues.length, 1),
      min: coverageValues.length ? Math.min(...coverageValues) : 0,
      max: coverageValues.length ? Math.max(...coverageValues) : 0,
    },
    condorcetWinnerId: diagnostics.winnerId,
    hasMajorityCycle: diagnostics.hasMajorityCycle,
  };
}

function hashString(value: string): string {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
}

export type BallotParticipationStatus =
  | 'in_progress'
  | 'submitted'
  | 'editing'
  | 'stalled';

export interface BallotParticipationRow {
  alias: string;
  displayName: string | null;
  status: BallotParticipationStatus;
  earlyConverged: boolean;
  coveragePercent: number;
  confidencePercent: number;
  lastSeenAt: string;
}

export interface BallotParticipationSummary {
  counts: {
    seen: number;
    submitted: number;
    inProgress: number;
    editing: number;
    stalled: number;
    earlyConverged: number;
  };
  ballots: BallotParticipationRow[];
}

/**
 * Shared draft-vs-submitted freshness rule so the participation summary and the
 * ballot page agree on whether a participant is editing an already-submitted
 * ballot.
 */
export function isDraftNewer(
  hasDraft: boolean,
  draftUpdatedAt: string | null,
  submittedAt: string | null,
): boolean {
  return (
    hasDraft &&
    (!submittedAt || (draftUpdatedAt !== null && draftUpdatedAt > submittedAt))
  );
}

/** Lean participation projection: only the fields the summary needs. */
export interface BallotParticipationStat {
  voterToken: string;
  displayName: string | null;
  hasDraft: boolean;
  hasSubmitted: boolean;
  draftCoveragePercent: number | null;
  draftConfidencePercent: number | null;
  submittedCoveragePercent: number | null;
  submittedConfidencePercent: number | null;
  draftUpdatedAt: string | null;
  submittedAt: string | null;
  lastSeenAt: string;
}

export function deriveBallotParticipationFromStats(
  voteId: string,
  rows: BallotParticipationStat[],
  isAnonymous: boolean,
  now: number = Date.now(),
): BallotParticipationSummary {
  const counts = {
    seen: rows.length,
    submitted: 0,
    inProgress: 0,
    editing: 0,
    stalled: 0,
    earlyConverged: 0,
  };

  const ballots = rows.map((row) => {
    const draftIsNewer = isDraftNewer(row.hasDraft, row.draftUpdatedAt, row.submittedAt);
    const activeCoverage = draftIsNewer
      ? row.draftCoveragePercent
      : row.submittedCoveragePercent ?? row.draftCoveragePercent;
    const activeConfidence = draftIsNewer
      ? row.draftConfidencePercent
      : row.submittedConfidencePercent ?? row.draftConfidencePercent;
    const lastSeenMs = Date.parse(row.lastSeenAt);
    const stalled =
      !row.hasSubmitted &&
      Number.isFinite(lastSeenMs) &&
      now - lastSeenMs > STALLED_AFTER_MS;

    let status: BallotParticipationStatus;
    if (stalled) {
      status = 'stalled';
      counts.stalled++;
    } else if (row.hasSubmitted && draftIsNewer) {
      status = 'editing';
      counts.editing++;
    } else if (row.hasSubmitted) {
      status = 'submitted';
      counts.submitted++;
    } else {
      status = 'in_progress';
      counts.inProgress++;
    }

    const earlyConverged = Boolean(
      row.hasSubmitted && (row.submittedCoveragePercent ?? 0) < 99.5,
    );
    if (earlyConverged) counts.earlyConverged++;

    const alias = `P-${hashString(`${voteId}:${row.voterToken}`)}`;
    // Fall back to the stable alias rather than a row index: rows are ordered by
    // lastSeenAt, so indexes change between polls.
    const displayName = isAnonymous ? null : row.displayName || alias;

    return {
      alias,
      displayName,
      status,
      earlyConverged,
      coveragePercent: activeCoverage ?? 0,
      confidencePercent: Math.max(0, Math.min(100, activeConfidence ?? 0)),
      lastSeenAt: row.lastSeenAt,
    };
  });

  return { counts, ballots };
}

export function deriveBallotParticipation(
  voteId: string,
  submissions: VoteRankingSubmission[],
  isAnonymous: boolean,
  now: number = Date.now(),
): BallotParticipationSummary {
  const rows: BallotParticipationStat[] = submissions.map((submission) => ({
    voterToken: submission.voterToken,
    displayName: submission.displayName,
    hasDraft: submission.draft !== null,
    hasSubmitted: submission.submitted !== null,
    draftCoveragePercent: submission.draft?.coverage?.percent ?? null,
    draftConfidencePercent: submission.draft?.confidencePercent ?? null,
    submittedCoveragePercent: submission.submitted?.coverage?.percent ?? null,
    submittedConfidencePercent: submission.submitted?.confidencePercent ?? null,
    draftUpdatedAt: submission.draftUpdatedAt,
    submittedAt: submission.submittedAt,
    lastSeenAt: submission.lastSeenAt,
  }));
  return deriveBallotParticipationFromStats(voteId, rows, isAnonymous, now);
}
