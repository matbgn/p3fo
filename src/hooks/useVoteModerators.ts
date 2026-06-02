import * as React from "react";
import { VoteModerator } from "@/lib/persistence-types";
import { getPersistenceAdapter } from "@/lib/persistence-factory";

export const useVoteModerators = (voteId: string) => {
  const [moderators, setModerators] = React.useState<VoteModerator[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadModerators = React.useCallback(async () => {
    try {
      const adapter = await getPersistenceAdapter();
      const result = await adapter.listVoteModerators(voteId);
      setModerators(result);
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
          setModerators(result);
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
    try {
      const adapter = await getPersistenceAdapter();
      await adapter.revokeVoteModerator(moderatorId);
      setModerators((prev) => prev.filter((m) => m.id !== moderatorId));
      return true;
    } catch (error) {
      console.error("Error revoking vote moderator:", error);
      return false;
    }
  };

  return {
    moderators,
    isLoading,
    loadModerators,
    addModerator,
    revokeModerator,
  };
};

export const useModeratorToken = (token: string | null) => {
  const [vote, setVote] = React.useState<import("@/lib/persistence-types").VoteEntity | null>(null);
  const [moderator, setModerator] = React.useState<VoteModerator | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const resolveToken = async () => {
      try {
        const adapter = await getPersistenceAdapter();
        const result = await adapter.resolveVoteModerator(token);
        if (mounted) {
          if (result) {
            setVote(result.vote);
            setModerator(result.moderator);
          } else {
            setError("Invalid or expired moderation token");
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Error resolving moderator token:", err);
        if (mounted) {
          setError("Failed to resolve moderation token");
          setIsLoading(false);
        }
      }
    };

    resolveToken();

    return () => {
      mounted = false;
    };
  }, [token]);

  return { vote, moderator, isLoading, error };
};