import * as React from "react";
import { useParams } from "react-router-dom";
import { VoteEntity, VoteResponseEntity, VoteProposal, VoteLoop } from "@/lib/persistence-types";
import { VOTING_MODES_LABELS, MJ_SCALE } from "@/components/planView/constants";
import { tallyThumbsUp as tallyThumbsUpShared, tallyUDNeutral as tallyUDNeutralShared, tallyPoints as tallyPointsShared, tallyMajorityJudgment as tallyMJShared, tallyConsentLoop as tallyConsentLoopShared } from "@/lib/vote-tally";
import { getVotingStrings } from "@/lib/voting-i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import QRCodeBlock from "@/components/voting/QRCodeBlock";
import {
  Vote,
  Trophy,
  Clock,
  Users,
  Link2,
  ThumbsUp,
  ThumbsDown,
  Minus,
  MessageSquare,
  Plus,
  MinusCircle,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";



async function fetchVote(slug: string): Promise<VoteEntity | null> {
  try {
    const res = await fetch(`/api/votes/${slug}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchResults(slug: string): Promise<{
  responses: VoteResponseEntity[];
  totalVotes: number;
} | null> {
  try {
    const res = await fetch(`/api/votes/${slug}/results`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function submitResponse(
  slug: string,
  body: {
    proposalId: string;
    value: number;
    voterToken: string;
    comment?: string;
  }
): Promise<VoteResponseEntity | null> {
  try {
    const res = await fetch(`/api/votes/${slug}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      console.error("Vote submission error:", err.error);
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

async function deleteResponse(
  slug: string,
  body: { voterToken: string; proposalId: string; loopId?: string | null }
): Promise<boolean> {
  try {
    const params = new URLSearchParams({ voterToken: body.voterToken, proposalId: body.proposalId });
    if (body.loopId) params.set("loopId", body.loopId);
    const res = await fetch(`/api/votes/${slug}/responses?${params.toString()}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      console.error("Vote withdrawal error:", err.error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function submitAudienceProposal(
  slug: string,
  content: string
): Promise<VoteProposal | null> {
  try {
    const res = await fetch(`/api/votes/${slug}/proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchLoops(voteId: string): Promise<VoteLoop[]> {
  try {
    const res = await fetch(`/api/votes/${voteId}/loops`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function getVoterToken(slug: string): string | null {
  try {
    return localStorage.getItem(`voted_vote_${slug}`);
  } catch {
    return null;
  }
}

function setVoterToken(slug: string, token: string): void {
  try {
    localStorage.setItem(`voted_vote_${slug}`, token);
  } catch { /* localStorage unavailable in some contexts */ }
}

function ensureVoterToken(slug: string): string {
  let token = getVoterToken(slug);
  if (!token) {
    token = crypto.randomUUID();
    setVoterToken(slug, token);
  }
  return token;
}

const PublicVotePage: React.FC = () => {
  const ts = getVotingStrings();
  const { slug } = useParams<{ slug: string }>();
  const [vote, setVote] = React.useState<VoteEntity | null>(null);
  const [responses, setResponses] = React.useState<VoteResponseEntity[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [voterValues, setVoterValues] = React.useState<Record<string, number>>({});
  const [comment, setComment] = React.useState("");
  const [hasSubmitted, setHasSubmitted] = React.useState(false);
  const [justVoted, setJustVoted] = React.useState(false);
  const canChangeVote = vote ? (vote.config.allowVoteChangeUntilClose ?? true) : true;
  const showResultsBeforeClose = vote ? (vote.config.showResultsBeforeClose ?? false) : false;
  const isClosed = vote?.config.phase === "CLOSED" || vote?.config.phase === "FINALIZED";
  const isSingleProposal = vote ? !(vote.config.multipleChoiceVote ?? true) : false;
  const showResults = vote ? (isClosed || showResultsBeforeClose || justVoted) : false;
  const [pointsBudget, setPointsBudget] = React.useState<Record<string, number>>({});
  const [audienceProposalText, setAudienceProposalText] = React.useState("");
  const [showPrevRounds, setShowPrevRounds] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [loops, setLoops] = React.useState<VoteLoop[]>([]);

  const voterToken = slug ? ensureVoterToken(slug) : "";

  React.useEffect(() => {
    if (!slug) return;
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      const v = await fetchVote(slug);
      if (!mounted) return;
      if (!v) {
        setError(ts.messages.voteNotFound);
        setIsLoading(false);
        return;
      }
      setVote(v);

      const r = await fetchResults(slug);
      if (!mounted) return;
      if (r) {
        setResponses(r.responses);
        const myToken = getVoterToken(slug);
        if (myToken) {
          const myResponses = r.responses.filter((x) => x.voterToken === myToken);
          if (myResponses.length > 0) {
            setHasSubmitted(true);
            const vals: Record<string, number> = {};
            myResponses.forEach((x) => {
              if (x.proposalId) vals[x.proposalId] = x.value;
            });
            setVoterValues(vals);
          }
        }
      }

      if (v.config.mode === "CONSENT_LOOP") {
        const loopData = await fetchLoops(v.id);
        if (mounted) setLoops(loopData);
      }
      setIsLoading(false);
    };
    load();
    const interval = setInterval(() => setRefreshKey((k) => k + 1), 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [slug]);

  React.useEffect(() => {
    if (!slug || !vote) return;
    let mounted = true;
    const refresh = async () => {
      const r = await fetchResults(slug);
      if (!mounted || !r) return;
      setResponses(r.responses);
    };
    refresh();
    return () => { mounted = false; };
  }, [refreshKey, slug, vote]);

  const handleSubmitVote = async (proposalId: string, value: number) => {
    if (!slug || !vote) return;

    // In single-choice mode, withdraw any existing vote on a different proposal
    // before submitting the new one, so the server tally reflects the switch.
    if (isSingleProposal) {
      const previousProposalId = Object.keys(voterValues).find(
        (id) => id !== proposalId,
      );
      if (previousProposalId) {
        await deleteResponse(slug, { voterToken, proposalId: previousProposalId });
      }
    }

    const result = await submitResponse(slug, {
      proposalId,
      value,
      voterToken,
      comment: comment || undefined,
    });
    if (result) {
      setHasSubmitted(true);
      setJustVoted(true);
      if (isSingleProposal) {
        setVoterValues({ [proposalId]: value });
      } else {
        setVoterValues((prev) => ({ ...prev, [proposalId]: value }));
      }
      setRefreshKey((k) => k + 1);
    }
  };

  const handleWithdrawVote = async (proposalId: string) => {
    if (!slug || !vote) return;
    const ok = await deleteResponse(slug, { voterToken, proposalId });
    if (ok) {
      setVoterValues((prev) => {
        const next = { ...prev };
        delete next[proposalId];
        if (Object.keys(next).length === 0) {
          setHasSubmitted(false);
          setJustVoted(false);
        }
        return next;
      });
      setRefreshKey((k) => k + 1);
    }
  };

  const handleSubmitAllVotes = async () => {
    if (!slug || !vote) return;
    const entries = Object.entries(voterValues);
    for (const [proposalId, value] of entries) {
      await submitResponse(slug, {
        proposalId,
        value,
        voterToken,
        comment: comment || undefined,
      });
    }
    setHasSubmitted(true);
    setJustVoted(true);
    setRefreshKey((k) => k + 1);
  };

  const handlePointsChange = (proposalId: string, delta: number) => {
    if (!vote) return;
    const maxBudget = vote.config.maxPointsPerUser || 10;
    const allowMultiple = vote.config.allowMultiple ?? false;
    const perProposalCap = allowMultiple ? maxBudget : 1;
    const currentTotal = Object.entries(pointsBudget)
      .filter(([id]) => id !== proposalId)
      .reduce((sum, [, v]) => sum + v, 0);
    const current = pointsBudget[proposalId] || 0;
    const newVal = Math.max(
      0,
      Math.min(perProposalCap, Math.min(maxBudget - currentTotal, current + delta)),
    );
    setPointsBudget((prev) => ({ ...prev, [proposalId]: newVal }));
    setVoterValues((prev) => ({ ...prev, [proposalId]: newVal }));
  };

  const handleAudienceProposal = async () => {
    if (!slug || !audienceProposalText.trim()) return;
    const result = await submitAudienceProposal(slug, audienceProposalText.trim());
    if (result) {
      setAudienceProposalText("");
      setRefreshKey((k) => k + 1);
    }
  };

  const isActive = vote?.config.phase === "OPEN";
  const isFinalized = vote?.config.phase === "FINALIZED";
  const isAnonymous = vote?.config.isAnonymous ?? true;

  const mode = vote?.config.mode;
  const showObjectionNudge =
    vote?.config.requireObjectionComment &&
    (mode === "THUMBS_UD_NEUTRAL" ||
      mode === "MAJORITY_JUDGMENT" ||
      mode === "CONSENT_LOOP");

  const objectionThreshold =
    mode === "THUMBS_UD_NEUTRAL"
      ? -1
      : mode === "MAJORITY_JUDGMENT" || mode === "CONSENT_LOOP"
        ? 0
        : Number.MIN_SAFE_INTEGER;

  const isNegativeVote = Object.values(voterValues).some(
    (v) => v <= objectionThreshold
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto mb-3" />
          <p>{ts.messages.loadingVote}</p>
        </div>
      </div>
    );
  }

  if (error || !vote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <Vote className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg">{error || ts.messages.voteNotFound}</p>
        </div>
      </div>
    );
  }

  const activeProposals = vote.proposals.filter((p) => p.active);
  const totalVoters = new Set(responses.map((r) => r.voterToken)).size;

  const tallyThumbsUpResult = (proposalId: string) =>
    tallyThumbsUpShared(responses, proposalId).count;

  const tallyUDNResult = (proposalId: string) =>
    tallyUDNeutralShared(responses, proposalId);

  const tallyPointsResult = (proposalId: string) =>
    tallyPointsShared(responses, proposalId).total;

  const tallyMJResult = (proposalId: string) =>
    tallyMJShared(responses, proposalId);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {isFinalized && vote.outcome && (
          <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-900">{ts.labels.outcome}</span>
            </div>
            <p className="text-sm text-blue-800">{vote.outcome.summary}</p>
            {vote.outcome.signature && (
              <p className="text-sm text-blue-700 mt-1 italic">
                &ldquo;{vote.outcome.signature}&rdquo;
              </p>
            )}
            <p className="text-xs text-blue-500 mt-2">
              Finalized {new Date(vote.outcome.finalizedAt).toLocaleString()}
            </p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge
              variant={
                isFinalized
                  ? "destructive"
                  : isClosed
                    ? "outline"
                    : isActive
                      ? "default"
                      : "secondary"
              }
            >
              {ts.phases[vote.config.phase] || vote.config.phase}
            </Badge>
            <Badge variant="outline">
              {ts.kinds[vote.config.kind] || vote.config.kind}
            </Badge>
            <Badge variant="outline">
              {VOTING_MODES_LABELS[vote.config.mode] || vote.config.mode}
            </Badge>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {vote.title}
          </h1>
          {vote.description && (
            <p className="text-gray-600 mb-4">{vote.description}</p>
          )}

          <div className="flex items-center gap-4 text-sm text-gray-400">
            {vote.config.closeAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Closes {new Date(vote.config.closeAt).toLocaleString()}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" />
               {totalVoters} {totalVoters !== 1 ? ts.labels.voters : ts.labels.voter}
            </span>
            {vote.linkedTaskId && (
              <span className="flex items-center gap-1 text-violet-500">
                 <ExternalLink className="w-4 h-4" />
                 {ts.labels.linkedTask}
              </span>
            )}
          </div>
        </div>

        {!isActive && !isClosed && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-center">
               <p className="text-yellow-700">
                 {ts.messages.notOpenForResponses}
               </p>
          </div>
        )}

        {isClosed && !isFinalized && (
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 mb-6 text-center">
             <p className="text-gray-600">
               {ts.messages.closedNoMoreResponses}
             </p>
          </div>
        )}

        {isActive && hasSubmitted && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-center">
             <p className="text-green-700">
               {ts.messages.thanksVoted}
             </p>
          </div>
        )}

        {mode !== "CONSENT_LOOP" && (
          <div className="space-y-4 mb-6">
            {activeProposals.map((proposal) => (
              <div
                key={proposal.id}
                className="bg-white rounded-lg shadow-sm border p-5"
              >
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                  Proposal {proposal.position + 1}
                </h3>
                {proposal.description && (
                  <p className="text-sm text-gray-500 mb-3">
                    {proposal.description}
                  </p>
                )}
                {proposal.infoUrl && (
                  <a
                    href={proposal.infoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-500 hover:underline flex items-center gap-1 mb-3"
                  >
                     <Link2 className="w-3 h-3" />
                     {ts.buttons.moreInfo}
                  </a>
                )}

                {isActive && (canChangeVote || !hasSubmitted) && (
                  <div className="mt-3">
                    {mode === "THUMBS_UP" && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={
                            voterValues[proposal.id] === 1
                              ? "default"
                              : "outline"
                          }
                          onClick={() => {
                            if (voterValues[proposal.id] === 1) {
                              handleWithdrawVote(proposal.id);
                            } else {
                              handleSubmitVote(proposal.id, 1);
                            }
                          }}
                          className={
                            voterValues[proposal.id] === 1
                              ? "bg-green-600 hover:bg-green-700"
                              : ""
                          }
                        >
                          <ThumbsUp className="w-4 h-4 mr-1" />
                          {voterValues[proposal.id] === 1
                            ? ts.buttons.voted
                            : ts.buttons.vote}
                        </Button>
                        {voterValues[proposal.id] === 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleWithdrawVote(proposal.id)}
                            title={ts.buttons.withdraw}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                        {showResults &&
                          (() => {
                            const count = tallyThumbsUpResult(proposal.id);
                            return (
                              <span className="text-sm text-gray-500">
                                 {count} vote{count !== 1 ? "s" : ""}
                              </span>
                            );
                          })()}
                      </div>
                    )}

                    {mode === "THUMBS_UD_NEUTRAL" && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={
                            voterValues[proposal.id] === -1
                              ? "default"
                              : "outline"
                          }
                          onClick={() => handleSubmitVote(proposal.id, -1)}
                          className={
                            voterValues[proposal.id] === -1
                              ? "bg-red-600 hover:bg-red-700"
                              : ""
                          }
                        >
                          <ThumbsDown className="w-4 h-4 mr-1" />
                          No
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            voterValues[proposal.id] === 0
                              ? "default"
                              : "outline"
                          }
                          onClick={() => handleSubmitVote(proposal.id, 0)}
                          className={
                            voterValues[proposal.id] === 0
                              ? "bg-yellow-500 hover:bg-yellow-600"
                              : ""
                          }
                        >
                          <Minus className="w-4 h-4 mr-1" />
                          Neutral
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            voterValues[proposal.id] === 1
                              ? "default"
                              : "outline"
                          }
                          onClick={() => handleSubmitVote(proposal.id, 1)}
                          className={
                            voterValues[proposal.id] === 1
                              ? "bg-green-600 hover:bg-green-700"
                              : ""
                          }
                        >
                          <ThumbsUp className="w-4 h-4 mr-1" />
                          Yes
                        </Button>
                      </div>
                    )}

                    {mode === "POINTS" && (() => {
                      const maxBudget = vote.config.maxPointsPerUser || 10;
                      const allowMultiple = vote.config.allowMultiple ?? false;
                      const perProposalCap = allowMultiple ? maxBudget : 1;
                      const currentVal = pointsBudget[proposal.id] || 0;
                      const otherTotal = Object.entries(pointsBudget)
                        .filter(([id]) => id !== proposal.id)
                        .reduce((sum, [, v]) => sum + v, 0);
                      const canIncrement =
                        currentVal < perProposalCap && currentVal < maxBudget - otherTotal;
                      return (
                        <div className="flex items-center gap-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePointsChange(proposal.id, -1)}
                            disabled={currentVal <= 0}
                          >
                            <MinusCircle className="w-4 h-4" />
                          </Button>
                          <span className="text-lg font-medium w-8 text-center">
                            {currentVal}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePointsChange(proposal.id, 1)}
                            disabled={!canIncrement}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                          <span className="text-xs text-gray-400">
                            / {allowMultiple ? maxBudget : 1} {ts.labels.points}
                          </span>
                        </div>
                      );
                    })()}

                    {mode === "MAJORITY_JUDGMENT" && (
                      <div className="flex flex-wrap gap-2">
                        {MJ_SCALE.map((grade) => (
                          <button
                            key={grade.value}
                            onClick={() =>
                              handleSubmitVote(proposal.id, grade.value)
                            }
                            className={`px-3 py-1.5 rounded-full text-xs font-medium text-white transition-colors ${
                              voterValues[proposal.id] === grade.value
                                ? `${grade.color} ring-2 ring-offset-1 ring-gray-400`
                                : `${grade.color} opacity-70 hover:opacity-100`
                            }`}
                          >
                            {grade.icon} {grade.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {showResults && (
                  <div className="mt-4 pt-3 border-t">
                     <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
                       {ts.labels.results}
                     </h4>
                    {mode === "THUMBS_UP" && (() => {
                      const count = tallyThumbsUpResult(proposal.id);
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-lg">&#x1F44D;</span>
                          <span className="font-medium">{count}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden ml-2">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{
                                width: `${totalVoters > 0 ? (count / totalVoters) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {mode === "THUMBS_UD_NEUTRAL" && (() => {
                      const t = tallyUDNResult(proposal.id);
                      const total = t.up + t.neutral + t.down || 1;
                      return (
                        <div className="space-y-1">
                          <div className="flex gap-3 text-sm">
                            <span className="text-red-600">
                              &#x1F44E; {t.down}
                            </span>
                            <span className="text-yellow-600">
                              &#x1F610; {t.neutral}
                            </span>
                            <span className="text-green-600">
                              &#x1F44D; {t.up}
                            </span>
                          </div>
                          <div className="flex h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-red-500"
                              style={{ width: `${(t.down / total) * 100}%` }}
                            />
                            <div
                              className="bg-yellow-400"
                              style={{
                                width: `${(t.neutral / total) * 100}%`,
                              }}
                            />
                            <div
                              className="bg-green-500"
                              style={{ width: `${(t.up / total) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
 
                    {mode === "POINTS" && (() => {
                      const total = tallyPointsResult(proposal.id);
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-lg">&#x1FA99;</span>
                          <span className="font-medium">{total} {ts.labels.points}</span>
                        </div>
                      );
                    })()}

                    {mode === "MAJORITY_JUDGMENT" && (() => {
                      const t = tallyMJResult(proposal.id);
                      const medianGrade = MJ_SCALE.find(
                        (g) => g.value === t.median
                      );
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{ts.labels.medianColon}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-xs text-white ${medianGrade?.color || "bg-gray-500"}`}
                            >
                              {medianGrade?.icon} {medianGrade?.label}
                            </span>
                          </div>
                          <div className="flex h-3 rounded-full overflow-hidden">
                            {MJ_SCALE.map((grade) => (
                              <div
                                key={grade.value}
                                className={`${grade.color}`}
                                style={{
                                  width: `${((t.distribution[grade.value] || 0) / (responses.length || 1)) * 100}%`,
                                }}
                                title={`${grade.label}: ${t.distribution[grade.value] || 0}`}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {mode === "CONSENT_LOOP" && (() => {
          const sortedLoops = [...loops].sort((a, b) => a.roundNumber - b.roundNumber);
          const currentOpenLoop = sortedLoops.find((l) => !l.closedAt);
          const firstProposalId = activeProposals[0]?.id || "";
          const tally = firstProposalId
            ? tallyConsentLoopShared(loops, responses, firstProposalId)
            : null;

          return (
            <div className="space-y-4 mb-6">
              <div className="bg-white rounded-lg shadow-sm border p-5">
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                   {ts.modes.CONSENT_LOOP}
                   {currentOpenLoop && (
                     <span className="ml-2 text-sm font-normal text-gray-500">
                       — Round {currentOpenLoop.roundNumber} is open
                     </span>
                  )}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  {ts.messages.consentLoopProcess}
                </p>

                {currentOpenLoop && currentOpenLoop.proposalContent && (
                  <div className="mb-4 p-3 bg-gray-50 rounded border">
                    <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
                      {ts.labels.currentRoundProposal}
                    </h4>
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: (() => {
                          try {
                            const blocks = JSON.parse(currentOpenLoop.proposalContent);
                            if (Array.isArray(blocks)) {
                              return blocks
                                .map((b: { content?: Array<{ text?: string }> }) => {
                                  if (!b.content || !Array.isArray(b.content)) return "";
                                  return `<p>${b.content.map((c: { text?: string }) => c.text || "").join("")}</p>`;
                                })
                                .join("");
                            }
                          } catch { /* empty */ }
                          return currentOpenLoop.proposalContent;
                        })(),
                      }}
                    />
                  </div>
                )}

                {isActive && firstProposalId && (canChangeVote || !hasSubmitted) && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {MJ_SCALE.map((grade) => (
                      <button
                        key={grade.value}
                        onClick={() => handleSubmitVote(firstProposalId, grade.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium text-white transition-colors ${
                          voterValues[firstProposalId] === grade.value
                            ? `${grade.color} ring-2 ring-offset-1 ring-gray-400`
                            : `${grade.color} opacity-70 hover:opacity-100`
                        }`}
                      >
                        {grade.icon} {grade.label}
                      </button>
                    ))}
                  </div>
                )}

                {showResults && tally && tally.perRound.length > 0 && (
                  <div className="mt-4 pt-3 border-t">
                    <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
                      {ts.labels.currentRoundResults}
                    </h4>
                    {(() => {
                      const currentRound = tally.perRound[tally.perRound.length - 1];
                      const medianGrade = MJ_SCALE.find((g) => g.value === currentRound?.median);
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{ts.labels.medianColon}</span>
                            <span className={`px-2 py-0.5 rounded text-xs text-white ${medianGrade?.color || "bg-gray-500"}`}>
                              {medianGrade?.icon} {medianGrade?.label}
                            </span>
                          </div>
                          <div className="flex h-3 rounded-full overflow-hidden">
                            {[...MJ_SCALE].sort((a, b) => b.value - a.value).map((grade) => {
                              const count = currentRound?.distribution[grade.value] || 0;
                              const total = Object.values(currentRound?.distribution || {}).reduce((s, v) => s + v, 0);
                              return (
                                <div
                                  key={grade.value}
                                  className={`${grade.color}`}
                                  style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
                                  title={`${grade.label}: ${count}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowPrevRounds(!showPrevRounds)}
                className="text-sm text-blue-500 hover:underline flex items-center gap-1"
              >
                {showPrevRounds ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                {showPrevRounds ? ts.buttons.hide : ts.buttons.show} previous rounds
                {sortedLoops.length > 0 && ` (${sortedLoops.filter((l) => l.closedAt).length} closed)`}
              </button>

              {showPrevRounds && tally && tally.perRound.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border p-5">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                  {ts.labels.roundByRoundSummary}
                </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr>
                          <th className="text-left py-2 px-3 border-b font-medium text-gray-600">
                            {ts.labels.round}
                          </th>
                          <th className="text-center py-2 px-3 border-b font-medium text-gray-600">
                            {ts.labels.median}
                          </th>
                          {MJ_SCALE.map((grade) => (
                            <th
                              key={grade.value}
                              className="text-center py-2 px-2 border-b font-medium text-gray-600"
                            >
                              <span title={grade.label}>{grade.icon}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tally.perRound.map((round) => {
                          const medianGrade = MJ_SCALE.find((g) => g.value === round.median);
                          const isOpen = !round.closed;
                          return (
                            <tr
                              key={round.loopId}
                              className={isOpen ? "bg-blue-50 border-l-4 border-l-blue-400" : "hover:bg-gray-50"}
                            >
                              <td className="py-2 px-3 border-b font-medium">
                                {ts.labels.round} {round.roundNumber}
                              </td>
                              <td className="py-2 px-3 border-b text-center">
                                {medianGrade && (
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs text-white ${medianGrade.color}`}>
                                    {medianGrade.icon} {medianGrade.label}
                                  </span>
                                )}
                              </td>
                            {MJ_SCALE.map((grade) => {
                                const count = round.distribution[grade.value] || 0;
                                return (
                                  <td
                                    key={grade.value}
                                    className="py-2 px-2 border-b text-center"
                                    title={`${grade.label}: ${count}`}
                                  >
                                    <span className="font-medium text-xs">{count}</span>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {mode === "POINTS" && isActive && (canChangeVote || !hasSubmitted) && (
          <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">{ts.buttons.submitPoints}</h3>
              <Button size="sm" onClick={handleSubmitAllVotes}>
                {ts.buttons.submit}
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              {ts.messages.allocatePointsBudget} Total
              budget: {vote.config.maxPointsPerUser || 10} {ts.labels.points}.
            </p>
          </div>
        )}

        {isActive && vote.config.allowFreeText && (canChangeVote || !hasSubmitted) && (
          <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1 mb-2">
              <MessageSquare className="w-4 h-4" />
              {ts.labels.comment}
            </label>
            {showObjectionNudge && isNegativeVote && (
              <p className="text-xs text-amber-600 flex items-center gap-1 mb-2">
                <AlertTriangle className="w-3 h-3" />
                {ts.messages.negativeCommentNudge}
              </p>
            )}
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={ts.placeholders.comment}
              rows={2}
            />
          </div>
        )}

        {isActive &&
          (canChangeVote || !hasSubmitted) &&
          vote.config.kind === "consultation" &&
          vote.config.allowAudienceProposals && (
            <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                {ts.labels.suggestProposal}
              </h3>
              <div className="flex gap-2">
                <Input
                  value={audienceProposalText}
                  onChange={(e) => setAudienceProposalText(e.target.value)}
                  placeholder={ts.placeholders.proposal}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleAudienceProposal}
                  disabled={!audienceProposalText.trim()}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {ts.buttons.add}
                </Button>
              </div>
            </div>
          )}

        {isClosed && (
          <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              {ts.labels.finalResults}
            </h3>
            {mode !== "CONSENT_LOOP" && (
              <div className="space-y-3">
                {activeProposals.map((proposal) => (
                  <div key={proposal.id} className="border rounded-lg p-3">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      Proposal {proposal.position + 1}
                    </h4>
                    {mode === "THUMBS_UP" && (() => {
                      const count = tallyThumbsUpResult(proposal.id);
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-lg">&#x1F44D;</span>
                          <span className="font-medium">{count}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden ml-2">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{
                                width: `${totalVoters > 0 ? (count / totalVoters) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                    {mode === "THUMBS_UD_NEUTRAL" && (() => {
                      const t = tallyUDNResult(proposal.id);
                      const total = t.up + t.neutral + t.down || 1;
                      return (
                        <div className="space-y-1">
                          <div className="flex gap-3 text-sm">
                            <span className="text-red-600">
                              &#x1F44E; {t.down}
                            </span>
                            <span className="text-yellow-600">
                              &#x1F610; {t.neutral}
                            </span>
                            <span className="text-green-600">
                              &#x1F44D; {t.up}
                            </span>
                          </div>
                          <div className="flex h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-red-500"
                              style={{ width: `${(t.down / total) * 100}%` }}
                            />
                            <div
                              className="bg-yellow-400"
                              style={{
                                width: `${(t.neutral / total) * 100}%`,
                              }}
                            />
                            <div
                              className="bg-green-500"
                              style={{ width: `${(t.up / total) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                    {mode === "POINTS" && (() => {
                       const total = tallyPointsResult(proposal.id);
                       return (
                         <div className="flex items-center gap-2">
                           <span className="text-lg">&#x1FA99;</span>
                           <span className="font-medium">{total} {ts.labels.points}</span>
                        </div>
                      );
                    })()}
                    {mode === "MAJORITY_JUDGMENT" && (() => {
                      const t = tallyMJResult(proposal.id);
                      const medianGrade = MJ_SCALE.find(
                        (g) => g.value === t.median
                      );
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span>{ts.labels.medianColon}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-xs text-white ${medianGrade?.color || "bg-gray-500"}`}
                            >
                              {medianGrade?.icon} {medianGrade?.label}
                            </span>
                          </div>
                          <div className="flex h-3 rounded-full overflow-hidden">
                            {MJ_SCALE.map((grade) => (
                              <div
                                key={grade.value}
                                className={`${grade.color}`}
                                style={{
                                  width: `${((t.distribution[grade.value] || 0) / (responses.length || 1)) * 100}%`,
                                }}
                                title={`${grade.label}: ${t.distribution[grade.value] || 0}`}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
            {!isAnonymous && responses.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
                  {ts.labels.voters}
                </h4>
                <div className="space-y-1">
                  {responses.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 text-xs text-gray-500"
                    >
                      <span>{r.userId || "Anonymous"}</span>
                      {r.comment && (
                        <span className="italic text-gray-400">
                          &mdash; {r.comment}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <Separator className="my-6" />

        <div className="bg-white rounded-lg shadow-sm border p-5">
          {vote.slug && <QRCodeBlock slug={vote.slug} />}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          {ts.messages.poweredBy}
        </p>
      </div>
    </div>
  );
};

export default PublicVotePage;