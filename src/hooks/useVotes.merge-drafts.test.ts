import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/collaboration', () => ({
  yVoteProposals: {},
  yVoteResponses: {},
  yVoteLoops: {},
  yVoteDraftRevisions: {},
  yVotePresenceRevisions: {},
  yVoteRankingState: {},
  initializeCollaboration: vi.fn(),
  isCollaborationEnabled: () => false,
  doc: {},
}));

import { mergeDraftResponses } from './useVotes';
import { voterAlias } from '@/lib/vote-ranking';
import type { VoteResponseEntity } from '@/lib/persistence-types';

const voteId = 'vote-1';
const token = 'voter-token';
const alias = voterAlias(voteId, token);

const submittedRow = (value: number, submittedAt: string): VoteResponseEntity => ({
  id: 'response-1',
  voteId,
  proposalId: 'proposal-1',
  userId: 'user-1',
  voterToken: token,
  value,
  submittedAt,
});

const draftRow = (value: number, updatedAt: string): VoteResponseEntity => ({
  id: `draft:${voteId}:${alias}:proposal-1`,
  voteId,
  proposalId: 'proposal-1',
  userId: null,
  voterToken: alias,
  value,
  submittedAt: updatedAt,
});

describe('mergeDraftResponses - draft freshness', () => {
  it('does not let a stale draft replace a newer submission', () => {
    const merged = mergeDraftResponses(
      voteId,
      [submittedRow(1, '2026-01-01T00:10:00.000Z')],
      [draftRow(0, '2026-01-01T00:05:00.000Z')],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe(1);
    expect(merged[0].voterToken).toBe(token);
  });

  it('lets a newer draft replace the submission', () => {
    const merged = mergeDraftResponses(
      voteId,
      [submittedRow(1, '2026-01-01T00:05:00.000Z')],
      [draftRow(0, '2026-01-01T00:10:00.000Z')],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe(0);
    expect(merged[0].id).toContain('draft:');
  });

  it('includes a draft for a participant who has not submitted yet', () => {
    const merged = mergeDraftResponses(voteId, [], [draftRow(2, '2026-01-01T00:10:00.000Z')]);

    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe(2);
  });
});

describe('mergeDraftResponses - collision-resistant identity', () => {
  const sharedAlias = 'P-COLLIDE';

  it('does not let a colliding alias replace another participant\'s submission', () => {
    const victim = {
      ...submittedRow(1, '2026-01-01T00:05:00.000Z'),
      voterAlias: sharedAlias,
      participantId: 'victim-digest',
    };
    const attackerDraft: VoteResponseEntity = {
      id: `draft:${voteId}:attacker-digest:proposal-1`,
      voteId,
      proposalId: 'proposal-1',
      userId: null,
      voterToken: sharedAlias,
      participantId: 'attacker-digest',
      value: 0,
      submittedAt: '2026-01-01T00:10:00.000Z',
    };

    const merged = mergeDraftResponses(voteId, [victim], [attackerDraft]);

    // The victim's submitted value survives; the colliding draft is additive.
    expect(merged).toHaveLength(2);
    expect(merged.find((row) => row.id === victim.id)?.value).toBe(1);
  });

  it('merges a draft when the participant digest matches', () => {
    const submitted = {
      ...submittedRow(1, '2026-01-01T00:05:00.000Z'),
      voterAlias: 'P-SAME',
      participantId: 'digest-1',
    };
    const draft = {
      ...draftRow(0, '2026-01-01T00:10:00.000Z'),
      participantId: 'digest-1',
    };

    const merged = mergeDraftResponses(voteId, [submitted], [draft]);

    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe(0);
  });
});
