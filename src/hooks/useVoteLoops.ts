import * as React from "react";
import { VoteLoop } from "@/lib/persistence-types";
import { getPersistenceAdapter } from "@/lib/persistence-factory";

export const useVoteLoops = (voteId: string) => {
  const [loops, setLoops] = React.useState<VoteLoop[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadLoops = React.useCallback(async () => {
    try {
      const adapter = await getPersistenceAdapter();
      const result = await adapter.listVoteLoops(voteId);
      setLoops(result);
      return result;
    } catch (error) {
      console.error("Error loading vote loops:", error);
      return [];
    }
  }, [voteId]);

  React.useEffect(() => {
    let mounted = true;

    const fetchLoops = async () => {
      setIsLoading(true);
      try {
        const adapter = await getPersistenceAdapter();
        const result = await adapter.listVoteLoops(voteId);
        if (mounted) {
          setLoops(result);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error loading vote loops:", error);
        if (mounted) setIsLoading(false);
      }
    };

    fetchLoops();

    const interval = setInterval(fetchLoops, 5000);

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
      const existingProposalLoops = freshLoops.filter((l) => l.proposalId === proposalId);
      const loop = await adapter.createVoteLoop(voteId, {
        proposalId,
        proposalContent: inheritFromContent || "",
        openedByUserId,
        openedAt: new Date().toISOString(),
        roundNumber: existingProposalLoops.length + 1,
      });
      setLoops((prev) => [...prev, loop]);
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