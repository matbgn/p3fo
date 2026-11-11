import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, BarChart3, Layers, Trophy, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ProposalContentDisplay } from './ProposalContentDisplay';
import type { VoteEntity, VoteRankingResult } from '@/lib/persistence-types';
import { proposalDisplayTitle } from '@/lib/vote-ranking';
import { useVoteRankingResults } from '@/hooks/useVoteRanking';
import { RankingExportMenu } from '@/components/RankingExportMenu';

interface PartialRankingResultsProps {
  vote: VoteEntity;
  canExport?: boolean;
}

export const PartialRankingResults: React.FC<PartialRankingResultsProps> = ({ vote, canExport = false }) => {
  const { t: tt } = useTranslation();
  // A finalized vote already carries its authoritative ranking snapshot; do not
  // let a transient results fetch failure hide data we already have.
  const hasStoredResult = Boolean(vote.outcome?.ranking);
  const { data, isLoading, error } = useVoteRankingResults(vote.slug, !hasStoredResult);
  const result: VoteRankingResult | null =
    vote.outcome?.ranking ?? data?.result ?? null;
  const hidden = hasStoredResult ? false : data?.hidden ?? false;
  const participantCount = data?.participantCount ?? result?.participantCount ?? 0;
  const proposalById = new Map(vote.proposals.map((proposal) => [proposal.id, proposal]));

  if (isLoading && !result) {
    return <p className="text-sm text-gray-400">{tt('voting.comparative.loading')}</p>;
  }
  if (error && !result) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (hidden) {
    return (
      <div className="rounded-lg border bg-white p-5 text-sm text-gray-500">
        {tt('voting.comparative.resultsHidden')}
        {participantCount > 0 && (
          <span className="block mt-1 text-xs text-gray-400">
            {tt('voting.comparative.submittedCount', { count: participantCount })}
          </span>
        )}
      </div>
    );
  }
  if (!result || result.groups.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-5 text-sm text-gray-500">
        {tt('voting.comparative.noBallots')}
      </div>
    );
  }

  const top = result.groups[0];
  // A finalized comparative vote can resolve a tied top group to a chosen
  // winner; reflect that authoritative outcome instead of still calling it tied.
  const resolvedWinnerId = vote.outcome?.winningProposalId ?? null;
  const topTied =
    top.proposalIds.length > 1 &&
    !(resolvedWinnerId && top.proposalIds.includes(resolvedWinnerId));
  // Derive every title once per render instead of re-parsing each proposal's
  // content for the export list and again for the JSX (the public page
  // re-renders on its 5s vote poll). Skip the export list entirely when export
  // is disabled so the public page never pays for it.
  const titleById = new Map(
    vote.proposals.map((proposal) => [proposal.id, proposalDisplayTitle(proposal)]),
  );
  const plainTitle = (id: string) => titleById.get(id) ?? id;
  const exportItems = canExport
    ? result.groups.flatMap((group) =>
        group.proposalIds.map((id) => ({
          rank: group.rank,
          id,
          title: plainTitle(id),
          score: group.score,
          tied: group.proposalIds.length > 1,
        })),
      )
    : [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Layers className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-semibold text-gray-900">
            {tt('voting.comparative.collectiveRanking')}
          </h3>
          <Badge variant={topTied ? 'secondary' : 'default'}>
            {topTied
              ? tt('voting.comparative.tied')
              : tt('voting.comparative.winner')}
          </Badge>
          {canExport && (
            <RankingExportMenu
              items={exportItems}
              filename={`vote-${vote.slug}-ranking`}
              className="ml-auto"
            />
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {tt('voting.comparative.submittedCount', { count: result.participantCount })}
          </span>
          <span className="flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5" />
            {tt('voting.comparative.coverage', { percent: Math.round(result.coverage.mean) })}
          </span>
          <span>{tt('voting.comparative.method')}</span>
        </div>
        {result.condorcetWinnerId && (
          <p className="mt-3 text-xs text-green-700">
            {tt('voting.comparative.condorcetWinner')}:{' '}
            {plainTitle(result.condorcetWinnerId)}
          </p>
        )}
        {result.hasMajorityCycle && !result.condorcetWinnerId && (
          <p className="mt-3 text-xs text-amber-700 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {tt('voting.comparative.majorityCycle')}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {result.groups.map((group, index) => {
          const isTop = index === 0;
          const groupTied =
            group.proposalIds.length > 1 &&
            !(resolvedWinnerId && group.proposalIds.includes(resolvedWinnerId));
          return (
            <div
              key={`${group.rank}-${group.proposalIds.join('-')}`}
              className={`rounded-lg border p-4 ${
                isTop ? 'border-blue-300 bg-blue-50' : 'bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs text-gray-400">#{group.rank}</span>
                {isTop && <Trophy className="w-4 h-4 text-blue-600" />}
                {groupTied && (
                  <Badge variant="secondary">{tt('voting.comparative.tied')}</Badge>
                )}
                <span className="text-xs text-gray-400">
                  {tt('voting.comparative.score')}: {group.score.toFixed(3)}
                </span>
              </div>
              <div className="space-y-3">
                {group.proposalIds.map((proposalId) => {
                  const proposal = proposalById.get(proposalId);
                  return (
                    <div key={proposalId}>
                      <p className="text-sm font-medium text-gray-900">
                        {plainTitle(proposalId)}
                        {proposalId === resolvedWinnerId && (
                          <Badge variant="default" className="ml-2">
                            {tt('voting.comparative.winner')}
                          </Badge>
                        )}
                      </p>
                      {proposal?.content && (
                        <div className="mt-1 text-xs text-gray-500">
                          <ProposalContentDisplay content={proposal.content} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
