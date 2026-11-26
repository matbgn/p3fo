import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { VoteProposal } from "@/lib/persistence-types";
import {
  activeSchedulingSlots,
  formatSchedulingDateKey,
  formatSchedulingInstant,
  formatSchedulingRange,
  formatSchedulingTimeKey,
} from "@/lib/scheduling";
import type { SchedulingHeatmap } from "@/lib/scheduling";
import { getVotingStrings } from "@/lib/voting-i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

export type { SchedulingHeatmap };

interface SchedulingCalendarProps {
  slots: VoteProposal[];
  timeZone: string;
  values?: Record<string, number>;
  paintMode?: number;
  onPaint?: (slotIds: string[], value: number | null) => void;
  readOnly?: boolean;
  heatmap?: SchedulingHeatmap | null;
  bestSlotIds?: string[];
}

interface CalendarDate {
  key: string;
  label: string;
  fullLabel: string;
}

/**
 * Cap on date × time cells rendered at once. A legitimately generated grid has
 * roughly one cell per slot (bounded by `MAX_SCHEDULING_SLOTS`), but a pruned or
 * crafted slot set can put a handful of different times on many dates and turn
 * the cross product into six figures. Paginate the date columns so the rendered
 * cell count stays bounded and every date remains reachable.
 */
const CALENDAR_MAX_CELLS_PER_PAGE = 4000;

function timeKey(iso: string, timeZone: string): string {
  // Delegates to the shared formatter cache: the grid builds one label per
  // slot, and an uncached `Intl.DateTimeFormat` here was constructed per slot.
  return formatSchedulingTimeKey(iso, timeZone);
}

export const SchedulingCalendar: React.FC<SchedulingCalendarProps> = ({
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
  const { handlePointerDown, handlePointerEnter, handleKeyDown } =
    useSchedulingPaint({ enabled: !readOnly, paintMode, onPaint });

  const { dates, times, slotAt, rangeBySlot } = React.useMemo(() => {
    const active = activeSchedulingSlots(slots);
    const dateMap = new Map<string, CalendarDate>();
    const timeSet = new Set<string>();
    const cells = new Map<string, VoteProposal>();
    // Formatted once per slot set instead of once per cell per render: the
    // grid re-renders on every drag-paint update and poll refresh, and
    // `formatSchedulingRange` runs several Intl calls per cell.
    const rangeBySlot = new Map<string, string>();

    for (const slot of active) {
      const startAt = slot.timeSlot?.startAt ?? "";
      const key = formatSchedulingDateKey(startAt, timeZone);
      const time = timeKey(startAt, timeZone);
      if (!key || !time) continue;
      if (!dateMap.has(key)) {
        dateMap.set(key, {
          key,
          label: formatSchedulingInstant(startAt, timeZone, {
            weekday: "short",
            month: "short",
            day: "numeric",
          }),
          fullLabel: formatSchedulingInstant(startAt, timeZone, {
            weekday: "long",
            month: "long",
            day: "numeric",
          }),
        });
      }
      rangeBySlot.set(
        slot.id,
        formatSchedulingRange(
          startAt,
          slot.timeSlot?.endAt ?? "",
          timeZone,
        ),
      );
      timeSet.add(time);
      cells.set(`${key}|${time}`, slot);
    }

    return {
      dates: [...dateMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
      times: [...timeSet].sort(),
      slotAt: cells,
      rangeBySlot,
    };
  }, [slots, timeZone]);

  const best = React.useMemo(() => new Set(bestSlotIds), [bestSlotIds]);

  const [datePage, setDatePage] = React.useState(0);
  const datesPerPage = Math.max(
    1,
    Math.floor(CALENDAR_MAX_CELLS_PER_PAGE / Math.max(1, times.length)),
  );
  const datePageCount = Math.max(1, Math.ceil(dates.length / datesPerPage));
  // Clamp in render so a shrinking slot set cannot strand the viewer on an
  // out-of-range page.
  const datePageIndex = Math.min(datePage, datePageCount - 1);
  const visibleDates = dates.slice(
    datePageIndex * datesPerPage,
    (datePageIndex + 1) * datesPerPage,
  );

  if (dates.length === 0 || times.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">{ts.scheduling.noSlots}</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="border-collapse text-xs select-none">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white border-b border-r px-2 py-1 text-left font-medium text-gray-500">
                {ts.scheduling.time}
              </th>
              {visibleDates.map((date) => (
                <th
                  key={date.key}
                  className="border-b border-l px-2 py-1 text-center font-medium text-gray-600 whitespace-nowrap"
                  title={date.fullLabel}
                >
                  {date.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((time) => (
              <tr key={time}>
                <th className="sticky left-0 z-10 bg-white border-b border-r px-2 py-1 text-left font-normal text-gray-500 whitespace-nowrap">
                  {time}
                </th>
                {visibleDates.map((date) => {
                  const slot = slotAt.get(`${date.key}|${time}`);
                  if (!slot) {
                    return (
                      <td
                        key={`${date.key}|${time}`}
                        className="border-b border-l bg-gray-50/60 px-1 py-0.5"
                      />
                    );
                  }
                  const value = values[slot.id];
                  const cell = heatmap?.bySlot.get(slot.id);
                  const isBest = best.has(slot.id);
                  const label = `${date.fullLabel} ${time} — ${
                    schedulingStatusLabel(value, ts.scheduling) ??
                    ts.scheduling.available
                  }`;
                  if (heatmap) {
                    const heatmapLabel = schedulingHeatmapTitle(
                      label,
                      ts.scheduling,
                      cell,
                    );
                    return (
                      <td
                        key={`${date.key}|${time}`}
                        className="border-b border-l p-0.5"
                      >
                        <div
                          role="img"
                          aria-label={heatmapLabel}
                          title={schedulingHeatmapTitle(
                            rangeBySlot.get(slot.id) ?? "",
                            ts.scheduling,
                            cell,
                          )}
                          className={cn(
                            "relative flex h-8 min-w-[2.75rem] items-center justify-center rounded border border-gray-200 text-[11px] font-medium text-gray-900",
                            isBest && "ring-2 ring-blue-600 ring-inset",
                          )}
                          style={{
                            background: schedulingHeatmapBackground(
                              cell,
                              heatmap.totalVoters,
                            ),
                          }}
                        >
                          {schedulingHeatmapCountLabel(cell)}
                          {value !== undefined && (
                            <span
                              className={cn(
                                "absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full",
                                schedulingAnswerDotClass(value),
                              )}
                            />
                          )}
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={`${date.key}|${time}`}
                      className="border-b border-l p-0.5"
                    >
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={value !== undefined}
                        disabled={readOnly}
                        title={`${rangeBySlot.get(slot.id) ?? ""}`}
                        className={cn(
                          "flex h-8 min-w-[2.75rem] items-center justify-center rounded border text-xs font-medium transition-colors",
                          schedulingStatusClass(value, "text-gray-300"),
                          isBest && "ring-2 ring-blue-600 ring-inset",
                          readOnly && "cursor-default",
                        )}
                        style={{ touchAction: "none" }}
                        onPointerDown={(event) =>
                          handlePointerDown(slot, value, event)
                        }
                        onPointerEnter={() => handlePointerEnter(slot)}
                        onKeyDown={(event) =>
                          handleKeyDown(slot, value, event)
                        }
                      >
                        {schedulingStatusMark(value)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {datePageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
          <span>
            {datePageIndex + 1} / {datePageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            type="button"
            className="h-7 px-2"
            disabled={datePageIndex === 0}
            onClick={() => setDatePage(datePageIndex - 1)}
            aria-label="Previous dates"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            type="button"
            className="h-7 px-2"
            disabled={datePageIndex >= datePageCount - 1}
            onClick={() => setDatePage(datePageIndex + 1)}
            aria-label="Next dates"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <SchedulingLegend
        showBest={best.size > 0}
        mode={heatmap ? "heatmap" : "selection"}
        helpText={readOnly ? undefined : ts.scheduling.selectSlotsHelp}
      />
    </div>
  );
};
