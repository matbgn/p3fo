import * as React from 'react';
import { AlertTriangle, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { getVotingStrings } from '@/lib/voting-i18n';
import { cn } from '@/lib/utils';

type CommentFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Show the "explain a negative vote" nudge. */
  nudge?: boolean;
  /** Save the comment without resubmitting the votes. */
  onSave?: () => void | Promise<void>;
  saving?: boolean;
  saved?: boolean;
  saveError?: string | null;
  className?: string;
};

/** The voter comment input, placed next to each mode's submit control. */
export const CommentField: React.FC<CommentFieldProps> = ({
  id = 'vote-comment',
  value,
  onChange,
  disabled = false,
  nudge = false,
  onSave,
  saving = false,
  saved = false,
  saveError = null,
  className,
}) => {
  const ts = getVotingStrings();
  const { t: tt } = useTranslation();

  return (
    <div className={cn('space-y-1', className)}>
      <label
        htmlFor={id}
        className="flex items-center gap-1 text-sm font-medium text-gray-700"
      >
        <MessageSquare className="w-4 h-4" />
        {ts.labels.comment}
      </label>
      {nudge && (
        <p className="flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="w-3 h-3" />
          {ts.messages.negativeCommentNudge}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={ts.placeholders.comment}
          rows={2}
          disabled={disabled}
          className="flex-1"
        />
        {onSave && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void onSave()}
            disabled={disabled || saving}
          >
            {saving ? tt('voting.savingComment') : tt('voting.saveComment')}
          </Button>
        )}
      </div>
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}
      {saved && <p className="text-xs text-green-600">{tt('voting.commentSaved')}</p>}
      <p className="text-xs text-gray-400">{tt('voting.commentHint')}</p>
    </div>
  );
};
