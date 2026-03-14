/**
 * Time Overlap Detection Utilities
 * Detects overlapping time entries for the same user
 */

export interface TimeEntry {
  taskId: string;
  index: number;
  startTime: number;
  endTime: number;
  userId?: string;
  taskTitle: string;
}

export interface OverlapGroup {
  entries: TimeEntry[];
  overlapStart: number;
  overlapEnd: number;
}

export interface OverlapInfo {
  overlappingGroups: OverlapGroup[];
  entryOverlapMap: Map<string, string[]>; // entry key -> list of overlapping entry keys
}

/**
 * Generate a unique key for an entry
 */
export function getEntryKey(taskId: string, index: number): string {
  return `${taskId}-${index}`;
}

/**
 * Check if two time ranges overlap
 */
export function doTimeRangesOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean {
  // Handle running timers (endTime = 0) by treating them as ongoing
  const effectiveEnd1 = end1 === 0 ? Date.now() : end1;
  const effectiveEnd2 = end2 === 0 ? Date.now() : end2;

  // Two ranges overlap if: start1 < end2 AND start2 < end1
  return start1 < effectiveEnd2 && start2 < effectiveEnd1;
}

/**
 * Detect all overlapping time entries grouped by user
 */
export function detectTimeOverlaps(entries: TimeEntry[]): OverlapInfo {
  // Group entries by user
  const entriesByUser = new Map<string | undefined, TimeEntry[]>();
  
  for (const entry of entries) {
    const existing = entriesByUser.get(entry.userId) || [];
    existing.push(entry);
    entriesByUser.set(entry.userId, existing);
  }

  const overlappingGroups: OverlapGroup[] = [];
  const entryOverlapMap = new Map<string, string[]>();

  // Process each user's entries
  for (const [userId, userEntries] of entriesByUser) {
    // Sort by start time for efficient comparison
    const sortedEntries = [...userEntries].sort((a, b) => a.startTime - b.startTime);

    // Compare each pair of entries
    for (let i = 0; i < sortedEntries.length; i++) {
      for (let j = i + 1; j < sortedEntries.length; j++) {
        const entry1 = sortedEntries[i];
        const entry2 = sortedEntries[j];

        // If entry1 ends before entry2 starts, no need to check further (sorted)
        const effectiveEnd1 = entry1.endTime === 0 ? Date.now() : entry1.endTime;
        if (effectiveEnd1 <= entry2.startTime) {
          break; // No more overlaps possible for entry1
        }

        // Check for overlap
        if (doTimeRangesOverlap(
          entry1.startTime, entry1.endTime,
          entry2.startTime, entry2.endTime
        )) {
          const key1 = getEntryKey(entry1.taskId, entry1.index);
          const key2 = getEntryKey(entry2.taskId, entry2.index);

          // Calculate overlap period
          const overlapStart = Math.max(entry1.startTime, entry2.startTime);
          const effectiveEnd2 = entry2.endTime === 0 ? Date.now() : entry2.endTime;
          const overlapEnd = Math.min(effectiveEnd1, effectiveEnd2);

          // Find or create overlap group
          let groupFound = false;
          for (const group of overlappingGroups) {
            // Check if this entry overlaps with any entry in existing group
            const overlapsGroup = group.entries.some(e => {
              const eKey = getEntryKey(e.taskId, e.index);
              return eKey === key1 || eKey === key2;
            });

            if (overlapsGroup) {
              // Add entries to group if not already there
              if (!group.entries.some(e => getEntryKey(e.taskId, e.index) === key1)) {
                group.entries.push(entry1);
              }
              if (!group.entries.some(e => getEntryKey(e.taskId, e.index) === key2)) {
                group.entries.push(entry2);
              }
              // Extend overlap range
              group.overlapStart = Math.min(group.overlapStart, overlapStart);
              group.overlapEnd = Math.max(group.overlapEnd, overlapEnd);
              groupFound = true;
              break;
            }
          }

          if (!groupFound) {
            overlappingGroups.push({
              entries: [entry1, entry2],
              overlapStart,
              overlapEnd,
            });
          }

          // Update entry overlap map
          const existing1 = entryOverlapMap.get(key1) || [];
          if (!existing1.includes(key2)) {
            existing1.push(key2);
          }
          entryOverlapMap.set(key1, existing1);

          const existing2 = entryOverlapMap.get(key2) || [];
          if (!existing2.includes(key1)) {
            existing2.push(key1);
          }
          entryOverlapMap.set(key2, existing2);
        }
      }
    }
  }

  return {
    overlappingGroups,
    entryOverlapMap,
  };
}

/**
 * Format duration in HH:MM format
 */
export function formatOverlapDuration(startTime: number, endTime: number): string {
  const durationMs = endTime - startTime;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}