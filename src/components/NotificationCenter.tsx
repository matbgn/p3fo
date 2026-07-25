import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, X, BellPlus, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReminderStore, Reminder } from "@/hooks/useReminders";
import { useViewNavigation } from "@/hooks/useView";
import { WELCOME_REMINDER_KEY } from "@/components/NotificationManager";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";

const SNOOZE_OPTIONS = [
  { value: 5, key: "notifications.snoozeDuration.5min" },
  { value: 15, key: "notifications.snoozeDuration.15min" },
  { value: 30, key: "notifications.snoozeDuration.30min" },
  { value: 60, key: "notifications.snoozeDuration.1hour" },
  { value: 120, key: "notifications.snoozeDuration.2hours" },
  { value: 1440, key: "notifications.snoozeDuration.1day" },
];

// Resolve the localized title for a reminder. System-generated reminders carry
// a translation key + params and are re-translated on locale change; legacy
// reminders (or user-authored ones) fall back to the stored title text.
function resolveReminderTitle(reminder: Reminder, t: (key: string, params?: Record<string, unknown>) => string): string {
  if (reminder.titleKey) {
    return t(reminder.titleKey, reminder.titleParams);
  }
  return reminder.title;
}

// Resolve the localized description. For the task-due reminder we format the
// stored ISO date with Intl.DateTimeFormat in the current locale so it
// re-localizes on language switch.
function resolveReminderDescription(
  reminder: Reminder,
  t: (key: string, params?: Record<string, unknown>) => string,
  locale: string,
): string | undefined {
  if (reminder.descriptionKey) {
    const params = { ...(reminder.descriptionParams ?? {}) } as Record<string, unknown>;
    if (typeof params.date === 'string') {
      try {
        params.formattedDate = new Intl.DateTimeFormat(locale, {
          dateStyle: 'full',
          timeStyle: 'short',
        }).format(new Date(params.date));
      } catch {
        params.formattedDate = params.date;
      }
    }
    return t(reminder.descriptionKey, params);
  }
  return reminder.description;
}

function ReminderItem({ reminder, onJump }: { reminder: Reminder; onJump?: () => void }) {
  const { t, i18n } = useTranslation();
  const { dismissReminder, markAsRead, snoozeReminder } = useReminderStore();
  const { handleFocusOnTask } = useViewNavigation();
  const [snoozeDuration, setSnoozeDuration] = React.useState(SNOOZE_OPTIONS[0].value);
  const [isJumping, setIsJumping] = React.useState(false);

  const handleDismiss = () => {
    dismissReminder(reminder.id);
  };

  const handleMarkAsRead = () => {
    markAsRead(reminder.id);
  };

  const handleSnooze = () => {
    snoozeReminder(reminder.id, snoozeDuration);
  };

  // A reminder can jump to a task when it carries a real taskId.
  // The onboarding welcome reminder uses a sentinel key, not a task id.
  const jumpableTaskId = reminder.taskId && reminder.taskId !== WELCOME_REMINDER_KEY
    ? reminder.taskId
    : undefined;

  const handleJumpToTask = () => {
    if (!jumpableTaskId || isJumping) return;
    setIsJumping(true);
    handleFocusOnTask(jumpableTaskId);
    onJump?.();
    // Clear the spinner after the view switch + scroll settles.
    setTimeout(() => setIsJumping(false), 1200);
  };

  // Resolve localized text from i18n keys when present so the reminder
  // re-translates when the locale changes; fall back to stored text otherwise.
  const resolvedTitle = resolveReminderTitle(reminder, t);
  const resolvedDescription = resolveReminderDescription(reminder, t, i18n.language);

  return (
    <div
      className={cn(
        "flex flex-col space-y-2 p-4 text-sm",
        !reminder.read && "bg-accent/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {jumpableTaskId ? (
          <button
            type="button"
            onClick={handleJumpToTask}
            disabled={isJumping}
            className="font-medium text-left hover:underline cursor-pointer flex items-center gap-1 min-w-0 flex-1 disabled:cursor-wait disabled:opacity-70"
            title={t("notifications.jumpToTask")}
          >
            <span className="truncate">{resolvedTitle}</span>
            {isJumping ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </button>
        ) : (
          <p className="font-medium flex-1 min-w-0 break-words">{resolvedTitle}</p>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-1 -mr-1" onClick={handleDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {resolvedDescription && (
        <p className="text-muted-foreground break-words">{resolvedDescription}</p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!reminder.read && (
          <Button variant="ghost" size="sm" onClick={handleMarkAsRead}>
            {t("notifications.markAsRead")}
          </Button>
        )}
        <Select
          value={snoozeDuration.toString()}
          onValueChange={(value) => setSnoozeDuration(parseInt(value))}
        >
          <SelectTrigger className="h-8 w-[120px] shrink-0 text-xs">
            <SelectValue placeholder={t("notifications.snoozePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {SNOOZE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value.toString()}>
                {t(option.key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={handleSnooze}>
          <BellPlus className="h-4 w-4 mr-1" />
          {t("notifications.snooze")}
        </Button>
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const { t } = useTranslation();
  const { reminders, unreadCount, clearAllReminders } = useReminderStore();
  const [popoverOpen, setPopoverOpen] = React.useState(false);

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 flex items-center justify-center text-xs text-white">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0">
        <div className="flex flex-col">
          <div className="flex items-center justify-between p-4">
            <h4 className="text-sm font-semibold">{t("notifications.title")}</h4>
            {reminders.length > 0 && (
              <Button variant="link" className="h-auto p-0 text-xs" onClick={clearAllReminders}>
                {t("notifications.clearAll")}
              </Button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {reminders.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                {t("notifications.empty")}
              </div>
            ) : (
              reminders.map((reminder) => (
                <ReminderItem
                  key={reminder.id}
                  reminder={reminder}
                  onJump={() => setPopoverOpen(false)}
                />
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}