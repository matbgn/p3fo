import * as React from "react";
import { VoteLoop } from "@/lib/persistence-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { deserializeBlocks } from "./BlockNoteProposalEditor";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { GitCompare } from "lucide-react";
import { getVotingStrings } from "@/lib/voting-i18n";

interface LoopRoundDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loops: VoteLoop[];
}

function blocksToText(json: string): string[] {
  const blocks = deserializeBlocks(json);
  return blocks.map((b: { content?: Array<{ text?: string }> }) => {
    if (!b.content || !Array.isArray(b.content)) return "";
    return b.content
      .map((c: { text?: string }) => c.text || "")
      .join("");
  });
}

function computeBlockDiff(
  leftLines: string[],
  rightLines: string[]
): Array<{
  type: "added" | "removed" | "unchanged";
  line: string;
}> {
  const result: Array<{
    type: "added" | "removed" | "unchanged";
    line: string;
  }> = [];

  const leftSet = new Set(leftLines);
  const rightSet = new Set(rightLines);

  const maxLen = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < maxLen; i++) {
    const l = i < leftLines.length ? leftLines[i] : undefined;
    const r = i < rightLines.length ? rightLines[i] : undefined;

    if (l !== undefined && r !== undefined) {
      if (l === r) {
        result.push({ type: "unchanged", line: l });
      } else {
        result.push({ type: "removed", line: l });
        result.push({ type: "added", line: r });
      }
    } else if (l !== undefined) {
      result.push({ type: "removed", line: l });
    } else if (r !== undefined) {
      result.push({ type: "added", line: r });
    }
  }

  return result;
}

const BLOCK_DIFF_COLORS = {
  added: "bg-green-50 border-l-4 border-l-green-500",
  removed: "bg-red-50 border-l-4 border-l-red-500",
  unchanged: "bg-white border-l-4 border-l-transparent",
};

const ReadOnlyBlockView: React.FC<{ json: string }> = ({ json }) => {
  const editor = useCreateBlockNote({
    initialContent: deserializeBlocks(json),
  });

  return (
    <div className="min-h-[60px] w-full rounded-md border border-gray-200 bg-white">
      <BlockNoteView
        editor={editor as never}
        theme="light"
        editable={false}
        className="w-full"
      />
    </div>
  );
};

export const LoopRoundDiffDialog: React.FC<LoopRoundDiffDialogProps> = ({
  open,
  onOpenChange,
  loops,
}) => {
  const t = getVotingStrings();
  const sortedLoops = React.useMemo(
    () => [...loops].sort((a, b) => a.roundNumber - b.roundNumber),
    [loops]
  );

  const closedLoops = sortedLoops.filter((l) => l.closedAt);

  const [leftIdx, setLeftIdx] = React.useState(0);
  const [rightIdx, setRightIdx] = React.useState(
    Math.min(1, closedLoops.length - 1)
  );

  React.useEffect(() => {
    if (closedLoops.length >= 2) {
      setLeftIdx(Math.max(0, closedLoops.length - 2));
      setRightIdx(closedLoops.length - 1);
    }
  }, [closedLoops.length]);

  if (closedLoops.length < 2) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.labels.roundComparison}</DialogTitle>
            <DialogDescription>
              {t.messages.needTwoClosedRounds}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.buttons.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const leftLoop = closedLoops[leftIdx];
  const rightLoop = closedLoops[rightIdx];
  const leftLines = blocksToText(leftLoop.proposalContent);
  const rightLines = blocksToText(rightLoop.proposalContent);
  const diff = computeBlockDiff(leftLines, rightLines);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="w-5 h-5" />
            {t.labels.roundComparison}
          </DialogTitle>
          <DialogDescription>
            {t.messages.compareRoundsDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="space-y-1">
            <Label className="text-xs">{t.labels.leftRound}</Label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={leftIdx}
              onChange={(e) =>
                setLeftIdx(Number((e.target as HTMLSelectElement).value))
              }
            >
              {closedLoops.map((l, i) => (
                <option key={l.id} value={i}>
                  {t.labels.round} {l.roundNumber}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.labels.rightRound}</Label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={rightIdx}
              onChange={(e) =>
                setRightIdx(Number((e.target as HTMLSelectElement).value))
              }
            >
              {closedLoops.map((l, i) => (
                <option key={l.id} value={i}>
                  {t.labels.round} {l.roundNumber}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <h4 className="text-xs font-medium text-gray-400 mb-2">
              Round {leftLoop.roundNumber}
            </h4>
            <ReadOnlyBlockView json={leftLoop.proposalContent} />
          </div>
          <div>
            <h4 className="text-xs font-medium text-gray-400 mb-2">
              Round {rightLoop.roundNumber}
            </h4>
            <ReadOnlyBlockView json={rightLoop.proposalContent} />
          </div>
        </div>

        <div className="space-y-1">
          <h4 className="text-xs font-medium text-gray-400 mb-2">
            {t.labels.blockLevelDiff}
          </h4>
          <div className="border rounded p-2 max-h-48 overflow-y-auto space-y-0.5">
            {diff.map((d, i) => (
              <div
                key={i}
                className={`px-2 py-0.5 text-sm font-mono whitespace-pre-wrap ${BLOCK_DIFF_COLORS[d.type]}`}
              >
                <span className="mr-2 text-xs text-gray-400 select-none">
                  {d.type === "added"
                    ? "+"
                    : d.type === "removed"
                      ? "-"
                      : " "}
                </span>
                {d.line || "(empty)"}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.buttons.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};