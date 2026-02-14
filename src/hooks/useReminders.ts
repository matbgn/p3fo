import { create } from "zustand";
import { ReminderEntity } from "@/lib/persistence-types";
import { getPersistenceAdapter } from "@/lib/persistence-factory";

export type ReminderState = 'scheduled' | 'triggered' | 'read' | 'dismissed';

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
  state: ReminderState; // Current state in the reminder lifecycle
};

// Valid state transitions for the reminder state machine
const VALID_TRANSITIONS: Record<ReminderState, ReminderState[]> = {
  scheduled: ['triggered', 'dismissed'],
  triggered: ['read', 'dismissed', 'scheduled'], // scheduled = snoozed
  read: ['dismissed'],
  dismissed: [], // Terminal state
};

// Logger for state transitions (for observability)
const logStateTransition = (
  reminderId: string,
  fromState: ReminderState,
  toState: ReminderState,
  reason?: string
) => {
  console.log(`[ReminderStateMachine] ${reminderId}: ${fromState} → ${toState}${reason ? ` (${reason})` : ''}`);
};

// Validate if a state transition is allowed
const isValidTransition = (fromState: ReminderState, toState: ReminderState): boolean => {
  if (fromState === toState) return true; // Same state is always valid
  return VALID_TRANSITIONS[fromState].includes(toState);
};

type ReminderStore = {
  reminders: Reminder[];
  addReminder: (reminder: Omit<Reminder, "id" | "read" | "state">) => void;
  dismissReminder: (id: string) => void;
  markAsRead: (id: string) => void;
  clearAllReminders: () => void;
  unreadCount: number;
  scheduledReminders: Reminder[]; // Reminders waiting to be triggered
  addScheduledReminder: (reminder: Omit<Reminder, "id" | "read" | "state">) => void;
  updateScheduledReminderTriggerDate: (taskId: string, newTriggerDate: string | undefined, offsetMinutes: number) => void;
  checkAndTriggerReminders: () => void;
  snoozeReminder: (id: string, durationMinutes: number) => void;
  setScheduledReminders: (reminders: Reminder[]) => void;
  deleteRemindersByTaskId: (taskId: string) => void;
  cleanupDuplicateReminders: () => void;
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
      
      const reminderWithId: Reminder = {
        ...newReminder,
        id: crypto.randomUUID(),
        read: false,
        state: newReminder.triggerDate ? 'scheduled' : 'triggered',
      };
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

      const reminderWithId: Reminder = {
        ...newReminder,
        id: crypto.randomUUID(),
        read: false,
        state: 'scheduled',
      };
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
      const reminder = state.reminders.find(r => r.id === id);
      const scheduledReminder = state.scheduledReminders.find(r => r.id === id);

      // Validate transition for active reminders
      if (reminder && !isValidTransition(reminder.state, 'dismissed')) {
        console.warn(`[ReminderStateMachine] Invalid transition attempted: ${id} ${reminder.state} → dismissed`);
        return state;
      }

      // Validate transition for scheduled reminders
      if (scheduledReminder && !isValidTransition(scheduledReminder.state, 'dismissed')) {
        console.warn(`[ReminderStateMachine] Invalid transition attempted: ${id} ${scheduledReminder.state} → dismissed`);
        return state;
      }

      const updatedReminders = state.reminders.filter((reminder) => reminder.id !== id);
      // Also remove from scheduled reminders if it was snoozed
      const updatedScheduledReminders = state.scheduledReminders.filter((reminder) => reminder.id !== id);

      // Log the transition
      const targetReminder = reminder || scheduledReminder;
      if (targetReminder) {
        logStateTransition(id, targetReminder.state, 'dismissed', 'user dismissed');
      }

      return {
        reminders: updatedReminders,
        scheduledReminders: updatedScheduledReminders,
        unreadCount: updatedReminders.filter((r) => !r.read).length,
      };
    }),
  markAsRead: (id) =>
    set((state) => {
      const reminder = state.reminders.find(r => r.id === id);
      if (reminder && !isValidTransition(reminder.state, 'read')) {
        console.warn(`[ReminderStateMachine] Invalid transition attempted: ${id} ${reminder.state} → read`);
        return state;
      }

      const updatedReminders = state.reminders.map((reminder) =>
        reminder.id === id ? { ...reminder, read: true, state: 'read' as ReminderState } : reminder,
      );

      if (reminder) {
        logStateTransition(id, reminder.state, 'read', 'user marked as read');
      }

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
          // Validate state transition
          if (!isValidTransition(reminder.state, 'triggered')) {
            console.warn(`[ReminderStateMachine] Invalid transition attempted: ${reminder.id} ${reminder.state} → triggered`);
            return true; // Keep in scheduled if transition is invalid
          }

          // Check if this reminder is already in the active reminders to prevent duplicates
          const isAlreadyActive = state.reminders.some(
            r => r.taskId === reminder.taskId &&
                 r.originalTriggerDate === reminder.originalTriggerDate
          );

          if (!isAlreadyActive) {
            const triggeredReminder: Reminder = {
              ...reminder,
              read: false,
              state: 'triggered',
            };
            toTrigger.push(triggeredReminder);
            logStateTransition(reminder.id, reminder.state, 'triggered', 'time reached');
          }

          // Remove triggered reminders from scheduled to prevent duplicates
          // Task reminders must be explicitly re-scheduled if the task date changes
          return false;
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

      // Validate state transition (triggered -> scheduled for snooze)
      if (!isValidTransition(snoozedReminder.state, 'scheduled')) {
        console.warn(`[ReminderStateMachine] Invalid transition attempted: ${id} ${snoozedReminder.state} → scheduled (snooze)`);
        return state;
      }

      const newTriggerDate = new Date();
      newTriggerDate.setMinutes(newTriggerDate.getMinutes() + durationMinutes);

      const updatedSnoozedReminder: Reminder = {
        ...snoozedReminder,
        read: false, // Mark as unread when snoozed so it triggers again
        triggerDate: newTriggerDate.toISOString(),
        originalTriggerDate: snoozedReminder.originalTriggerDate || snoozedReminder.triggerDate,
        state: 'scheduled',
      };

      logStateTransition(id, snoozedReminder.state, 'scheduled', `snoozed for ${durationMinutes} minutes`);

      // Remove from current reminders and add to scheduled
      const updatedReminders = state.reminders.filter((r) => r.id !== id);

      // Check if a similar scheduled reminder already exists to prevent duplicates
      const isDuplicate = state.scheduledReminders.some(
        r => r.taskId === updatedSnoozedReminder.taskId &&
             r.originalTriggerDate === updatedSnoozedReminder.originalTriggerDate
      );

      let updatedScheduledReminders: Reminder[];
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
  deleteRemindersByTaskId: (taskId) =>
    set((state) => {
      // Remove reminders associated with the task from both active and scheduled lists
      const updatedReminders = state.reminders.filter((reminder) => reminder.taskId !== taskId);
      const updatedScheduledReminders = state.scheduledReminders.filter((reminder) => reminder.taskId !== taskId);
      return {
        reminders: updatedReminders,
        scheduledReminders: updatedScheduledReminders,
        unreadCount: updatedReminders.filter((r) => !r.read).length,
      };
    }),
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

// Helper function to convert Reminder to ReminderEntity for persistence
const reminderToEntity = (reminder: Reminder, userId: string): ReminderEntity => ({
  id: reminder.id,
  userId,
  taskId: reminder.taskId,
  title: reminder.title,
  description: reminder.description,
  read: reminder.read,
  persistent: reminder.persistent,
  triggerDate: reminder.triggerDate,
  offsetMinutes: reminder.offsetMinutes,
  snoozeDurationMinutes: reminder.snoozeDurationMinutes,
  originalTriggerDate: reminder.originalTriggerDate,
  state: reminder.state,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// Helper function to convert ReminderEntity to Reminder
const entityToReminder = (entity: ReminderEntity): Reminder => ({
  id: entity.id,
  title: entity.title,
  description: entity.description,
  read: entity.read,
  persistent: entity.persistent,
  triggerDate: entity.triggerDate,
  taskId: entity.taskId,
  offsetMinutes: entity.offsetMinutes,
  snoozeDurationMinutes: entity.snoozeDurationMinutes,
  originalTriggerDate: entity.originalTriggerDate,
  state: entity.state,
});

// Load reminders from persistence
export async function loadRemindersFromPersistence(userId?: string): Promise<void> {
  try {
    const adapter = await getPersistenceAdapter();
    const entities = await adapter.listReminders(userId);
    
    const activeReminders: Reminder[] = [];
    const scheduledReminders: Reminder[] = [];
    
    for (const entity of entities) {
      const reminder = entityToReminder(entity);
      
      if (entity.state === 'scheduled' && entity.triggerDate) {
        scheduledReminders.push(reminder);
      } else if (entity.state === 'triggered' || entity.state === 'read') {
        activeReminders.push(reminder);
      }
      // 'dismissed' reminders are not loaded
    }
    
    useReminderStore.setState({
      reminders: activeReminders,
      scheduledReminders: scheduledReminders,
      unreadCount: activeReminders.filter(r => !r.read).length,
    });
  } catch (error) {
    console.error('Error loading reminders from persistence:', error);
  }
}

// Save a reminder to persistence
export async function saveReminderToPersistence(reminder: Reminder, userId: string): Promise<void> {
  try {
    const adapter = await getPersistenceAdapter();
    const entity = reminderToEntity(reminder, userId);
    
    const existing = await adapter.getReminderById(reminder.id);
    if (existing) {
      await adapter.updateReminder(reminder.id, entity);
    } else {
      await adapter.createReminder(entity);
    }
  } catch (error) {
    console.error('Error saving reminder to persistence:', error);
  }
}

// Save all reminders to persistence
export async function saveAllRemindersToPersistence(reminders: Reminder[], userId: string): Promise<void> {
  try {
    const adapter = await getPersistenceAdapter();
    
    // Get existing reminders to determine what to update vs create
    const existingEntities = await adapter.listReminders(userId);
    const existingIds = new Set(existingEntities.map(e => e.id));
    
    for (const reminder of reminders) {
      const entity = reminderToEntity(reminder, userId);
      
      if (existingIds.has(reminder.id)) {
        await adapter.updateReminder(reminder.id, entity);
      } else {
        await adapter.createReminder(entity);
      }
    }
  } catch (error) {
    console.error('Error saving reminders to persistence:', error);
  }
}

// Delete a reminder from persistence
export async function deleteReminderFromPersistence(id: string): Promise<void> {
  try {
    const adapter = await getPersistenceAdapter();
    await adapter.deleteReminder(id);
  } catch (error) {
    console.error('Error deleting reminder from persistence:', error);
  }
}