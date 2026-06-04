import * as React from "react";
import { VoteEntity, VoteLoop } from "@/lib/persistence-types";
import { VOTING_MODES_LABELS, MJ_SCALE } from "@/components/planView/constants";
import { useVoteResults } from "@/hooks/useVotes";
import { useVoteLoops } from "@/hooks/useVoteLoops";
import { tallyThumbsUp, tallyUDNeutral, tallyPoints, tallyMajorityJudgment, tallyConsentLoop } from "@/lib/vote-tally";
import { getVotingStrings } from "@/lib/voting-i18n";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, MessageSquare, Trophy } from "lucide-react";
import { LoopRoundProposalTooltip } from "./LoopRoundProposalTooltip";
import { ProposalContentDisplay } from "./ProposalContentDisplay";

interface VoteResultsProps {
  vote: VoteEntity;
}


const PHASE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  IDLE: "secondary",
  OPEN: "default",
  CLOSED: "outline",
  FINALIZED: "destructive",
};

const ConsentLoopResults: React.FC<{ vote: VoteEntity }> = ({ vote }) => {
  const t = getVotingStrings();
  const { responses, isLoading: responsesLoading } = useVoteResults(vote.id);
  const { loops, isLoading: loopsLoading } = useVoteLoops(vote.id);
  const activeProposals = vote.proposals.filter((p) => p.active);

  const tally = React.useMemo(
    () => tallyConsentLoop(loops, responses, activeProposals.map((p) => p.id)),
    [loops, responses, activeProposals]
  );

  if (responsesLoading || loopsLoading) {
    return <p className="text-sm text-gray-400">{t.messages.loadingResults}</p>;
  }

  if (loops.length === 0) {
    return <p className="text-sm text-gray-400 italic">{t.messages.noRoundsYet}</p>;
  }

  return (
    <div className="space-y-4">
      {activeProposals.map((proposal, idx) => {
        const proposalTally = tally.proposals.find((p) => p.proposalId === proposal.id);
        if (!proposalTally || proposalTally.perRound.length === 0) return null;

        const openLoop = loops.find((l) => l.proposalId === proposal.id && !l.closedAt);
        const closedRounds = proposalTally.perRound.filter((r) => r.closed);
        const lastClosedRound = closedRounds.length > 0 ? closedRounds[closedRounds.length - 1] : null;

        const displayRound = openLoop
          ? (proposalTally.current ?? lastClosedRound ?? proposalTally.perRound[proposalTally.perRound.length - 1])
          : (lastClosedRound ?? proposalTally.perRound[proposalTally.perRound.length - 1]);

        if (!displayRound) return null;

        const isAdopted = lastClosedRound?.adopted ?? false;
        const isOpen = !!openLoop;
        const roundNumber = openLoop
          ? proposalTally.perRound.find((r) => r.loopId === openLoop.id)?.roundNumber
            ?? proposalTally.perRound.length
          : lastClosedRound?.roundNumber ?? proposalTally.perRound.length;
        const totalVotes = MJ_SCALE.reduce(
          (sum, grade) => sum + (displayRound.distribution[grade.value] || 0),
          0
        );
        const medianGrade = MJ_SCALE.find((g) => g.value === displayRound.median);

        const segments = MJ_SCALE
          .map((grade) => ({
            ...grade,
            count: displayRound.distribution[grade.value] || 0,
            percentage: totalVotes > 0
              ? ((displayRound.distribution[grade.value] || 0) / totalVotes) * 100
              : 0,
          }))
          .filter((d) => d.count > 0);

        const lastLoop = openLoop || (lastClosedRound ? loops.find((l) => l.id === lastClosedRound.loopId) : undefined);
        const proposalContent = lastLoop?.proposalContent || proposal.content;

        return (
          <LoopRoundProposalTooltip
            key={proposal.id}
            proposalContent={proposalContent}
            roundNumber={roundNumber}
          >
          <div
            className={`border rounded-lg p-3 ${
              isAdopted ? "border-green-500 bg-green-50" : isOpen ? "border-blue-400 bg-blue-50" : "bg-white"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-900">
                {proposal.description || `${t.labels.proposals} ${idx + 1}`}
              </h4>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {t.labels.round} {roundNumber}
                </span>
                {isOpen ? (
                  <Badge variant="default">{t.phases.OPEN}</Badge>
                ) : isAdopted ? (
                  <Badge className="bg-green-600">{t.messages.consentLoopAdopted.split("—")[0].trim()}</Badge>
                ) : (
                  <Badge variant="outline">{t.phases.CLOSED}</Badge>
                )}
              </div>
            </div>

            {totalVotes > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">{t.labels.medianColon}</span>
                  {medianGrade && (
                    <span className={`px-2 py-0.5 rounded text-xs text-white ${medianGrade.color}`}>
                      {medianGrade.icon} {medianGrade.label}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    ({totalVotes} {totalVotes !== 1 ? t.labels.voters : t.labels.voter})
                  </span>
                </div>
                <div className="relative w-full h-6 flex rounded overflow-hidden bg-gray-100">
                  {segments.map((item, index) => {
                    const isMedian = item.value === displayRound.median;
                    const isFirst = index === 0;
                    const isLast = index === segments.length - 1;
                    return (
                      <div
                        key={item.value}
                        className={`h-full flex items-center justify-center relative ${item.color} ${
                          isFirst ? "rounded-l" : ""
                        } ${isLast ? "rounded-r" : ""} ${
                          isMedian ? "ring-2 ring-white z-20 shadow-md scale-y-125 mx-0.5 rounded-sm origin-center" : ""
                        }`}
                        style={{ width: `${item.percentage}%` }}
                        title={`${item.label}: ${item.count} votes (${item.percentage.toFixed(1)}%)`}
                      >
                        {item.percentage >= 10 && (
                          <span className={`text-[10px] font-bold ${
                            [1, 2].includes(item.value) ? "text-black" : "text-white"
                          } drop-shadow-md`}>
                            {item.percentage.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">
                {isOpen ? t.messages.noVotesYet : t.messages.noVotesYet}
              </p>
            )}
          </div>
          </LoopRoundProposalTooltip>
        );
      })}
    </div>
  );
};

export const VoteResults: React.FC<VoteResultsProps> = ({ vote }) => {
  const t = getVotingStrings();
  const { responses, isLoading } = useVoteResults(vote.id);
  const isAnonymous = vote.config.isAnonymous ?? true;

  const totalVoters = new Set(responses.map((r) => r.voterToken)).size;
  const commentsCount = responses.filter((r) => r.comment).length;

  if (vote.config.mode === "CONSENT_LOOP") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant={PHASE_VARIANTS[vote.config.phase] || "secondary"}>
            {t.phases[vote.config.phase] || vote.config.phase}
          </Badge>
          <Badge variant="outline">{VOTING_MODES_LABELS[vote.config.mode]}</Badge>
          <Badge variant="outline">{vote.config.kind === "decision" ? t.kinds.decision : t.kinds.consultation}</Badge>
        </div>

        {vote.outcome && (
          <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-900">{t.labels.outcome}</span>
            </div>
            <p className="text-sm text-blue-800">{vote.outcome.summary}</p>
            {vote.outcome.signature && (
              <p className="text-sm text-blue-700 mt-1 italic">"{vote.outcome.signature}"</p>
            )}
            <p className="text-xs text-blue-500 mt-2">
              Finalized {new Date(vote.outcome.finalizedAt).toLocaleString()}
            </p>
          </div>
        )}

        <div className="flex gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {totalVoters} {totalVoters !== 1 ? t.labels.voters : t.labels.voter}
          </span>
          {commentsCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="w-4 h-4" />
              {commentsCount} {commentsCount !== 1 ? t.labels.comments : t.labels.comment}
            </span>
          )}
        </div>

        <ConsentLoopResults vote={vote} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant={PHASE_VARIANTS[vote.config.phase] || "secondary"}>
          {t.phases[vote.config.phase] || vote.config.phase}
        </Badge>
        <Badge variant="outline">{VOTING_MODES_LABELS[vote.config.mode]}</Badge>
        <Badge variant="outline">{vote.config.kind === "decision" ? t.kinds.decision : t.kinds.consultation}</Badge>
      </div>

      {vote.outcome && (
        <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-blue-900">{t.labels.outcome}</span>
          </div>
          <p className="text-sm text-blue-800">{vote.outcome.summary}</p>
          {vote.outcome.signature && (
            <p className="text-sm text-blue-700 mt-1 italic">"{vote.outcome.signature}"</p>
          )}
          <p className="text-xs text-blue-500 mt-2">
            Finalized {new Date(vote.outcome.finalizedAt).toLocaleString()}
          </p>
        </div>
      )}

      <div className="flex gap-4 text-sm text-gray-500">
        <span className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          {totalVoters} {totalVoters !== 1 ? t.labels.voters : t.labels.voter}
        </span>
        {commentsCount > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" />
            {commentsCount} {commentsCount !== 1 ? t.labels.comments : t.labels.comment}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">{t.messages.loadingResults}</p>
      ) : responses.length === 0 ? (
        <p className="text-sm text-gray-400">{t.messages.noVotesYet}</p>
      ) : (
        <div className="space-y-3">
          {vote.proposals.filter((p) => p.active).map((proposal) => {
            const isWinning = vote.outcome?.winningProposalId === proposal.id;

            return (
              <div
                key={proposal.id}
                className={`border rounded-lg p-3 ${
                  isWinning ? "border-blue-500 bg-blue-50" : "bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-900">
                    {isWinning && <Trophy className="w-4 h-4 text-blue-600 inline mr-1" />}
                    Proposal {proposal.position + 1}
                  </h4>
                </div>
                {proposal.content && <ProposalContentDisplay content={proposal.content} className="mb-2" />}

                {vote.config.mode === "THUMBS_UP" && (() => {
                  const tally = tallyThumbsUp(responses, proposal.id);
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-lg">👍</span>
                      <span className="font-medium">{tally.count}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden ml-2">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${totalVoters > 0 ? (tally.count / totalVoters) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {vote.config.mode === "THUMBS_UD_NEUTRAL" && (() => {
                  const tally = tallyUDNeutral(responses, proposal.id);
                  const total = tally.up + tally.neutral + tally.down || 1;
                  return (
                    <div className="space-y-1">
                      <div className="flex gap-3 text-sm">
                        <span className="text-green-600">👍 {tally.up}</span>
                        <span className="text-yellow-600">😐 {tally.neutral}</span>
                        <span className="text-red-600">👎 {tally.down}</span>
                      </div>
                      <div className="flex h-2 rounded-full overflow-hidden">
                        <div className="bg-green-500" style={{ width: `${(tally.up / total) * 100}%` }} />
                        <div className="bg-yellow-400" style={{ width: `${(tally.neutral / total) * 100}%` }} />
                        <div className="bg-red-500" style={{ width: `${(tally.down / total) * 100}%` }} />
                      </div>
                    </div>
                  );
                })()}

                {vote.config.mode === "POINTS" && (() => {
                  const tally = tallyPoints(responses, proposal.id);
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🪙</span>
                      <span className="font-medium">{tally.total} {t.labels.points}</span>
                    </div>
                  );
                })()}

                {vote.config.mode === "MAJORITY_JUDGMENT" && (() => {
                  const tally = tallyMajorityJudgment(responses, proposal.id);
                  const medianGrade = MJ_SCALE.find((g) => g.value === tally.median);
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span>{t.labels.medianColon}</span>
                        <span className={`px-2 py-0.5 rounded text-xs text-white ${medianGrade?.color || "bg-gray-500"}`}>
                          {medianGrade?.icon} {medianGrade?.label}
                        </span>
                      </div>
                      <div className="flex h-3 rounded-full overflow-hidden">
                        {MJ_SCALE.map((grade) => (
                          <div
                            key={grade.value}
                            className={`${grade.color}`}
                            style={{ width: `${((tally.distribution[grade.value] || 0) / (responses.length || 1)) * 100}%` }}
                            title={`${grade.label}: ${tally.distribution[grade.value] || 0}`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {!isAnonymous && (() => {
                  const voterRows = responses.filter((r) => r.proposalId === proposal.id);
                  if (voterRows.length === 0) return null;
                  return (
                    <div className="mt-2 space-y-1">
                      {voterRows.map((r) => (
                        <div key={r.id} className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{r.userId || "Anonymous"}</span>
                          {r.comment && (
                            <span className="italic text-gray-400">— {r.comment}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};