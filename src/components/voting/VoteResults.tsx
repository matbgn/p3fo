import * as React from "react";
import { VoteEntity, VoteProposal, VoteLoop, VoteResponseEntity } from "@/lib/persistence-types";
import { VOTING_MODES_LABELS, MJ_SCALE, mjGradeLabel } from "@/components/planView/constants";
import { getPokerScale, pokerCardDescription } from "@/lib/poker";
import { pokerProposalIsRevealed } from "@/lib/vote-ranking";
import { forceRevealPokerProposal } from "@/hooks/usePokerState";
import { useVoteParticipation, useVoteResults, responseVoterAlias, responseVoterDisplayName } from "@/hooks/useVotes";
import { useVoteLoops } from "@/hooks/useVoteLoops";
import { tallyThumbsUp, tallyUDNeutral, tallyBudget, tallyMajorityJudgment, tallyPoker, voteResultsSortMetric, voteResultsSupportsMedian, tallyConsentLoop, getBestConsentRound, EVENT_RSVP_PROPOSAL_ID } from "@/lib/vote-tally";
import { budgetTallyPresentation } from "@/lib/budget";
import { getVotingStrings, pokerTallyLabels } from "@/lib/voting-i18n";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, MessageSquare, Trophy, ArrowUpDown, ArrowDownWideNarrow } from "lucide-react";
import { LoopRoundProposalTooltip } from "./LoopRoundProposalTooltip";
import { ProposalContentDisplay } from "./ProposalContentDisplay";
import { PokerTallyDisplay } from "./PokerTallyDisplay";
import { BudgetTallyDisplay } from "./BudgetTallyDisplay";
import { PartialRankingResults } from "./PartialRankingResults";
import { AttendanceRsvpSummary } from "./AttendanceRsvpSummary";
import { SchedulingSummary } from "./SchedulingSummary";
import { VoteComments, type VoteCommentEntry } from "./VoteComments";
import { buildVoteCommentEntries } from "@/lib/vote-comments";
import { attendancePartySize, summarizeAttendance } from "@/lib/attendance";
import { normalizeSchedulingConfig, tallyScheduling } from "@/lib/scheduling";

interface VoteResultsProps {
  vote: VoteEntity;
  /** When present, comparative results stream live to this moderator session
   * even while they are still hidden from the public page. */
  moderatorToken?: string;
  /** Selects the in-app moderator detail view rather than the participant
   * results view, which stays gated by the pre-close visibility setting. */
  moderatorView?: boolean;
}


const PHASE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  IDLE: "secondary",
  OPEN: "default",
  CLOSED: "outline",
  FINALIZED: "destructive",
};

const ConsentLoopResults: React.FC<{ vote: VoteEntity }> = ({ vote }) => {
  const t = getVotingStrings();
  const { t: tt } = useTranslation();
  const { responses, isLoading: responsesLoading } = useVoteResults(vote.id, true, false);
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

  const isVoteClosed = vote.config.phase === "CLOSED" || vote.config.phase === "FINALIZED";

  return (
    <div className="space-y-4">
      {activeProposals.map((proposal, idx) => {
        const proposalTally = tally.proposals.find((p) => p.proposalId === proposal.id);
        if (!proposalTally || proposalTally.perRound.length === 0) return null;

        const openLoop = loops.find((l) => l.proposalId === proposal.id && !l.closedAt);
        const closedRounds = proposalTally.perRound.filter((r) => r.closed);
        const lastClosedRound = closedRounds.length > 0 ? closedRounds[closedRounds.length - 1] : null;
        const autoBest = isVoteClosed ? getBestConsentRound(proposalTally) : null;
        const outcomeLoopId = vote.outcome?.winningLoopId;
        const bestRound = isVoteClosed
          ? (outcomeLoopId ? proposalTally.perRound.find((r) => r.loopId === outcomeLoopId) ?? autoBest : autoBest)
          : null;

        const displayRound = isVoteClosed
          ? (bestRound ?? lastClosedRound ?? proposalTally.perRound[proposalTally.perRound.length - 1])
          : openLoop
            ? (proposalTally.current ?? lastClosedRound ?? proposalTally.perRound[proposalTally.perRound.length - 1])
            : (lastClosedRound ?? proposalTally.perRound[proposalTally.perRound.length - 1]);

        if (!displayRound) return null;

        const isAdopted = isVoteClosed
          ? (bestRound?.adopted ?? false)
          : (lastClosedRound?.adopted ?? false);
        const isOpen = !isVoteClosed && !!openLoop;
        const roundNumber = isVoteClosed
          ? bestRound?.roundNumber ?? lastClosedRound?.roundNumber ?? proposalTally.perRound.length
          : openLoop
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

        const lastLoop = openLoop
          || (bestRound ? loops.find((l) => l.id === bestRound.loopId) : undefined)
          || (lastClosedRound ? loops.find((l) => l.id === lastClosedRound.loopId) : undefined);
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
                {proposal.description || tt("voting.proposalN", { n: idx + 1 })}
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

export const VoteOutcomeBanner: React.FC<{ vote: VoteEntity }> = ({ vote }) => {
  const t = getVotingStrings();
  const { t: tt } = useTranslation();
  if (!vote.outcome) return null;
  return (
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
        {tt("voting.finalizedPrefix")} {new Date(vote.outcome.finalizedAt).toLocaleString()}
      </p>
    </div>
  );
};

/**
 * Shared results header: phase/mode/kind badges, the outcome banner and the
 * voter/joined/comments counters. Both the generic and the scheduling branch
 * render it, so a counter or the draft hint cannot silently disappear from one
 * mode's results.
 */
const VoteResultsHeader: React.FC<{
  vote: VoteEntity;
  voters: number;
  joinedCount: number;
  commentsCount: number;
  hasDrafts: boolean;
  draftCount: number;
}> = ({ vote, voters, joinedCount, commentsCount, hasDrafts, draftCount }) => {
  const t = getVotingStrings();
  const { t: tt } = useTranslation();
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant={PHASE_VARIANTS[vote.config.phase] || "secondary"}>
          {t.phases[vote.config.phase] || vote.config.phase}
        </Badge>
        <Badge variant="outline">{VOTING_MODES_LABELS[vote.config.mode]}</Badge>
        <Badge variant="outline">{vote.config.kind === "decision" ? t.kinds.decision : t.kinds.consultation}</Badge>
        {hasDrafts && (
          <Badge variant="secondary">{tt("voting.draftResults")}</Badge>
        )}
      </div>

      {vote.outcome && (
        <VoteOutcomeBanner vote={vote} />
      )}

      <div className="flex gap-4 text-sm text-gray-500">
        <span className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          {voters} {voters !== 1 ? t.labels.voters : t.labels.voter}
        </span>
        {joinedCount > voters && (
          <span className="flex items-center gap-1 text-blue-700">
            <Users className="w-4 h-4" />
            {tt("voting.joinedCount", { count: joinedCount })}
          </span>
        )}
        {commentsCount > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" />
            {commentsCount} {commentsCount !== 1 ? t.labels.comments : t.labels.comment}
          </span>
        )}
      </div>

      {hasDrafts && (
        <p className="text-xs text-amber-700">
          {tt("voting.draftIncludedHint", { count: draftCount })}
        </p>
      )}
    </>
  );
};

export const VoteResults: React.FC<VoteResultsProps> = ({ vote, moderatorToken, moderatorView = false }) => {
  const t = getVotingStrings();
  const { t: tt } = useTranslation();
  const { responses, isLoading, hasDrafts, draftCount, refetch } = useVoteResults(
    vote.id,
    // Comparative votes never store vote responses; polling the response
    // endpoint for them is pure waste.
    vote.config.mode !== "COMPARATIVE_PRIORITIZATION",
    // Only the moderator view shows in-progress selections, and only while the
    // vote is open: a draft left behind by a dead tab must never be merged into
    // the tally after the vote closed, where "submitted votes only" applies.
    moderatorView && vote.config.phase === "OPEN",
    // Drafts are read from the moderator-authenticated channel; without an
    // active moderator link the view safely falls back to submitted ballots.
    moderatorToken,
  );
  const participants = useVoteParticipation(
    vote.id,
    // Presence only exists while the vote is open; the endpoint returns an
    // empty list otherwise, so polling a closed vote would be pure waste.
    vote.config.mode !== "COMPARATIVE_PRIORITIZATION" && vote.config.phase === "OPEN",
    moderatorToken,
  );
  // Union of people who submitted/are drafting and people who merely opened
  // the page. The latter is the "joined but not voting yet" pre-state. Dedupe on
  // the moderator-only participant digest when present so two colliding public
  // aliases do not collapse to one person (nor one person to two).
  const identityOfResponse = React.useCallback(
    (response: VoteResponseEntity) =>
      response.participantId ?? responseVoterAlias(vote.id, response),
    [vote.id],
  );
  const joinedCount = React.useMemo(
    () =>
      new Set([
        ...responses.map(identityOfResponse),
        ...participants.map((participant) => participant.participantId ?? participant.voterAlias),
      ]).size,
    [identityOfResponse, responses, participants],
  );
  const isAnonymous = vote.config.isAnonymous ?? true;

  // One deduplicated comment list for every mode, shared with the public page.
  const commentEntries = React.useMemo<VoteCommentEntry[]>(
    () => buildVoteCommentEntries(vote.id, responses, isAnonymous),
    [responses, isAnonymous, vote.id],
  );

  const [resultsSortMetric, setResultsSortMetric] = React.useState<"original" | "median" | "average">("original");
  const [resultsSortDir, setResultsSortDir] = React.useState<"asc" | "desc">("desc");
  const [forcingRevealId, setForcingRevealId] = React.useState<string | null>(null);
  const [forcedRevealIds, setForcedRevealIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [forceRevealError, setForceRevealError] = React.useState<string | null>(null);

  // A new round resets the persisted allow-list, so the locally hidden buttons
  // must come back too; otherwise the previous round's reveals would keep the
  // button hidden for the same proposal id. A moderator reset rewinds to round
  // 0, so the phase is part of the key: the reset moves the vote to IDLE and
  // reopening moves it back to OPEN, clearing the stale local hides.
  const pokerRound = vote.config.poker?.round ?? 0;
  React.useEffect(() => {
    setForcedRevealIds(new Set());
    setForceRevealError(null);
  }, [vote.id, pokerRound, vote.config.phase]);

  const handleForceReveal = React.useCallback(
    async (proposalId: string) => {
      if (!moderatorToken) return;
      setForcingRevealId(proposalId);
      setForceRevealError(null);
      try {
        await forceRevealPokerProposal(
          vote.slug || vote.id,
          proposalId,
          moderatorToken,
        );
        // Hide the button immediately; the moderator's vote poll/Yjs broadcast
        // (and the refetch below) will carry the persisted id shortly.
        setForcedRevealIds((previous) => {
          const next = new Set(previous);
          next.add(proposalId);
          return next;
        });
        await refetch();
      } catch (error) {
        setForceRevealError(
          error instanceof Error ? error.message : t.poker.forceRevealFailed,
        );
      } finally {
        setForcingRevealId(null);
      }
    },
    [moderatorToken, refetch, t.poker.forceRevealFailed, vote.id, vote.slug],
  );

  // One memoized RSVP projection shared by the header count and the summary
  // body, so a polling refresh scans the response list once instead of twice
  // and an unrelated re-render (e.g. a dialog keystroke) does not scan it at all.
  const attendanceSummary = React.useMemo(
    () =>
      vote.config.mode === "ATTENDANCE"
        ? summarizeAttendance(responses, {
            isAnonymous,
            includeComments: vote.config.allowFreeText === true,
          })
        : null,
    [vote.config.mode, vote.config.allowFreeText, responses, isAnonymous],
  );

  // Scheduling results are aggregate-only for the public page but include the
  // participant × slot matrix in the moderator view. One projection is shared
  // by the header count and the summary body.
  const schedulingConfig = React.useMemo(
    () => normalizeSchedulingConfig(vote.config.scheduling),
    [vote.config.scheduling],
  );
  const schedulingTally = React.useMemo(
    () =>
      vote.config.mode === "SCHEDULING"
        ? tallyScheduling(responses, vote.proposals, schedulingConfig)
        : null,
    [vote.config.mode, vote.proposals, responses, schedulingConfig],
  );

  const totalVoters = new Set(responses.map(identityOfResponse)).size;
  // The budget share bar uses the same participant count as the voter badge:
  // one source of truth for how many voters the group budget covers, and one
  // shared derivation with the public results page.
  const budgetPresentation = budgetTallyPresentation(
    vote.config,
    totalVoters,
    t.labels.points,
  );
  const budgetAggregateTotal = budgetPresentation.aggregateTotal;
  const budgetTallyFormat = budgetPresentation.formatAmount;
  const budgetTallyIcon = budgetPresentation.icon;
  const commentsCount = commentEntries.length;

  if (vote.config.mode === "COMPARATIVE_PRIORITIZATION") {
    return (
      <div className="space-y-4">
        <VoteOutcomeBanner vote={vote} />
        <PartialRankingResults
          vote={vote}
          canExport
          moderatorToken={moderatorToken}
          moderatorView={moderatorView}
        />
      </div>
    );
  }

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
          <VoteOutcomeBanner vote={vote} />
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
        <VoteComments comments={commentEntries} />
      </div>
    );
  }

  if (vote.config.mode === "ATTENDANCE") {
    const tally = attendanceSummary?.tally;
    const questions = vote.config.attendance?.customQuestions ?? [];
    // Organizers asked for emails / custom answers; show them only in the
    // moderator view. The public projection never carries these fields.
    const moderatorAttendees = moderatorView
      ? responses.filter(
          (response) =>
            response.proposalId === EVENT_RSVP_PROPOSAL_ID && response.value === 1,
        )
      : [];
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant={PHASE_VARIANTS[vote.config.phase] || "secondary"}>
            {t.phases[vote.config.phase] || vote.config.phase}
          </Badge>
          <Badge variant="outline">{VOTING_MODES_LABELS[vote.config.mode]}</Badge>
          <Badge variant="outline">
            {vote.config.kind === "decision" ? t.kinds.decision : t.kinds.consultation}
          </Badge>
        </div>

        {vote.outcome && <VoteOutcomeBanner vote={vote} />}

        <div className="flex gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {tally?.total ?? 0} {tally?.total !== 1 ? t.labels.voters : t.labels.voter}
          </span>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-400">{t.messages.loadingResults}</p>
        ) : (
          <div className="border rounded-lg p-3">
            <AttendanceRsvpSummary
              responses={responses}
              isAnonymous={isAnonymous}
              showComments={false}
              summary={attendanceSummary ?? undefined}
            />
          </div>
        )}

        {moderatorView && moderatorAttendees.length > 0 && (
          <div className="border rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-medium text-gray-400 uppercase">
              {t.attendance.attendees}
            </h4>
            <ul className="space-y-2">
              {moderatorAttendees.map((response) => {
                const data = response.attendeeData;
                const displayName = responseVoterDisplayName(
                  vote.id,
                  response,
                  isAnonymous,
                );
                return (
                  <li key={response.id} className="text-sm">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium text-gray-900">
                        {displayName}
                      </span>
                      <span className="text-xs text-gray-400">× {attendancePartySize(data)}</span>
                    </div>
                    {data?.email && (
                      <div className="text-xs text-gray-500">
                        {t.attendance.email}: {data.email}
                      </div>
                    )}
                    {questions.map((question) => {
                      const answer = data?.answers?.[question.id];
                      if (!answer) return null;
                      return (
                        <div key={question.id} className="text-xs text-gray-500">
                          {question.prompt}: {answer}
                        </div>
                      );
                    })}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <VoteComments comments={commentEntries} />
      </div>
    );
  }

  if (vote.config.mode === "SCHEDULING") {
    const tally = schedulingTally;
    return (
      <div className="space-y-4">
        <VoteResultsHeader
          vote={vote}
          voters={tally?.totalVoters ?? 0}
          joinedCount={joinedCount}
          commentsCount={commentsCount}
          hasDrafts={hasDrafts}
          draftCount={draftCount}
        />

        {isLoading ? (
          <p className="text-sm text-gray-400">{t.messages.loadingResults}</p>
        ) : responses.length === 0 || !tally || tally.totalVoters === 0 ? (
          <p className="text-sm text-gray-400">{t.messages.noVotesYet}</p>
        ) : (
          <div className="space-y-3">
            <SchedulingSummary
              vote={vote}
              responses={responses}
              tally={tally}
              moderatorView={moderatorView}
              moderatorToken={moderatorToken}
              onChanged={refetch}
            />
            <VoteComments comments={commentEntries} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <VoteResultsHeader
        vote={vote}
        voters={totalVoters}
        joinedCount={joinedCount}
        commentsCount={commentsCount}
        hasDrafts={hasDrafts}
        draftCount={draftCount}
      />

      {forceRevealError && (
        <p className="text-sm text-red-600" role="alert">
          {forceRevealError}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">{t.messages.loadingResults}</p>
      ) : responses.length === 0 ? (
        <p className="text-sm text-gray-400">{t.messages.noVotesYet}</p>
      ) : (
        <div className="space-y-3">
          {(() => {
            const mode = vote.config.mode;
            const active = vote.proposals.filter((p) => p.active);
            const canSortResults = active.length > 1;
            const pokerScale = getPokerScale(vote.config.poker?.scale);
            // One mapping from i18n to poker card descriptions: `pokerTallyLabels`
            // already exposes `unknown`, `coffee` and `animals`, so no renderer
            // keeps its own copy that can drift when a key is added.
            const pokerDescriptions = pokerTallyLabels(t);
            const formatVoteValue = (value: number): string => {
              if (mode === "THUMBS_UP") return tt("voting.yes");
              if (mode === "THUMBS_UD_NEUTRAL") {
                if (value === 1) return tt("voting.yes");
                if (value === -1) return tt("voting.no");
                return tt("voting.neutral");
              }
              if (mode === "POINTS") {
                return budgetTallyFormat(value);
              }
              if (mode === "MAJORITY_JUDGMENT") {
                const grade = MJ_SCALE.find((g) => g.value === value);
                if (!grade) return String(value);
                return `${grade.icon} ${mjGradeLabel(tt, value)}`;
              }
              if (mode === "POKER_PLANNING") {
                const card = pokerScale.cards.find((c) => c.value === value);
                if (!card) return String(value);
                const description = pokerCardDescription(card, pokerDescriptions);
                return pokerScale.emoji && description
                  ? `${card.label} ${description}`
                  : card.label;
              }
              return String(value);
            };
            const metric =
              resultsSortMetric === "average" ? "average" : "median";
            const metricFor = (p: VoteProposal): number =>
              voteResultsSortMetric(
                mode,
                responses,
                p.id,
                metric,
                pokerScale.id,
              );
            let proposals: VoteProposal[] = active;
            if (resultsSortMetric !== "original" && active.length > 1) {
              const sorted = [...active].sort((a, b) => metricFor(a) - metricFor(b));
              proposals = resultsSortDir === "desc" ? sorted.reverse() : sorted;
            }
            return (
              <>
                {canSortResults && (
                  <div className="flex items-center gap-2 flex-wrap pb-3 border-b">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      <span>{t.labels.sortResults}:</span>
                    </div>
                    <select
                      value={resultsSortMetric}
                      onChange={(e) => setResultsSortMetric(e.target.value as typeof resultsSortMetric)}
                      className="text-xs border rounded px-2 py-1 bg-white"
                    >
                      <option value="original">{t.labels.sortByOriginal}</option>
                      {voteResultsSupportsMedian(mode) ? (
                        <option value="median">{t.labels.sortByMedian}</option>
                      ) : null}
                      <option value="average">
                        {mode === "POINTS"
                          ? t.labels.sortByTotal
                          : t.labels.sortByAverage}
                      </option>
                    </select>
                    {resultsSortMetric !== "original" && (
                      <button
                        onClick={() => setResultsSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                        className="text-xs border rounded px-2 py-1 bg-white hover:bg-gray-50 flex items-center gap-1"
                        title={resultsSortDir === "asc" ? t.labels.sortAscending : t.labels.sortDescending}
                      >
                        <ArrowDownWideNarrow className={`w-3.5 h-3.5 transition-transform ${resultsSortDir === "asc" ? "rotate-180" : ""}`} />
                        {resultsSortDir === "asc" ? t.labels.sortAscending : t.labels.sortDescending}
                      </button>
                    )}
                  </div>
                )}
                {proposals.map((proposal) => {
            const isWinning = vote.outcome?.winningProposalId === proposal.id;

            return (
              <div
                key={proposal.id}
                className={`border rounded-lg p-3 ${
                  isWinning ? "border-blue-500 bg-blue-50" : "bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="text-sm font-medium text-gray-900">
                    {isWinning && <Trophy className="w-4 h-4 text-blue-600 inline mr-1" />}
                    {proposal.description?.trim() || tt("voting.proposalN", { n: proposal.position + 1 })}
                  </h4>
                  {mode === "POKER_PLANNING" &&
                    moderatorView &&
                    moderatorToken &&
                    !vote.config.poker?.revealedAt &&
                    !pokerProposalIsRevealed(vote, proposal.id) &&
                    !forcedRevealIds.has(proposal.id) && (
                      <button
                        type="button"
                        onClick={() => void handleForceReveal(proposal.id)}
                        disabled={forcingRevealId === proposal.id}
                        className="shrink-0 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {forcingRevealId === proposal.id
                          ? t.poker.forceRevealing
                          : t.poker.forceReveal}
                      </button>
                    )}
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

                {vote.config.mode === "POINTS" && (
                  <BudgetTallyDisplay
                    tally={tallyBudget(responses, proposal.id)}
                    totalBudget={budgetAggregateTotal}
                    labels={t.budget}
                    formatAmount={budgetTallyFormat}
                    icon={budgetTallyIcon}
                  />
                )}

                {vote.config.mode === "MAJORITY_JUDGMENT" && (() => {
                  const tally = tallyMajorityJudgment(responses, proposal.id);
                  const medianGrade = MJ_SCALE.find((g) => g.value === tally.median);
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span>{t.labels.medianColon}</span>
                        <span className={`px-2 py-0.5 rounded text-xs text-white ${medianGrade?.color || "bg-gray-500"}`}>
                          {medianGrade?.icon} {medianGrade ? mjGradeLabel(tt, tally.median) : ""}
                        </span>
                      </div>
                      <div className="flex h-3 rounded-full overflow-hidden">
                        {MJ_SCALE.map((grade) => (
                          <div
                            key={grade.value}
                            className={`${grade.color}`}
                            style={{ width: `${((tally.distribution[grade.value] || 0) / (responses.length || 1)) * 100}%` }}
                            title={`${mjGradeLabel(tt, grade.value)}: ${tally.distribution[grade.value] || 0}`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {vote.config.mode === "POKER_PLANNING" && (() => {
                  const tally = tallyPoker(responses, proposal.id, pokerScale.id);
                  return (
                    <PokerTallyDisplay
                      tally={tally}
                      labels={pokerTallyLabels(t)}
                    />
                  );
                })()}

                {(() => {
                  const voterRows = responses.filter((r) => r.proposalId === proposal.id);
                  if (voterRows.length === 0) return null;
                  return (
                    <div className="mt-2 space-y-1">
                      {voterRows.map((r) => {
                        const displayName = responseVoterDisplayName(
                          vote.id,
                          r,
                          isAnonymous,
                        );
                        return (
                          <div
                            key={r.id}
                            className="flex items-center justify-between gap-2 text-xs text-gray-500"
                          >
                            <span>{displayName}</span>
                            {typeof r.value === "number" && (
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
                                {formatVoteValue(r.value)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
            })}
          </>
            );
          })()}
          <VoteComments comments={commentEntries} />
        </div>
      )}
    </div>
  );
};