/**
 * Pure task temporal-field rules shared by the HTTP server, MCP imports, and
 * any other writer that persists a partial task patch.
 *
 * Before the temporal split, the legacy `terminationDate` column carried both
 * meanings: the deadline for active tasks and the completion time for Done
 * tasks. Keep it mirrored so older readers keep working. Only a counterpart
 * that the caller did not provide is derived, so an intentional clear is not
 * resurrected from the stored row.
 */
export interface TemporalTaskFields {
  triageStatus?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  terminationDate?: string | null;
}

export function applyTemporalMirror(
  target: TemporalTaskFields,
  provided: Partial<TemporalTaskFields>,
  previousStatus?: string | null,
): TemporalTaskFields {
  const has = (key: keyof TemporalTaskFields) =>
    Object.prototype.hasOwnProperty.call(provided, key);
  const statusChanged =
    provided.triageStatus !== undefined && provided.triageStatus !== previousStatus;

  if (target.triageStatus === 'Done') {
    if (has('completedAt') && !has('terminationDate')) {
      target.terminationDate = target.completedAt ?? null;
    } else if (has('terminationDate') && !has('completedAt')) {
      target.completedAt = target.terminationDate ?? null;
    } else if (statusChanged && !has('completedAt') && !has('terminationDate')) {
      // Entering Done without an explicit completion time must still record
      // when the task was completed. Legacy rows may still carry their deadline
      // only in terminationDate; migrate it to dueDate before overwriting the
      // mirror, otherwise the deadline is lost.
      if (!has('dueDate') && target.dueDate == null && target.terminationDate != null) {
        target.dueDate = target.terminationDate;
      }
      target.completedAt = new Date().toISOString();
      target.terminationDate = target.completedAt;
    }
    return target;
  }

  if (has('dueDate') && !has('terminationDate')) {
    target.terminationDate = target.dueDate ?? null;
  } else if (has('terminationDate') && !has('dueDate')) {
    target.dueDate = target.terminationDate ?? null;
  }

  // Legacy active rows may hold their deadline only in terminationDate because
  // the startup backfill deliberately skips rows older than its cutoff. Copy it
  // into dueDate on any partial update so a later status change cannot erase it.
  if (
    !has('dueDate') &&
    target.dueDate == null &&
    target.terminationDate != null &&
    previousStatus !== 'Done'
  ) {
    target.dueDate = target.terminationDate;
  }

  if (statusChanged && previousStatus === 'Done') {
    // Leaving Done must clear the completion marker and restore the deadline
    // mirror from the due date instead of keeping the completion timestamp.
    // Non-Done transitions must not touch the deadline mirror: legacy active
    // rows still keep their deadline only in terminationDate.
    if (!has('completedAt')) target.completedAt = null;
    if (!has('terminationDate') && !has('dueDate')) {
      target.terminationDate = target.dueDate ?? null;
    }
  }

  return target;
}
