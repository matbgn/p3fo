/**
 * Shared hover timing constants.
 *
 * The "delayed hover reveal" pattern is used by several card surfaces
 * (Kanban board, Storyboard, Flow view) so that quick pointer passes do
 * not surface the action toolbar. Keeping the delay value in a single
 * place avoids drift between the three consumers.
 */

/**
 * Delay (in milliseconds) before hover-gated card controls appear after
 * the pointer enters a card. Used by `TaskCard` via the `hoverEnterDelayMs`
 * prop and by `StoryboardCard`'s internal hover timer.
 */
export const HOVER_ENTER_DELAY_MS = 1100;

/**
 * Delay (in milliseconds) before hover-gated card controls collapse after
 * the pointer leaves a card. Mirrors the value hardcoded in `TaskCard`
 * (`handleMouseLeave`); re-exported here so future consumers can reuse it.
 */
export const HOVER_LEAVE_DELAY_MS = 300;