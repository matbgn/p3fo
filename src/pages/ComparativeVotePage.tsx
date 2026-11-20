import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, ListOrdered } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { VoteEntity } from '@/lib/persistence-types';
import { getVotingStrings } from '@/lib/voting-i18n';
import { areRankingResultsVisible } from '@/lib/vote-ranking';
import { ComparativeVoteBallot } from '@/components/voting/ComparativeVoteBallot';
import { PartialRankingResults } from '@/components/voting/PartialRankingResults';
import { VoteOutcomeBanner } from '@/components/voting/VoteResults';

interface ComparativeVotePageProps {
  vote: VoteEntity;
  slug: string;
  voterToken: string;
}

export const ComparativeVotePage: React.FC<ComparativeVotePageProps> = ({
  vote,
  slug,
  voterToken,
}) => {
  const { t: tt } = useTranslation();
  const ts = getVotingStrings();
  const isOpen = vote.config.phase === 'OPEN';
  const isFinalized = vote.config.phase === 'FINALIZED';
  const isClosed = vote.config.phase === 'CLOSED' || isFinalized;
  // Same rule the server uses to decide whether ranking results may be shown.
  const showResults = areRankingResultsVisible(vote);
  const [resultsRefreshKey, setResultsRefreshKey] = React.useState(0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {isFinalized && vote.outcome && (
          <div className="mb-6">
            <VoteOutcomeBanner vote={vote} />
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge
              variant={
                isFinalized
                  ? 'destructive'
                  : isClosed
                    ? 'outline'
                    : isOpen
                      ? 'default'
                      : 'secondary'
              }
            >
              {ts.phases[vote.config.phase] || vote.config.phase}
            </Badge>
            <Badge variant="outline">{ts.kinds[vote.config.kind] || vote.config.kind}</Badge>
            <Badge variant="outline">
              <ListOrdered className="w-3 h-3 mr-1" />
              {ts.modes[vote.config.mode] ?? vote.config.mode}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{vote.title}</h1>
          {vote.description && <p className="text-gray-600 mb-4">{vote.description}</p>}
          <div className="flex items-center gap-4 text-sm text-gray-400">
            {vote.config.closeAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {tt('voting.closesPrefix')} {new Date(vote.config.closeAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {!isOpen && !isClosed && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-center">
            <p className="text-yellow-700">{ts.messages.notOpenForResponses}</p>
          </div>
        )}
        {isClosed && !isFinalized && (
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 mb-6 text-center">
            <p className="text-gray-600">{ts.messages.closedNoMoreResponses}</p>
          </div>
        )}

        {isOpen && (
          <ComparativeVoteBallot
            vote={vote}
            slug={slug}
            voterToken={voterToken}
            onSubmitted={() => setResultsRefreshKey((value) => value + 1)}
          />
        )}

        {showResults && (
          <div className="mt-6">
            <PartialRankingResults key={resultsRefreshKey} vote={vote} />
          </div>
        )}
      </div>
    </div>
  );
};
