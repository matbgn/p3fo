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
import { useTranslation } from "react-i18next";
import { useVoteLoops } from "@/hooks/useVoteLoops";
import { tallyConsentLoop, getBestConsentRound } from "@/lib/vote-tally";
import { useVoteResults } from "@/hooks/useVotes";
import { useVoteRankingResults } from "@/hooks/useVoteRanking";
import { proposalDisplayTitle, resolveFinalizedWinner, voteAllowsTies } from "@/lib/vote-ranking";
import { MJ_SCALE } from "@/components/planView/constants";

interface FinalizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vote: VoteEntity;
  onFinalize: (outcome: VoteEntity["outcome"]) => Promise<boolean>;
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
  const [finalizeError, setFinalizeError] = React.useState<string | null>(null);
  const t = getVotingStrings();
  const { t: tt } = useTranslation();

  const isConsentLoop = vote.config.mode === "CONSENT_LOOP";
  const isComparative = vote.config.mode === "COMPARATIVE_PRIORITIZATION";
  const {
    data: rankingData,
    isLoading: rankingLoading,
    error: rankingError,
    refresh: refreshRanking,
  } = useVoteRankingResults(vote.slug, open && isComparative);
  const { loops, isLoading: loopsLoading } = useVoteLoops(vote.id, !isComparative);
  const { responses, isLoading: responsesLoading } = useVoteResults(vote.id, !isComparative);
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
      setFinalizeError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || !isComparative) return;
    const top = rankingData?.result?.groups[0]?.proposalIds ?? [];
    setWinningProposalId(top.length === 1 ? top[0] : null);
  }, [open, isComparative, rankingData]);

  const activeProposals = vote.proposals.filter((p) => p.active);
  const topGroup = rankingData?.result?.groups[0]?.proposalIds ?? [];
  const topTied = topGroup.length > 1;
  const allowTies = voteAllowsTies(vote.config);
  // Derive the button state from the same rule the finalize handler enforces so
  // the two cannot disagree when the tie policy changes.
  const needsTieSelection =
    isComparative &&
    Boolean(rankingData?.result) &&
    resolveFinalizedWinner(topGroup, allowTies, winningProposalId).error ===
      'tied-requires-selection';
  const proposalLabel = (id: string) => {
    const proposal = vote.proposals.find((candidate) => candidate.id === id);
    return proposal ? proposalDisplayTitle(proposal) : id;
  };

  const handleFinalize = async () => {
    setIsSaving(true);
    setFinalizeError(null);
    try {
      // Re-read the collective ranking immediately before finalizing so the
      // stored summary names the same winner the server recomputes from the
      // ballots at finalize time (the dialog snapshot may be stale).
      const freshRanking = isComparative ? await refreshRanking() : null;
      const currentRanking = freshRanking ?? rankingData;
      const currentTopGroup = currentRanking?.result?.groups[0]?.proposalIds ?? topGroup;

      let effectiveWinner = winningProposalId;
      if (isComparative) {
        if (currentRanking?.result) {
          const resolution = resolveFinalizedWinner(currentTopGroup, allowTies, winningProposalId);
          if (resolution.error) {
            // The refreshed top group no longer matches the dialog's stale
            // selection (for example a new ballot created a tie). Tell the
            // moderator and clear the stale winner so the tie UI can act
            // instead of the click silently doing nothing.
            setFinalizeError(
              resolution.error === 'tied-requires-tie'
                ? tt("voting.comparative.finalizeTieHint")
                : t.messages.selectWinningProposal,
            );
            setWinningProposalId(null);
            return;
          }
          effectiveWinner = resolution.winningProposalId;
          if (resolution.winningProposalId) {
            setWinningProposalId(resolution.winningProposalId);
          }
        } else if (currentRanking?.hidden) {
          // The finalize endpoint refuses to finalize a comparative vote while
          // its ranking is hidden, so the moderator must close the vote (or
          // enable early results) first. Do not attempt the request: it would
          // only fail with a generic error.
          setFinalizeError(
            currentRanking.participantCount
              ? tt("voting.comparative.finalizeNeedsVisibleResults")
              : tt("voting.comparative.noBallotsToFinalize"),
          );
          return;
        } else {
          setFinalizeError(tt("voting.comparative.finalizeFailed"));
          return;
        }
      }

      const winningProposal = effectiveWinner
        ? activeProposals.find((p) => p.id === effectiveWinner)
        : null;
      const finalSummary =
        summary.trim() ||
        (effectiveWinner
          ? winningProposal
            ? tt("voting.finalizeSummaryProposal", { n: winningProposal.position + 1 })
            : tt("voting.finalizeSummaryGeneric")
          : tt("voting.finalizeSummaryTie"));

      const finalized = await onFinalize({
        winningProposalId: effectiveWinner,
        winningLoopId: isConsentLoop ? winningLoopId : undefined,
        summary: finalSummary,
        finalizedAt: new Date().toISOString(),
        finalizedByUserId: vote.ownerId,
        signature: signature.trim() || undefined,
      });

      if (finalized) {
        onOpenChange(false);
      } else {
        setFinalizeError(tt("voting.comparative.finalizeFailed"));
      }
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
            {isComparative
              ? tt("voting.comparative.finalizeDescription")
              : t.messages.selectWinningProposal}
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

          {isComparative && (
            <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3">
              <Label className="text-sm font-medium">{tt("voting.comparative.topGroup")}</Label>
              {rankingLoading && (
                <p className="text-sm text-gray-500">{tt("voting.comparative.loading")}</p>
              )}
              {!rankingLoading && rankingError && (
                <div className="space-y-1">
                  <p className="text-sm text-red-600">{rankingError}</p>
                  <Button size="sm" variant="outline" onClick={() => void refreshRanking()}>
                    {tt("common.retry")}
                  </Button>
                </div>
              )}
              {!rankingLoading && !rankingError && rankingData?.hidden && (
                <p className="text-sm text-gray-500">
                  {tt("voting.comparative.resultsHidden")}
                </p>
              )}
              {!rankingLoading && !rankingError && !rankingData?.hidden && !rankingData?.result && (
                <p className="text-sm text-gray-500">{tt("voting.comparative.noBallotsToFinalize")}</p>
              )}
              {rankingData?.result && (
                <>
                  <div className="space-y-1">
                    {topGroup.map((id) => (
                      <p key={id} className="text-sm text-gray-800">
                        {proposalLabel(id)}
                      </p>
                    ))}
                  </div>
                  {topTied && allowTies && (
                    <p className="text-xs text-blue-700">
                      {tt("voting.comparative.finalizeTieHint")}
                    </p>
                  )}
                  {topTied && !allowTies && (
                    <RadioGroup
                      value={winningProposalId || ""}
                      onValueChange={(value) => setWinningProposalId(value)}
                    >
                      {topGroup.map((id) => (
                        <div key={id} className="flex items-center gap-2">
                          <RadioGroupItem value={id} id={`comparative-${id}`} />
                          <Label htmlFor={`comparative-${id}`} className="text-sm">
                            {proposalLabel(id)}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                </>
              )}
            </div>
          )}

          {!isComparative && (
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
          )}

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
          {finalizeError && (
            <p className="mr-auto text-sm text-red-600">{finalizeError}</p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />
            {t.buttons.cancel}
          </Button>
          <Button
            onClick={handleFinalize}
            disabled={
              isSaving ||
              isModerator ||
              // A comparative vote can only be finalized once its ranking is
              // visible (the server rejects hidden results); with no result
              // there are no submitted ballots to finalize either.
              (isComparative && (!rankingData?.result || rankingData?.hidden)) ||
              needsTieSelection
            }
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