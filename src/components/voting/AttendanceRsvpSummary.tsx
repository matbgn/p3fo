import * as React from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";
import type { VoteResponseEntity } from "@/lib/persistence-types";
import { formatEventMoment, summarizeAttendance, type AttendanceSummary } from "@/lib/attendance";
import { getVotingStrings } from "@/lib/voting-i18n";

/**
 * Shared event-RSVP summary (tally, going list, hidden count, optional comments)
 * used by both the public RSVP page and the moderator results view so the two
 * projections cannot drift.
 */
export const AttendanceRsvpSummary: React.FC<{
  responses: VoteResponseEntity[];
  isAnonymous: boolean;
  showComments?: boolean;
  /**
   * A projection the parent already derived from the same response list. When
   * present the list is not scanned again, so a parent that needs the tally for
   * its own header can share one memoized projection with this component.
   */
  summary?: AttendanceSummary;
}> = ({ responses, isAnonymous, showComments = false, summary: sharedSummary }) => {
  const ts = getVotingStrings();
  const { t: tt } = useTranslation();
  // One memoized projection: the parent re-renders on every RSVP-dialog
  // keystroke, but the response list only changes on a data refresh. Skip the
  // computation entirely when the parent already handed us the projection.
  const computedSummary = React.useMemo(
    () =>
      sharedSummary
        ? null
        : summarizeAttendance(responses, { isAnonymous, includeComments: showComments }),
    [sharedSummary, responses, isAnonymous, showComments],
  );
  const summary = sharedSummary ?? computedSummary;
  if (!summary) return null;
  const { tally, comments: commentRows } = summary;
  if (tally.total === 0) {
    return <p className="text-sm text-gray-400 italic">{ts.messages.noVotesYet}</p>;
  }
  const total = tally.total || 1;
  const attendeeRows = summary.rows;
  const visibleAttendees = attendeeRows.filter((row) => row.visibility === "public");
  const hiddenCount = attendeeRows.length - visibleAttendees.length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="text-green-600">✓ {ts.attendanceOptions.going} {tally.going}</span>
        <span className="text-yellow-600">{ts.attendanceOptions.maybe} {tally.maybe}</span>
        <span className="text-red-600">✗ {ts.attendanceOptions.notGoing} {tally.notGoing}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden">
        <div className="bg-green-500" style={{ width: `${(tally.going / total) * 100}%` }} />
        <div className="bg-yellow-400" style={{ width: `${(tally.maybe / total) * 100}%` }} />
        <div className="bg-red-500" style={{ width: `${(tally.notGoing / total) * 100}%` }} />
      </div>
      <div className="mt-2 space-y-1">
        <h4 className="text-xs font-medium text-gray-400 uppercase">
          {ts.attendance.attendees}
        </h4>
        {attendeeRows.length === 0 ? (
          <p className="text-xs text-gray-400 italic">{ts.attendance.noAttendees}</p>
        ) : (
          <>
            {visibleAttendees.map((row, index) => (
              <div key={index} className="flex items-center gap-2 text-xs text-gray-500">
                <span>{row.displayName ?? row.alias ?? tt("voting.anonymous")}</span>
                <span className="text-gray-400">× {row.partySize}</span>
              </div>
            ))}
            {hiddenCount > 0 && (
              <p className="text-xs text-gray-400">
                {hiddenCount} {ts.attendance.hiddenAttendees}
              </p>
            )}
          </>
        )}
      </div>
      {showComments && commentRows.length > 0 && (
        <div className="mt-3 space-y-2 border-t pt-2">
          <h4 className="text-xs font-medium text-gray-400 uppercase flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5" />
            {commentRows.length} {commentRows.length !== 1 ? ts.labels.comments : ts.labels.comment}
          </h4>
          <ul className="space-y-2">
            {commentRows.map((row) => (
              <li key={row.id} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium text-gray-900">
                    {row.author ?? tt("voting.anonymous")}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatEventMoment(row.submittedAt)}
                  </span>
                </div>
                <p className="mt-1 text-gray-700 whitespace-pre-wrap break-words">
                  {row.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
