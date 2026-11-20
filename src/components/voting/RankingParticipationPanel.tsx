import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ParticipationSummary } from '@/components/voting/ParticipationSummary';
import { useVoteRankingParticipation } from '@/hooks/useVoteRanking';

interface RankingParticipationPanelProps {
  voteId: string;
  ownerId: string;
  moderatorToken?: string;
}

export const RankingParticipationPanel: React.FC<RankingParticipationPanelProps> = ({
  voteId,
  ownerId,
  moderatorToken,
}) => {
  const { t: tt } = useTranslation();
  const { summary, isLoading, error } = useVoteRankingParticipation(
    voteId,
    ownerId,
    moderatorToken,
    5000,
  );

  if (isLoading && !summary) {
    return <p className="text-sm text-gray-400">{tt('voting.comparative.loading')}</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!summary) {
    return <p className="text-sm text-gray-400">{tt('voting.comparative.noParticipation')}</p>;
  }

  return <ParticipationSummary summary={summary} showMetrics />;
};
