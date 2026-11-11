import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Clock, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useVoteRankingParticipation } from '@/hooks/useVoteRanking';

interface RankingParticipationPanelProps {
  voteId: string;
  ownerId: string;
  moderatorToken?: string;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  submitted: 'default',
  editing: 'secondary',
  in_progress: 'outline',
  stalled: 'destructive',
};

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

  const counts = summary.counts;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="rounded-lg border bg-white p-3">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Users className="w-3.5 h-3.5" /> {tt('voting.comparative.seen')}
          </div>
          <p className="text-xl font-semibold text-gray-900">{counts.seen}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <CheckCircle2 className="w-3.5 h-3.5" /> {tt('voting.comparative.submitted')}
          </div>
          <p className="text-xl font-semibold text-green-700">{counts.submitted}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5" /> {tt('voting.comparative.inProgress')}
          </div>
          <p className="text-xl font-semibold text-blue-700">
            {counts.inProgress + counts.editing}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <AlertTriangle className="w-3.5 h-3.5" /> {tt('voting.comparative.earlyConverged')}
          </div>
          <p className="text-xl font-semibold text-amber-700">{counts.earlyConverged}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <AlertTriangle className="w-3.5 h-3.5" /> {tt('voting.comparative.stalled')}
          </div>
          <p className="text-xl font-semibold text-red-700">{counts.stalled}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            {tt('voting.comparative.editing')}
          </div>
          <p className="text-xl font-semibold text-gray-700">{counts.editing}</p>
        </div>
      </div>

      {summary.ballots.length === 0 ? (
        <p className="text-sm text-gray-400">{tt('voting.comparative.noParticipation')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="px-3 py-2 border-b">{tt('voting.comparative.participant')}</th>
                <th className="px-3 py-2 border-b">{tt('voting.comparative.status')}</th>
                <th className="px-3 py-2 border-b">{tt('voting.comparative.coverage')}</th>
                <th className="px-3 py-2 border-b">{tt('voting.comparative.confidence')}</th>
                <th className="px-3 py-2 border-b">{tt('voting.comparative.lastSeen')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.ballots.map((ballot) => (
                <tr key={ballot.alias} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {ballot.displayName || ballot.alias}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_VARIANT[ballot.status] || 'outline'}>
                      {tt(`voting.comparative.status_${ballot.status}`)}
                    </Badge>
                    {ballot.earlyConverged && (
                      <Badge variant="secondary" className="ml-1">
                        {tt('voting.comparative.earlyConverged')}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {Math.round(ballot.coveragePercent)}%
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {Math.round(ballot.confidencePercent)}%
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">
                    {new Date(ballot.lastSeenAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
