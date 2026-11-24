/**
 * Names of the shared Yjs maps whose entries are scoped to a single vote.
 *
 * Reset/delete must clear every one of these on both the client
 * (`clearVoteChildrenFromYjs`) and the server (`clearVoteFromYjs`). Keep the
 * list here so the two paths cannot drift and leave stale live state behind.
 * The concrete maps are created in `collaboration.ts`.
 */
export const VOTE_SCOPED_YJS_MAPS = [
  'voteResponses',
  'voteLoops',
  'voteRankingState',
  'voteDraftRevisions',
  'votePresenceRevisions',
] as const;
