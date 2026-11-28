import type { VoteResponseEntity } from './persistence-types';
import { responseVoterDisplayName } from './vote-ranking';

export type VoteCommentEntry = {
  comment: string;
  /** Display name, or null when the vote is anonymous. */
  name: string | null;
};

/**
 * The deduplicated comment list shared by the moderator results panel and the
 * public results page. A scheduling batch repeats the voter's comment on every
 * availability row and a multi-proposal submit repeats it on every proposal
 * response, so key on the shared identity+text pair. Both renderers must apply
 * the same key and name rule or one view would show a voter's comment twice.
 */
export function buildVoteCommentEntries(
  voteId: string,
  responses: VoteResponseEntity[],
  isAnonymous: boolean,
): VoteCommentEntry[] {
  const seen = new Set<string>();
  const entries: VoteCommentEntry[] = [];
  for (const response of responses) {
    const comment = response.comment?.trim();
    if (!comment) continue;
    const name = responseVoterDisplayName(voteId, response, isAnonymous);
    const key = `${name}\u0000${comment}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ comment, name });
  }
  return entries;
}
