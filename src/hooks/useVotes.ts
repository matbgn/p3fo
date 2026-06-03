import * as React from "react";
import { eventBus } from "@/lib/events";
import { VoteEntity, VoteResponseEntity, VoteKind } from "@/lib/persistence-types";
import { getPersistenceAdapter } from "@/lib/persistence-factory";

let votes: VoteEntity[] = [];

const loadVotes = async (opts?: { linkedTaskId?: string; ownerId?: string; kind?: VoteKind }): Promise<VoteEntity[]> => {
  try {
    const adapter = await getPersistenceAdapter();
    votes = await adapter.listVotes(opts);
    eventBus.publish("votesChanged");
    return votes;
  } catch (error) {
    console.error("Error loading votes:", error);
    return votes;
  }
};

const loadVoteById = async (id: string): Promise<VoteEntity | null> => {
  try {
    const adapter = await getPersistenceAdapter();
    return await adapter.getVoteById(id);
  } catch (error) {
    console.error("Error loading vote by id:", error);
    return null;
  }
};

const loadVoteBySlug = async (slug: string): Promise<VoteEntity | null> => {
  try {
    const adapter = await getPersistenceAdapter();
    return await adapter.getVoteBySlug(slug);
  } catch (error) {
    console.error("Error loading vote by slug:", error);
    return null;
  }
};

const createVote = async (input: Partial<VoteEntity>): Promise<VoteEntity | null> => {
  try {
    const adapter = await getPersistenceAdapter();
    const vote = await adapter.createVote(input);
    votes = [...votes, vote];
    eventBus.publish("votesChanged");
    return vote;
  } catch (error) {
    console.error("Error creating vote:", error);
    return null;
  }
};

const updateVote = async (id: string, patch: Partial<VoteEntity>): Promise<VoteEntity | null> => {
  try {
    const adapter = await getPersistenceAdapter();
    const updated = await adapter.updateVote(id, patch);
    if (updated) {
      votes = votes.map(v => v.id === id ? updated : v);
      eventBus.publish("votesChanged");
    }
    return updated;
  } catch (error) {
    console.error("Error updating vote:", error);
    return null;
  }
};

const finalizeVote = async (id: string, outcome: VoteEntity['outcome']): Promise<VoteEntity | null> => {
  try {
    const adapter = await getPersistenceAdapter();
    const updated = await adapter.finalizeVote(id, outcome);
    if (updated) {
      votes = votes.map(v => v.id === id ? updated : v);
      eventBus.publish("votesChanged");
    }
    return updated;
  } catch (error) {
    console.error("Error finalizing vote:", error);
    return null;
  }
};

const deleteVote = async (id: string): Promise<void> => {
  try {
    const adapter = await getPersistenceAdapter();
    await adapter.deleteVote(id);
    votes = votes.filter(v => v.id !== id);
    eventBus.publish("votesChanged");
  } catch (error) {
    console.error("Error deleting vote:", error);
  }
};

const resetVote = async (id: string): Promise<VoteEntity | null> => {
  try {
    const adapter = await getPersistenceAdapter();
    const updated = await adapter.resetVote(id);
    if (updated) {
      votes = votes.map(v => v.id === id ? updated : v);
      eventBus.publish("votesChanged");
    }
    return updated;
  } catch (error) {
    console.error("Error resetting vote:", error);
    return null;
  }
};

const submitVoteResponse = async (voteIdOrSlug: string, response: Partial<VoteResponseEntity>): Promise<VoteResponseEntity | null> => {
  try {
    const adapter = await getPersistenceAdapter();
    const vote = await adapter.getVoteById(voteIdOrSlug) || await adapter.getVoteBySlug(voteIdOrSlug);
    if (!vote) return null;
    throw new Error("submitVoteResponse requires server-side endpoint — use HTTP adapter");
  } catch (error) {
    console.error("Error submitting vote response:", error);
    return null;
  }
};

export const useVotes = (opts?: { linkedTaskId?: string; ownerId?: string; kind?: VoteKind }) => {
  const [votesState, setVotesState] = React.useState<VoteEntity[]>(votes);
  const [isLoading, setIsLoading] = React.useState(true);

  const linkedTaskId = opts?.linkedTaskId;
  const ownerId = opts?.ownerId;
  const kind = opts?.kind;

  React.useEffect(() => {
    let mounted = true;

    const fetchVotes = async () => {
      setIsLoading(true);
      const result = await loadVotes({ linkedTaskId, ownerId, kind });
      if (mounted) {
        setVotesState(result);
        setIsLoading(false);
      }
    };

    fetchVotes();

    const handler = () => {
      if (mounted) {
        setVotesState([...votes]);
      }
    };

    eventBus.subscribe("votesChanged", handler);

    return () => {
      mounted = false;
      eventBus.unsubscribe("votesChanged", handler);
    };
  }, [linkedTaskId, ownerId, kind]);

  return {
    votes: votesState,
    isLoading,
    loadVotes,
    loadVoteById,
    loadVoteBySlug,
    createVote,
    updateVote,
    finalizeVote,
    deleteVote,
    resetVote,
  };
};

export const useVoteResults = (voteId: string) => {
  const [responses, setResponses] = React.useState<VoteResponseEntity[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const adapter = await getPersistenceAdapter();
        const result = await adapter.listVoteResponses(voteId);
        if (mounted) {
          setResponses(result);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error loading vote results:", error);
        if (mounted) setIsLoading(false);
      }
    };

    fetchResults();

    const interval = setInterval(fetchResults, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [voteId]);

  return { responses, isLoading, refetch: async () => {
    try {
      const adapter = await getPersistenceAdapter();
      const result = await adapter.listVoteResponses(voteId);
      setResponses(result);
    } catch (error) {
      console.error("Error refetching vote results:", error);
    }
  }};
};

export const useVoterToken = (slug: string) => {
  const STORAGE_PREFIX = 'voted_vote_';

  const getToken = (): string | null => {
    try {
      return localStorage.getItem(`${STORAGE_PREFIX}${slug}`);
    } catch {
      return null;
    }
  };

  const setToken = (token: string) => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${slug}`, token);
    } catch {
      // ignore
    }
  };

  const hasVoted = getToken() !== null;

  return { voterToken: getToken(), hasVoted, setToken };
};