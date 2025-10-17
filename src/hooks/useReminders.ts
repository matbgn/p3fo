import { create } from "zustand";

export type Reminder = {
  id: string;
  title: string;
  description?: string;
  read: boolean;
  persistent: boolean;
  triggerDate?: string; // ISO date string for scheduling
  taskId?: string; // ID of the task this reminder is associated with
  offsetMinutes?: number; // Minutes before triggerDate to show the reminder
  snoozeDurationMinutes?: number; // Duration in minutes for snoozing
  originalTriggerDate?: string; // To store the original trigger date when snoozing
};

type ReminderStore = {
  reminders: Reminder[];
  addReminder: (reminder: Omit<Reminder, "id" | "read">) => void;
  dismissReminder: (id: string) => void;
  markAsRead: (id: string) => void;
  clearAllReminders: () => void;
  unreadCount: number;
  scheduledReminders: Reminder[]; // Reminders waiting to be triggered
  addScheduledReminder: (reminder: Omit<Reminder, "id" | "read">) => void;
  updateScheduledReminderTriggerDate: (taskId: string, newTriggerDate: string | undefined, offsetMinutes: number) => void;
  checkAndTriggerReminders: () => void;
  snoozeReminder: (id: string, durationMinutes: number) => void;
};

export const useReminderStore = create<ReminderStore>((set, get) => ({
  reminders: [],
  scheduledReminders: [],
  unreadCount: 0,
  addReminder: (newReminder) => {
    if (newReminder.triggerDate) {
      get().addScheduledReminder(newReminder);
      return;
    }
    set((state) => {
      const reminderWithId = { ...newReminder, id: crypto.randomUUID(), read: false };
      const updatedReminders = [reminderWithId, ...state.reminders];
      return {
        reminders: updatedReminders,
        unreadCount: updatedReminders.filter((r) => !r.read).length,
      };
    });
  },
  addScheduledReminder: (newReminder) =>
    set((state) => {
      const reminderWithId = { ...newReminder, id: crypto.randomUUID(), read: false };
      const updatedScheduledReminders = [reminderWithId, ...state.scheduledReminders];
      return {
        scheduledReminders: updatedScheduledReminders,
      };
    }),
  updateScheduledReminderTriggerDate: (taskId, newTriggerDate, offsetMinutes) =>
    set((state) => {
      const updatedScheduledReminders = state.scheduledReminders.map((reminder) => {
        if (reminder.taskId === taskId) {
          // If newTriggerDate is undefined, it means the termination date was cleared, so dismiss the reminder
          if (newTriggerDate === undefined) {
            return { ...reminder, triggerDate: undefined, originalTriggerDate: undefined, offsetMinutes: undefined };
          }

          const originalTrigger = new Date(newTriggerDate);
          const calculatedTriggerDate = new Date(originalTrigger.getTime() - offsetMinutes * 60 * 1000).toISOString();
          
          return {
            ...reminder,
            triggerDate: calculatedTriggerDate,
            originalTriggerDate: originalTrigger.toISOString(),
            offsetMinutes: offsetMinutes,
          };
        }
        return reminder;
      }).filter(reminder => reminder.triggerDate !== undefined); // Remove reminders that have been cleared
      return { scheduledReminders: updatedScheduledReminders };
    }),
  dismissReminder: (id) =>
    set((state) => {
      const updatedReminders = state.reminders.filter((reminder) => reminder.id !== id);
      // Also remove from scheduled reminders if it was snoozed
      const updatedScheduledReminders = state.scheduledReminders.filter((reminder) => reminder.id !== id);
      return {
        reminders: updatedReminders,
        scheduledReminders: updatedScheduledReminders,
        unreadCount: updatedReminders.filter((r) => !r.read).length,
      };
    }),
  markAsRead: (id) =>
    set((state) => {
      const updatedReminders = state.reminders.map((reminder) =>
        reminder.id === id ? { ...reminder, read: true } : reminder,
      );
      return {
        reminders: updatedReminders,
        unreadCount: updatedReminders.filter((r) => !r.read).length,
      };
    }),
  clearAllReminders: () =>
    set(() => ({
      reminders: [],
      scheduledReminders: [],
      unreadCount: 0,
    })),
  checkAndTriggerReminders: () => {
    const now = new Date();
    set((state) => {
      const toTrigger: Reminder[] = [];
      const remainingScheduled = state.scheduledReminders.filter((reminder) => {
        if (reminder.triggerDate && new Date(reminder.triggerDate) <= now) {
          toTrigger.push({ ...reminder, read: false });
          return false;
        }
        return true;
      });

      if (toTrigger.length > 0) {
        const updatedReminders = [...toTrigger, ...state.reminders];
        return {
          reminders: updatedReminders,
          // Do not remove triggered reminders from scheduledReminders if they are task-specific
          // This allows them to be re-triggered if the task's terminationDate changes.
          scheduledReminders: state.scheduledReminders.filter(
            (sr) => !toTrigger.some((tt) => tt.id === sr.id && tt.taskId),
          ),
          unreadCount: updatedReminders.filter((r) => !r.read).length,
        };
      }
      return state; // No changes if no reminders triggered
    });
  },
  snoozeReminder: (id, durationMinutes) =>
    set((state) => {
      const snoozedReminder = state.reminders.find((r) => r.id === id);
      if (!snoozedReminder) return state;

      const newTriggerDate = new Date();
      newTriggerDate.setMinutes(newTriggerDate.getMinutes() + durationMinutes);

      const updatedSnoozedReminder: Reminder = {
        ...snoozedReminder,
        read: false, // Mark as unread when snoozed so it triggers again
        triggerDate: newTriggerDate.toISOString(),
        originalTriggerDate: snoozedReminder.originalTriggerDate || snoozedReminder.triggerDate,
      };

      // Remove from current reminders and add to scheduled
      const updatedReminders = state.reminders.filter((r) => r.id !== id);
      const updatedScheduledReminders = [...state.scheduledReminders, updatedSnoozedReminder];

      return {
        reminders: updatedReminders,
        scheduledReminders: updatedScheduledReminders,
        unreadCount: updatedReminders.filter((r) => !r.read).length,
      };
    }),
}));

export const useReminders = () => useReminderStore();