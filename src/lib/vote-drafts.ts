import type { VoteDraftEntity } from './persistence-types';
// The server build emits plain ESM and resolves relative imports verbatim, so
// server-imported modules must carry the explicit `.js` extension (same as
// `vote-ranking.ts` / `sprint-autoclose.ts`).
import { createVoteEphemeralStore } from './vote-ephemeral-store.js';

/**
 * Ephemeral in-progress selections live in process memory only: they are never
 * persisted as votes, they expire on their own, and a restart simply drops
 * them. The moderator-authorized `GET /drafts` route is the only reader.
 */
export const VOTE_DRAFT_TTL_MS = 30 * 60 * 1000;

/**
 * Write path is authenticated only by a client-supplied voter token, so a caller
 * can mint arbitrary aliases. Bound the store per vote and evict the oldest
 * live draft past the limit; without this, memory grows with request count
 * instead of with the number of real participants.
 */
export const MAX_VOTE_DRAFTS_PER_VOTE = 1000;

interface StoredVoteDraft extends VoteDraftEntity {
  expiresAt: number;
}

const store = createVoteEphemeralStore<StoredVoteDraft, VoteDraftEntity>({
  maxPerVote: MAX_VOTE_DRAFTS_PER_VOTE,
  toEntity: (draft) => ({
    voteId: draft.voteId,
    voterAlias: draft.voterAlias,
    participantId: draft.participantId,
    values: { ...draft.values },
    displayName: draft.displayName,
    updatedAt: draft.updatedAt,
    publisherId: draft.publisherId,
  }),
});

/** Drop every expired draft in every vote, independent of any moderator read. */
export function sweepExpiredVoteDrafts(now = Date.now()): void {
  store.sweep(now);
}

export function upsertVoteDraft(input: {
  voteId: string;
  voterAlias: string;
  values: Record<string, number>;
  /** Non-anonymous display name, shown only on the moderator draft channel. */
  displayName?: string;
  publisherId?: string;
  /**
   * Store key for this participant. Defaults to `voterAlias` for callers that
   * already hold a non-credential identifier; the server passes an unforgeable
   * digest so a colliding public alias cannot overwrite another participant's
   * draft.
   */
  participantKey?: string;
  now?: number;
}): VoteDraftEntity {
  const now = input.now ?? Date.now();
  const values: Record<string, number> = {};
  for (const [proposalId, value] of Object.entries(input.values)) {
    if (typeof value === 'number' && Number.isFinite(value)) values[proposalId] = value;
  }
  const draft: StoredVoteDraft = {
    voteId: input.voteId,
    voterAlias: input.voterAlias,
    participantId: input.participantKey ?? input.voterAlias,
    values,
    displayName: input.displayName,
    updatedAt: new Date(now).toISOString(),
    publisherId: input.publisherId,
    expiresAt: now + VOTE_DRAFT_TTL_MS,
  };
  store.set(input.voteId, input.participantKey ?? input.voterAlias, draft, now);
  return store.toEntity(draft);
}

/**
 * Deletes a participant's draft by its store key. When `publisherId` is
 * supplied, the draft is only removed if it was written by that tab, so a second
 * tab of the same voter cannot erase the draft another tab is actively
 * publishing.
 */
export function deleteVoteDraft(
  voteId: string,
  participantKey: string,
  publisherId?: string,
): boolean {
  const existing = store.get(voteId, participantKey);
  if (!existing) return false;
  if (publisherId && existing.publisherId && existing.publisherId !== publisherId) {
    return false;
  }
  return store.delete(voteId, participantKey);
}

/** Returns the vote's live drafts, dropping expired entries as it goes. */
export function listVoteDrafts(voteId: string, now = Date.now()): VoteDraftEntity[] {
  return store.list(voteId, now);
}

/** Reset/delete must not leave a vote's drafts behind in memory. */
export function clearVoteDrafts(voteId: string): void {
  store.clearVote(voteId);
}

/** Test helper: drop every vote's drafts. */
export function resetVoteDraftsForTests(): void {
  store.clearAll();
}
