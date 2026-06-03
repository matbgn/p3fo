import * as React from "react";
import { VoteEntity, VoteLoop } from "@/lib/persistence-types";
import { Button } from "@/components/ui/button";
import {
  Play,
  Square,
  Trophy,
  XCircle,
} from "lucide-react";
import { getVotingStrings } from "@/lib/voting-i18n";

interface LoopRoundControlsProps {
  vote: VoteEntity;
  loops: VoteLoop[];
  proposalId: string;
  onOpenRound: (proposalId: string) => void;
  onCloseRound: (loopId: string) => void;
  isModerator?: boolean;
}

export const LoopRoundControls: React.FC<LoopRoundControlsProps> = ({
  vote,
  loops,
  proposalId,
  onOpenRound,
  onCloseRound,
  isModerator = false,
}) => {
  const t = getVotingStrings();

  const isFinalized = vote.config.phase === "FINALIZED";
  const isOpen = vote.config.phase === "OPEN";

  const proposalLoops = React.useMemo(
    () => [...loops].filter((l) => l.proposalId === proposalId).sort((a, b) => a.roundNumber - b.roundNumber),
    [loops, proposalId]
  );

  const currentOpenLoop = proposalLoops.find((l) => !l.closedAt);
  const canOpen = isOpen && !currentOpenLoop;

  if (isFinalized) {
    return (
      <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
        <Trophy className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium text-blue-800">
          {t.messages.consentLoopFinalized}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {currentOpenLoop && isOpen && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCloseRound(currentOpenLoop.id)}
            className="border-yellow-500 text-yellow-700 hover:bg-yellow-50"
          >
            <Square className="w-4 h-4 mr-1" />
            {t.buttons.closeRound} {currentOpenLoop.roundNumber}
          </Button>
        )}

        {canOpen && (
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            onClick={() => onOpenRound(proposalId)}
          >
            <Play className="w-4 h-4 mr-1" />
            {t.buttons.openRound} {proposalLoops.length + 1}
          </Button>
        )}

        {!isOpen && !isFinalized && !isModerator && (
          <span className="text-xs text-gray-500 italic">
            {t.messages.onlyOwnerCanFinalize}
          </span>
        )}
      </div>
    </div>
  );
};