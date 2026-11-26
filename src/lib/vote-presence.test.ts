import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_VOTE_PRESENCE_PER_VOTE,
  VOTE_PRESENCE_TTL_MS,
  clearVotePresence,
  listVotePresence,
  resetVotePresenceForTests,
  touchVotePresence,
} from './vote-presence';

const base = { voteId: 'vote-1', voterAlias: 'P-abc' };

describe('vote presence store', () => {
  beforeEach(() => resetVotePresenceForTests());

  it('records a participant before any selection exists', () => {
    touchVotePresence({ ...base, now: 1000 });

    const presence = listVotePresence('vote-1', 1000);
    expect(presence).toHaveLength(1);
    expect(presence[0]).toMatchObject({
      voteId: 'vote-1',
      voterAlias: 'P-abc',
      joinedAt: new Date(1000).toISOString(),
      lastSeenAt: new Date(1000).toISOString(),
    });
  });

  it('keeps joinedAt across heartbeats', () => {
    touchVotePresence({ ...base, now: 1000 });
    touchVotePresence({ ...base, now: 31_000 });

    const [presence] = listVotePresence('vote-1', 31_000);
    expect(presence.joinedAt).toBe(new Date(1000).toISOString());
    expect(presence.lastSeenAt).toBe(new Date(31_000).toISOString());
  });

  it('carries the display name for a non-anonymous heartbeat', () => {
    touchVotePresence({ ...base, displayName: 'Alice', now: 1000 });

    const [presence] = listVotePresence('vote-1', 1000);
    expect(presence.displayName).toBe('Alice');
  });

  it('resets joinedAt after the entry expired', () => {
    touchVotePresence({ ...base, now: 1000 });
    const later = 1000 + VOTE_PRESENCE_TTL_MS + 1;
    touchVotePresence({ ...base, now: later });

    const [presence] = listVotePresence('vote-1', later);
    expect(presence.joinedAt).toBe(new Date(later).toISOString());
  });

  it('drops expired participants when reading', () => {
    touchVotePresence({ ...base, now: 1000 });
    expect(listVotePresence('vote-1', 1000 + VOTE_PRESENCE_TTL_MS)).toHaveLength(0);
  });

  it('keeps presence scoped per vote and clears on reset', () => {
    touchVotePresence({ ...base, now: 1000 });
    touchVotePresence({ ...base, voteId: 'vote-2', voterAlias: 'P-def', now: 1000 });

    expect(listVotePresence('vote-1', 1000)).toHaveLength(1);
    expect(listVotePresence('vote-2', 1000)).toHaveLength(1);

    clearVotePresence('vote-1');
    expect(listVotePresence('vote-1', 1000)).toHaveLength(0);
    expect(listVotePresence('vote-2', 1000)).toHaveLength(1);
  });

  it('bounds the number of participants per vote and evicts the oldest', () => {
    for (let i = 0; i < MAX_VOTE_PRESENCE_PER_VOTE + 5; i++) {
      touchVotePresence({ ...base, voterAlias: `P-${i}`, now: 1000 + i });
    }

    const presence = listVotePresence('vote-1', 2000);
    expect(presence).toHaveLength(MAX_VOTE_PRESENCE_PER_VOTE);
    expect(presence.some((entry) => entry.voterAlias === 'P-0')).toBe(false);
  });

  it('keys by participantKey so a colliding display alias cannot displace another participant', () => {
    touchVotePresence({
      ...base,
      voterAlias: 'P-shared',
      participantKey: 'key-a',
      now: 1000,
    });
    touchVotePresence({
      ...base,
      voterAlias: 'P-shared',
      participantKey: 'key-b',
      now: 1000,
    });

    expect(listVotePresence('vote-1', 1000)).toHaveLength(2);
  });
});
