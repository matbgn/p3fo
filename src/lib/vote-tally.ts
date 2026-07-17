import { VoteResponseEntity, VoteLoop } from "./persistence-types";
import { MJ_SCALE } from "@/components/planView/constants";

export interface ThumbsUpTally {
  count: number;
}

export interface UDNeutralTally {
  up: number;
  neutral: number;
  down: number;
}

export interface PointsTally {
  total: number;
}

export interface MJTally {
  median: number;
  distribution: Record<number, number>;
}

export interface ProposalLoopTally {
  proposalId: string;
  perRound: Array<{
    roundNumber: number;
    loopId: string;
    median: number;
    distribution: Record<number, number>;
    adopted: boolean;
    closed: boolean;
  }>;
  current: MJTally | null;
}

export interface ConsentLoopTally {
  proposals: ProposalLoopTally[];
}

export type ProposalRoundTally = ProposalLoopTally["perRound"][number];

/**
 * Returns the best round to display for a consent-loop proposal once the
 * process is closed.
 *
 * Preference order:
 *  1. The adopted closed round with the highest majority mention (median).
 *     If several rounds are adopted, the one where the group converged the
 *     best is the meaningful "final" outcome.
 *  2. If no round was adopted, the last closed round (so the user still sees
 *     where the process ended, marked as not adopted).
 *  3. null if there are no closed rounds.
 */
export function getBestConsentRound(
  tally: ProposalLoopTally
): ProposalRoundTally | null {
  const closed = tally.perRound.filter((r) => r.closed);
  if (closed.length === 0) return null;

  const adopted = closed.filter((r) => r.adopted);
  if (adopted.length > 0) {
    return adopted.reduce((best, r) => (r.median > best.median ? r : best));
  }
  return closed[closed.length - 1];
}

export function tallyThumbsUp(
  responses: VoteResponseEntity[],
  proposalId: string
): ThumbsUpTally {
  return {
    count: responses.filter((r) => r.proposalId === proposalId && r.value === 1)
      .length,
  };
}

export function tallyUDNeutral(
  responses: VoteResponseEntity[],
  proposalId: string
): UDNeutralTally {
  const filtered = responses.filter((r) => r.proposalId === proposalId);
  return {
    up: filtered.filter((r) => r.value === 1).length,
    neutral: filtered.filter((r) => r.value === 0).length,
    down: filtered.filter((r) => r.value === -1).length,
  };
}

export function tallyPoints(
  responses: VoteResponseEntity[],
  proposalId: string
): PointsTally {
  const filtered = responses.filter((r) => r.proposalId === proposalId);
  return { total: filtered.reduce((sum, r) => sum + r.value, 0) };
}

export function tallyMajorityJudgment(
  responses: VoteResponseEntity[],
  proposalId: string
): MJTally {
  const filtered = responses.filter((r) => r.proposalId === proposalId);
  return computeMJFromValues(filtered.map((r) => r.value));
}

export function computeMJFromValues(values: number[]): MJTally {
  const distribution: Record<number, number> = {};
  for (const grade of MJ_SCALE) {
    distribution[grade.value] = values.filter((v) => v === grade.value).length;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.ceil(sorted.length / 2) - 1] : 0;
  return { median, distribution };
}

export function getMJMedianFromRecord(votes: Record<string, number>): number | null {
  const values = Object.values(votes).sort((a, b) => a - b);
  if (values.length === 0) return null;
  return values[Math.ceil(values.length / 2) - 1];
}

export function tallyConsentLoop(
  loops: VoteLoop[],
  responses: VoteResponseEntity[],
  proposalIds: string[]
): ConsentLoopTally {
  const proposals: ProposalLoopTally[] = proposalIds.map((proposalId) => {
    const proposalLoops = loops
      .filter((l) => l.proposalId === proposalId)
      .sort((a, b) => a.roundNumber - b.roundNumber);

    if (proposalLoops.length === 0) {
      return { proposalId, perRound: [], current: null };
    }

    const perRound = proposalLoops.map((loop) => {
      const loopResponses = responses.filter(
        (r) => r.proposalId === proposalId && r.loopId === loop.id
      );
      const mj = computeMJFromValues(loopResponses.map((r) => r.value));
      const bottomGrades = (mj.distribution[0] || 0) + (mj.distribution[-1] || 0);
      const hasVotes = loopResponses.length > 0;
      return {
        roundNumber: loop.roundNumber,
        loopId: loop.id,
        median: mj.median,
        distribution: mj.distribution,
        adopted: hasVotes && bottomGrades === 0,
        closed: !!loop.closedAt,
      };
    });

    const currentOpenLoop = proposalLoops.find((l) => !l.closedAt);
    let current: MJTally | null = null;
    if (currentOpenLoop) {
      const loopResponses = responses.filter(
        (r) => r.proposalId === proposalId && r.loopId === currentOpenLoop.id
      );
      current = computeMJFromValues(loopResponses.map((r) => r.value));
    }

    return { proposalId, perRound, current };
  });

  return { proposals };
}

export function calculateCardVoteScore(
  votes: Record<string, number>,
  mode: "THUMBS_UP" | "THUMBS_UD_NEUTRAL" | "POINTS" | "MAJORITY_JUDGMENT"
): number {
  const values = Object.values(votes);
  if (values.length === 0) return 0;
  switch (mode) {
    case "THUMBS_UP":
      return values.filter((v) => v > 0).length;
    case "THUMBS_UD_NEUTRAL":
      return values.reduce((acc, v) => acc + v, 0);
    case "POINTS":
      return values.reduce((acc, v) => acc + v, 0);
    case "MAJORITY_JUDGMENT": {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.ceil(sorted.length / 2) - 1];
    }
    default:
      return 0;
  }
}