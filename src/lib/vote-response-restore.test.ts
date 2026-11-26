import { describe, expect, it } from 'vitest';
import type { VoteResponseEntity } from './persistence-types';
import { restoreVoteResponseTokens } from './vote-response-restore';

function response(
  id: string,
  voteId: string,
  proposalId: string,
  voterToken: string,
  identity: { participantId?: string; voterAlias?: string; userId?: string | null },
): VoteResponseEntity {
  return {
    id,
    voteId,
    proposalId,
    loopId: undefined,
    userId: identity.userId ?? null,
    voterToken,
    ...(identity.participantId
      ? { participantId: identity.participantId }
      : {}),
    ...(identity.voterAlias ? { voterAlias: identity.voterAlias } : {}),
    value: 1,
    submittedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('restoreVoteResponseTokens', () => {
  it('reissues one token per participant and keeps all of their slots', () => {
    const items = [
      response('r1', 'vote-1', 'slot-1', '', { participantId: 'emmanuel' }),
      response('r2', 'vote-1', 'slot-2', '', { participantId: 'emmanuel' }),
      response('r3', 'vote-1', 'slot-1', '', { participantId: 'matthieu' }),
      response('r4', 'vote-1', 'slot-2', '', { participantId: 'matthieu' }),
    ];

    let index = 0;
    const restored = restoreVoteResponseTokens(items, () => `token-${++index}`);

    expect(restored.map((item) => item.voterToken)).toEqual([
      'token-1',
      'token-1',
      'token-2',
      'token-2',
    ]);
  });

  it('prefers the moderator participant digest over the public alias', () => {
    let index = 0;
    const restored = restoreVoteResponseTokens(
      [
        response('r1', 'vote-1', 'slot-1', '', {
          participantId: 'digest-a',
          voterAlias: 'same-alias',
        }),
        response('r2', 'vote-1', 'slot-1', '', {
          participantId: 'digest-b',
          voterAlias: 'same-alias',
        }),
      ],
      () => `digest-token-${++index}`,
    );

    expect(restored.map((item) => item.voterToken)).toEqual([
      'digest-token-1',
      'digest-token-2',
    ]);
  });

  it('keeps different votes separate even when the alias matches', () => {
    let index = 0;
    const restored = restoreVoteResponseTokens(
      [
        response('r1', 'vote-1', 'slot-1', '', { voterAlias: 'same' }),
        response('r2', 'vote-2', 'slot-1', '', { voterAlias: 'same' }),
      ],
      () => `token-${++index}`,
    );
    expect(restored.map((item) => item.voterToken)).toEqual([
      'token-1',
      'token-2',
    ]);
  });

  it('preserves a real browser-mode token', () => {
    const restored = restoreVoteResponseTokens(
      [response('r1', 'vote-1', 'slot-1', 'real-token', {})],
      () => 'unused',
    );
    expect(restored[0]?.voterToken).toBe('real-token');
  });

  it('falls back to the user id when no public identity is present', () => {
    const restored = restoreVoteResponseTokens(
      [response('r1', 'vote-1', 'slot-1', '', { userId: 'user-1' })],
      () => 'user-token',
    );
    expect(restored[0]?.voterToken).toBe('user-token');
  });

  it('leaves rows without any identity untouched', () => {
    const restored = restoreVoteResponseTokens(
      [response('r1', 'vote-1', 'slot-1', '', {})],
      () => 'unused',
    );
    expect(restored[0]?.voterToken).toBe('');
  });
});
