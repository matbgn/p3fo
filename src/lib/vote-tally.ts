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

export interface ConsentLoopTally {
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
  proposalId: string
): ConsentLoopTally {
  if (loops.length === 0) return { perRound: [], current: null };

  const sortedLoops = [...loops].sort((a, b) => a.roundNumber - b.roundNumber);

  const perRound = sortedLoops.map((loop) => {
    const loopResponses = responses.filter(
      (r) => r.proposalId === proposalId && r.loopId === loop.id
    );
    const mj = computeMJFromValues(loopResponses.map((r) => r.value));
    const bottomGrades = (mj.distribution[0] || 0) + (mj.distribution[-1] || 0);
    return {
      roundNumber: loop.roundNumber,
      loopId: loop.id,
      median: mj.median,
      distribution: mj.distribution,
      adopted: bottomGrades === 0,
      closed: !!loop.closedAt,
    };
  });

  const currentOpenLoop = sortedLoops.find((l) => !l.closedAt);
  let current: MJTally | null = null;
  if (currentOpenLoop) {
    const loopResponses = responses.filter(
      (r) => r.proposalId === proposalId && r.loopId === currentOpenLoop.id
    );
    current = computeMJFromValues(loopResponses.map((r) => r.value));
  }

  return { perRound, current };
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