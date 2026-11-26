import * as React from "react";
import { getVotingStrings } from "@/lib/voting-i18n";
import { SCHEDULING_STATUS_SWATCH_CLASS } from "./schedulingCalendarInteraction";

interface SchedulingLegendProps {
  /** Show the "best times" marker. */
  showBest: boolean;
  /** Flow-specific hint; `undefined` hides it (read-only calendar). */
  helpText?: string;
  /**
   * The heatmap renders the third bucket as unavailable / no answer in a
   * neutral gray; the selection palette keeps the explicit red unavailable.
   */
  mode?: "selection" | "heatmap";
}

/**
 * Availability legend shared by the time-grid and month calendars. One copy so
 * the answer palette and labels cannot drift between the two views.
 */
export const SchedulingLegend: React.FC<SchedulingLegendProps> = ({
  showBest,
  helpText,
  mode = "selection",
}) => {
  const ts = getVotingStrings();
  const unavailableSwatch =
    mode === "heatmap" ? "bg-gray-300" : SCHEDULING_STATUS_SWATCH_CLASS[-1];
  const unavailableLabel =
    mode === "heatmap"
      ? ts.scheduling.unavailableNoAnswer
      : ts.scheduling.unavailable;
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
      <span className="inline-flex items-center gap-1">
        <span
          className={`h-2.5 w-2.5 rounded-sm ${SCHEDULING_STATUS_SWATCH_CLASS[1]}`}
        />
        {ts.scheduling.available}
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          className={`h-2.5 w-2.5 rounded-sm ${SCHEDULING_STATUS_SWATCH_CLASS[0]}`}
        />
        {ts.scheduling.ifNeeded}
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          className={`h-2.5 w-2.5 rounded-sm ${unavailableSwatch}`}
        />
        {unavailableLabel}
      </span>
      {showBest && (
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm border-2 border-blue-600" />
          {ts.scheduling.bestTimes}
        </span>
      )}
      {helpText && <span className="text-gray-400">{helpText}</span>}
    </div>
  );
};
