import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, X, BellPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReminderStore, Reminder } from "@/hooks/useReminders";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SNOOZE_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 1440, label: "1 day" },
];

function ReminderItem({ reminder }: { reminder: Reminder }) {
  const { dismissReminder, markAsRead, snoozeReminder } = useReminderStore();
  const [snoozeDuration, setSnoozeDuration] = React.useState(SNOOZE_OPTIONS[0].value);

  const handleDismiss = () => {
    dismissReminder(reminder.id);
  };

  const handleMarkAsRead = () => {
    markAsRead(reminder.id);
  };

  const handleSnooze = () => {
    snoozeReminder(reminder.id, snoozeDuration);
  };

  return (
    <div
      className={cn(
        "flex flex-col space-y-2 p-4 text-sm",
        !reminder.read && "bg-accent/20",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-medium">{reminder.title}</p>
          {reminder.description && (
            <p className="text-muted-foreground">{reminder.description}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center justify-end space-x-2">
        {!reminder.read && (
          <Button variant="ghost" size="sm" onClick={handleMarkAsRead}>
            Mark as Read
          </Button>
        )}
        <Select
          value={snoozeDuration.toString()}
          onValueChange={(value) => setSnoozeDuration(parseInt(value))}
        >
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="Snooze" />
          </SelectTrigger>
          <SelectContent>
            {SNOOZE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value.toString()}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={handleSnooze}>
          <BellPlus className="h-4 w-4 mr-1" />
          Snooze
        </Button>
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const { reminders, unreadCount, clearAllReminders } = useReminderStore();

  return (
    <Popover>
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
      <PopoverContent className="w-80 p-0">
        <div className="flex flex-col">
          <div className="flex items-center justify-between p-4">
            <h4 className="text-sm font-semibold">Notifications</h4>
            {reminders.length > 0 && (
              <Button variant="link" className="h-auto p-0 text-xs" onClick={clearAllReminders}>
                Clear All
              </Button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {reminders.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No new notifications.
              </div>
            ) : (
              reminders.map((reminder) => (
                <ReminderItem key={reminder.id} reminder={reminder} />
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}