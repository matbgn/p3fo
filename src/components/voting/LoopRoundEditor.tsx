import * as React from "react";
import { VoteEntity, VoteLoop } from "@/lib/persistence-types";
import { BlockNoteProposalEditor } from "./BlockNoteProposalEditor";
import { Label } from "@/components/ui/label";
import { Clock } from "lucide-react";
import { getVotingStrings } from "@/lib/voting-i18n";

interface LoopRoundEditorProps {
  loop: VoteLoop | null;
  vote?: VoteEntity;
  onChange: (content: string) => void;
  readOnly?: boolean;
}

export const LoopRoundEditor: React.FC<LoopRoundEditorProps> = ({
  loop,
  vote,
  onChange,
  readOnly = false,
}) => {
  const t = getVotingStrings();

  if (!loop) {
    return (
      <p className="text-sm text-gray-400 italic">
        No active round. Open a round to begin editing.
      </p>
    );
  }

  const proposal = vote?.proposals.find((p) => p.id === loop.proposalId);
  const proposalLabel = proposal?.description || proposal?.content
    ? `${t.labels.round} ${loop.roundNumber}`
    : `${t.labels.round} ${loop.roundNumber}`;

  const elapsed = loop.openedAt
    ? Math.floor(
        (Date.now() - new Date(loop.openedAt).getTime()) / 60000
      )
    : 0;

  const fallbackContent = proposal?.content || "";
  const displayValue = loop.proposalContent || fallbackContent || "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {proposalLabel}
        </Label>
        {!loop.closedAt && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {elapsed}m since open
          </span>
        )}
      </div>

      <BlockNoteProposalEditor
        value={displayValue}
        onChange={onChange}
        readOnly={readOnly || !!loop.closedAt}
        placeholder="Refine the proposal text for this round..."
      />

      {loop.closedAt && (
        <p className="text-xs text-gray-400 italic">
          This round is closed and cannot be edited.
        </p>
      )}
    </div>
  );
};