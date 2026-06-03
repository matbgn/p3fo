import * as React from "react";
import { VoteLoop, VoteResponseEntity } from "@/lib/persistence-types";
import { MJ_SCALE } from "@/components/planView/constants";
import { tallyConsentLoop, ProposalLoopTally } from "@/lib/vote-tally";
import { getVotingStrings } from "@/lib/voting-i18n";
import { Badge } from "@/components/ui/badge";

interface LoopRoundTabsProps {
  loops: VoteLoop[];
  responses: VoteResponseEntity[];
  proposalId: string;
  proposalLabel?: string;
}

export const LoopRoundTabs: React.FC<LoopRoundTabsProps> = ({
  loops,
  responses,
  proposalId,
  proposalLabel,
}) => {
  const t = getVotingStrings();
  const tally = React.useMemo(
    () => tallyConsentLoop(loops, responses, [proposalId]),
    [loops, responses, proposalId]
  );

  const proposalTally: ProposalLoopTally | undefined = tally.proposals[0];

  if (!proposalTally || (proposalTally.perRound.length === 0 && !proposalTally.current)) {
    return (
      <p className="text-sm text-gray-400 italic">
        {t.messages.noRoundsYet}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {proposalLabel && (
        <h4 className="text-sm font-medium text-gray-700">{proposalLabel}</h4>
      )}

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
              {MJ_SCALE.map((grade) => (
                <th
                  key={grade.value}
                  className="text-center py-2 px-2 border-b font-medium text-gray-600"
                >
                  <div className="flex items-center justify-center gap-1">
                    <div className={`w-3 h-3 rounded ${grade.color}`}></div>
                    <span className="text-[10px]">{grade.label}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proposalTally.perRound.map((round) => {
              const medianGrade = MJ_SCALE.find(
                (g) => g.value === round.median
              );
              const isOpen = !round.closed;
              const roundTotal = MJ_SCALE.reduce(
                (sum, grade) => sum + (round.distribution[grade.value] || 0),
                0
              );
              const roundSegments = MJ_SCALE
                .map((grade) => ({
                  ...grade,
                  count: round.distribution[grade.value] || 0,
                  percentage:
                    roundTotal > 0
                      ? ((round.distribution[grade.value] || 0) / roundTotal) * 100
                      : 0,
                }))
                .filter((d) => d.count > 0);

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
                  <td
                    colSpan={MJ_SCALE.length}
                    className="py-2 px-2 border-b"
                  >
                    {roundTotal > 0 ? (
                      <div className="relative w-full h-6 flex rounded overflow-hidden bg-gray-100">
                        {roundSegments.map((item, index) => {
                          const isMedian = item.value === round.median;
                          const isFirst = index === 0;
                          const isLast = index === roundSegments.length - 1;
                          return (
                            <div
                              key={item.value}
                              className={`h-full flex items-center justify-center relative ${item.color} ${
                                isFirst ? "rounded-l" : ""
                              } ${isLast ? "rounded-r" : ""} ${
                                isMedian
                                  ? "ring-2 ring-white z-20 shadow-md scale-y-125 mx-0.5 rounded-sm origin-center"
                                  : ""
                              }`}
                              style={{ width: `${item.percentage}%` }}
                              title={`${item.label}: ${item.count} votes (${item.percentage.toFixed(1)}%)`}
                            >
                              {item.percentage >= 10 && (
                                <span
                                  className={`text-[10px] font-bold ${
                                    [1, 2].includes(item.value) ? "text-black" : "text-white"
                                  } drop-shadow-md`}
                                >
                                  {item.percentage.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="w-full h-6 bg-gray-50 rounded flex items-center justify-center text-[10px] text-gray-400">
                        —
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};