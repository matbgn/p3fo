/**
 * Budget-of-points vote model shared by the editor, the public ballot, the
 * results panels and the server.
 *
 * A POINTS vote either uses the historical flexible model (an integer budget
 * spent freely per proposal) or a fixed-note model (the "$100 prioritisation"
 * practice: a voter receives a multiset of notes and spends each note once).
 * The fixed-note model is a variation inside POINTS, like poker decks live
 * inside POKER_PLANNING, so every mode-independent code path stays untouched.
 */

export type BudgetPresetId = 'flexible' | 'monopoly' | 'custom';

export interface BudgetNote {
  value: number;
  count: number;
}

export interface BudgetConfig {
  preset: BudgetPresetId;
  /**
   * Resolved note multiset. Stored for fixed-note presets so a later change to
   * a built-in preset cannot retroactively alter an existing vote. Absent for
   * the flexible model.
   */
  notes?: BudgetNote[];
}

export interface BudgetPreset {
  id: BudgetPresetId;
  notes?: BudgetNote[];
}

/** proposalId -> note value (as a JSON key) -> number of notes */
export type BudgetAllocation = Record<string, Record<string, number>>;

export interface BudgetTally {
  total: number;
  backers: number;
}

export const DEFAULT_BUDGET_PRESET: BudgetPresetId = 'flexible';
export const DEFAULT_FLEXIBLE_BUDGET = 10;

export const MAX_BUDGET_DENOMINATIONS = 12;
export const MAX_BUDGET_NOTE_COUNT = 500;
export const MAX_BUDGET_TOTAL = 100_000;
export const MAX_BUDGET_ENTRIES = 500;

/**
 * Upper bound on the synchronous work the unauthenticated draft preview may
 * spend proving a per-proposal total is reachable. Above it the draft skips the
 * formability check; the submit route still validates the real note breakdown,
 * so a large configured deck cannot be turned into an event-loop stall.
 */
const MAX_DRAFT_REACHABILITY_WORK = 1_000_000;

/**
 * Hard ceiling on the fallback note reconstruction, in abstract work units.
 *
 * A visited-node counter alone was not enough: each node still built a memo key
 * whose length (and therefore the memo's memory) and the inner candidate scan
 * both scale with the number of backed proposals, so a 500-proposal ballot could
 * multiply a 250k-node budget into ~125M iterations and hundreds of MB of
 * strings on the public-page load. Every unit below — a visited node, one
 * character of a memo key, and one candidate target considered in the inner
 * loop — is charged against this single budget, which keeps total time and memo
 * memory constant no matter how many proposals the ballot backs. When it is
 * exhausted the reconstruction returns `null`; the caller already treats that as
 * "cannot rebuild", keeps the ballot read-only, and offers the reset path
 * (`budgetRebuildFailed`), and the submit route still validates the real
 * breakdown, so skipping the reconstruction is a safe degradation.
 */
const MAX_ALLOCATION_SEARCH_WORK = 4_000_000;

const FLEXIBLE_PRESET: BudgetPreset = { id: 'flexible' };

const MONOPOLY_PRESET: BudgetPreset = {
  id: 'monopoly',
  notes: [
    { value: 20, count: 2 },
    { value: 10, count: 4 },
    { value: 5, count: 4 },
  ],
};

const CUSTOM_PRESET: BudgetPreset = { id: 'custom' };

export const BUDGET_PRESETS: readonly BudgetPreset[] = [
  FLEXIBLE_PRESET,
  MONOPOLY_PRESET,
  CUSTOM_PRESET,
];

export const DEFAULT_CUSTOM_BUDGET_NOTES: readonly BudgetNote[] =
  MONOPOLY_PRESET.notes ?? [];

export function isBudgetPresetId(value: unknown): value is BudgetPresetId {
  return (
    typeof value === 'string' &&
    BUDGET_PRESETS.some((preset) => preset.id === value)
  );
}

export function budgetPresetNotes(
  preset: BudgetPresetId,
): BudgetNote[] | undefined {
  const found = BUDGET_PRESETS.find((entry) => entry.id === preset);
  return found?.notes?.map((note) => ({ ...note }));
}

/**
 * Sanitize a caller-provided note list. Invalid entries are dropped, duplicate
 * values are merged (the first occurrence wins its position), values are sorted
 * descending, and the total note count / total face value are bounded so the
 * allocation checks stay cheap.
 */
export function normalizeBudgetNotes(raw: unknown): BudgetNote[] {
  if (!Array.isArray(raw)) return [];
  const byValue = new Map<number, number>();
  // Bound the scan: this parser runs on the create/update routes whose body
  // limit is 10mb, so an unbounded `raw` array would let one request force the
  // event loop through hundreds of thousands of entries. Every other budget
  // path caps its input (MAX_BUDGET_ENTRIES); a fully expanded valid deck is at
  // most MAX_BUDGET_DENOMINATIONS x MAX_BUDGET_ENTRIES entries, so entries past
  // this cap can only be redundant duplicates that the merge would ignore.
  const scanLimit = Math.min(
    raw.length,
    MAX_BUDGET_DENOMINATIONS * MAX_BUDGET_ENTRIES,
  );
  for (let index = 0; index < scanLimit; index++) {
    const entry = raw[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const value = (entry as { value?: unknown }).value;
    const count = (entry as { count?: unknown }).count;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value <= 0 ||
      value > MAX_BUDGET_TOTAL
    ) {
      continue;
    }
    if (
      typeof count !== 'number' ||
      !Number.isInteger(count) ||
      count <= 0 ||
      count > MAX_BUDGET_NOTE_COUNT
    ) {
      continue;
    }
    byValue.set(value, (byValue.get(value) ?? 0) + count);
  }

  const sorted = [...byValue.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_BUDGET_DENOMINATIONS);

  const notes: BudgetNote[] = [];
  let remainingNotes = MAX_BUDGET_NOTE_COUNT;
  let remainingTotal = MAX_BUDGET_TOTAL;
  for (const note of sorted) {
    const byCount = Math.min(note.count, remainingNotes);
    const byValue = Math.floor(remainingTotal / note.value);
    const count = Math.min(byCount, byValue);
    if (count <= 0) continue;
    notes.push({ value: note.value, count });
    remainingNotes -= count;
    remainingTotal -= count * note.value;
  }
  return notes;
}

/**
 * Resolve a stored budget block to its canonical form. An unknown preset or a
 * custom preset without any usable note falls back to the flexible model so a
 * corrupted config can never make a vote unanswerable.
 */
export function normalizeBudgetConfig(
  raw?: Partial<BudgetConfig> | null,
): BudgetConfig {
  const preset = isBudgetPresetId(raw?.preset)
    ? raw!.preset!
    : DEFAULT_BUDGET_PRESET;
  if (preset === 'flexible') return { preset };
  if (preset === 'custom') {
    const notes = normalizeBudgetNotes(raw?.notes);
    return notes.length > 0 ? { preset, notes } : { preset: 'flexible' };
  }
  // The stored multiset is authoritative for a built-in preset, so editing the
  // preset constant in a later release cannot retroactively reinterpret an
  // existing vote. Fall back to the current canonical notes only when the
  // stored block predates this field.
  const storedNotes = normalizeBudgetNotes(raw?.notes);
  if (storedNotes.length > 0) return { preset, notes: storedNotes };
  return { preset, notes: budgetPresetNotes(preset) ?? [] };
}

/**
 * Resolve the budget block a points-vote editor should both display and
 * persist for the currently selected preset.
 *
 * A built-in preset keeps the note multiset loaded with the vote (or seeded
 * when the preset was chosen), so a later edit to the preset constant cannot
 * retroactively reinterpret a stored vote; the flexible model carries no notes.
 * Keeping this in one place means the preview and the save payload can never
 * disagree about which deck is authoritative.
 */
export function budgetFromPreset(
  preset: BudgetPresetId,
  notes: readonly BudgetNote[],
): BudgetConfig {
  return normalizeBudgetConfig({
    preset,
    notes: preset === 'flexible' ? undefined : [...notes],
  });
}

type BudgetConfigSource = {
  budget?: BudgetConfig | null;
  maxPointsPerUser?: number | null;
};

export function budgetNotes(
  source: BudgetConfigSource,
): BudgetNote[] | undefined {
  if (!source.budget) return undefined;
  const normalized = normalizeBudgetConfig(source.budget);
  return normalized.preset === 'flexible' ? undefined : normalized.notes;
}

export function budgetUsesNotes(source: BudgetConfigSource): boolean {
  return (budgetNotes(source)?.length ?? 0) > 0;
}

/** The flexible per-proposal `allowMultiple` toggle only applies to points. */
export function budgetAllowsMultiple(source: BudgetConfigSource): boolean {
  return !budgetUsesNotes(source);
}

export function budgetTotal(source: BudgetConfigSource): number {
  const notes = budgetNotes(source);
  if (notes && notes.length > 0) {
    return budgetNoteTotal(notes);
  }
  const max = source.maxPointsPerUser;
  return typeof max === 'number' && Number.isFinite(max) && max > 0
    ? max
    : DEFAULT_FLEXIBLE_BUDGET;
}

export function budgetNoteTotal(notes: readonly BudgetNote[]): number {
  return notes.reduce((sum, note) => sum + note.value * note.count, 0);
}

/**
 * Validate a budget config as submitted to the create/update routes. Returns an
 * error string, or null when the block is usable.
 */
export function budgetConfigError(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return 'budget must be an object';
  }
  const preset = (raw as { preset?: unknown }).preset;
  if (preset !== undefined && !isBudgetPresetId(preset)) {
    return 'Invalid budget variation';
  }
  if (preset === 'custom') {
    const notes = normalizeBudgetNotes((raw as { notes?: unknown }).notes);
    if (notes.length === 0) {
      return 'A custom budget needs at least one positive note';
    }
    return null;
  }
  if (preset !== undefined && preset !== 'flexible') {
    // Built-in presets are canonical, but the stored note multiset is the
    // authority: a caller may pass one through untouched and a later preset
    // edit still cannot alter an existing vote.
    return null;
  }
  if (preset === undefined) {
    // Treat an untyped block as flexible only when it carries no notes.
    const notes = normalizeBudgetNotes((raw as { notes?: unknown }).notes);
    if (notes.length > 0) {
      return 'A budget variation is required when notes are provided';
    }
  }
  return null;
}

/**
 * Resolve the effective budget block and total for a create/update payload.
 *
 * Both vote routes apply the same rules — sanitize the block, reject a
 * malformed flexible cap, derive the total from the notes when the variation
 * is fixed, and keep the stored values when the request omits them — so the
 * resolution lives here instead of being copied per route.
 */
export function resolveBudgetConfig(input: {
  requestedBudget: unknown;
  budgetProvided: boolean;
  requestedMaxPointsPerUser: unknown;
  maxProvided: boolean;
  fallbackBudget?: BudgetConfig | null;
  fallbackMaxPointsPerUser?: number | null;
}):
  | { budget: BudgetConfig; maxPointsPerUser: number; error: null }
  | { budget: null; maxPointsPerUser: null; error: string } {
  if (input.budgetProvided) {
    const budgetError = budgetConfigError(input.requestedBudget);
    if (budgetError) {
      return { budget: null, maxPointsPerUser: null, error: budgetError };
    }
  }
  const budget = normalizeBudgetConfig(
    input.budgetProvided
      ? (input.requestedBudget as Partial<BudgetConfig> | null)
      : input.fallbackBudget,
  );
  const requestedMax = input.requestedMaxPointsPerUser;
  const maxProvided = input.maxProvided && requestedMax !== undefined;
  if (
    budget.preset === 'flexible' &&
    maxProvided &&
    (typeof requestedMax !== 'number' ||
      !Number.isInteger(requestedMax) ||
      requestedMax <= 0)
  ) {
    return {
      budget: null,
      maxPointsPerUser: null,
      error: 'maxPointsPerUser must be a positive integer',
    };
  }
  const maxPointsPerUser = budgetTotal({
    budget,
    maxPointsPerUser:
      maxProvided && typeof requestedMax === 'number'
        ? requestedMax
        : input.fallbackMaxPointsPerUser,
  });
  return { budget, maxPointsPerUser, error: null };
}

/**
 * Apply a resolved budget block to a vote-config record and drop the derived
 * `allowMultiple` flag for fixed-note variations. The create and update routes
 * both use this so the rule cannot drift between them: a fixed-note vote saved
 * through only one route must not stay spendable at one point per proposal.
 */
export function applyResolvedBudgetConfig(
  target: Record<string, unknown>,
  resolved: { budget: BudgetConfig; maxPointsPerUser: number },
): void {
  target.budget = resolved.budget;
  target.maxPointsPerUser = resolved.maxPointsPerUser;
  if (!budgetAllowsMultiple({ budget: resolved.budget })) {
    target.allowMultiple = undefined;
  }
}

/**
 * Remove every points-budget field from a config that is not a POINTS vote.
 * One helper keeps the create and update routes clearing the same fields when a
 * budget field is added later.
 */
export function clearBudgetConfig(target: Record<string, unknown>): void {
  target.budget = undefined;
  target.maxPointsPerUser = undefined;
  target.allowMultiple = undefined;
}

export function formatBudgetAmount(value: number): string {
  return `$${value}`;
}

/**
 * The presentational derivation shared by every POINTS results surface: the
 * amount formatter (money vs points), the leading glyph, and the aggregate
 * budget the share bar is measured against. Keeping it in one place means the
 * moderator panel and the public page cannot silently diverge.
 */
export interface BudgetTallyPresentation {
  formatAmount: (value: number) => string;
  icon: string;
  aggregateTotal: number;
}

export function budgetTallyPresentation(
  source: BudgetConfigSource,
  voters: number,
  pointsLabel: string,
): BudgetTallyPresentation {
  const usesNotes = budgetUsesNotes(source);
  return {
    formatAmount: usesNotes
      ? formatBudgetAmount
      : (value: number) => `${value} ${pointsLabel}`,
    icon: usesNotes ? "💵" : "🪙",
    aggregateTotal: budgetTotal(source) * Math.max(1, voters),
  };
}

export function formatBudgetNotes(notes: readonly BudgetNote[]): string {
  return notes
    .map((note) => `${note.count}\u00d7${formatBudgetAmount(note.value)}`)
    .join(' + ');
}

/** Count the notes already spent per face value across a whole allocation. */
export function budgetUsedNoteCounts(
  allocation: BudgetAllocation | undefined,
): Record<number, number> {
  const used: Record<number, number> = {};
  if (!allocation) return used;
  for (const perProposal of Object.values(allocation)) {
    if (!perProposal || typeof perProposal !== 'object') continue;
    for (const [rawValue, rawCount] of Object.entries(perProposal)) {
      const value = Number(rawValue);
      const count = Number(rawCount);
      if (!Number.isInteger(value) || value <= 0) continue;
      if (!Number.isInteger(count) || count <= 0) continue;
      used[value] = (used[value] ?? 0) + count;
    }
  }
  return used;
}

export interface BudgetSubmissionBody {
  values?: unknown;
  allocation?: unknown;
}

export interface BudgetParseResult {
  values: Record<string, number>;
  error: string | null;
}

/**
 * Single-value flexible check shared by the whole-ballot parser and the legacy
 * per-row submit route. The per-proposal cap — including the `allowMultiple`
 * rule — lives here so the two writable paths cannot drift while the fallback is
 * still live during a rolling deploy. `spentElsewhere` is only passed by the
 * whole-ballot parser; the per-row route cannot see the rest of the ballot.
 */
export function flexibleValueError(
  source: BudgetConfigSource & { allowMultiple?: boolean | null },
  value: number,
  spentElsewhere = 0,
): string | null {
  const allowMultiple = source.allowMultiple ?? false;
  if (!allowMultiple && value > 1) {
    return 'This points vote allows at most one point per proposal';
  }
  const totalBudget = budgetTotal(source);
  if (spentElsewhere + value > totalBudget) {
    return `Budget exceeds the maximum of ${totalBudget}`;
  }
  return null;
}

function parseFlexibleSubmission(
  source: BudgetConfigSource & { allowMultiple?: boolean | null },
  activeProposalIds: ReadonlySet<string>,
  body: BudgetSubmissionBody,
): BudgetParseResult {
  if (
    !body.values ||
    typeof body.values !== 'object' ||
    Array.isArray(body.values)
  ) {
    return {
      values: {},
      error: 'values must be an object keyed by proposal id',
    };
  }
  const entries = Object.entries(body.values as Record<string, unknown>);
  if (entries.length > MAX_BUDGET_ENTRIES) {
    return { values: {}, error: 'Too many budget values' };
  }
  const values: Record<string, number> = {};
  let spent = 0;
  for (const [proposalId, rawValue] of entries) {
    if (!activeProposalIds.has(proposalId)) {
      return {
        values: {},
        error: 'Budget values reference an unknown or inactive proposal',
      };
    }
    if (
      typeof rawValue !== 'number' ||
      !Number.isInteger(rawValue) ||
      rawValue < 0
    ) {
      return {
        values: {},
        error: 'Budget values must be non-negative integers',
      };
    }
    const valueError = flexibleValueError(source, rawValue, spent);
    if (valueError) {
      return { values: {}, error: valueError };
    }
    spent += rawValue;
    if (rawValue > 0) values[proposalId] = rawValue;
  }
  return { values, error: null };
}

function parseNotesSubmission(
  notes: readonly BudgetNote[],
  activeProposalIds: ReadonlySet<string>,
  body: BudgetSubmissionBody,
): BudgetParseResult {
  if (
    !body.allocation ||
    typeof body.allocation !== 'object' ||
    Array.isArray(body.allocation)
  ) {
    return {
      values: {},
      error: 'allocation must be an object keyed by proposal id',
    };
  }
  const allowed = new Map(notes.map((note) => [note.value, note.count]));
  const used: Record<number, number> = {};
  const values: Record<string, number> = {};
  const entries = Object.entries(
    body.allocation as Record<string, unknown>,
  );
  if (entries.length > MAX_BUDGET_ENTRIES) {
    return { values: {}, error: 'Too many budget allocations' };
  }
  for (const [proposalId, rawBucket] of entries) {
    if (!activeProposalIds.has(proposalId)) {
      return {
        values: {},
        error: 'Budget allocation references an unknown or inactive proposal',
      };
    }
    if (
      !rawBucket ||
      typeof rawBucket !== 'object' ||
      Array.isArray(rawBucket)
    ) {
      return {
        values: {},
        error: 'Budget allocation must be an object keyed by note value',
      };
    }
    const bucket = rawBucket as Record<string, unknown>;
    // A bucket needs at most one key per configured denomination. Without this
    // bound a caller can send millions of zero-count aliases of one value
    // ("5", "5.0", "5e0", ...) and force this public route to scan them all.
    if (Object.keys(bucket).length > allowed.size) {
      return {
        values: {},
        error: 'Budget allocation uses an unknown note value',
      };
    }
    let proposalTotal = 0;
    for (const [rawValue, rawCount] of Object.entries(bucket)) {
      const value = Number(rawValue);
      if (!allowed.has(value)) {
        return {
          values: {},
          error: 'Budget allocation uses an unknown note value',
        };
      }
      if (
        typeof rawCount !== 'number' ||
        !Number.isInteger(rawCount) ||
        rawCount < 0
      ) {
        return {
          values: {},
          error: 'Budget note counts must be non-negative integers',
        };
      }
      const nextUsed = (used[value] ?? 0) + rawCount;
      const available = allowed.get(value) ?? 0;
      if (nextUsed > available) {
        return {
          values: {},
          error: `Too many ${formatBudgetAmount(value)} notes: only ${available} available`,
        };
      }
      used[value] = nextUsed;
      proposalTotal += value * rawCount;
    }
    if (proposalTotal > 0) {
      values[proposalId] = proposalTotal;
    }
  }
  return { values, error: null };
}

/**
 * Validate one whole POINTS ballot. Flexible votes submit `{ values }`; fixed
 * note votes submit `{ allocation }`, which the server can check against the
 * exact note counts instead of trusting a client-computed total.
 */
export function parseBudgetSubmission(
  source: BudgetConfigSource & { allowMultiple?: boolean | null },
  activeProposalIds: Iterable<string>,
  body: BudgetSubmissionBody,
): BudgetParseResult {
  const active = new Set(activeProposalIds);
  const notes = budgetNotes(source);
  if (notes && notes.length > 0) {
    return parseNotesSubmission(notes, active, body);
  }
  return parseFlexibleSubmission(source, active, body);
}

/**
 * The draft channel only carries per-proposal totals, not the note breakdown.
 * Validate what can be validated from totals so a live draft cannot advertise
 * an allocation the submit route would refuse.
 *
 * This runs on an unauthenticated route, so every step is bounded by the input
 * budget rather than by the number of submitted entries: the cumulative total
 * is checked before any knapsack work, and the reachable-sum set is computed
 * once for the whole draft instead of once per proposal.
 */
export function validateBudgetDraftValues(
  source: BudgetConfigSource & { allowMultiple?: boolean | null },
  values: Record<string, number>,
): string | null {
  const active = new Set(Object.keys(values));
  const notes = budgetNotes(source);
  if (notes && notes.length > 0) {
    const total = budgetTotal(source);
    let spent = 0;
    let maxValue = 0;
    for (const value of Object.values(values)) {
      if (!Number.isInteger(value) || value < 0) {
        return 'Budget values must be non-negative integers';
      }
      spent += value;
      if (value > maxValue) maxValue = value;
    }
    // Reject an over-budget draft before the knapsack: a caller controls both
    // the entry count and each value, so the cheap sum must come first.
    if (spent > total) {
      return `Budget exceeds the maximum of ${total}`;
    }
    if (maxValue > 0) {
      const maxAmount = Math.min(maxValue, total);
      const occurrences = notes.reduce((sum, note) => sum + note.count, 0);
      // Bound the public draft route: the scan is occurrences x maxAmount, and
      // both are driven by the stored deck plus one caller-supplied value. Above
      // the cap, skip the preview check (the submit route remains authoritative)
      // instead of letting a large deck block the event loop.
      if (occurrences * maxAmount <= MAX_DRAFT_REACHABILITY_WORK) {
        const reachable = reachableNoteSums(notes, maxAmount);
        for (const [proposalId, value] of Object.entries(values)) {
          if (value > 0 && reachable[value] !== 1) {
            return `The ${formatBudgetAmount(value)} allocation for ${proposalId} cannot be formed with the available notes`;
          }
        }
      }
    }
    // A cross-proposal exact allocation is exponential in the worst case. This
    // is an ephemeral, unauthenticated preview; the submit route still validates
    // the real note breakdown, and per-proposal formability plus the total bound
    // already keep the moderator matrix from showing an obviously unsaveable
    // ballot. Deliberately do not run the full DFS here.
    return null;
  }
  return parseFlexibleSubmission(source, active, { values }).error;
}

/**
 * Reachable face values (0..maxAmount) for the bounded note multiset. One pass
 * can answer every value a ballot contains, instead of a knapsack per entry.
 */
function reachableNoteSums(
  notes: readonly BudgetNote[],
  maxAmount: number,
): Uint8Array {
  const reachable = new Uint8Array(maxAmount + 1);
  reachable[0] = 1;
  for (const note of notes) {
    if (note.value > maxAmount) continue;
    for (let occurrence = 0; occurrence < note.count; occurrence++) {
      for (let value = maxAmount; value >= note.value; value--) {
        if (reachable[value - note.value]) reachable[value] = 1;
      }
    }
  }
  return reachable;
}

function greedyAllocation(
  targets: ReadonlyArray<{ id: string; value: number }>,
  notes: readonly number[],
): BudgetAllocation | null {
  const pool = new Map<number, number>();
  for (const value of notes) pool.set(value, (pool.get(value) ?? 0) + 1);
  const poolValues = [...pool.keys()].sort((a, b) => b - a);
  const allocation: BudgetAllocation = {};
  for (const target of targets) {
    let remaining = target.value;
    for (const value of poolValues) {
      while (remaining >= value && (pool.get(value) ?? 0) > 0) {
        remaining -= value;
        pool.set(value, (pool.get(value) ?? 0) - 1);
        const bucket = (allocation[target.id] ??= {});
        const key = String(value);
        bucket[key] = (bucket[key] ?? 0) + 1;
      }
    }
    if (remaining !== 0) return null;
  }
  return allocation;
}

/**
 * Reconstruct a note allocation for persisted per-proposal totals. The submit
 * route validated a concrete allocation, so a solution exists; the greedy pass
 * covers the canonical decks and the bounded DFS handles the rest. `null` means
 * the totals cannot be explained by the stored note multiset.
 */
export function allocationFromValues(
  values: Record<string, number>,
  notes: readonly BudgetNote[],
): BudgetAllocation | null {
  const targets = Object.entries(values)
    .map(([id, value]) => ({ id, value: Math.max(0, Math.trunc(value)) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
  if (targets.length === 0) return {};

  const expanded: number[] = [];
  for (const note of notes) {
    for (let index = 0; index < note.count; index++) expanded.push(note.value);
  }
  expanded.sort((a, b) => b - a);

  const greedy = greedyAllocation(targets, expanded);
  if (greedy) return greedy;

  const allocation: BudgetAllocation = {};
  const remaining = targets.map((target) => target.value);
  const memo = new Set<string>();
  // Branch in a stable, precomputed order. Rebuilding and sorting this order at
  // every node allocated a fresh array once per visited node on a public-page
  // reload, which made the reconstruction superlinear in the number of proposals.
  const targetOrder = targets
    .map((_, index) => index)
    .sort((a, b) => targets[b].value - targets[a].value);
  let nonZeroTargets = remaining.filter((value) => value > 0).length;
  // One budget for node visits, memo-key characters, and inner-loop candidates.
  // `remaining.length` (the proposal count) therefore no longer multiplies the
  // node cap: a wide ballot simply reaches the limit after fewer nodes.
  let work = 0;
  const exhausted = () => work > MAX_ALLOCATION_SEARCH_WORK;

  const search = (noteIndex: number): boolean => {
    if (exhausted()) return false;
    work += 1;
    if (nonZeroTargets === 0) return true;
    if (noteIndex >= expanded.length) return false;
    // Build the key, then pay for every character we retain in the memo. The
    // transient string is itself bounded by the proposal count, so a single node
    // can never allocate more than one bounded key.
    const stateKey = `${noteIndex}:${remaining.join(',')}`;
    work += stateKey.length;
    if (exhausted()) return false;
    if (memo.has(stateKey)) return false;
    memo.add(stateKey);

    const noteValue = expanded[noteIndex];
    for (const index of targetOrder) {
      if (exhausted()) return false;
      work += 1;
      if (remaining[index] < noteValue) continue;
      const target = targets[index];
      remaining[index] -= noteValue;
      const becameZero = remaining[index] === 0;
      if (becameZero) nonZeroTargets -= 1;
      const bucket = (allocation[target.id] ??= {});
      const key = String(noteValue);
      bucket[key] = (bucket[key] ?? 0) + 1;
      if (search(noteIndex + 1)) return true;
      bucket[key] -= 1;
      if (bucket[key] === 0) delete bucket[key];
      if (Object.keys(bucket).length === 0) delete allocation[target.id];
      remaining[index] += noteValue;
      if (becameZero) nonZeroTargets += 1;
    }

    // Unspent notes are allowed: a voter may leave part of the budget unused.
    return search(noteIndex + 1);
  };

  return search(0) ? allocation : null;
}

/**
 * Per-proposal result for a budget vote. `backers` is the number of voters who
 * put at least one note/point on the proposal, which is the other half of the
 * "$100 prioritisation" signal beside the total amount.
 */
export function tallyBudget(
  responses: ReadonlyArray<{
    proposalId: string | null;
    value: number;
  }>,
  proposalId: string,
): BudgetTally {
  let total = 0;
  let backers = 0;
  for (const response of responses) {
    if (response.proposalId !== proposalId) continue;
    if (typeof response.value !== 'number' || !Number.isFinite(response.value)) {
      continue;
    }
    if (response.value <= 0) continue;
    total += response.value;
    backers += 1;
  }
  return { total, backers };
}
