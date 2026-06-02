import * as React from "react";
import { VoteEntity, VoteLoop } from "@/lib/persistence-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Play,
  Square,
  Trophy,
  XCircle,
  Ban,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";

interface LoopRoundControlsProps {
  vote: VoteEntity;
  loops: VoteLoop[];
  onOpenRound: () => void;
  onCloseRound: (gatingValue: -1 | 0 | 1, gatingComment?: string) => void;
  onFinalize: (
    verdict: "ADOPTED" | "WITHDRAWN" | "BLOCKED",
    finalLoopId?: string
  ) => void;
  isModerator?: boolean;
}

const EMPTY_CONSENT_LOOP_OUTCOMES = {
  ADOPTED: "Adopted — no remaining objections",
  WITHDRAWN: "Withdrawn — proposer pulled the proposal",
  BLOCKED: "Blocked — objection(s) could not be integrated",
} as const;

export const LoopRoundControls: React.FC<LoopRoundControlsProps> = ({
  vote,
  loops,
  onOpenRound,
  onCloseRound,
  onFinalize,
  isModerator = false,
}) => {
  const [showGatingDialog, setShowGatingDialog] = React.useState(false);
  const [showFinalizeDialog, setShowFinalizeDialog] = React.useState(false);
  const [gatingValue, setGatingValue] = React.useState<-1 | 0 | 1>(0);
  const [gatingComment, setGatingComment] = React.useState("");
  const [finalizeVerdict, setFinalizeVerdict] = React.useState<
    "ADOPTED" | "WITHDRAWN" | "BLOCKED"
  >("ADOPTED");

  const isFinalized = vote.config.phase === "FINALIZED";
  const isOpen = vote.config.phase === "OPEN";
  const maxRounds = vote.config.consentLoopMaxRounds || 10;
  const gatingMode = vote.config.consentLoopGatingMode || "UD_NEUTRAL";

  const sortedLoops = React.useMemo(
    () => [...loops].sort((a, b) => a.roundNumber - b.roundNumber),
    [loops]
  );

  const currentOpenLoop = sortedLoops.find((l) => !l.closedAt);
  const lastClosedLoop = [...sortedLoops]
    .reverse()
    .find((l) => l.closedAt);
  const roundCount = sortedLoops.length;
  const atMaxRounds = roundCount >= maxRounds;

  const canAdopt = (() => {
    if (!lastClosedLoop) return false;
    return !lastClosedLoop.gatingValue || lastClosedLoop.gatingValue >= 0;
  })();

  const handleCloseRound = () => {
    if (gatingMode === "UD_NEUTRAL") {
      setShowGatingDialog(true);
    } else {
      onCloseRound(0);
    }
  };

  const handleGatingSubmit = () => {
    onCloseRound(gatingValue, gatingComment || undefined);
    setShowGatingDialog(false);
    setGatingComment("");
    setGatingValue(0);
  };

  const handleFinalize = () => {
    const finalLoopId =
      finalizeVerdict === "ADOPTED" || finalizeVerdict === "BLOCKED"
        ? lastClosedLoop?.id
        : undefined;
    onFinalize(finalizeVerdict, finalLoopId);
    setShowFinalizeDialog(false);
  };

  if (isFinalized) {
    return (
      <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
        <Trophy className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium text-blue-800">
          {vote.outcome?.loopVerdict
            ? EMPTY_CONSENT_LOOP_OUTCOMES[vote.outcome.loopVerdict]
            : "This consent loop is finalized."}
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
            onClick={handleCloseRound}
            className="border-yellow-500 text-yellow-700 hover:bg-yellow-50"
          >
            <Square className="w-4 h-4 mr-1" />
            Close round {currentOpenLoop.roundNumber}
          </Button>
        )}

        {!currentOpenLoop && isOpen && !atMaxRounds && (
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            onClick={onOpenRound}
          >
            <Play className="w-4 h-4 mr-1" />
            Open round {roundCount + 1}
          </Button>
        )}

        {atMaxRounds && !currentOpenLoop && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Maximum rounds reached ({maxRounds}). You must finalize.
          </p>
        )}

        {lastClosedLoop && isOpen && !isModerator && (
          <Button
            size="sm"
            onClick={() => setShowFinalizeDialog(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Trophy className="w-4 h-4 mr-1" />
            Finalize
          </Button>
        )}

        {lastClosedLoop && isOpen && isModerator && (
          <Button
            size="sm"
            variant="outline"
            className="border-blue-300 text-blue-600"
            title="Only the owner can finalize. Request finalization from the owner."
          >
            <Trophy className="w-4 h-4 mr-1" />
            Request finalization
          </Button>
        )}
      </div>

      <Dialog open={showGatingDialog} onOpenChange={setShowGatingDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Round closed — Gating check
            </DialogTitle>
            <DialogDescription>
              Did anyone want to block the proposal? This helps avoid false
              blocks from grades like &ldquo;Insufficient&rdquo; without a
              real objection.
            </DialogDescription>
          </DialogHeader>

          <RadioGroup
            value={String(gatingValue)}
            onValueChange={(v) => setGatingValue(Number(v) as -1 | 0 | 1)}
            className="space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="-1" id="block" />
              <Label htmlFor="block" className="flex items-center gap-1">
                <Ban className="w-4 h-4 text-red-500" /> Block (objection
                remains)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="0" id="neutral" />
              <Label htmlFor="neutral" className="flex items-center gap-1">
                <RotateCcw className="w-4 h-4 text-yellow-500" /> Neutral
                (uncertain)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="1" id="for" />
              <Label htmlFor="for" className="flex items-center gap-1">
                <Play className="w-4 h-4 text-green-500" /> For it (no
                objection)
              </Label>
            </div>
          </RadioGroup>

          <Textarea
            value={gatingComment}
            onChange={(e) => setGatingComment(e.target.value)}
            placeholder="Optional comment on the gating decision..."
            rows={2}
          />

          <DialogFooter>
            <Button onClick={handleGatingSubmit}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Finalize consent loop</DialogTitle>
            <DialogDescription>
              Choose the outcome for this consent loop. This action is
              irreversible.
            </DialogDescription>
          </DialogHeader>

          <RadioGroup
            value={finalizeVerdict}
            onValueChange={(v) =>
              setFinalizeVerdict(v as "ADOPTED" | "WITHDRAWN" | "BLOCKED")
            }
            className="space-y-3"
          >
            <div className="flex items-start space-x-2 p-2 rounded border hover:bg-gray-50">
              <RadioGroupItem value="ADOPTED" id="adopt" className="mt-1" />
              <Label htmlFor="adopt" className="flex-1">
                <span className="font-medium flex items-center gap-1">
                  <Trophy className="w-4 h-4 text-green-600" /> Adopt
                </span>
                <span className="text-xs text-gray-500 block">
                  No remaining objections. The current round&apos;s proposal
                  becomes the decision.
                </span>
                {!canAdopt && (
                  <span className="text-xs text-red-500 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" />
                    Last round had a blocking gating vote
                  </span>
                )}
              </Label>
            </div>
            <div className="flex items-start space-x-2 p-2 rounded border hover:bg-gray-50">
              <RadioGroupItem value="WITHDRAWN" id="withdraw" className="mt-1" />
              <Label htmlFor="withdraw" className="flex-1">
                <span className="font-medium flex items-center gap-1">
                  <XCircle className="w-4 h-4 text-yellow-600" /> Withdraw
                </span>
                <span className="text-xs text-gray-500 block">
                  The proposer pulls the proposal. No decision is adopted.
                </span>
              </Label>
            </div>
            <div className="flex items-start space-x-2 p-2 rounded border hover:bg-gray-50">
              <RadioGroupItem value="BLOCKED" id="blocked" className="mt-1" />
              <Label htmlFor="blocked" className="flex-1">
                <span className="font-medium flex items-center gap-1">
                  <Ban className="w-4 h-4 text-red-600" /> Blocked
                </span>
                <span className="text-xs text-gray-500 block">
                  Objection(s) at round{" "}
                  {lastClosedLoop?.roundNumber || "?"} could not be integrated.
                </span>
              </Label>
            </div>
          </RadioGroup>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowFinalizeDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFinalize}
              disabled={finalizeVerdict === "ADOPTED" && !canAdopt}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Finalize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};