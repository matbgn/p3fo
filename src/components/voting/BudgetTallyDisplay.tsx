import * as React from "react";
import { formatBudgetAmount, type BudgetTally } from "@/lib/budget";

export interface BudgetTallyLabels {
  backers: string;
  shareOfBudget: string;
}

interface BudgetTallyDisplayProps {
  tally: BudgetTally;
  /** Face value of every participant's budget, used for the share bar. */
  totalBudget?: number;
  labels: BudgetTallyLabels;
  /**
   * Formats the amount. Defaults to the fixed-note money format; a flexible
   * points vote passes a points formatter so it is not shown as dollars.
   */
  formatAmount?: (value: number) => string;
  /** Leading glyph; defaults to the money icon used by fixed-note budgets. */
  icon?: string;
}

/**
 * The per-proposal result of a budget vote: the amount it received and how many
 * voters backed it. The percentage is relative to the aggregate budget the
 * group had to spend, which is the readable form the practice recommends.
 */
export const BudgetTallyDisplay: React.FC<BudgetTallyDisplayProps> = ({
  tally,
  totalBudget,
  labels,
  formatAmount = formatBudgetAmount,
  icon = "💵",
}) => {
  if (tally.total <= 0) return null;
  const share =
    typeof totalBudget === "number" && totalBudget > 0
      ? Math.min(100, (tally.total / totalBudget) * 100)
      : null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5">
          <span className="text-lg">{icon}</span>
          <span className="font-medium">{formatAmount(tally.total)}</span>
        </span>
        <span className="text-xs text-gray-500">
          {tally.backers} {labels.backers}
        </span>
        {share !== null && (
          <span className="text-xs text-gray-400">
            {share.toFixed(0)}% {labels.shareOfBudget}
          </span>
        )}
      </div>
      {share !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${share}%` }}
          />
        </div>
      )}
    </div>
  );
};
