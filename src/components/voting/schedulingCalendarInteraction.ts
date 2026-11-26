import * as React from "react";
import type { VoteProposal } from "@/lib/persistence-types";
import type { SchedulingHeatmapCell } from "@/lib/scheduling";

/** Tailwind classes for a slot's selection status. */
export function schedulingStatusClass(
  value: number | undefined,
  emptyTextClass: string,
): string {
  if (value === 1) return "bg-green-500 border-green-600 text-white";
  if (value === 0) return "bg-yellow-400 border-yellow-500 text-gray-900";
  if (value === -1) return "bg-red-500 border-red-600 text-white";
  return `bg-white border-gray-200 ${emptyTextClass} hover:bg-gray-50`;
}

/** Glyph shown inside a selected slot. */
export function schedulingStatusMark(value: number | undefined): string {
  if (value === 1) return "\u2713";
  if (value === 0) return "~";
  if (value === -1) return "\u2717";
  return "";
}

export interface SchedulingStatusLabels {
  available: string;
  ifNeeded: string;
  unavailable: string;
}

/**
 * Human label for an availability answer. Shared by both calendars and the
 * results summary so a wording change cannot make the time grid, month view
 * and participant matrix announce different labels for the same answer.
 * Returns undefined for an unanswered slot; callers decide their empty label.
 */
export function schedulingStatusLabel(
  value: number | undefined,
  labels: SchedulingStatusLabels,
): string | undefined {
  if (value === 1) return labels.available;
  if (value === 0) return labels.ifNeeded;
  if (value === -1) return labels.unavailable;
  return undefined;
}

/**
 * Swatch fill for the availability legend, keyed by answer. Kept next to
 * `schedulingStatusClass` so the legend and the painted slot use the same
 * palette; both calendars render the legend from this map.
 */
export const SCHEDULING_STATUS_SWATCH_CLASS: Record<1 | 0 | -1, string> = {
  1: "bg-green-500",
  0: "bg-yellow-400",
  [-1]: "bg-red-500",
};

/**
 * Overlay dot for the viewer's own answer on a heatmap cell. Darker than
 * `SCHEDULING_STATUS_SWATCH_CLASS` so it stays legible on the green intensity
 * ramp; shared so the time grid and month view cannot render the same answer in
 * different colours.
 */
export function schedulingAnswerDotClass(value: number): string {
  if (value === 1) return "bg-green-900";
  if (value === 0) return "bg-yellow-700";
  return "bg-red-800";
}

/**
 * Tooltip text for a heatmap cell. Both calendars expose the same three counts,
 * so the wording lives here instead of being re-typed per layout.
 */
export function schedulingHeatmapTitle(
  prefix: string,
  labels: SchedulingStatusLabels,
  cell: SchedulingHeatmapCell | undefined,
): string {
  return `${prefix} \u00b7 ${labels.available}: ${cell?.available ?? 0} \u00b7 ${labels.ifNeeded}: ${cell?.ifNeeded ?? 0} \u00b7 ${labels.unavailable}: ${cell?.unavailable ?? 0}`;
}

/**
 * Compact count shown inside a heatmap cell. Fully-available voters stay the
 * primary number; if-needed voters are shown in parentheses so a cell with no
 * hard availability is not misread as empty (for example `(1)`).
 */
export function schedulingHeatmapCountLabel(
  cell: SchedulingHeatmapCell | undefined,
): string {
  const available = cell?.available ?? 0;
  const ifNeeded = cell?.ifNeeded ?? 0;
  if (available > 0) {
    return ifNeeded > 0 ? `${available} (${ifNeeded})` : `${available}`;
  }
  return ifNeeded > 0 ? `(${ifNeeded})` : "0";
}

/**
 * Segment widths for one heatmap cell. The heatmap shows the full answer
 * distribution, not only hard availability: green is fully available, yellow
 * is if-needed, and the remainder is unavailable / no answer.
 */
export function schedulingHeatmapSegments(
  cell: SchedulingHeatmapCell | undefined,
  totalVoters: number,
): { greenPct: number; yellowPct: number; neutralPct: number } {
  if (!cell || totalVoters <= 0) {
    return { greenPct: 0, yellowPct: 0, neutralPct: 100 };
  }
  const greenPct = Math.max(
    0,
    Math.min(100, (cell.available / totalVoters) * 100),
  );
  const yellowPct = Math.max(
    0,
    Math.min(100 - greenPct, (cell.ifNeeded / totalVoters) * 100),
  );
  return { greenPct, yellowPct, neutralPct: 100 - greenPct - yellowPct };
}

/**
 * Fill for one heatmap cell. The green segment keeps the existing availability
 * intensity ramp; the yellow segment represents if-needed coverage. Kept in one
 * place so the time and month calendars cannot render the same heatmap
 * differently.
 */
export function schedulingHeatmapBackground(
  cell: SchedulingHeatmapCell | undefined,
  totalVoters: number,
): string {
  const { greenPct, yellowPct } = schedulingHeatmapSegments(cell, totalVoters);
  const greenOpacity = 0.08 + 0.72 * (greenPct / 100);
  const yellowOpacity = 0.15 + 0.6 * (yellowPct / 100);
  const green = `rgba(34, 197, 94, ${greenOpacity.toFixed(3)})`;
  const yellow = `rgba(234, 179, 8, ${yellowOpacity.toFixed(3)})`;
  return `linear-gradient(90deg, ${green} 0 ${greenPct.toFixed(3)}%, ${yellow} ${greenPct.toFixed(3)}% ${(greenPct + yellowPct).toFixed(3)}%, rgba(156, 163, 175, 0.10) ${(greenPct + yellowPct).toFixed(3)}% 100%)`;
}

interface UseSchedulingPaintOptions {
  /** When false, pointer and keyboard painting is disabled (read-only/heatmap). */
  enabled: boolean;
  paintMode: number;
  onPaint?: (slotIds: string[], value: number | null) => void;
}

export interface SchedulingPaintHandlers {
  paint: (slot: VoteProposal) => void;
  handlePointerDown: (
    slot: VoteProposal,
    value: number | undefined,
    event: React.PointerEvent,
  ) => void;
  handlePointerEnter: (slot: VoteProposal) => void;
  handleKeyDown: (
    slot: VoteProposal,
    value: number | undefined,
    event: React.KeyboardEvent,
  ) => void;
}

/**
 * Shared drag-to-paint interaction for the scheduling calendars. A plain click
 * toggles the clicked slot; a drag paints every entered slot. Deferring the
 * click until pointerup avoids toggling off when a drag starts on an already
 * selected slot. Kept in one hook so the time and month calendars cannot drift.
 */
export function useSchedulingPaint({
  enabled,
  paintMode,
  onPaint,
}: UseSchedulingPaintOptions): SchedulingPaintHandlers {
  const paintingRef = React.useRef(false);
  const draggedRef = React.useRef(false);
  const startRef = React.useRef<{
    slot: VoteProposal;
    value: number | undefined;
  } | null>(null);
  const lastPaintedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const stop = () => {
      if (paintingRef.current && !draggedRef.current && startRef.current) {
        const { slot, value } = startRef.current;
        onPaint?.([slot.id], value === paintMode ? null : paintMode);
      }
      paintingRef.current = false;
      draggedRef.current = false;
      startRef.current = null;
      lastPaintedRef.current = null;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [onPaint, paintMode]);

  const paint = (slot: VoteProposal) => {
    if (!enabled || !onPaint) return;
    if (lastPaintedRef.current === slot.id) return;
    lastPaintedRef.current = slot.id;
    onPaint([slot.id], paintMode);
  };

  const handlePointerDown = (
    slot: VoteProposal,
    value: number | undefined,
    event: React.PointerEvent,
  ) => {
    if (!enabled || event.button !== 0) return;
    event.preventDefault();
    paintingRef.current = true;
    draggedRef.current = false;
    startRef.current = { slot, value };
    lastPaintedRef.current = null;
  };

  const handlePointerEnter = (slot: VoteProposal) => {
    if (!enabled || !paintingRef.current) return;
    if (!draggedRef.current) {
      draggedRef.current = true;
      const start = startRef.current;
      if (start) {
        lastPaintedRef.current = start.slot.id;
        onPaint?.([start.slot.id], paintMode);
      }
    }
    paint(slot);
  };

  const handleKeyDown = (
    slot: VoteProposal,
    value: number | undefined,
    event: React.KeyboardEvent,
  ) => {
    if (!enabled) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onPaint?.([slot.id], value === paintMode ? null : paintMode);
  };

  return { paint, handlePointerDown, handlePointerEnter, handleKeyDown };
}
