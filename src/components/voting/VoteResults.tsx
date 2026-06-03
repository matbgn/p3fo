import * as React from "react";
import { VoteEntity } from "@/lib/persistence-types";
import { VOTING_MODES_LABELS, MJ_SCALE } from "@/components/planView/constants";
import { useVoteResults } from "@/hooks/useVotes";
import { tallyThumbsUp, tallyUDNeutral, tallyPoints, tallyMajorityJudgment, tallyConsentLoop } from "@/lib/vote-tally";
import { getVotingStrings } from "@/lib/voting-i18n";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, MessageSquare, Trophy } from "lucide-react";

interface VoteResultsProps {
  vote: VoteEntity;
}


const PHASE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  IDLE: "secondary",
  OPEN: "default",
  CLOSED: "outline",
  FINALIZED: "destructive",
};

export const VoteResults: React.FC<VoteResultsProps> = ({ vote }) => {
  const t = getVotingStrings();
  const { responses, isLoading } = useVoteResults(vote.id);
  const isAnonymous = vote.config.isAnonymous ?? true;

  const totalVoters = new Set(responses.map((r) => r.voterToken)).size;
  const commentsCount = responses.filter((r) => r.comment).length;

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

                {vote.config.mode === "CONSENT_LOOP" && (() => {
                  return (
                    <p className="text-xs text-gray-400 italic">
                      {t.messages.consentLoopResultsPerRound}
                    </p>
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