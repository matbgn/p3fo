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
  setScheduledReminders: (reminders: Reminder[]) => void;
};

export const useReminderStore = create<ReminderStore>((set, get) => ({
  reminders: [],
  scheduledReminders: [],
  unreadCount: 0,
  addReminder: (newReminder) => {
    // Check if a reminder with the same taskId and originalTriggerDate already exists
    const existingReminder = get().scheduledReminders.find(
      r => r.taskId === newReminder.taskId &&
           r.originalTriggerDate === newReminder.triggerDate
    );
    
    if (existingReminder) {
      // If it exists, update it instead of creating a new one
      get().updateScheduledReminderTriggerDate(
        newReminder.taskId!,
        newReminder.triggerDate,
        newReminder.offsetMinutes || 0
      );
      return;
    }
    
    if (newReminder.triggerDate) {
      get().addScheduledReminder(newReminder);
      return;
    }
    set((state) => {
      // Check if a similar reminder already exists to prevent duplicates
      const isDuplicate = state.reminders.some(
        r => r.taskId === newReminder.taskId &&
             r.title === newReminder.title &&
             r.description === newReminder.description
      );
      
      if (isDuplicate) {
        return state; // Don't add duplicate
      }
      
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
      // Check if a similar scheduled reminder already exists to prevent duplicates
      const isDuplicate = state.scheduledReminders.some(
        r => r.taskId === newReminder.taskId &&
             r.originalTriggerDate === newReminder.triggerDate
      );
      
      if (isDuplicate) {
        return state; // Don't add duplicate
      }
      
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
          // Check if this reminder is already in the active reminders to prevent duplicates
          const isAlreadyActive = state.reminders.some(
            r => r.taskId === reminder.taskId &&
                 r.originalTriggerDate === reminder.originalTriggerDate
          );
          
          if (!isAlreadyActive) {
            toTrigger.push({ ...reminder, read: false });
          }
          
          // Don't remove task-specific reminders, so they can be re-evaluated
          return !!reminder.taskId;
        }
        return true;
      });

      if (toTrigger.length > 0) {
        // Deduplicate reminders before adding them
        const deduplicatedToTrigger = toTrigger.filter(
          (reminder, index, self) =>
            index === self.findIndex(r => r.taskId === reminder.taskId &&
                                         r.originalTriggerDate === reminder.originalTriggerDate)
        );
        
        const updatedReminders = [...deduplicatedToTrigger, ...state.reminders];
        return {
          reminders: updatedReminders,
          scheduledReminders: remainingScheduled,
          unreadCount: updatedReminders.filter((r) => !r.read).length,
        };
      }
      return state;
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
      
      // Check if a similar scheduled reminder already exists to prevent duplicates
      const isDuplicate = state.scheduledReminders.some(
        r => r.taskId === updatedSnoozedReminder.taskId &&
             r.originalTriggerDate === updatedSnoozedReminder.originalTriggerDate
      );
      
      let updatedScheduledReminders;
      if (isDuplicate) {
        // Update existing reminder instead of adding a new one
        updatedScheduledReminders = state.scheduledReminders.map(r =>
          r.taskId === updatedSnoozedReminder.taskId &&
          r.originalTriggerDate === updatedSnoozedReminder.originalTriggerDate
            ? updatedSnoozedReminder
            : r
        );
      } else {
        updatedScheduledReminders = [...state.scheduledReminders, updatedSnoozedReminder];
      }

      return {
        reminders: updatedReminders,
        scheduledReminders: updatedScheduledReminders,
        unreadCount: updatedReminders.filter((r) => !r.read).length,
      };
    }),
  setScheduledReminders: (reminders) => set(() => ({ scheduledReminders: reminders })),
  cleanupDuplicateReminders: () =>
    set((state) => {
      // Deduplicate scheduledReminders based on ID
      const deduplicatedReminders = state.scheduledReminders.filter(
        (reminder, index, self) =>
          index === self.findIndex(r => r.id === reminder.id)
      );
      
      // Deduplicate active reminders based on taskId and originalTriggerDate
      const deduplicatedActiveReminders = state.reminders.filter(
        (reminder, index, self) =>
          index === self.findIndex(r => r.taskId === reminder.taskId &&
                                       r.originalTriggerDate === reminder.originalTriggerDate)
      );
      
      return {
        scheduledReminders: deduplicatedReminders,
        reminders: deduplicatedActiveReminders,
        unreadCount: deduplicatedActiveReminders.filter(r => !r.read).length
      };
    }),
}));

export const useReminders = () => useReminderStore();