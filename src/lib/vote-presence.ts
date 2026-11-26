import type { VotePresenceEntity } from './persistence-types';
// The server build emits plain ESM and resolves relative imports verbatim, so
// server-imported modules must carry the explicit `.js` extension (same as
// `vote-ranking.ts` / `sprint-autoclose.ts`).
import { createVoteEphemeralStore } from './vote-ephemeral-store.js';

/**
 * Presence is who has the public vote page open, whether or not they have
 * selected anything yet. It is ephemeral and per-process, like drafts: a
 * heartbeat refreshes `lastSeenAt`, the entry expires on its own, and only the
 * moderator-authenticated channel reads it.
 */
export const VOTE_PRESENCE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * A heartbeat is authenticated only by a client-supplied voter token, so a
 * caller can mint arbitrary aliases. Bound the store per vote and evict the
 * oldest entry past the limit; the ceiling is the safety valve, not a product
 * limit, so it stays well above any real vote's roster.
 */
export const MAX_VOTE_PRESENCE_PER_VOTE = 5000;

interface StoredPresence extends VotePresenceEntity {
  expiresAt: number;
}

const store = createVoteEphemeralStore<StoredPresence, VotePresenceEntity>({
  maxPerVote: MAX_VOTE_PRESENCE_PER_VOTE,
  toEntity: (presence) => ({
    voteId: presence.voteId,
    voterAlias: presence.voterAlias,
    participantId: presence.participantId,
    displayName: presence.displayName,
    joinedAt: presence.joinedAt,
    lastSeenAt: presence.lastSeenAt,
  }),
});

/** Drop every expired participant in every vote, independent of any moderator read. */
export function sweepExpiredVotePresence(now = Date.now()): void {
  store.sweep(now);
}

/** Record a heartbeat, keeping the original `joinedAt` for a live participant. */
export function touchVotePresence(input: {
  voteId: string;
  voterAlias: string;
  /**
   * Store key for this participant. Defaults to `voterAlias`; the server passes
   * an unforgeable digest so a colliding public alias cannot spoof or displace
   * another participant's presence.
   */
  participantKey?: string;
  /**
   * Chosen display name for a non-anonymous vote. The presence channel is read
   * only through the moderator capability, so carrying it here lets the
   * participation view name someone who joined but has not cast a ballot yet.
   */
  displayName?: string;
  now?: number;
}): VotePresenceEntity {
  const now = input.now ?? Date.now();
  const participantKey = input.participantKey ?? input.voterAlias;
  const previous = store.get(input.voteId, participantKey);
  const joinedAt =
    previous && previous.expiresAt > now
      ? previous.joinedAt
      : new Date(now).toISOString();
  const presence: StoredPresence = {
    voteId: input.voteId,
    voterAlias: input.voterAlias,
    participantId: participantKey,
    displayName: input.displayName,
    joinedAt,
    lastSeenAt: new Date(now).toISOString(),
    expiresAt: now + VOTE_PRESENCE_TTL_MS,
  };
  store.set(input.voteId, participantKey, presence, now);
  return store.toEntity(presence);
}

/** Returns live participants, dropping expired entries as it goes. */
export function listVotePresence(voteId: string, now = Date.now()): VotePresenceEntity[] {
  return store.list(voteId, now);
}

/** Reset/delete must not leave a vote's presence behind in memory. */
export function clearVotePresence(voteId: string): void {
  store.clearVote(voteId);
}

/** Test helper: drop every vote's presence. */
export function resetVotePresenceForTests(): void {
  store.clearAll();
}
