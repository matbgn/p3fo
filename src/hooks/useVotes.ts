import * as React from "react";
import { eventBus } from "@/lib/events";
import { VoteEntity, VoteResponseEntity, VoteKind } from "@/lib/persistence-types";
import { getPersistenceAdapter } from "@/lib/persistence-factory";
import { yVoteProposals, yVoteResponses, yVoteLoops, initializeCollaboration, isCollaborationEnabled, doc } from "@/lib/collaboration";
import { PERSISTENCE_CONFIG } from "@/lib/persistence-config";

let votes: VoteEntity[] = [];

if (!PERSISTENCE_CONFIG.FORCE_BROWSER) {
  initializeCollaboration();
}

const parseYjsValue = (v: unknown): VoteEntity | null => {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toJSON" in v) return (v as { toJSON: () => VoteEntity }).toJSON() as VoteEntity;
  return JSON.parse(JSON.stringify(v)) as VoteEntity;
};

const parseYjsResponseValue = (v: unknown): VoteResponseEntity | null => {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toJSON" in v) return (v as { toJSON: () => VoteResponseEntity }).toJSON() as VoteResponseEntity;
  return JSON.parse(JSON.stringify(v)) as VoteResponseEntity;
};

export const syncVoteToYjs = (id: string, vote: VoteEntity) => {
  if (isCollaborationEnabled()) {
    yVoteProposals.set(id, vote);
  }
};

export const syncResponsesToYjs = (voteId: string, responses: VoteResponseEntity[]) => {
  if (!isCollaborationEnabled()) return;
  doc.transact(() => {
    const keysToDelete: string[] = [];
    yVoteResponses.forEach((v, k) => {
      const parsed = parseYjsResponseValue(v);
      if (parsed && parsed.voteId === voteId && !responses.some(r => r.id === parsed.id)) {
        keysToDelete.push(k as string);
      }
    });
    keysToDelete.forEach(k => yVoteResponses.delete(k));
    responses.forEach(r => yVoteResponses.set(r.id, r));
  });
};

const syncVotesToYjs = () => {
  if (!isCollaborationEnabled()) return;
  doc.transact(() => {
    const currentIds = Array.from(yVoteProposals.keys()) as string[];
    const newIds = votes.map(v => v.id);
    currentIds.forEach(id => {
      if (!newIds.includes(id)) {
        yVoteProposals.delete(id);
      }
    });
    votes.forEach(vote => {
      yVoteProposals.set(vote.id, vote);
    });
  });
};

const syncResponseToYjs = (response: VoteResponseEntity) => {
  if (isCollaborationEnabled()) {
    yVoteResponses.set(response.id, response);
  }
};

const clearVoteChildrenFromYjs = (voteId: string) => {
  if (!isCollaborationEnabled()) return;
  doc.transact(() => {
    const responseKeysToDelete: string[] = [];
    yVoteResponses.forEach((v, k) => {
      const parsed = parseYjsResponseValue(v);
      if (parsed && parsed.voteId === voteId) responseKeysToDelete.push(k as string);
    });
    responseKeysToDelete.forEach(k => yVoteResponses.delete(k));

    const loopKeysToDelete: string[] = [];
    yVoteLoops.forEach((v, k) => {
      const raw = v as { toJSON?: () => unknown } | null;
      let parsed: { voteId?: string } | null = null;
      if (raw && typeof raw === "object" && "toJSON" in raw) {
        parsed = (raw as { toJSON: () => { voteId?: string } }).toJSON();
      } else if (raw) {
        try { parsed = JSON.parse(JSON.stringify(raw)) as { voteId?: string }; } catch { /* ignore */ }
      }
      if (parsed && parsed.voteId === voteId) loopKeysToDelete.push(k as string);
    });
    loopKeysToDelete.forEach(k => yVoteLoops.delete(k));
  });
};

if (isCollaborationEnabled()) {
  yVoteProposals.observe(() => {
    const newVotes = (Array.from(yVoteProposals.values()) as unknown[])
      .map(v => parseYjsValue(v))
      .filter((v): v is VoteEntity => v !== null);
    votes = newVotes;
    eventBus.publish("votesChanged");
  });

  yVoteResponses.observe(() => {
    eventBus.publish("voteResponsesChanged");
  });
}

const loadVotes = async (opts?: { linkedTaskId?: string; ownerId?: string; kind?: VoteKind }): Promise<VoteEntity[]> => {
  try {
    const adapter = await getPersistenceAdapter();
    votes = await adapter.listVotes(opts);
    eventBus.publish("votesChanged");
    syncVotesToYjs();
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
    syncVoteToYjs(vote.id, vote);
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
      syncVoteToYjs(id, updated);
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
      syncVoteToYjs(id, updated);
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
    if (isCollaborationEnabled()) {
      yVoteProposals.delete(id);
    }
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
      syncVoteToYjs(id, updated);
      clearVoteChildrenFromYjs(id);
      eventBus.publish("votesChanged");
      eventBus.publish("voteLoopsChanged");
      eventBus.publish("voteResponsesChanged");
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

  const fetchResults = React.useCallback(async () => {
    try {
      const adapter = await getPersistenceAdapter();
      const result = await adapter.listVoteResponses(voteId);
      setResponses(result);
      syncResponsesToYjs(voteId, result);
    } catch (error) {
      console.error("Error loading vote results:", error);
    }
  }, [voteId]);

  React.useEffect(() => {
    let mounted = true;

    const initialFetch = async () => {
      setIsLoading(true);
      try {
        const adapter = await getPersistenceAdapter();
        const result = await adapter.listVoteResponses(voteId);
        if (mounted) {
          setResponses(result);
          setIsLoading(false);
        }
        syncResponsesToYjs(voteId, result);
      } catch (error) {
        console.error("Error loading vote results:", error);
        if (mounted) setIsLoading(false);
      }
    };

    initialFetch();

    const yjsHandler = () => {
      if (!mounted) return;
      const allResponses = (Array.from(yVoteResponses.values()) as unknown[])
        .map(v => parseYjsResponseValue(v))
        .filter((v): v is VoteResponseEntity => v !== null);
      const voteResponses = allResponses.filter(r => r.voteId === voteId);
      setResponses(voteResponses);
    };

    if (isCollaborationEnabled()) {
      yVoteResponses.observe(yjsHandler);
      const eventHandler = () => {
        if (!mounted) return;
        fetchResults();
      };
      eventBus.subscribe("voteResponsesChanged", eventHandler);
      return () => {
        mounted = false;
        yVoteResponses.unobserve(yjsHandler);
        eventBus.unsubscribe("voteResponsesChanged", eventHandler);
      };
    }

    const interval = setInterval(initialFetch, 5000);
    const eventHandler = () => {
      if (!mounted) return;
      fetchResults();
    };
    eventBus.subscribe("voteResponsesChanged", eventHandler);
    return () => {
      mounted = false;
      clearInterval(interval);
      eventBus.unsubscribe("voteResponsesChanged", eventHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voteId]);

  return { responses, isLoading, refetch: fetchResults };
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