import type { VoteResponseEntity } from './persistence-types';

/**
 * Restore a backup's vote responses without losing participant identity.
 *
 * Server exports deliberately blank `voterToken` and carry `participantId` /
 * `voterAlias` instead. Importing those rows verbatim would make every
 * participant share the empty token, and the `(voteId, voterToken, proposalId,
 * loopId)` unique key would keep only the last row per slot. Reissue one fresh
 * token per vote + participant identity so the restored rows stay distinct.
 *
 * A non-empty token is preserved: browser-mode backups already carry real
 * tokens and must not be rewritten.
 */
export function restoreVoteResponseTokens(
  items: VoteResponseEntity[],
  createToken: () => string = () => crypto.randomUUID(),
): VoteResponseEntity[] {
  const tokenByParticipant = new Map<string, string>();
  return items.map((item) => {
    if (item.voterToken) return item;
    const identity = item.participantId || item.voterAlias || item.userId;
    if (!identity) return item;
    const key = `${item.voteId}\u0000${identity}`;
    let token = tokenByParticipant.get(key);
    if (!token) {
      token = createToken();
      tokenByParticipant.set(key, token);
    }
    return { ...item, voterToken: token };
  });
}
