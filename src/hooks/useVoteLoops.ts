import * as React from "react";
import { VoteLoop } from "@/lib/persistence-types";
import { getPersistenceAdapter } from "@/lib/persistence-factory";
import { yVoteLoops, initializeCollaboration, isCollaborationEnabled, doc } from "@/lib/collaboration";
import { PERSISTENCE_CONFIG } from "@/lib/persistence-config";
import { eventBus } from "@/lib/events";

if (!PERSISTENCE_CONFIG.FORCE_BROWSER) {
  initializeCollaboration();
}

const parseYjsLoopValue = (v: unknown): VoteLoop | null => {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toJSON" in v) return (v as { toJSON: () => VoteLoop }).toJSON() as VoteLoop;
  return JSON.parse(JSON.stringify(v)) as VoteLoop;
};

const syncLoopToYjs = (loop: VoteLoop) => {
  if (isCollaborationEnabled()) {
    yVoteLoops.set(loop.id, loop);
  }
};

const syncLoopsToYjs = (voteId: string, loops: VoteLoop[]) => {
  if (!isCollaborationEnabled()) return;
  doc.transact(() => {
    const keysToDelete: string[] = [];
    yVoteLoops.forEach((v, k) => {
      const parsed = parseYjsLoopValue(v);
      if (parsed && parsed.voteId === voteId && !loops.some(l => l.id === parsed.id)) {
        keysToDelete.push(k as string);
      }
    });
    keysToDelete.forEach(k => yVoteLoops.delete(k));
    loops.forEach(l => yVoteLoops.set(l.id, l));
  });
};

if (isCollaborationEnabled()) {
  yVoteLoops.observe(() => {
    eventBus.publish("voteLoopsChanged");
  });
}

export const useVoteLoops = (voteId: string) => {
  const [loops, setLoops] = React.useState<VoteLoop[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadLoops = React.useCallback(async () => {
    try {
      const adapter = await getPersistenceAdapter();
      const result = await adapter.listVoteLoops(voteId);
      setLoops(result);
      syncLoopsToYjs(voteId, result);
      return result;
    } catch (error) {
      console.error("Error loading vote loops:", error);
      return [];
    }
  }, [voteId]);

  React.useEffect(() => {
    let mounted = true;

    const initialFetch = async () => {
      setIsLoading(true);
      try {
        const adapter = await getPersistenceAdapter();
        const result = await adapter.listVoteLoops(voteId);
        if (mounted) {
          setLoops(result);
          setIsLoading(false);
        }
        syncLoopsToYjs(voteId, result);
      } catch (error) {
        console.error("Error loading vote loops:", error);
        if (mounted) setIsLoading(false);
      }
    };

    initialFetch();

    const yjsHandler = () => {
      if (!mounted) return;
      const allLoops = (Array.from(yVoteLoops.values()) as unknown[])
        .map(v => parseYjsLoopValue(v))
        .filter((v): v is VoteLoop => v !== null);
      const voteLoops = allLoops.filter(l => l.voteId === voteId);
      setLoops(voteLoops);
    };

    if (isCollaborationEnabled()) {
      yVoteLoops.observe(yjsHandler);
      return () => {
        mounted = false;
        yVoteLoops.unobserve(yjsHandler);
      };
    }

    const interval = setInterval(initialFetch, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [voteId]);

  const openRound = async (
    proposalId: string,
    openedByUserId: string,
    inheritFromContent?: string
  ): Promise<VoteLoop | null> => {
    try {
      const adapter = await getPersistenceAdapter();
      const freshLoops = await adapter.listVoteLoops(voteId);
      setLoops(freshLoops);
      syncLoopsToYjs(voteId, freshLoops);
      const existingProposalLoops = freshLoops.filter((l) => l.proposalId === proposalId);
      const loop = await adapter.createVoteLoop(voteId, {
        proposalId,
        proposalContent: inheritFromContent || "",
        openedByUserId,
        openedAt: new Date().toISOString(),
        roundNumber: existingProposalLoops.length + 1,
      });
      setLoops((prev) => [...prev, loop]);
      syncLoopToYjs(loop);
      return loop;
    } catch (error) {
      console.error("Error opening round:", error);
      return null;
    }
  };

  const closeRound = async (loopId: string): Promise<VoteLoop | null> => {
    try {
      const adapter = await getPersistenceAdapter();
      const updated = await adapter.closeVoteLoop(loopId);
      if (updated) {
        setLoops((prev) => prev.map((l) => (l.id === loopId ? updated : l)));
        syncLoopToYjs(updated);
      }
      return updated;
    } catch (error) {
      console.error("Error closing round:", error);
      return null;
    }
  };

  const updateRoundContent = async (
    loopId: string,
    content: string
  ): Promise<VoteLoop | null> => {
    try {
      const adapter = await getPersistenceAdapter();
      const updated = await adapter.updateVoteLoop(loopId, {
        proposalContent: content,
      });
      if (updated) {
        setLoops((prev) => prev.map((l) => (l.id === loopId ? updated : l)));
        syncLoopToYjs(updated);
      }
      return updated;
    } catch (error) {
      console.error("Error updating round content:", error);
      return null;
    }
  };

  return {
    loops,
    isLoading,
    loadLoops,
    openRound,
    closeRound,
    updateRoundContent,
  };
};