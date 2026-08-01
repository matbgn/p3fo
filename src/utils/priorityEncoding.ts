/**
 * Dot-notation float priority encoding for hierarchical task ordering.
 *
 * Scheme:
 *   Depth 0 (roots):      1.00   2.00   3.00
 *   Depth 1 (children):   1.01   1.02   1.03       (of parent 1.00)
 *   Depth 2 (grandchild): 1.0101 1.0102            (of parent 1.01)
 *
 * Sorting by `priority ASC` yields correct hierarchical order automatically —
 * no per-sibling-group renumbering required.
 *
 * Max safe depth: ~7 (float64 precision limit around 10^-14).
 */

export const MAX_PRIORITY_DEPTH = 7;

/**
 * Compute the priority for a child at the given depth.
 *
 * @param parentPriority The priority value of the parent task (e.g. 1, 1.01).
 * @param childIndex     0-based index of the child among its siblings.
 * @param depth          1-based depth of the child (roots are depth 0).
 * @returns The float priority for the child (e.g. 1.0102).
 */
export function computeChildPriority(
  parentPriority: number,
  childIndex: number,
  depth: number,
): number {
  if (depth <= 0) {
    // Root level: integer priorities (1, 2, 3, ...)
    return childIndex + 1;
  }
  // Each depth level adds 2 decimal places.
  // depth 1 -> 10^-2, depth 2 -> 10^-4, depth d -> 10^(-2*d)
  const increment = (childIndex + 1) * Math.pow(10, -2 * depth);
  return parentPriority + increment;
}

/**
 * Renumber a list of sibling tasks sequentially based on their current order.
 *
 * @param siblings      Ordered array of sibling tasks (or objects with id).
 * @param parentPriority The priority of the parent (0 for roots).
 * @param depth         1-based depth of the siblings (0 for roots).
 * @returns Array of `{ id, priority }` patches to apply via updatePrioritiesBulk.
 */
export function renumberSiblings<T extends { id: string; priority?: number | null }>(
  siblings: T[],
  parentPriority: number,
  depth: number,
): { id: string; priority: number }[] {
  return siblings.map((sibling, index) => ({
    id: sibling.id,
    priority: computeChildPriority(parentPriority, index, depth),
  }));
}