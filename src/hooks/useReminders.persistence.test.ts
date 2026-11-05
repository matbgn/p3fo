import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  listReminders: vi.fn(),
  getReminderById: vi.fn(),
  createReminder: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
  clearAllReminders: vi.fn(),
}));

vi.mock('@/lib/persistence-factory', () => ({
  getPersistenceAdapter: async () => ({
    listReminders: mocks.listReminders,
    getReminderById: mocks.getReminderById,
    createReminder: mocks.createReminder,
    updateReminder: mocks.updateReminder,
    deleteReminder: mocks.deleteReminder,
    clearAllReminders: mocks.clearAllReminders,
  }),
}));

import {
  useReminderStore,
  flushPendingReminders,
  loadRemindersFromPersistence,
} from './useReminders';

const resetStore = () => {
  useReminderStore.setState({
    reminders: [],
    scheduledReminders: [],
    unreadCount: 0,
    currentUserId: 'user-1',
  });
};

describe('useReminders - dirty-set persistence', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.listReminders.mockResolvedValue([]);
    mocks.getReminderById.mockResolvedValue(null);
    resetStore();
    await flushPendingReminders();
  });

  it('writes nothing when no reminder changed', async () => {
    useReminderStore.setState({ unreadCount: 0 });
    await flushPendingReminders();

    expect(mocks.createReminder).not.toHaveBeenCalled();
    expect(mocks.updateReminder).not.toHaveBeenCalled();
  });

  it('creates only the newly added reminder', async () => {
    act(() => {
      useReminderStore.getState().addReminder({ title: 'New reminder', persistent: false });
    });

    await flushPendingReminders();

    expect(mocks.createReminder).toHaveBeenCalledTimes(1);
    expect(mocks.updateReminder).not.toHaveBeenCalled();
  });

  it('updates only the reminder that changed', async () => {
    act(() => {
      useReminderStore.getState().addReminder({ title: 'New reminder', persistent: false });
    });
    await flushPendingReminders();
    mocks.createReminder.mockClear();
    mocks.getReminderById.mockResolvedValue({ id: 'existing' });
    mocks.updateReminder.mockClear();

    const reminder = useReminderStore.getState().reminders[0];
    act(() => {
      useReminderStore.getState().markAsRead(reminder.id);
    });

    await flushPendingReminders();

    expect(mocks.updateReminder).toHaveBeenCalledTimes(1);
    expect(mocks.createReminder).not.toHaveBeenCalled();
  });

  it('does not re-persist reminders loaded from storage', async () => {
    mocks.listReminders.mockResolvedValue([
      {
        id: 'reminder-1',
        userId: 'user-1',
        title: 'Loaded reminder',
        read: false,
        persistent: false,
        state: 'triggered',
      },
    ]);

    await loadRemindersFromPersistence('user-1');
    await flushPendingReminders();

    expect(mocks.updateReminder).not.toHaveBeenCalled();
    expect(mocks.createReminder).not.toHaveBeenCalled();
  });
});
