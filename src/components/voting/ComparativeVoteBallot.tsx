import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Flag, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProposalContentDisplay } from './ProposalContentDisplay';
import { UserContext } from '@/context/UserContextDefinition';
import {
  batchPairwiseWins,
  confidencePercent,
  estimateScores,
  initState,
  rankResults,
  recordBatch,
  selectNextBatch,
  type ComparisonBatch,
  type PLTask,
  type PrioritizationState,
} from '@/lib/pl-prioritization';
import {
  activeProposalIds,
  computeBallotCoverage,
  DEFAULT_RANKING_ENGINE,
  expectedRankingPairs,
  isDraftNewer,
  isVoteAnonymous,
  MAX_RANKED_ITEMS,
  proposalDisplayTitle,
  RANKING_ENGINE_VERSION,
  rankingEngineToK,
  selectRankedItemIds,
} from '@/lib/vote-ranking';
import type {
  VoteEntity,
  VoteRankingBallot,
  VoteRankingComparison,
} from '@/lib/persistence-types';
import { useMyVoteRankingSubmission } from '@/hooks/useVoteRanking';

interface ComparativeVoteBallotProps {
  vote: VoteEntity;
  slug: string;
  voterToken: string;
  onSubmitted?: () => void;
}

function toTasks(vote: VoteEntity): PLTask[] {
  const byId = new Map(vote.proposals.map((proposal) => [proposal.id, proposal]));
  return activeProposalIds(vote).flatMap((id) => {
    const proposal = byId.get(id);
    if (!proposal) return [];
    return [{ id, title: proposalDisplayTitle(proposal) }];
  });
}

function hydrateState(
  tasks: PLTask[],
  k: number,
  ballot: VoteRankingBallot,
): PrioritizationState {
  const base = initState(tasks, k);
  const winMatrix: PrioritizationState['winMatrix'] = {};
  for (const comparison of ballot.comparisons) {
    if (!winMatrix[comparison.winner]) winMatrix[comparison.winner] = {};
    winMatrix[comparison.winner][comparison.winner === comparison.a ? comparison.b : comparison.a] =
      (winMatrix[comparison.winner][comparison.winner === comparison.a ? comparison.b : comparison.a] ?? 0) + 1;
  }
  const taskIds = tasks.map((task) => task.id);
  const scores = estimateScores(winMatrix, taskIds);
  return {
    ...base,
    winMatrix,
    scores,
    totalBatches: ballot.batchCount,
    rankingHistory: [],
    stallCount: 0,
    done: false,
    results: null,
    stopReason: null,
  };
}

function comparisonsForBatch(
  ids: string[],
  highestId: string,
  lowestId: string | undefined,
  k: number,
): VoteRankingComparison[] {
  return batchPairwiseWins(ids, highestId, lowestId, k).map((win) => ({
    a: win.winnerId,
    b: win.loserId,
    winner: win.winnerId,
  }));
}

/**
 * Declare at most `MAX_RANKED_ITEMS` item ids even when the vote has a larger
 * proposal set, otherwise every submit is rejected with a 400. Prefer the
 * most-compared proposals so the collective ranking ranks the items voters
 * actually saw. The cap is shared with the server validation and the result
 * builder so the three cannot drift apart.
 */
function ballotItemIds(
  tasks: PLTask[],
  comparisons: VoteRankingComparison[],
): string[] {
  const ids = tasks.map((task) => task.id);
  if (ids.length <= MAX_RANKED_ITEMS) return ids;

  const comparedCount = new Map<string, number>();
  for (const comparison of comparisons) {
    comparedCount.set(comparison.a, (comparedCount.get(comparison.a) ?? 0) + 1);
    comparedCount.set(comparison.b, (comparedCount.get(comparison.b) ?? 0) + 1);
  }
  const position = new Map(tasks.map((task, index) => [task.id, index]));
  // Declare only the proposals this ballot actually compared. `itemIds` is what
  // the collective result builder counts, so listing un-compared proposals
  // would make it rank items nobody saw and drop the comparisons for items that
  // were actually compared. Keep the server's two-id minimum for a degenerate
  // ballot whose comparisons all reference removed proposals.
  const comparedIds = ids.filter((id) => (comparedCount.get(id) ?? 0) > 0);
  if (comparedIds.length >= 2) {
    return selectRankedItemIds(comparedIds, comparedCount, position);
  }
  return selectRankedItemIds(ids, comparedCount, position);
}

export const ComparativeVoteBallot: React.FC<ComparativeVoteBallotProps> = ({
  vote,
  slug,
  voterToken,
  onSubmitted,
}) => {
  const { t: tt } = useTranslation();
  const userContext = React.useContext(UserContext);
  // The public page polls every few seconds and recreates `vote`, so a memo
  // keyed on the object identity would re-extract every proposal's title on
  // each poll. Key it on the proposal data that actually determines the task
  // list instead; `toTasks` reads the latest vote through a ref.
  const proposalsKey = React.useMemo(
    () =>
      [
        vote.id,
        ...vote.proposals.map((proposal) =>
          [
            proposal.id,
            proposal.active ? '1' : '0',
            proposal.position,
            proposal.description ?? '',
            proposal.content ?? '',
          ].join('\u0000'),
        ),
      ].join('\u0001'),
    [vote],
  );
  const voteRef = React.useRef(vote);
  voteRef.current = vote;
  const tasks = React.useMemo(
    () => (proposalsKey ? toTasks(voteRef.current) : []),
    [proposalsKey],
  );
  const engine = vote.config.rankingEngine ?? DEFAULT_RANKING_ENGINE;
  const k = rankingEngineToK(engine);
  const canChange = vote.config.allowVoteChangeUntilClose ?? true;
  // Use the shared rule: an absent flag means anonymous, matching the server.
  const isAnonymous = isVoteAnonymous(vote.config);
  const {
    submission,
    isLoading,
    error,
    refresh,
    save,
    withdraw,
  } = useMyVoteRankingSubmission(slug, voterToken);

  const [engineState, setEngineState] = React.useState<PrioritizationState | null>(null);
  const [currentBatch, setCurrentBatch] = React.useState<ComparisonBatch | null>(null);
  const [comparisons, setComparisons] = React.useState<VoteRankingComparison[]>([]);
  const [batchCount, setBatchCount] = React.useState(0);
  const [batchPhase, setBatchPhase] = React.useState<'highest' | 'lowest'>('highest');
  const [selectedHighestId, setSelectedHighestId] = React.useState<string | null>(null);
  const [localSubmitted, setLocalSubmitted] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  // Background-save failures must not replace the ballot with a fatal error:
  // keep the comparison UI interactive and surface the save problem inline.
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // Advances only when the voter makes a real comparison. The debounced save
  // must not be keyed on `vote`/`buildBallot`, because the public page polls
  // every few seconds and re-creates the vote object, which would re-upload the
  // whole ballot with no user progress.
  const [saveSeq, setSaveSeq] = React.useState(0);
  const hydratedRef = React.useRef(false);

  // A submitted ballot is locked when the vote disallows changes. `submission`
  // holds server data, but an explicit submit in this session is tracked by
  // `localSubmitted`, so the lock does not depend on reloading the metadata.
  const locked = !canChange && (Boolean(submission?.submitted) || localSubmitted);
  // Derived ballot state only changes when the comparison set or engine state
  // changes. Memoizing keeps the 5s public-page poll (which recreates `vote`)
  // from re-scanning every comparison and re-ranking twice on each render.
  const itemIds = React.useMemo(() => tasks.map((task) => task.id), [tasks]);
  const coverage = React.useMemo(
    () => computeBallotCoverage({ itemIds, comparisons }),
    [itemIds, comparisons],
  );
  const userRanking = React.useMemo(
    () => (engineState ? rankResults(engineState) : []),
    [engineState],
  );
  const progress = React.useMemo(
    () => (engineState ? confidencePercent(engineState) : 0),
    [engineState],
  );
  const totalPairs = expectedRankingPairs(tasks.length);

  const buildBallot = React.useCallback(
    (state: PrioritizationState | null): VoteRankingBallot => ({
      itemIds: ballotItemIds(tasks, comparisons),
      comparisons,
      batchCount,
      coverage,
      confidencePercent: state ? confidencePercent(state) : 0,
      stopReason: state?.stopReason ?? null,
      engine,
      engineVersion: RANKING_ENGINE_VERSION,
    }),
    [tasks, comparisons, batchCount, engine, coverage],
  );

  const engineStateRef = React.useRef(engineState);
  engineStateRef.current = engineState;
  const buildBallotRef = React.useRef(buildBallot);
  buildBallotRef.current = buildBallot;
  // An autosave already in flight is awaited before an explicit submit so the
  // server cannot stamp `draftUpdatedAt` after `submittedAt`.
  const inFlightSaveRef = React.useRef<Promise<void> | null>(null);
  const submittingRef = React.useRef(false);
  const saveMetaRef = React.useRef<{ userId: string | null; displayName: string | null }>({
    userId: null,
    displayName: null,
  });
  saveMetaRef.current = {
    userId: userContext?.userId ?? null,
    displayName: isAnonymous ? null : userContext?.userSettings?.username ?? null,
  };

  React.useEffect(() => {
    if (hydratedRef.current || isLoading || tasks.length < 2) return;
    const source = submission?.draft ?? submission?.submitted ?? null;
    if (source) {
      const hydrated = hydrateState(tasks, k, source);
      setEngineState(hydrated);
      setComparisons(source.comparisons);
      setBatchCount(source.batchCount);
      const draftIsNewer = isDraftNewer(
        submission?.draft != null,
        submission?.draftUpdatedAt ?? null,
        submission?.submittedAt ?? null,
      );
      const alreadySubmitted = Boolean(submission?.submitted && !draftIsNewer);
      setLocalSubmitted(alreadySubmitted);
      setCurrentBatch(
        locked || alreadySubmitted ? null : selectNextBatch(hydrated),
      );
    } else {
      const fresh = initState(tasks, k);
      setEngineState(fresh);
      setComparisons([]);
      setBatchCount(0);
      setCurrentBatch(selectNextBatch(fresh));
    }
    hydratedRef.current = true;
  }, [isLoading, submission, tasks, k, locked]);

  React.useEffect(() => {
    // `isSaving` belongs in the guard and the dependency list: starting a submit
    // tears down the pending timer, so a trailing autosave cannot race the
    // explicit submit and stamp `draftUpdatedAt` after `submittedAt`. Otherwise a
    // submitted ballot reloads as "editing" (and is rejected with a spurious
    // error when the vote locks ballots after submit).
    if (saveSeq === 0 || locked || localSubmitted || isSaving) return;
    const timer = window.setTimeout(() => {
      const state = engineStateRef.current;
      if (!state || submittingRef.current) return;
      const pending = save(buildBallotRef.current(state), 'in_progress', saveMetaRef.current)
        .then(() => setSaveError(null))
        .catch((caught) => {
          setSaveError(caught instanceof Error ? caught.message : String(caught));
        });
      inFlightSaveRef.current = pending;
      void pending.finally(() => {
        if (inFlightSaveRef.current === pending) inFlightSaveRef.current = null;
      });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [saveSeq, locked, localSubmitted, isSaving, save]);

  const applyNextState = React.useCallback(
    (next: PrioritizationState, added: VoteRankingComparison[]) => {
      setEngineState(next);
      setComparisons((previous) => [...previous, ...added]);
      setBatchCount((count) => count + 1);
      setSaveSeq((seq) => seq + 1);
      setBatchPhase('highest');
      setSelectedHighestId(null);
      if (next.done) {
        setCurrentBatch(null);
      } else {
        setCurrentBatch(selectNextBatch(next));
      }
    },
    [],
  );

  const handleHighest = (highestId: string) => {
    if (!engineState || !currentBatch) return;
    const ids = currentBatch.tasks.map((task) => task.id);
    if (currentBatch.k === 2) {
      const added = comparisonsForBatch(ids, highestId, undefined, currentBatch.k);
      applyNextState(recordBatch(engineState, highestId, undefined, ids), added);
      return;
    }
    setSelectedHighestId(highestId);
    setBatchPhase('lowest');
  };

  const handleLowest = (lowestId: string) => {
    if (!engineState || !currentBatch || !selectedHighestId) return;
    const ids = currentBatch.tasks.map((task) => task.id);
    const added = comparisonsForBatch(ids, selectedHighestId, lowestId, currentBatch.k);
    applyNextState(
      recordBatch(engineState, selectedHighestId, lowestId, ids),
      added,
    );
  };

  const submit = React.useCallback(async () => {
    if (!engineState) return;
    setIsSaving(true);
    submittingRef.current = true;
    try {
      // Finish any autosave that already left the timer before sending the
      // submit: the server stamps the draft time when it handles the request, so
      // a late autosave would otherwise make the submitted ballot look newer
      // than the submission. The pending chain already swallows save errors.
      if (inFlightSaveRef.current) {
        await inFlightSaveRef.current;
      }
      await save(buildBallot(engineState), 'submitted', {
        userId: userContext?.userId ?? null,
        displayName: isAnonymous ? null : userContext?.userSettings?.username ?? null,
      });
      setSaveError(null);
      setLocalSubmitted(true);
      onSubmitted?.();
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      submittingRef.current = false;
      setIsSaving(false);
    }
  }, [engineState, buildBallot, save, userContext, isAnonymous, onSubmitted]);

  const handleWithdraw = async () => {
    try {
      await withdraw();
    } catch (caught) {
      // Do not clear the ballot when the server refused the withdrawal (closed
      // vote or a locked submission): the stored ballot would still be counted.
      setSaveError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    hydratedRef.current = false;
    setEngineState(null);
    setCurrentBatch(null);
    setComparisons([]);
    setBatchCount(0);
    setSaveSeq(0);
    setLocalSubmitted(false);
    // The batch UI state is independent of the re-hydration effect, so clear the
    // mid-selection phase too; otherwise the fresh batch would resume in the
    // "pick lowest" step with the withdrawn batch's highest selection.
    setBatchPhase('highest');
    setSelectedHighestId(null);
    // The collective ranking includes this voter's ballot, so removing it must
    // refetch the results exactly like a submit does; otherwise the panel keeps
    // showing a ranking that still counts the withdrawn ballot.
    onSubmitted?.();
  };

  const handleContinue = () => {
    setLocalSubmitted(false);
    // Re-arm autosave only on the next real comparison. Without this reset the
    // effect below re-runs as soon as `localSubmitted` flips and uploads a newer
    // draft even though nothing changed, which makes a submitted ballot look
    // unsubmitted (isDraftNewer) on reload.
    setSaveSeq(0);
    // A submit is allowed while a K>2 batch is mid-selection (lowest phase).
    // Starting a new batch without clearing the phase would render it in the
    // "pick lowest" step and record a comparison against the previous batch's
    // highest, so reset the phase exactly like `applyNextState` does.
    setBatchPhase('highest');
    setSelectedHighestId(null);
    if (engineState) {
      // The engine marks itself done as soon as it converges, and
      // `selectNextBatch` returns null for a done/confident state. Clear the
      // terminal flags and force a new batch so an already-submitted ballot can
      // be edited instead of the button doing nothing.
      const resumed: PrioritizationState = {
        ...engineState,
        done: false,
        results: null,
        stopReason: null,
        stallCount: 0,
      };
      setEngineState(resumed);
      setCurrentBatch(selectNextBatch(resumed, undefined, { forceContinue: true }));
    }
  };

  if (tasks.length < 2) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-gray-500">
        {tt('voting.comparative.noProposals')}
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-gray-400">{tt('voting.comparative.loading')}</p>;
  }

  if (error) {
    // A transient load failure must not block participation until a full page
    // reload: the self-ballot load only runs once per slug/token, so offer a
    // retry that re-runs it.
    return (
      <div className="rounded-lg border bg-white p-6 text-sm">
        <p className="text-red-600">{error}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => void refresh()}>
          {tt('common.retry')}
        </Button>
      </div>
    );
  }

  const proposalById = new Map(vote.proposals.map((proposal) => [proposal.id, proposal]));

  return (
    <div className="space-y-4">
      {saveError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {saveError}
        </div>
      )}
      <div className="rounded-lg border bg-white p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <ListOrdered className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">{tt('voting.comparative.title')}</h2>
          <Badge variant="outline">{`BT K=${k}`}</Badge>
        </div>
        <p className="text-sm text-gray-500 mt-2">{tt('voting.comparative.intro')}</p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{tt('voting.comparative.progress', { n: batchCount, confidence: Math.round(progress) })}</span>
            <span>{tt('voting.comparative.coverage', { percent: Math.round(coverage.percent) })}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
          <p className="text-[11px] text-gray-400">
            {tt('voting.comparative.coveredPairs', { covered: coverage.coveredPairs, total: totalPairs })}
          </p>
        </div>
      </div>

      {(locked || localSubmitted) && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle2 className="w-5 h-5" />
            <p className="text-sm font-medium">
              {locked ? tt('voting.comparative.ballotLocked') : tt('voting.comparative.ballotSubmitted')}
            </p>
          </div>
          {userRanking.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase text-green-700 mb-2">
                {tt('voting.comparative.yourRanking')}
              </p>
              <ol className="space-y-1 text-sm text-green-900">
                {userRanking.map((result, index) => {
                  const proposal = proposalById.get(result.taskId);
                  return (
                    <li key={result.taskId} className="flex gap-2">
                      <span className="font-mono text-xs text-green-600">{index + 1}.</span>
                      <span>{proposal ? proposalDisplayTitle(proposal) : result.taskId}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {!locked && (
            <div className="flex flex-wrap gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={handleContinue}>
                {tt('voting.comparative.updateBallot')}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleWithdraw} className="text-red-600">
                {tt('voting.comparative.withdrawBallot')}
              </Button>
            </div>
          )}
        </div>
      )}

      {!locked && !localSubmitted && currentBatch && (
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm text-gray-600 mb-4 text-center">
            {batchPhase === 'highest'
              ? tt('voting.comparative.pickHighest')
              : tt('voting.comparative.pickLowest')}
          </p>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {currentBatch.tasks.map((task) => {
              const disabled = batchPhase === 'lowest' && task.id === selectedHighestId;
              const proposal = proposalById.get(task.id);
              return (
                <div
                  key={task.id}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    if (batchPhase === 'highest') handleHighest(task.id);
                    else handleLowest(task.id);
                  }}
                  onKeyDown={(event) => {
                    if (disabled) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (batchPhase === 'highest') handleHighest(task.id);
                      else handleLowest(task.id);
                    }
                  }}
                  className={`text-left rounded-lg border p-4 transition-colors ${
                    disabled
                      ? 'opacity-40 cursor-not-allowed bg-gray-50'
                      : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900 mb-2">
                    {proposal ? proposalDisplayTitle(proposal) : task.title}
                  </p>
                  {proposal?.content && (
                    <div className="text-xs text-gray-500 line-clamp-4">
                      <ProposalContentDisplay content={proposal.content} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            {batchCount > 0 && (
              <Button size="sm" variant="ghost" onClick={() => void submit()} disabled={isSaving}>
                <Flag className="w-4 h-4 mr-1" />
                {tt('voting.comparative.submitBallot')}
              </Button>
            )}
          </div>
        </div>
      )}

      {!locked && !localSubmitted && !currentBatch && engineState && (
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm text-gray-700 mb-2">{tt('voting.comparative.readyToSubmit')}</p>
          <p className="text-xs text-gray-400 mb-4">
            {tt('voting.comparative.coveredPairs', { covered: coverage.coveredPairs, total: totalPairs })}
          </p>
          {userRanking.length > 0 && (
            <ol className="space-y-1 text-sm text-gray-800 mb-4">
              {userRanking.map((result, index) => {
                const proposal = proposalById.get(result.taskId);
                return (
                  <li key={result.taskId} className="flex gap-2">
                    <span className="font-mono text-xs text-gray-400">{index + 1}.</span>
                    <span>{proposal ? proposalDisplayTitle(proposal) : result.taskId}</span>
                  </li>
                );
              })}
            </ol>
          )}
          <Button onClick={() => void submit()} disabled={isSaving || comparisons.length === 0}>
            {isSaving ? tt('voting.comparative.saving') : tt('voting.comparative.submitBallot')}
          </Button>
        </div>
      )}
    </div>
  );
};
