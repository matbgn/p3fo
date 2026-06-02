import * as React from "react";
import { VoteLoop, VoteResponseEntity } from "@/lib/persistence-types";
import { MJ_SCALE } from "@/components/planView/constants";
import { tallyConsentLoop } from "@/lib/vote-tally";
import { getVotingStrings } from "@/lib/voting-i18n";
import { Badge } from "@/components/ui/badge";

interface LoopRoundTabsProps {
  loops: VoteLoop[];
  responses: VoteResponseEntity[];
  proposalId: string;
  maxRounds?: number;
}

export const LoopRoundTabs: React.FC<LoopRoundTabsProps> = ({
  loops,
  responses,
  proposalId,
  maxRounds,
}) => {
  const t = getVotingStrings();
  const tally = React.useMemo(
    () => tallyConsentLoop(loops, responses, proposalId),
    [loops, responses, proposalId]
  );

  if (tally.perRound.length === 0 && !tally.current) {
    return (
      <p className="text-sm text-gray-400 italic">
        {t.messages.noRoundsYet}
      </p>
    );
  }

  const sortedScale = [...MJ_SCALE].sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left py-2 px-3 border-b font-medium text-gray-600">
                {t.labels.round}
              </th>
              <th className="text-center py-2 px-3 border-b font-medium text-gray-600">
                {t.labels.median}
              </th>
              <th className="text-center py-2 px-3 border-b font-medium text-gray-600">
                {t.labels.status}
              </th>
              {sortedScale.map((grade) => (
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
              const medianGrade = MJ_SCALE.find(
                (g) => g.value === round.median
              );
              const isOpen = !round.closed;

              return (
                <tr
                  key={round.loopId}
                  className={
                    isOpen
                      ? "bg-blue-50 border-l-4 border-l-blue-400"
                      : "hover:bg-gray-50"
                  }
                >
                  <td className="py-2 px-3 border-b font-medium">
                    {t.labels.round} {round.roundNumber}
                  </td>
                  <td className="py-2 px-3 border-b text-center">
                    {round.median !== undefined && medianGrade && (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs text-white ${medianGrade.color}`}
                      >
                        {medianGrade.icon} {medianGrade.label}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 border-b text-center">
                    {isOpen ? (
                      <Badge variant="default">{t.phases.OPEN}</Badge>
                    ) : round.adopted ? (
                      <Badge className="bg-green-600">{t.messages.consentLoopAdopted.split("—")[0].trim()}</Badge>
                    ) : (
                      <Badge variant="outline">{t.phases.CLOSED}</Badge>
                    )}
                  </td>
                  {sortedScale.map((grade) => {
                    const count = round.distribution[grade.value] || 0;
                    const total = Object.values(round.distribution).reduce(
                      (s, v) => s + v,
                      0
                    );
                    const pct = total > 0 ? (count / total) * 100 : 0;

                    return (
                      <td
                        key={grade.value}
                        className="py-2 px-2 border-b text-center"
                        title={`${grade.label}: ${count}`}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="font-medium text-xs">{count}</span>
                          {count > 0 && (
                            <div className="w-8 h-1 rounded-full overflow-hidden bg-gray-100">
                              <div
                                className={`h-full rounded-full ${grade.color}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {maxRounds && (
        <p className="text-xs text-gray-400">
          {t.labels.maxRounds}: {maxRounds} ({t.labels.rounds.toLowerCase()}: {tally.perRound.length})
        </p>
      )}
    </div>
  );
};