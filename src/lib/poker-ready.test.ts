import { describe, it, expect, beforeEach } from 'vitest';
import {
  POKER_READY_TTL_MS,
  clearPokerReady,
  clearPokerReadyForParticipant,
  listPokerReady,
  markPokerReady,
  resetPokerReadyForTests,
  sweepExpiredPokerReady,
} from './poker-ready';

describe('poker ready store', () => {
  beforeEach(() => resetPokerReadyForTests());

  it('marks a participant ready with a stable timestamp', () => {
    markPokerReady({ voteId: 'vote-1', participantId: 'p1', now: 1000 });
    markPokerReady({ voteId: 'vote-1', participantId: 'p1', now: 5000 });

    const ready = listPokerReady('vote-1', 5000);
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({
      voteId: 'vote-1',
      participantId: 'p1',
      readyAt: new Date(1000).toISOString(),
    });
  });

  it('clears one participant without disturbing the others', () => {
    markPokerReady({ voteId: 'vote-1', participantId: 'p1', now: 1000 });
    markPokerReady({ voteId: 'vote-1', participantId: 'p2', now: 1000 });

    expect(clearPokerReadyForParticipant('vote-1', 'p1')).toBe(true);
    expect(listPokerReady('vote-1', 1000).map((entry) => entry.participantId)).toEqual(['p2']);
  });

  it('scopes entries per vote and clears a vote', () => {
    markPokerReady({ voteId: 'vote-1', participantId: 'p1', now: 1000 });
    markPokerReady({ voteId: 'vote-2', participantId: 'p1', now: 1000 });

    clearPokerReady('vote-1');
    expect(listPokerReady('vote-1', 1000)).toHaveLength(0);
    expect(listPokerReady('vote-2', 1000)).toHaveLength(1);
  });

  it('drops expired entries on read and sweep', () => {
    markPokerReady({ voteId: 'vote-1', participantId: 'p1', now: 1000 });
    const later = 1000 + POKER_READY_TTL_MS;
    expect(listPokerReady('vote-1', later)).toHaveLength(0);

    markPokerReady({ voteId: 'vote-2', participantId: 'p1', now: 1000 });
    sweepExpiredPokerReady(later);
    expect(listPokerReady('vote-2', 1000 + POKER_READY_TTL_MS - 1)).toHaveLength(0);
  });
});
