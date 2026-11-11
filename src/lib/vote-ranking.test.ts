import { describe, expect, it } from 'vitest';
import type {
  VoteEntity,
  VoteRankingBallot,
  VoteRankingSubmission,
} from './persistence-types';
import {
  buildVoteRankingResult,
  computeBallotCoverage,
  deriveBallotParticipation,
  proposalDisplayTitle,
  proposalHasContent,
  resolveFinalizedWinner,
} from './vote-ranking';

function makeVote(ids: string[]): VoteEntity {
  return {
    id: 'vote-1',
    slug: 'vote-1',
    title: 'Test vote',
    ownerId: 'owner',
    proposals: ids.map((id, index) => ({
      id,
      content: `Proposal ${id}`,
      position: index,
      active: true,
    })),
    config: {
      mode: 'COMPARATIVE_PRIORITIZATION',
      kind: 'decision',
      phase: 'OPEN',
      rankingEngine: 'bt-k2',
      allowTies: true,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeBallot(
  itemIds: string[],
  comparisons: VoteRankingBallot['comparisons'],
): VoteRankingBallot {
  return {
    itemIds,
    comparisons,
    batchCount: comparisons.length,
    coverage: computeBallotCoverage({ itemIds, comparisons }),
    confidencePercent: 100,
    stopReason: 'confident',
    engine: 'bt-k2',
    engineVersion: 'test',
  };
}

function makeSubmission(
  voterToken: string,
  ballot: VoteRankingBallot | null,
  overrides: Partial<VoteRankingSubmission> = {},
): VoteRankingSubmission {
  return {
    id: `submission-${voterToken}`,
    voteId: 'vote-1',
    voterToken,
    userId: null,
    displayName: null,
    draft: ballot,
    submitted: ballot,
    draftUpdatedAt: '2026-01-01T00:00:00.000Z',
    submittedAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('finalize winner resolution', () => {
  it('takes the only top item when the top group is a single proposal', () => {
    expect(resolveFinalizedWinner(['a'], true, null)).toEqual({ winningProposalId: 'a' });
    expect(resolveFinalizedWinner(['a'], false, 'a')).toEqual({ winningProposalId: 'a' });
  });

  it('finalizes a tie when ties are allowed and no winner is requested', () => {
    expect(resolveFinalizedWinner(['a', 'b'], true, null)).toEqual({ winningProposalId: null });
  });

  it('rejects a requested winner when ties are allowed', () => {
    expect(resolveFinalizedWinner(['a', 'b'], true, 'a')).toEqual({
      winningProposalId: null,
      error: 'tied-requires-tie',
    });
  });

  it('requires a top-group winner when ties are disabled', () => {
    expect(resolveFinalizedWinner(['a', 'b'], false, null)).toEqual({
      winningProposalId: null,
      error: 'tied-requires-selection',
    });
    expect(resolveFinalizedWinner(['a', 'b'], false, 'c')).toEqual({
      winningProposalId: null,
      error: 'tied-requires-selection',
    });
    expect(resolveFinalizedWinner(['a', 'b'], false, 'b')).toEqual({ winningProposalId: 'b' });
  });
});

describe('proposal text extraction', () => {
  it('prefers the description and reads plain or HTML content', () => {
    expect(proposalDisplayTitle({ id: 'a', description: ' Desc ' })).toBe('Desc');
    expect(proposalDisplayTitle({ id: 'a', content: 'Plain text' })).toBe('Plain text');
    expect(proposalDisplayTitle({ id: 'a', content: '<p>Hello&nbsp;world</p>' })).toBe(
      'Hello world',
    );
  });

  it('reads nested BlockNote block text', () => {
    const content = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: 'Nested title' }] },
    ]);
    expect(proposalDisplayTitle({ id: 'a', content })).toBe('Nested title');
    expect(proposalHasContent({ content })).toBe(true);
  });

  it('separates sibling blocks instead of concatenating their text', () => {
    const blockContent = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] },
    ]);
    expect(proposalDisplayTitle({ id: 'a', content: blockContent })).toBe('Alpha Beta');
    expect(proposalDisplayTitle({ id: 'a', content: '<p>Alpha</p><p>Beta</p>' })).toBe(
      'Alpha Beta',
    );
  });

  it('keeps a word split across inline spans intact', () => {
    const content = JSON.stringify([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hel', styles: { bold: true } },
          { type: 'text', text: 'lo' },
        ],
      },
    ]);
    expect(proposalDisplayTitle({ id: 'a', content })).toBe('Hello');
  });

  it('treats a text-less BlockNote document as empty instead of returning JSON', () => {
    // Regression: the title used to fall through to the raw JSON fallback while
    // the content check reported empty, so both helpers disagreed.
    const content = JSON.stringify([{ type: 'paragraph', content: [] }]);
    expect(proposalDisplayTitle({ id: 'fallback-id', content })).toBe('fallback-id');
    expect(proposalHasContent({ content })).toBe(false);
  });

  it('treats a media-only proposal as content instead of a blank placeholder', () => {
    // Regression: an image-only proposal has no text, so the batch import used
    // to drop it as if it were the empty default proposal.
    const content = JSON.stringify([
      { type: 'image', props: { url: 'https://example.test/a.png', caption: '' } },
    ]);
    expect(proposalHasContent({ content })).toBe(true);
    expect(proposalHasContent({ content: JSON.stringify([{ type: 'paragraph', props: {} }]) })).toBe(
      false,
    );
  });
});

describe('vote ranking aggregation', () => {
  it('returns null when there are no submitted ballots', () => {
    const vote = makeVote(['a', 'b']);
    expect(buildVoteRankingResult(vote, [])).toBeNull();
    expect(
      buildVoteRankingResult(vote, [
        makeSubmission('u1', null, {
          submitted: null,
          draft: makeBallot(['a', 'b'], [{ a: 'a', b: 'b', winner: 'a' }]),
        }),
      ]),
    ).toBeNull();
  });

  it('gives opposite single-comparison voters equal weight', () => {
    const vote = makeVote(['a', 'b']);
    const result = buildVoteRankingResult(vote, [
      makeSubmission(
        'u1',
        makeBallot(['a', 'b'], [{ a: 'a', b: 'b', winner: 'a' }]),
      ),
      makeSubmission(
        'u2',
        makeBallot(['a', 'b'], [{ a: 'a', b: 'b', winner: 'b' }]),
      ),
    ]);
    expect(result).not.toBeNull();
    expect(result!.participantCount).toBe(2);
    expect(result!.groups).toHaveLength(1);
    expect(result!.groups[0].proposalIds.sort()).toEqual(['a', 'b']);
  });

  it('does not let repeated comparisons from one voter dominate', () => {
    const vote = makeVote(['a', 'b']);
    const heavy = Array.from({ length: 100 }, () => ({
      a: 'a',
      b: 'b',
      winner: 'a',
    }));
    const result = buildVoteRankingResult(vote, [
      makeSubmission('u1', makeBallot(['a', 'b'], heavy)),
      makeSubmission(
        'u2',
        makeBallot(['a', 'b'], [{ a: 'a', b: 'b', winner: 'b' }]),
      ),
    ]);
    expect(result!.groups).toHaveLength(1);
  });

  it('separates items when a dense total order has strong evidence', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const vote = makeVote(ids);
    const comparisons = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        for (let repeat = 0; repeat < 10; repeat++) {
          comparisons.push({ a: ids[i], b: ids[j], winner: ids[i] });
        }
      }
    }
    const result = buildVoteRankingResult(
      vote,
      Array.from({ length: 10 }, (_, index) =>
        makeSubmission(`u${index}`, makeBallot(ids, comparisons)),
      ),
    );
    expect(result!.groups.map((group) => group.proposalIds[0])).toEqual(ids);
  });

  it('recomputes coverage from comparisons and ignores a tampered percentage', () => {
    const itemIds = ['a', 'b', 'c'];
    const ballot = makeBallot(itemIds, [{ a: 'a', b: 'b', winner: 'a' }]);
    ballot.coverage = { coveredPairs: 3, totalPairs: 3, percent: 100 };
    const result = buildVoteRankingResult(makeVote(itemIds), [
      makeSubmission('u1', ballot),
    ]);
    expect(result!.coverage.mean).toBeCloseTo(100 / 3);
    expect(computeBallotCoverage(ballot).coveredPairs).toBe(1);
  });
});

describe('robustness and majority diagnostics', () => {
  it('ignores malformed comparison entries instead of throwing', () => {
    const vote = makeVote(['a', 'b']);
    const ballot = makeBallot(['a', 'b'], [{ a: 'a', b: 'b', winner: 'a' }]);
    (ballot.comparisons as unknown[]).push(
      null,
      { a: 'a', b: 'b' },
      { a: 'a', b: 'b', winner: 'not-an-item' },
    );
    const result = buildVoteRankingResult(vote, [makeSubmission('u1', ballot)]);
    expect(result).not.toBeNull();
    expect(result!.coverage.mean).toBeCloseTo(100);
  });

  it('uses ballot-majority for Condorcet, not coverage-normalized weights', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const vote = makeVote(ids);
    const denseComparisons = [
      { a: 'a', b: 'b', winner: 'a' },
      { a: 'a', b: 'c', winner: 'a' },
      { a: 'a', b: 'd', winner: 'a' },
      { a: 'b', b: 'c', winner: 'b' },
      { a: 'b', b: 'd', winner: 'b' },
      { a: 'c', b: 'd', winner: 'c' },
    ];
    const result = buildVoteRankingResult(vote, [
      ...Array.from({ length: 4 }, (_, index) =>
        makeSubmission(`dense${index}`, makeBallot(ids, denseComparisons)),
      ),
      // This voter compared only one pair and prefers b; equal-total-weight
      // normalization would let that single pair outweigh the four dense
      // ballots, but the pairwise majority is still a > b.
      makeSubmission(
        'sparse',
        makeBallot(ids, [{ a: 'a', b: 'b', winner: 'b' }]),
      ),
    ]);
    expect(result!.condorcetWinnerId).toBe('a');
    expect(result!.hasMajorityCycle).toBe(false);
  });
});

describe('ballot participation', () => {
  it('derives submitted, editing, and early-converged states', () => {
    const voteId = 'vote-1';
    const submitted = makeSubmission(
      'u1',
      makeBallot(['a', 'b', 'c'], [{ a: 'a', b: 'b', winner: 'a' }]),
    );
    const editing = makeSubmission(
      'u2',
      makeBallot(['a', 'b', 'c'], [{ a: 'a', b: 'b', winner: 'a' }]),
      {
        draft: makeBallot(['a', 'b', 'c'], [{ a: 'a', b: 'b', winner: 'b' }]),
        draftUpdatedAt: '2026-01-01T00:10:00.000Z',
        submittedAt: '2026-01-01T00:00:00.000Z',
      },
    );
    const inProgress = makeSubmission('u3', null, {
      draft: makeBallot(['a', 'b', 'c'], []),
      draftUpdatedAt: '2026-01-01T00:05:00.000Z',
      submitted: null,
      submittedAt: null,
      lastSeenAt: '2026-01-01T00:19:00.000Z',
    });

    const summary = deriveBallotParticipation(
      voteId,
      [submitted, editing, inProgress],
      true,
      Date.parse('2026-01-01T00:20:00.000Z'),
    );
    expect(summary.counts.seen).toBe(3);
    expect(summary.counts.submitted).toBe(1);
    expect(summary.counts.editing).toBe(1);
    expect(summary.counts.inProgress).toBe(1);
    expect(summary.counts.earlyConverged).toBe(2);
    expect(summary.ballots.every((row) => row.displayName === null)).toBe(true);
  });

  it('uses stable aliases and names only when not anonymous', () => {
    const submission = makeSubmission(
      'u1',
      makeBallot(['a', 'b'], [{ a: 'a', b: 'b', winner: 'a' }]),
      { displayName: 'Alice' },
    );
    const anonymous = deriveBallotParticipation('vote-1', [submission], true);
    const named = deriveBallotParticipation('vote-1', [submission], false);
    expect(anonymous.ballots[0].alias).toBe(named.ballots[0].alias);
    expect(anonymous.ballots[0].displayName).toBeNull();
    expect(named.ballots[0].displayName).toBe('Alice');
  });
});
