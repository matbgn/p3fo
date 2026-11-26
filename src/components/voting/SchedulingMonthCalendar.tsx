import * as React from "react";
import { Temporal } from "@js-temporal/polyfill";
import type { VoteProposal } from "@/lib/persistence-types";
import {
  activeSchedulingSlots,
  formatSchedulingDateKey,
  formatSchedulingDay,
  getFormatter,
} from "@/lib/scheduling";
import { getVotingStrings } from "@/lib/voting-i18n";
import { cn } from "@/lib/utils";
import type { SchedulingHeatmap } from "./SchedulingCalendar";
import { SchedulingLegend } from "./SchedulingLegend";
import {
  schedulingAnswerDotClass,
  schedulingHeatmapBackground,
  schedulingHeatmapCountLabel,
  schedulingHeatmapTitle,
  schedulingStatusClass,
  schedulingStatusLabel,
  schedulingStatusMark,
  useSchedulingPaint,
} from "./schedulingCalendarInteraction";

interface SchedulingMonthCalendarProps {
  slots: VoteProposal[];
  timeZone: string;
  values?: Record<string, number>;
  paintMode?: number;
  onPaint?: (slotIds: string[], value: number | null) => void;
  readOnly?: boolean;
  heatmap?: SchedulingHeatmap | null;
  bestSlotIds?: string[];
}

interface MonthGrid {
  key: string;
  label: string;
  candidateCount: number;
  days: Temporal.PlainDate[];
}

function formatMonthLabel(first: Temporal.PlainDate): string {
  // Shared cache: the month grid re-renders on every paint, and this label was
  // rebuilding an `Intl.DateTimeFormat` each time.
  const formatter = getFormatter(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  if (!formatter) return `${first.year}-${String(first.month).padStart(2, "0")}`;
  try {
    return formatter.format(
      new Date(Date.UTC(first.year, first.month - 1, 1)),
    );
  } catch {
    return `${first.year}-${String(first.month).padStart(2, "0")}`;
  }
}

function weekdayLabels(): string[] {
  const formatter = getFormatter(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });
  if (!formatter) return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  try {
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(Date.UTC(2024, 0, 1 + index))),
    );
  } catch {
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  }
}

export const SchedulingMonthCalendar: React.FC<
  SchedulingMonthCalendarProps
> = ({
  slots,
  timeZone,
  values = {},
  paintMode = 1,
  onPaint,
  readOnly = false,
  heatmap = null,
  bestSlotIds = [],
}) => {
  const ts = getVotingStrings();
  const interactive = !heatmap && !readOnly;
  const { handlePointerDown, handlePointerEnter, handleKeyDown } =
    useSchedulingPaint({ enabled: interactive, paintMode, onPaint });

  const { byDate, dayLabels, months } = React.useMemo(() => {
    const active = activeSchedulingSlots(slots);

    const dateMap = new Map<string, VoteProposal>();
    // Formatted once per slot set: the grid re-renders on every paint update
    // and poll refresh, so an inline `formatSchedulingDay` per cell repeated
    // the same Intl work for every candidate day on every render.
    const dayLabels = new Map<string, string>();
    for (const slot of active) {
      const key = formatSchedulingDateKey(slot.timeSlot?.startAt ?? "", timeZone);
      if (!key) continue;
      if (!dateMap.has(key)) {
        dateMap.set(key, slot);
        dayLabels.set(
          key,
          formatSchedulingDay(slot.timeSlot?.startAt ?? "", timeZone),
        );
      }
    }

    const monthKeys = new Set<string>();
    for (const key of dateMap.keys()) monthKeys.add(key.slice(0, 7));

    const months: MonthGrid[] = [...monthKeys]
      .sort()
      .map((monthKey) => {
        const first = Temporal.PlainDate.from(`${monthKey}-01`);
        const offset = first.dayOfWeek - 1;
        const weeksNeeded = Math.ceil((offset + first.daysInMonth) / 7);
        const gridStart = first.subtract({ days: offset });
        const days: Temporal.PlainDate[] = [];
        for (let index = 0; index < weeksNeeded * 7; index += 1) {
          days.push(gridStart.add({ days: index }));
        }
        const candidateCount = [...dateMap.keys()].filter(
          (key) => key.slice(0, 7) === monthKey,
        ).length;
        return {
          key: monthKey,
          label: formatMonthLabel(first),
          candidateCount,
          days,
        };
      });

    return { byDate: dateMap, dayLabels, months };
  }, [slots, timeZone]);

  const best = React.useMemo(() => new Set(bestSlotIds), [bestSlotIds]);
  const labels = React.useMemo(() => weekdayLabels(), []);

  if (months.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">{ts.scheduling.noSlots}</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-4">
        {months.map((month) => (
          <div key={month.key} className="w-full max-w-md space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-gray-700">{month.label}</p>
              <span className="text-[11px] text-gray-400">
                {month.candidateCount} {ts.scheduling.days}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-[10px] font-medium uppercase text-gray-400">
              {labels.map((label) => (
                <span key={label} className="text-center">
                  {label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 select-none">
              {month.days.map((date) => {
                const key = date.toString();
                const inMonth = date.month === Number(month.key.slice(5, 7));
                const slot = byDate.get(key);

                if (!inMonth) {
                  return (
                    <div
                      key={key}
                      aria-hidden="true"
                      className="aspect-square min-h-10 rounded"
                    />
                  );
                }

                if (!slot) {
                  return (
                    <div
                      key={key}
                      className="flex aspect-square min-h-10 items-center justify-center rounded border border-transparent text-xs text-gray-300"
                    >
                      {date.day}
                    </div>
                  );
                }

                const value = values[slot.id];
                const cell = heatmap?.bySlot.get(slot.id);
                const isBest = best.has(slot.id);
                const dayLabel = dayLabels.get(key) ?? "";

                if (heatmap) {
                  return (
                    <div
                      key={key}
                      role="img"
                      aria-label={schedulingHeatmapTitle(
                        dayLabel,
                        ts.scheduling,
                        cell,
                      )}
                      title={schedulingHeatmapTitle(
                        dayLabel,
                        ts.scheduling,
                        cell,
                      )}
                      className={cn(
                        "relative flex aspect-square min-h-10 items-center justify-center rounded border border-gray-200 text-sm font-medium text-gray-900",
                        isBest && "ring-2 ring-blue-600 ring-inset",
                      )}
                      style={{
                        background: schedulingHeatmapBackground(
                          cell,
                          heatmap.totalVoters,
                        ),
                      }}
                    >
                      {date.day}
                      <span className="absolute bottom-0.5 text-[10px] leading-none opacity-70">
                        {schedulingHeatmapCountLabel(cell)}
                      </span>
                      {value !== undefined && (
                        <span
                          className={cn(
                            "absolute right-1 top-1 h-1.5 w-1.5 rounded-full",
                            schedulingAnswerDotClass(value),
                          )}
                        />
                      )}
                    </div>
                  );
                }

                return candidateButton(slot, date.day, value, isBest, dayLabel);
              })}
            </div>
          </div>
        ))}
      </div>
      <SchedulingLegend
        showBest={best.size > 0}
        mode={heatmap ? "heatmap" : "selection"}
        helpText={interactive ? ts.scheduling.selectDaysHelp : undefined}
      />
    </div>
  );

  function candidateButton(
    slot: VoteProposal,
    dayNumber: number,
    value: number | undefined,
    isBest: boolean,
    dayLabel: string,
  ) {
    return (
      <button
        key={slot.id}
        type="button"
        aria-label={`${dayLabel} \u2014 ${
          schedulingStatusLabel(value, ts.scheduling) ??
          ts.scheduling.available
        }`}
        aria-pressed={value !== undefined}
        disabled={!interactive}
        className={cn(
          "relative flex aspect-square min-h-10 flex-col items-center justify-center rounded border text-sm font-medium transition-colors",
          schedulingStatusClass(value, "text-gray-500"),
          isBest && "ring-2 ring-blue-600 ring-inset",
          !interactive && "cursor-default",
        )}
        style={{ touchAction: "none" }}
        onPointerDown={(event) => handlePointerDown(slot, value, event)}
        onPointerEnter={() => handlePointerEnter(slot)}
        onKeyDown={(event) => handleKeyDown(slot, value, event)}
      >
        <span>{dayNumber}</span>
        {value !== undefined && (
          <span className="text-[10px] leading-none">
            {schedulingStatusMark(value)}
          </span>
        )}
      </button>
    );
  }
};
