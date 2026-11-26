import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_VOTE_DRAFTS_PER_VOTE,
  VOTE_DRAFT_TTL_MS,
  clearVoteDrafts,
  deleteVoteDraft,
  listVoteDrafts,
  resetVoteDraftsForTests,
  upsertVoteDraft,
} from './vote-drafts';

const base = {
  voteId: 'vote-1',
  voterAlias: 'P-abc',
  values: { p1: 2, p2: 3 },
};

describe('vote draft store', () => {
  beforeEach(() => resetVoteDraftsForTests());

  it('stores and lists a draft by alias', () => {
    upsertVoteDraft({ ...base, now: 1000 });

    const drafts = listVoteDrafts('vote-1', 1000);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      voteId: 'vote-1',
      voterAlias: 'P-abc',
      values: { p1: 2, p2: 3 },
    });
  });

  it('replaces the previous draft for the same voter', () => {
    upsertVoteDraft({ ...base, now: 1000 });
    upsertVoteDraft({ ...base, values: { p1: 1 }, now: 2000 });

    const drafts = listVoteDrafts('vote-1', 2000);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].values).toEqual({ p1: 1 });
  });

  it('keeps the non-anonymous display name on the moderator draft channel', () => {
    upsertVoteDraft({ ...base, displayName: 'Alice Example', now: 1000 });

    const drafts = listVoteDrafts('vote-1', 1000);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].displayName).toBe('Alice Example');
  });

  it('keeps drafts scoped per vote', () => {
    upsertVoteDraft({ ...base, now: 1000 });
    upsertVoteDraft({ ...base, voteId: 'vote-2', voterAlias: 'P-def', now: 1000 });

    expect(listVoteDrafts('vote-1', 1000)).toHaveLength(1);
    expect(listVoteDrafts('vote-2', 1000)[0].voterAlias).toBe('P-def');
  });

  it('only deletes a draft written by the same tab', () => {
    upsertVoteDraft({ ...base, publisherId: 'tab-a', now: 1000 });

    expect(deleteVoteDraft('vote-1', 'P-abc', 'tab-b')).toBe(false);
    expect(listVoteDrafts('vote-1', 1000)).toHaveLength(1);

    expect(deleteVoteDraft('vote-1', 'P-abc', 'tab-a')).toBe(true);
    expect(listVoteDrafts('vote-1', 1000)).toHaveLength(0);
  });

  it('drops expired drafts when reading', () => {
    upsertVoteDraft({ ...base, now: 1000 });

    expect(listVoteDrafts('vote-1', 1000 + VOTE_DRAFT_TTL_MS)).toHaveLength(0);
  });

  it('clears every draft for a vote on reset/delete', () => {
    upsertVoteDraft({ ...base, now: 1000 });
    upsertVoteDraft({ ...base, voterAlias: 'P-xyz', now: 1000 });

    clearVoteDrafts('vote-1');
    expect(listVoteDrafts('vote-1', 1000)).toHaveLength(0);
  });

  it('bounds the number of drafts per vote and evicts the oldest', () => {
    for (let i = 0; i < MAX_VOTE_DRAFTS_PER_VOTE + 5; i++) {
      upsertVoteDraft({ ...base, voterAlias: `P-${i}`, now: 1000 + i });
    }

    const drafts = listVoteDrafts('vote-1', 2000);
    expect(drafts).toHaveLength(MAX_VOTE_DRAFTS_PER_VOTE);
    expect(drafts.some((draft) => draft.voterAlias === 'P-0')).toBe(false);
  });

  it('keys by participantKey so a colliding display alias cannot overwrite another draft', () => {
    upsertVoteDraft({
      ...base,
      voterAlias: 'P-shared',
      participantKey: 'key-a',
      values: { p1: 1 },
      now: 1000,
    });
    upsertVoteDraft({
      ...base,
      voterAlias: 'P-shared',
      participantKey: 'key-b',
      values: { p1: 2 },
      now: 1000,
    });

    expect(listVoteDrafts('vote-1', 1000)).toHaveLength(2);
  });
});
