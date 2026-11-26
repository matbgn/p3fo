import * as React from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Users } from "lucide-react";
import type { VoteEntity, VoteResponseEntity } from "@/lib/persistence-types";
import {
  buildSchedulingHeatmap,
  formatNormalizedSchedulingRunLabel,
  formatSchedulingDateKey,
  formatSchedulingDay,
  formatSchedulingInstant,
  normalizeSchedulingConfig,
  schedulingBestSlotIds,
  tallyScheduling,
  topSchedulingRuns,
  type SchedulingRunTally,
  type SchedulingSlotTally,
  type SchedulingTally,
} from "@/lib/scheduling";
import {
  buildAllDayEventIcs,
  buildEventIcs,
  downloadEventIcs,
} from "@/lib/ics";
import { getVotingStrings } from "@/lib/voting-i18n";
import { Button } from "@/components/ui/button";
import { SchedulingCalendar } from "./SchedulingCalendar";
import { SchedulingMonthCalendar } from "./SchedulingMonthCalendar";
import { schedulingStatusLabel } from "./schedulingCalendarInteraction";

/** Upper bound on participant × slot cells rendered in one matrix page. */
const MATRIX_MAX_CELLS_PER_PAGE = 4000;
const MATRIX_MAX_PARTICIPANTS_PER_PAGE = 50;

interface SlotDateGroup {
  key: string;
  slots: SchedulingSlotTally[];
}

interface SchedulingSummaryProps {
  vote: VoteEntity;
  responses: VoteResponseEntity[];
  /**
   * Shows the participant × slot matrix. Only ever set by the moderator
   * results view: the public projection must stay aggregate-only.
   */
  moderatorView?: boolean;
  /** A tally the parent already computed from the same response list. */
  tally?: SchedulingTally | null;
  /** How many best-run cards to render per tier. Defaults to 5. */
  maxRuns?: number;
}

function groupSlotsByDate(
  slots: SchedulingSlotTally[],
  timeZone: string,
): SlotDateGroup[] {
  // Group with a Map keyed by date so a day-mode poll with one group per day
  // stays O(slots) instead of rescanning the groups built so far.
  const groups = new Map<string, SlotDateGroup>();
  for (const slot of slots) {
    const key = formatSchedulingDateKey(slot.startAt, timeZone);
    // Match the public header and month calendar: a slot whose start cannot be
    // keyed has no day, so it cannot own a matrix column (an empty key would
    // render a blank date column that the other views never show).
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.slots.push(slot);
    } else {
      groups.set(key, { key, slots: [slot] });
    }
  }
  return Array.from(groups.values());
}

function cellLabel(value: number | undefined): string {
  if (value === 1) return "A";
  if (value === 0) return "M";
  if (value === -1) return "N";
  return "–";
}

function cellClass(value: number | undefined): string {
  if (value === 1) return "bg-green-50 text-green-700";
  if (value === 0) return "bg-yellow-50 text-yellow-700";
  if (value === -1) return "bg-red-50 text-red-700";
  return "text-gray-300";
}

/**
 * One participant × slot cell. The day and time matrices group their columns
 * differently, but the value→label/colour/title mapping must stay identical in
 * both, so it lives here instead of being copy-pasted per layout.
 */
const ParticipantCell: React.FC<{ value: number | undefined }> = ({ value }) => {
  const ts = getVotingStrings();
  return (
    <td
      className={`px-2 py-1 text-center border-l ${cellClass(value)}`}
      title={schedulingStatusLabel(value, ts.scheduling)}
    >
      {cellLabel(value)}
    </td>
  );
};

/**
 * Aggregate scheduling results shared by the public page and the moderator
 * results view. The heatmap and best-run cards never name participants; the
 * participant matrix is rendered only when `moderatorView` is true.
 */
export const SchedulingSummary: React.FC<SchedulingSummaryProps> = ({
  vote,
  responses,
  moderatorView = false,
  tally: sharedTally,
  maxRuns = 5,
}) => {
  const ts = getVotingStrings();
  const config = React.useMemo(
    () => normalizeSchedulingConfig(vote.config.scheduling),
    [vote.config.scheduling],
  );
  const computedTally = React.useMemo(
    () =>
      sharedTally ??
      tallyScheduling(responses, vote.proposals, config),
    [sharedTally, responses, vote.proposals, config],
  );
  const tally = computedTally;
  const total = tally.totalVoters;
  const groups = React.useMemo(
    // Only the moderator matrix consumes the per-day groups; the public
    // projection must not pay for this on every tally refresh.
    () => (moderatorView ? groupSlotsByDate(tally.slots, config.timeZone) : []),
    [moderatorView, tally.slots, config.timeZone],
  );
  const heatmap = React.useMemo(
    () => buildSchedulingHeatmap(tally),
    [tally],
  );
  const bestRuns = React.useMemo(
    () => topSchedulingRuns(tally, maxRuns),
    [tally, maxRuns],
  );
  const bestSlotIds = React.useMemo(() => schedulingBestSlotIds(tally), [tally]);
  // Format each run once per tally from the already-normalized config instead
  // of normalizing (which parses and sorts every date) once per run per render.
  const runLabels = React.useMemo(() => {
    const labels = new Map<string, string>();
    for (const run of bestRuns) {
      labels.set(
        `${run.startAt}-${run.endAt}`,
        formatNormalizedSchedulingRunLabel(run, config),
      );
    }
    return labels;
  }, [bestRuns, config]);
  const isDayMode = config.unit === "day";

  // The moderator matrix renders one cell per participant × slot. Bound the
  // number of cells per page so a poll with many slots and voters cannot create
  // a six-figure node tree and freeze the results view; every participant stays
  // reachable through the page controls.
  const [matrixPage, setMatrixPage] = React.useState(0);
  const matrixParticipantsPerPage = Math.max(
    1,
    Math.min(
      MATRIX_MAX_PARTICIPANTS_PER_PAGE,
      Math.floor(MATRIX_MAX_CELLS_PER_PAGE / Math.max(1, tally.slots.length)),
    ),
  );
  const matrixPageCount = Math.max(
    1,
    Math.ceil(tally.participants.length / matrixParticipantsPerPage),
  );
  // Clamp in render so a shrinking tally cannot strand the moderator on an
  // out-of-range page.
  const matrixPageIndex = Math.min(matrixPage, matrixPageCount - 1);
  const visibleParticipants = tally.participants.slice(
    matrixPageIndex * matrixParticipantsPerPage,
    (matrixPageIndex + 1) * matrixParticipantsPerPage,
  );

  const handleAddToCalendar = (run: SchedulingRunTally) => {
    try {
      const dateKey = formatSchedulingDateKey(run.startAt, config.timeZone);
      const content = isDayMode
        ? buildAllDayEventIcs({
            title: vote.title,
            description: vote.description,
            dateKey,
          })
        : buildEventIcs({
            title: vote.title,
            description: vote.description,
            startAt: run.startAt,
            endAt: run.endAt,
          });
      downloadEventIcs(
        `${vote.slug || "event"}${dateKey ? `-${dateKey}` : ""}.ics`,
        content,
      );
    } catch {
      // A malformed run cannot be turned into a calendar file.
    }
  };

  if (total === 0) {
    return (
      <p className="text-sm text-gray-400 italic">{ts.messages.noVotesYet}</p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-gray-400 uppercase">
            {ts.scheduling.heatmap}
          </h4>
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Users className="w-3.5 h-3.5" />
            {total} {total !== 1 ? ts.labels.voters : ts.labels.voter}
          </span>
        </div>
        {isDayMode ? (
          <SchedulingMonthCalendar
            slots={vote.proposals}
            timeZone={config.timeZone}
            readOnly
            heatmap={heatmap}
            bestSlotIds={bestSlotIds}
          />
        ) : (
          <SchedulingCalendar
            slots={vote.proposals}
            timeZone={config.timeZone}
            readOnly
            heatmap={heatmap}
            bestSlotIds={bestSlotIds}
          />
        )}
      </div>

      {bestRuns.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          {ts.scheduling.noCommonTime}
        </p>
      ) : (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-400 uppercase">
            {isDayMode ? ts.scheduling.bestDays : ts.scheduling.bestTimes}
          </h4>
          {bestRuns.map((run) => (
            <div
              key={`${run.startAt}-${run.endAt}`}
              className="border rounded-lg p-3 flex items-start justify-between gap-3"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900">
                  {runLabels.get(`${run.startAt}-${run.endAt}`)}
                </p>
                <p className="flex flex-wrap gap-3 text-xs">
                  <span className="text-green-600">
                    {ts.scheduling.available}: {run.available}
                  </span>
                  <span className="text-yellow-600">
                    {ts.scheduling.ifNeeded}: {run.ifNeeded}
                  </span>
                  <span className="text-red-600">
                    {ts.scheduling.unavailable}: {run.unavailable}
                  </span>
                  <span className="text-gray-600">
                    {ts.scheduling.coverage}: {run.coverage}/{total}
                  </span>
                  {run.available === total ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800">
                      {ts.scheduling.everyoneAvailable}
                    </span>
                  ) : run.coverage === total ? (
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 font-medium text-yellow-800">
                      {ts.scheduling.everyoneCanAttendIfNeeded}
                    </span>
                  ) : null}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAddToCalendar(run)}
              >
                <CalendarPlus className="w-4 h-4 mr-1" />
                {ts.scheduling.addToCalendar}
              </Button>
            </div>
          ))}
        </div>
      )}

      {moderatorView && tally.participants.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-400 uppercase">
            {ts.scheduling.participants}
          </h4>
          <div className="overflow-x-auto">
            {isDayMode ? (
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white text-left py-1 pr-3 font-medium text-gray-600" />
                    {groups.map((group) => (
                      <th
                        key={group.key}
                        className="px-2 py-1 text-center font-medium text-gray-600 border-l whitespace-nowrap"
                      >
                        {group.slots[0]
                          ? formatSchedulingDay(
                              group.slots[0].startAt,
                              config.timeZone,
                              { dateStyle: "medium" },
                            )
                          : group.key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleParticipants.map((participant) => (
                    <tr key={participant.key}>
                      <td className="sticky left-0 bg-white text-left py-1 pr-3 text-gray-700 whitespace-nowrap">
                        {participant.displayName || participant.alias}
                      </td>
                      {groups.map((group) => {
                        const slot = group.slots[0];
                        const value = slot
                          ? participant.values[slot.proposalId]
                          : undefined;
                        return (
                          <ParticipantCell
                            key={`${participant.key}-${group.key}`}
                            value={value}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white text-left py-1 pr-3 font-medium text-gray-600" />
                    {groups.map((group) => (
                      <th
                        key={group.key}
                        colSpan={group.slots.length}
                        className="px-2 py-1 text-center font-medium text-gray-600 border-l"
                      >
                        {group.slots[0]
                          ? formatSchedulingInstant(
                              group.slots[0].startAt,
                              config.timeZone,
                              { month: "short", day: "numeric" },
                            )
                          : group.key}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky left-0 bg-white text-left py-1 pr-3" />
                    {groups.flatMap((group) =>
                      group.slots.map((slot) => (
                        <th
                          key={slot.proposalId}
                          className="px-2 py-1 text-center font-normal text-gray-500 border-l whitespace-nowrap"
                        >
                          {formatSchedulingInstant(slot.startAt, config.timeZone, {
                            timeStyle: "short",
                          })}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleParticipants.map((participant) => (
                    <tr key={participant.key}>
                      <td className="sticky left-0 bg-white text-left py-1 pr-3 text-gray-700 whitespace-nowrap">
                        {participant.displayName || participant.alias}
                      </td>
                      {groups.flatMap((group) =>
                        group.slots.map((slot) => {
                          const value = participant.values[slot.proposalId];
                          return (
                            <ParticipantCell
                              key={`${participant.key}-${slot.proposalId}`}
                              value={value}
                            />
                          );
                        }),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {matrixPageCount > 1 && (
            <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
              <span>
                {matrixPageIndex + 1} / {matrixPageCount}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                disabled={matrixPageIndex === 0}
                onClick={() => setMatrixPage(matrixPageIndex - 1)}
                aria-label={`${matrixPageIndex} / ${matrixPageCount}`}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                disabled={matrixPageIndex >= matrixPageCount - 1}
                onClick={() => setMatrixPage(matrixPageIndex + 1)}
                aria-label={`${matrixPageIndex + 2} / ${matrixPageCount}`}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
