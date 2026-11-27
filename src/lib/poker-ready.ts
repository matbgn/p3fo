import { createVoteEphemeralStore } from './vote-ephemeral-store.js';

/**
 * A participant's "ready for reveal" signal. It is ephemeral and vote-scoped,
 * like drafts and presence: the server derives the participant set from the
 * submitted responses (the same identity grouping the scheduling tally uses),
 * so this store only answers "which of those participants are ready?".
 */
export const POKER_READY_TTL_MS = 6 * 60 * 60 * 1000;
export const MAX_POKER_READY_PER_VOTE = 5000;

export interface PokerReadyEntity {
  voteId: string;
  participantId: string;
  readyAt: string;
}

interface StoredPokerReady extends PokerReadyEntity {
  expiresAt: number;
}

const store = createVoteEphemeralStore<StoredPokerReady, PokerReadyEntity>({
  maxPerVote: MAX_POKER_READY_PER_VOTE,
  toEntity: (entry) => ({
    voteId: entry.voteId,
    participantId: entry.participantId,
    readyAt: entry.readyAt,
  }),
});

export function markPokerReady(input: {
  voteId: string;
  participantId: string;
  now?: number;
}): PokerReadyEntity {
  const now = input.now ?? Date.now();
  const previous = store.get(input.voteId, input.participantId);
  const readyAt =
    previous && previous.expiresAt > now
      ? previous.readyAt
      : new Date(now).toISOString();
  const entry: StoredPokerReady = {
    voteId: input.voteId,
    participantId: input.participantId,
    readyAt,
    expiresAt: now + POKER_READY_TTL_MS,
  };
  store.set(input.voteId, input.participantId, entry, now);
  return store.toEntity(entry);
}

export function clearPokerReadyForParticipant(
  voteId: string,
  participantId: string,
): boolean {
  return store.delete(voteId, participantId);
}

export function clearPokerReady(voteId: string): void {
  store.clearVote(voteId);
}

export function sweepExpiredPokerReady(now = Date.now()): void {
  store.sweep(now);
}

export function listPokerReady(
  voteId: string,
  now = Date.now(),
): PokerReadyEntity[] {
  return store.list(voteId, now);
}

export function resetPokerReadyForTests(): void {
  store.clearAll();
}
