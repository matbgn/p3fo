import * as React from "react";
import { VoteModerator } from "@/lib/persistence-types";
import { getPersistenceAdapter } from "@/lib/persistence-factory";

/** Keep the previous array when a poll returns the same list, so polling does
 * not force a re-render of the whole vote detail subtree. */
function applyModerators(
  previous: VoteModerator[],
  next: VoteModerator[],
): VoteModerator[] {
  if (
    previous.length === next.length &&
    previous.every(
      (moderator, index) =>
        moderator.id === next[index].id &&
        moderator.token === next[index].token &&
        moderator.active === next[index].active &&
        moderator.lastSeenAt === next[index].lastSeenAt,
    )
  ) {
    return previous;
  }
  return next;
}

/**
 * Moderator-link list for one vote. The vote detail view owns the single list so
 * the moderation, results and participation tabs share one active token instead
 * of polling the same endpoint with drifting copies.
 */
export const useVoteModerators = (voteId: string) => {
  const [moderators, setModerators] = React.useState<VoteModerator[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  // Latest list for imperative callers (the owner view's ensure step) that
  // would otherwise capture a stale closure from a render.
  const moderatorsRef = React.useRef<VoteModerator[]>([]);
  React.useEffect(() => {
    moderatorsRef.current = moderators;
  }, [moderators]);
  const ensuringRef = React.useRef(false);

  const loadModerators = React.useCallback(async () => {
    try {
      const adapter = await getPersistenceAdapter();
      const result = await adapter.listVoteModerators(voteId);
      setModerators((previous) => applyModerators(previous, result));
      return result;
    } catch (error) {
      console.error("Error loading vote moderators:", error);
      return [];
    }
  }, [voteId]);

  React.useEffect(() => {
    let mounted = true;

    const fetchModerators = async () => {
      setIsLoading(true);
      try {
        const adapter = await getPersistenceAdapter();
        const result = await adapter.listVoteModerators(voteId);
        if (mounted) {
          setModerators((previous) => applyModerators(previous, result));
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error loading vote moderators:", error);
        if (mounted) setIsLoading(false);
      }
    };

    fetchModerators();

    const interval = setInterval(fetchModerators, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [voteId]);

  const addModerator = async (
    input: { displayName: string; email?: string }
  ): Promise<VoteModerator | null> => {
    try {
      const adapter = await getPersistenceAdapter();
      const moderator = await adapter.addVoteModerator(voteId, input);
      setModerators((prev) => [...prev, moderator]);
      return moderator;
    } catch (error) {
      console.error("Error adding vote moderator:", error);
      return null;
    }
  };

  const revokeModerator = async (moderatorId: string): Promise<boolean> => {
    // Revocation is privileged: send a capability for this vote so the server
    // can verify the caller before deactivating another link. Prefer a link
    // other than the one being revoked so the request does not depend on the
    // credential it is about to invalidate.
    const activeModerators = moderatorsRef.current.filter((m) => m.active);
    const moderatorToken =
      activeModerators.find((m) => m.id !== moderatorId)?.token ??
      activeModerators[0]?.token;
    try {
      const adapter = await getPersistenceAdapter();
      await adapter.revokeVoteModerator(voteId, moderatorId, moderatorToken);
      setModerators((prev) => prev.filter((m) => m.id !== moderatorId));
      return true;
    } catch (error) {
      console.error("Error revoking vote moderator:", error);
      return false;
    }
  };

  /**
   * The in-app owner view is the facilitator view: hidden results and live
   * drafts are read through a moderator capability. Create one when the vote
   * has no active link, so the owner does not have to mint a link by hand
   * before every live view. The link is a normal, revocable moderator link and
   * appears in the moderation tab like any other.
   */
  const ensureActiveModerator = React.useCallback(
    async (displayName = "Owner"): Promise<VoteModerator | null> => {
      const existing = moderatorsRef.current.find((moderator) => moderator.active);
      if (existing) return existing;
      if (ensuringRef.current) return null;
      ensuringRef.current = true;
      try {
        const adapter = await getPersistenceAdapter();
        const moderator = await adapter.addVoteModerator(voteId, { displayName });
        moderatorsRef.current = [...moderatorsRef.current, moderator];
        setModerators((prev) =>
          prev.some((m) => m.id === moderator.id) ? prev : [...prev, moderator],
        );
        return moderator;
      } catch (error) {
        console.error("Error ensuring vote moderator:", error);
        return null;
      } finally {
        ensuringRef.current = false;
      }
    },
    [voteId],
  );

  return {
    moderators,
    isLoading,
    loadModerators,
    addModerator,
    revokeModerator,
    ensureActiveModerator,
  };
};

export const useModeratorToken = (token: string | null) => {
  const [vote, setVote] = React.useState<import("@/lib/persistence-types").VoteEntity | null>(null);
  const [moderator, setModerator] = React.useState<VoteModerator | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!token) return;
    try {
      const adapter = await getPersistenceAdapter();
      const result = await adapter.resolveVoteModerator(token);
      if (result) {
        setVote(result.vote);
        setModerator(result.moderator);
        setError(null);
      } else {
        setError("Invalid or expired moderation token");
      }
    } catch (err) {
      console.error("Error resolving moderator token:", err);
      setError("Failed to resolve moderation token");
    }
  }, [token]);

  React.useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    let mounted = true;
    const resolveToken = async () => {
      await refresh();
      if (mounted) setIsLoading(false);
    };

    void resolveToken();
    const interval = setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [token, refresh]);

  return { vote, moderator, isLoading, error, refresh };
};