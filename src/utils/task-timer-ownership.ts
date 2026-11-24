/**
 * Task timer ownership.
 *
 * The open timer entry is shared workspace state (it syncs over Yjs), so every
 * client can see it. Control of it must stay with the task's assignee; otherwise
 * a bystander can stop someone else's work.
 *
 * Unassigned tasks are open to everyone. An unknown current user (still
 * loading) is not blocked, so the UI does not flicker into a disabled state.
 */

/**
 * The app stores unassigned task owners in two shapes: a missing `userId`, and
 * a legacy string sentinel. Filtering code throughout the app treats both
 * `'unassigned'` and `'UNASSIGNED'` as unassigned, so this helper must agree or
 * it attributes the task to a phantom user and locks the timer for everyone.
 */
const UNASSIGNED_USER_IDS = new Set(['UNASSIGNED', 'unassigned']);

export function isUnassignedUserId(userId?: string | null): boolean {
  return !!userId && UNASSIGNED_USER_IDS.has(userId);
}

export function getTaskOwnerId(task: { userId?: string | null }): string | null {
  return task.userId && !isUnassignedUserId(task.userId) ? task.userId : null;
}

/**
 * Whether `currentUserId` may start or stop the task's timer.
 *
 * Permission only. Use `isTaskTimerOwnedByUser` for bookkeeping (WIP limits and
 * stopping the user's other timers): an unassigned task is open to everyone but
 * is not counted as any named user's own work.
 */
export function canUserToggleTaskTimer(
  task: { userId?: string | null },
  currentUserId?: string | null,
): boolean {
  if (!currentUserId) return true;
  const ownerId = getTaskOwnerId(task);
  if (!ownerId) return true;
  if (isUnassignedUserId(currentUserId)) return false;
  return ownerId === currentUserId;
}

/**
 * Whether an existing task timer belongs to `currentUserId` for WIP accounting
 * and automatic stop-on-switch.
 *
 * This is intentionally narrower than `canUserToggleTaskTimer`: an unassigned
 * task is open to everyone, but it is not any named user's own work, so it does
 * not consume their WIP slot nor get stopped when they start another task. The
 * unassigned filter pseudo-user still owns unassigned timers.
 */
export function isTaskTimerOwnedByUser(
  task: { userId?: string | null },
  currentUserId?: string | null,
): boolean {
  if (!currentUserId) return true;
  const ownerId = getTaskOwnerId(task);
  if (!ownerId) return isUnassignedUserId(currentUserId);
  return ownerId === currentUserId;
}
