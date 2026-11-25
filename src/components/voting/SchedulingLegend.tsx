import * as React from "react";
import { getVotingStrings } from "@/lib/voting-i18n";
import { SCHEDULING_STATUS_SWATCH_CLASS } from "./schedulingCalendarInteraction";

interface SchedulingLegendProps {
  /** Show the "best times" marker. */
  showBest: boolean;
  /** Flow-specific hint; `undefined` hides it (read-only calendar). */
  helpText?: string;
}

/**
 * Availability legend shared by the time-grid and month calendars. One copy so
 * the answer palette and labels cannot drift between the two views.
 */
export const SchedulingLegend: React.FC<SchedulingLegendProps> = ({
  showBest,
  helpText,
}) => {
  const ts = getVotingStrings();
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
          className={`h-2.5 w-2.5 rounded-sm ${SCHEDULING_STATUS_SWATCH_CLASS[-1]}`}
        />
        {ts.scheduling.unavailable}
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
