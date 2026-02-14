import { useReminderStore, Reminder } from "@/hooks/useReminders";

export const addReminder = (reminder: Omit<Reminder, "id" | "read" | "state"> & { triggerDate?: string; taskId?: string; offsetMinutes?: number }) => {
  const finalReminder = { ...reminder };

  if (reminder.triggerDate && reminder.offsetMinutes !== undefined && reminder.offsetMinutes > 0) {
    const originalTrigger = new Date(reminder.triggerDate);
    finalReminder.originalTriggerDate = originalTrigger.toISOString(); // Set originalTriggerDate
    originalTrigger.setMinutes(originalTrigger.getMinutes() - reminder.offsetMinutes);
    finalReminder.triggerDate = originalTrigger.toISOString();
  } else if (reminder.triggerDate) {
    finalReminder.originalTriggerDate = reminder.triggerDate; // If no offset, original is the triggerDate
  }

  useReminderStore.getState().addReminder(finalReminder);
};