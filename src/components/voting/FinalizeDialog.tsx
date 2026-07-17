import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, Trophy, X } from "lucide-react";
import { VoteEntity, VoteLoop } from "@/lib/persistence-types";
import { getVotingStrings } from "@/lib/voting-i18n";
import { useVoteLoops } from "@/hooks/useVoteLoops";
import { tallyConsentLoop, getBestConsentRound } from "@/lib/vote-tally";
import { useVoteResults } from "@/hooks/useVotes";
import { MJ_SCALE } from "@/components/planView/constants";

interface FinalizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vote: VoteEntity;
  onFinalize: (outcome: VoteEntity["outcome"]) => Promise<void>;
  isModerator?: boolean;
}

export const FinalizeDialog: React.FC<FinalizeDialogProps> = ({
  open,
  onOpenChange,
  vote,
  onFinalize,
  isModerator = false,
}) => {
  const [winningProposalId, setWinningProposalId] = React.useState<string | null>(null);
  const [winningLoopId, setWinningLoopId] = React.useState<string | null>(null);
  const [signature, setSignature] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [summary, setSummary] = React.useState("");
  const t = getVotingStrings();

  const isConsentLoop = vote.config.mode === "CONSENT_LOOP";
  const { loops, isLoading: loopsLoading } = useVoteLoops(vote.id);
  const { responses, isLoading: responsesLoading } = useVoteResults(vote.id);
  const consentDataLoading = loopsLoading || responsesLoading;

  const consentTally = React.useMemo(
    () => isConsentLoop
      ? tallyConsentLoop(loops, responses, vote.proposals.filter((p) => p.active).map((p) => p.id))
      : null,
    [isConsentLoop, loops, responses, vote.proposals]
  );

  React.useEffect(() => {
    if (open) {
      setWinningProposalId(null);
      setWinningLoopId(null);
      setSignature("");
      setSummary("");
    }
  }, [open]);

  const activeProposals = vote.proposals.filter((p) => p.active);

  const handleFinalize = async () => {
    setIsSaving(true);
    try {
      const finalSummary =
        summary.trim() ||
        (winningProposalId
          ? activeProposals.find((p) => p.id === winningProposalId)
            ? `Proposal ${activeProposals.find((p) => p.id === winningProposalId)!.position + 1} selected as the decision.`
            : "Proposal selected as the decision."
          : "Tie — no decision reached.");

      await onFinalize({
        winningProposalId,
        winningLoopId: isConsentLoop ? winningLoopId : undefined,
        summary: finalSummary,
        finalizedAt: new Date().toISOString(),
        finalizedByUserId: vote.ownerId,
        signature: signature.trim() || undefined,
      });

      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-blue-600" />
            {t.buttons.finalizeDecision}
          </DialogTitle>
          <DialogDescription>
            {t.messages.selectWinningProposal}
          </DialogDescription>
        </DialogHeader>

          <div className="space-y-4">
            {isModerator && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  {t.messages.moderatorsCannotFinalize}
                </p>
              </div>
            )}
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              {t.messages.finalizingLocks}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{t.labels.winningProposal}</Label>
            <RadioGroup
              value={winningProposalId || "tie"}
              onValueChange={(v) => {
                setWinningProposalId(v === "tie" ? null : v);
                setWinningLoopId(null);
              }}
            >
              {activeProposals.map((proposal, index) => (
                <div key={proposal.id} className="flex items-center gap-2">
                  <RadioGroupItem value={proposal.id} id={`proposal-${proposal.id}`} />
                  <Label htmlFor={`proposal-${proposal.id}`} className="text-sm">
                    {proposal.description?.trim() || `Proposal ${index + 1}`}
                  </Label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <RadioGroupItem value="tie" id="proposal-tie" />
                <Label htmlFor="proposal-tie" className="text-sm text-gray-500 italic">
                  {t.messages.tieNoDecision}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {isConsentLoop && consentDataLoading && (
            <div className="space-y-2 p-3 rounded-md bg-blue-50 border border-blue-200">
              <p className="text-sm text-gray-500">Loading rounds…</p>
            </div>
          )}

          {isConsentLoop && !consentDataLoading && consentTally && (() => {
            const proposalsWithRounds = activeProposals
              .map((proposal) => {
                const proposalTally = consentTally.proposals.find((p) => p.proposalId === proposal.id);
                if (!proposalTally) return null;
                const closedRounds = proposalTally.perRound.filter((r) => r.closed);
                if (closedRounds.length === 0) return null;
                return { proposal, proposalTally, closedRounds };
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);
            if (proposalsWithRounds.length === 0) return null;
            return (
              <div className="space-y-3 p-3 rounded-md bg-blue-50 border border-blue-200">
                <Label className="text-sm font-medium">{t.messages.selectWinningRound}</Label>
                <RadioGroup
                  value={winningLoopId || "auto"}
                  onValueChange={(v) => setWinningLoopId(v === "auto" ? null : v)}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="auto" id="round-auto" />
                    <Label htmlFor="round-auto" className="text-sm">
                      {t.messages.roundAuto}
                    </Label>
                  </div>
                  {proposalsWithRounds.map(({ proposal, proposalTally, closedRounds }) => {
                    const best = getBestConsentRound(proposalTally);
                    return (
                      <div key={proposal.id} className="space-y-1 pt-2 border-t">
                        <p className="text-xs font-medium text-gray-600">
                          {proposal.description?.trim() || `Proposal ${proposal.position + 1}`}
                          {best?.adopted && (
                            <span className="ml-1.5 text-xs text-green-600">
                              (auto: {t.labels.round} {best.roundNumber}, {MJ_SCALE.find((g) => g.value === best.median)?.label})
                            </span>
                          )}
                        </p>
                        {closedRounds.map((round) => {
                          const medianGrade = MJ_SCALE.find((g) => g.value === round.median);
                          const totalVotes = MJ_SCALE.reduce((s, g) => s + (round.distribution[g.value] || 0), 0);
                          return (
                            <div key={round.loopId} className="flex items-center gap-2 pl-4">
                              <RadioGroupItem value={round.loopId} id={`round-${round.loopId}`} />
                              <Label htmlFor={`round-${round.loopId}`} className="text-sm">
                                {t.labels.round} {round.roundNumber}
                                {medianGrade && (
                                  <span className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] text-white ${medianGrade.color}`}>
                                    {medianGrade.label}
                                  </span>
                                )}
                                <span className="ml-1.5 text-xs text-gray-500">
                                  ({totalVotes} {totalVotes !== 1 ? t.labels.voters : t.labels.voter})
                                </span>
                                {round.adopted && (
                                  <span className="ml-1.5 text-xs text-green-600 font-medium">
                                    {t.messages.consentLoopAdopted.split("\u2014")[0].trim()}
                                  </span>
                                )}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </RadioGroup>
              </div>
            );
          })()}

          <div className="space-y-2">
            <Label className="text-sm font-medium">{t.labels.signature}</Label>
            <Textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder={t.placeholders.signature}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{t.labels.summary}</Label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t.placeholders.summaryOverride}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />
            {t.buttons.cancel}
          </Button>
          <Button
            onClick={handleFinalize}
            disabled={isSaving || isModerator}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Trophy className="w-4 h-4 mr-2" />
            {isSaving ? t.pages.finalizing : t.buttons.finalize}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};