import type { PersistenceAdapter, SalaryBoardEntity } from '@/lib/persistence-types';

/**
 * Detects whether the workspace contains any real data beyond the
 * auto-created defaults. Used to decide if the example-data onboarding
 * prompt may be shown: the moment anything was touched (any user, tasks,
 * salaries, votes, circles, frameworks, boards, reminders, QoL answers),
 * we must never propose seeding fake data.
 *
 * Stores that are auto-persisted with default content on first view open
 * (salary board, dream/fertilization boards) are only counted as data when
 * their content differs from the pristine default.
 */
export async function hasAnyWorkspaceData(
  adapter: PersistenceAdapter,
  currentUserId: string | null,
): Promise<boolean> {
  try {
    // Any other user than the current one, or any user that completed onboarding
    const users = await adapter.listUsers();
    if (users.some(u => u.userId !== currentUserId || u.hasCompletedOnboarding)) return true;

    const [tasks, votes, circles, frameworks, reminders, qolResponses, salaryBoard, dreamBoard, fertilizationBoard, pomodoroSessions] = await Promise.all([
      adapter.listTasks(),
      adapter.listVotes(),
      adapter.listCircles(),
      adapter.listFrameworks(),
      adapter.listReminders(),
      adapter.getAllQolSurveyResponses(),
      adapter.getSalaryBoardState(),
      adapter.getDreamBoardState(),
      adapter.getFertilizationBoardState(),
      adapter.listPomodoroSessions(),
    ]);

    if (tasks.length > 0) return true;
    if (votes.length > 0) return true;
    if (circles.length > 0) return true;
    if (frameworks.length > 0) return true;
    if (reminders.length > 0) return true;
    if (Object.keys(qolResponses).length > 0) return true;
    if (pomodoroSessions.length > 0) return true;

    // Salary board: ignore the auto-persisted default (no employees, no scenarios)
    if (salaryBoard && isSalaryBoardTouched(salaryBoard)) return true;

    // Boards: any card or active session means real use
    if (dreamBoard && ((dreamBoard.cards?.length ?? 0) > 0 || dreamBoard.isSessionActive)) return true;
    if (fertilizationBoard && ((fertilizationBoard.cards?.length ?? 0) > 0 || fertilizationBoard.isSessionActive)) return true;

    return false;
  } catch (error) {
    // If the check fails, err on the safe side: do not propose fake data
    console.error('Error checking for existing workspace data:', error);
    return true;
  }
}

const isSalaryBoardTouched = (board: SalaryBoardEntity): boolean =>
  (board.employees?.length ?? 0) > 0 || (board.budget?.scenarios?.length ?? 0) > 0;