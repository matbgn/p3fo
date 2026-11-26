import * as React from 'react';
import { MessageSquare } from 'lucide-react';
import { getVotingStrings } from '@/lib/voting-i18n';

export type VoteCommentEntry = {
  comment: string;
  /** Display name, or null when the vote is anonymous. */
  name: string | null;
};

/**
 * One comments section for every vote mode, used by the moderator/owner results
 * panel. Comments are always shown; the voter's name is shown only when the
 * vote is not anonymous. Availability batches repeat the same comment on every
 * slot row, so callers deduplicate before passing entries here.
 */
export const VoteComments: React.FC<{ comments: VoteCommentEntry[] }> = ({ comments }) => {
  const t = getVotingStrings();

  if (comments.length === 0) return null;

  return (
    <div className="border rounded-lg p-3" data-test="vote-comments">
      <h4 className="flex items-center gap-1 text-xs font-medium text-gray-400 uppercase mb-2">
        <MessageSquare className="w-3 h-3" />
        {t.labels.comments}
      </h4>
      <ul className="space-y-1 text-sm text-gray-600">
        {comments.map((entry, index) => (
          <li key={`${index}-${entry.comment.slice(0, 24)}`} className="italic">
            {entry.name && (
              <span className="not-italic font-medium text-gray-700">{entry.name} — </span>
            )}
            {entry.comment}
          </li>
        ))}
      </ul>
    </div>
  );
};
