/**
 * Shared mechanics for a vote-scoped, bounded, TTL in-memory store.
 *
 * Drafts and presence have the same lifecycle: entries live only in process
 * memory, expire on their own, are evicted oldest-first past a per-vote ceiling,
 * and must be cleared when a vote is reset or deleted. Keeping that logic here
 * means a fix to expiry, eviction or cleanup cannot drift between the two
 * channels.
 */
export interface EphemeralEntry {
  voteId: string;
  expiresAt: number;
}

export interface VoteEphemeralStore<TStored extends EphemeralEntry, TEntity> {
  get(voteId: string, key: string): TStored | undefined;
  /** Store an entry and prune the vote's map (expired first, then oldest). */
  set(voteId: string, key: string, entry: TStored, now: number): void;
  delete(voteId: string, key: string): boolean;
  /** Return live entries as entities, dropping expired ones as it goes. */
  list(voteId: string, now: number): TEntity[];
  /** Drop every expired entry in every vote, independent of any read. */
  sweep(now: number): void;
  clearVote(voteId: string): void;
  clearAll(): void;
  toEntity(entry: TStored): TEntity;
}

export function createVoteEphemeralStore<TStored extends EphemeralEntry, TEntity>(options: {
  maxPerVote: number;
  toEntity: (entry: TStored) => TEntity;
}): VoteEphemeralStore<TStored, TEntity> {
  const { maxPerVote, toEntity } = options;
  const byVote = new Map<string, Map<string, TStored>>();

  // Enforce the per-vote ceiling. Expired entries are dropped lazily on read and
  // by the periodic sweep, so this O(n) scan only runs on the rare write that
  // actually exceeds the ceiling, never on a normal heartbeat/autosave.
  const evictOldest = (byKey: Map<string, TStored>): void => {
    while (byKey.size > maxPerVote) {
      let oldestKey: string | null = null;
      let oldestExpiry = Infinity;
      for (const [key, entry] of byKey) {
        if (entry.expiresAt < oldestExpiry) {
          oldestExpiry = entry.expiresAt;
          oldestKey = key;
        }
      }
      if (oldestKey === null) break;
      byKey.delete(oldestKey);
    }
  };

  const mapForVote = (voteId: string): Map<string, TStored> => {
    let byKey = byVote.get(voteId);
    if (!byKey) {
      byKey = new Map();
      byVote.set(voteId, byKey);
    }
    return byKey;
  };

  return {
    get(voteId, key) {
      return byVote.get(voteId)?.get(key);
    },
    set(voteId, key, entry, _now) {
      const byKey = mapForVote(voteId);
      byKey.set(key, entry);
      // Expired entries are dropped lazily on read and by the periodic sweep;
      // scanning the whole map on every write made a presence heartbeat or draft
      // autosave O(n) and an n-participant cycle O(n^2). Only the rare ceiling
      // guard is evaluated here.
      evictOldest(byKey);
    },
    delete(voteId, key) {
      const byKey = byVote.get(voteId);
      if (!byKey || !byKey.has(key)) return false;
      byKey.delete(key);
      if (byKey.size === 0) byVote.delete(voteId);
      return true;
    },
    list(voteId, now) {
      const byKey = byVote.get(voteId);
      if (!byKey) return [];
      const result: TEntity[] = [];
      for (const [key, entry] of byKey) {
        if (entry.expiresAt <= now) {
          byKey.delete(key);
          continue;
        }
        result.push(toEntity(entry));
      }

      if (byKey.size === 0) byVote.delete(voteId);
      return result;
    },
    sweep(now) {
      for (const [voteId, byKey] of byVote) {
        for (const [key, entry] of byKey) {
          if (entry.expiresAt <= now) byKey.delete(key);
        }
        if (byKey.size === 0) byVote.delete(voteId);
      }
    },
    clearVote(voteId) {
      byVote.delete(voteId);
    },
    clearAll() {
      byVote.clear();
    },
    toEntity,
  };
}
