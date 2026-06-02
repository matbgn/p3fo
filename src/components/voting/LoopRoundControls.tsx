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
import { getVotingStrings } from "@/lib/voting-i18n";

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
  const t = getVotingStrings();
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
            ? EMPTY_CONSENT_LOOP_OUTCOMES[vote.outcome.loopVerdict] as string
            : t.messages.consentLoopFinalized}
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
            {t.messages.maxRoundsReached}
          </p>
        )}

        {lastClosedLoop && isOpen && !isModerator && (
          <Button
            size="sm"
            onClick={() => setShowFinalizeDialog(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Trophy className="w-4 h-4 mr-1" />
            {t.buttons.finalize}
          </Button>
        )}

        {lastClosedLoop && isOpen && isModerator && (
          <Button
            size="sm"
            variant="outline"
            className="border-blue-300 text-blue-600"
            title={t.messages.onlyOwnerCanFinalize}
          >
            <Trophy className="w-4 h-4 mr-1" />
            {t.buttons.requestFinalization}
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
              {t.messages.gatingDescription}
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
                <Ban className="w-4 h-4 text-red-500" /> {t.gating.block}
               </Label>
             </div>
             <div className="flex items-center space-x-2">
               <RadioGroupItem value="0" id="neutral" />
               <Label htmlFor="neutral" className="flex items-center gap-1">
                 <RotateCcw className="w-4 h-4 text-yellow-500" /> {t.gating.neutral}
               </Label>
             </div>
             <div className="flex items-center space-x-2">
               <RadioGroupItem value="1" id="for" />
               <Label htmlFor="for" className="flex items-center gap-1">
                 <Play className="w-4 h-4 text-green-500" /> {t.gating.forIt}
              </Label>
            </div>
          </RadioGroup>

          <Textarea
            value={gatingComment}
            onChange={(e) => setGatingComment(e.target.value)}
              placeholder={t.placeholders.gatingComment}
            rows={2}
          />

          <DialogFooter>
            <Button onClick={handleGatingSubmit}>{t.buttons.confirm}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.buttons.finalizeConsentLoop}</DialogTitle>
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
                  <Trophy className="w-4 h-4 text-green-600" /> {t.buttons.adopt}
                 </span>
                 <span className="text-xs text-gray-500 block">
                   {t.messages.consentLoopAdopted}
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
                  <XCircle className="w-4 h-4 text-yellow-600" /> {t.buttons.withdraw}
                 </span>
                 <span className="text-xs text-gray-500 block">
                   {t.messages.consentLoopWithdrawn}
                </span>
              </Label>
            </div>
            <div className="flex items-start space-x-2 p-2 rounded border hover:bg-gray-50">
              <RadioGroupItem value="BLOCKED" id="blocked" className="mt-1" />
              <Label htmlFor="blocked" className="flex-1">
                <span className="font-medium flex items-center gap-1">
                  <Ban className="w-4 h-4 text-red-600" /> {t.buttons.blocked}
                 </span>
                 <span className="text-xs text-gray-500 block">
                   {t.messages.consentLoopBlocked}
                </span>
              </Label>
            </div>
          </RadioGroup>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowFinalizeDialog(false)}
            >
              {t.buttons.cancel}
            </Button>
            <Button
              onClick={handleFinalize}
              disabled={finalizeVerdict === "ADOPTED" && !canAdopt}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {t.buttons.finalize}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};