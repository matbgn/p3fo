import * as React from "react";
import {
  getPokerScale,
  pokerCardDescription,
  type PokerDescriptions,
  type PokerStats,
} from "@/lib/poker";
import type { PokerTallyLabels } from "@/lib/voting-i18n";
import { cn } from "@/lib/utils";

interface PokerTallyDisplayProps {
  tally: PokerStats;
  labels: PokerTallyLabels;
}

const formatStat = (value: number | null): string =>
  value === null ? "—" : value.toFixed(1);

export const PokerTallyDisplay: React.FC<PokerTallyDisplayProps> = ({
  tally,
  labels,
}) => {
  if (tally.total === 0) return null;

  const scale = getPokerScale(tally.scaleId);
  // `labels` already carries the description fields, so pass it straight through
  // instead of rebuilding a second mapping that can drift from i18n.
  const descriptions: PokerDescriptions = labels;
  const estimableCards = scale.cards.filter((card) => !card.special);
  const verdictCard = scale.cards.find((card) => card.label === tally.verdict);
  const specialCounts = [
    { card: scale.cards.find((card) => card.special === "unknown"), label: labels.unknown, count: tally.unknown },
    { card: scale.cards.find((card) => card.special === "coffee"), label: labels.coffee, count: tally.coffee },
  ].filter((entry) => entry.card && entry.count > 0);

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-1 space-y-3 duration-300">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-2">
          <span className="text-sm text-gray-600">{labels.verdict}</span>
          <span
            className={cn(
              "rounded px-2.5 py-1 font-semibold text-white",
              scale.emoji ? "text-xl" : "text-sm",
              verdictCard?.color ?? "bg-gray-500",
            )}
            title={
              verdictCard
                ? pokerCardDescription(verdictCard, descriptions)
                : undefined
            }
          >
            {tally.verdict}
            {scale.emoji && verdictCard && (
              <span className="ml-1 text-sm font-normal">
                {pokerCardDescription(verdictCard, descriptions)}
              </span>
            )}
          </span>
        </span>
        {scale.numeric && tally.estimable > 0 && (
          <>
            <span className="text-sm text-gray-600">
              {labels.average}{" "}
              <span className="font-semibold text-gray-900">
                {formatStat(tally.average)}
              </span>
            </span>
            <span className="text-sm text-gray-600">
              {labels.standardDeviation}{" "}
              <span className="font-semibold text-gray-900">
                {formatStat(tally.standardDeviation)}
              </span>
            </span>
          </>
        )}
        <span className="text-xs text-gray-500">
          {tally.total} {tally.total === 1 ? labels.voter : labels.voters}
        </span>
      </div>

      {tally.estimable > 0 && (
        <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
          {estimableCards.map((card) => {
            const count = tally.distribution[card.value] ?? 0;
            if (count === 0) return null;
            return (
              <div
                key={card.value}
                className={card.color}
                style={{ width: `${(count / tally.estimable) * 100}%` }}
                title={`${pokerCardDescription(card, descriptions) ?? card.label}: ${count}`}
              />
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {estimableCards.map((card) => {
          const count = tally.distribution[card.value] ?? 0;
          return (
            <span
              key={card.value}
              className={cn(
                "rounded border px-2 py-1 text-xs font-medium",
                count > 0
                  ? "bg-white text-gray-800"
                  : "bg-gray-50 text-gray-400",
              )}
              title={`${pokerCardDescription(card, descriptions) ?? card.label}: ${count}`}
            >
              <span className={scale.emoji ? "text-base" : undefined}>
                {card.label}
              </span>
              {scale.emoji && (
                <span className="ml-1 text-[10px] font-normal text-gray-500">
                  {pokerCardDescription(card, descriptions)}
                </span>
              )}{" "}
              <span className="text-gray-400">×{count}</span>
            </span>
          );
        })}
        {specialCounts.map(({ card, label, count }) => (
          <span
            key={card!.value}
            className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"
            title={`${label}: ${count}`}
          >
            <span className={scale.emoji ? "text-base" : undefined}>
              {card!.label}
            </span>{" "}
            {scale.emoji && <span className="text-[10px]">{label}</span>}{" "}
            {count}
          </span>
        ))}
      </div>
    </div>
  );
};
