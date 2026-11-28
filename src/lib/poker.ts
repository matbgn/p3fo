export const POKER_UNKNOWN = 100;
export const POKER_COFFEE = 1000;

export type PokerScaleId = 'fibonacci' | 'tshirt' | 'powersof2' | 'animals';
export type PokerAnimalName =
  | 'mouse'
  | 'cat'
  | 'dog'
  | 'sheep'
  | 'cow'
  | 'elephant';

export interface PokerDescriptions {
  unknown: string;
  coffee: string;
  animals: Record<PokerAnimalName, string>;
}

export interface PokerCard {
  value: number;
  label: string;
  description?: string;
  descriptionKey?: 'unknown' | 'coffee' | PokerAnimalName;
  color: string;
  special?: 'unknown' | 'coffee';
}

export interface PokerScale {
  id: PokerScaleId;
  numeric: boolean;
  emoji?: boolean;
  cards: PokerCard[];
}

export interface PokerConfig {
  scale: PokerScaleId;
  round?: number;
  armedAt?: string | null;
  revealAt?: string | null;
  revealedAt?: string | null;
  /**
   * Ids of active proposals a moderator revealed on their own, before the
   * round-wide `revealedAt`. `revealedAt` still means every proposal is
   * revealed; this list is only meaningful while the round is otherwise blind.
   */
  revealedProposalIds?: string[];
}

/**
 * The readiness/reveal projection returned by `GET /api/votes/:idOrSlug/poker`.
 * Shared by the server and the public page so a field rename cannot drift.
 */
export interface PokerState {
  participantCount: number;
  readyCount: number;
  allReady: boolean;
  youAreParticipant: boolean;
  youAreReady: boolean;
  armedAt: string | null;
  revealAt: string | null;
  revealedAt: string | null;
  round: number;
  scale: PokerScaleId;
}

export interface PokerStats {
  scaleId: PokerScaleId;
  numeric: boolean;
  median: number | null;
  average: number | null;
  standardDeviation: number | null;
  verdict: string;
  distribution: Record<number, number>;
  total: number;
  estimable: number;
  unknown: number;
  coffee: number;
}

const UNKNOWN_CARD: PokerCard = {
  value: POKER_UNKNOWN,
  label: '?',
  description: 'Unsure',
  descriptionKey: 'unknown',
  color: 'bg-gray-500',
  special: 'unknown',
};

const COFFEE_CARD: PokerCard = {
  value: POKER_COFFEE,
  label: '☕',
  description: 'Coffee break',
  descriptionKey: 'coffee',
  color: 'bg-stone-600',
  special: 'coffee',
};

const FIBONACCI_CARDS: PokerCard[] = [
  { value: 0, label: '0', color: 'bg-slate-500' },
  { value: 1, label: '1', color: 'bg-sky-500' },
  { value: 2, label: '2', color: 'bg-cyan-600' },
  { value: 3, label: '3', color: 'bg-teal-600' },
  { value: 5, label: '5', color: 'bg-green-600' },
  { value: 8, label: '8', color: 'bg-lime-600' },
  { value: 13, label: '13', color: 'bg-amber-500' },
  { value: 21, label: '21', color: 'bg-orange-600' },
  { value: 34, label: '34', color: 'bg-rose-500' },
  { value: 55, label: '55', color: 'bg-red-600' },
  { value: 89, label: '89', color: 'bg-fuchsia-600' },
  UNKNOWN_CARD,
  COFFEE_CARD,
];

const TSHIRT_CARDS: PokerCard[] = [
  { value: 1, label: 'XS', color: 'bg-sky-500' },
  { value: 2, label: 'S', color: 'bg-cyan-600' },
  { value: 3, label: 'M', color: 'bg-teal-600' },
  { value: 5, label: 'L', color: 'bg-green-600' },
  { value: 8, label: 'XL', color: 'bg-lime-600' },
  { value: 13, label: 'XXL', color: 'bg-amber-500' },
  UNKNOWN_CARD,
  COFFEE_CARD,
];

const POWERS_OF_TWO_CARDS: PokerCard[] = [
  { value: 0, label: '0', color: 'bg-slate-500' },
  { value: 1, label: '1', color: 'bg-sky-500' },
  { value: 2, label: '2', color: 'bg-cyan-600' },
  { value: 4, label: '4', color: 'bg-teal-600' },
  { value: 8, label: '8', color: 'bg-green-600' },
  { value: 16, label: '16', color: 'bg-amber-500' },
  { value: 32, label: '32', color: 'bg-orange-600' },
  { value: 64, label: '64', color: 'bg-rose-500' },
  UNKNOWN_CARD,
  COFFEE_CARD,
];

const ANIMAL_CARDS: PokerCard[] = [
  { value: 1, label: '🐭', description: 'Mouse', descriptionKey: 'mouse', color: 'bg-sky-500' },
  { value: 2, label: '🐱', description: 'Cat', descriptionKey: 'cat', color: 'bg-cyan-600' },
  { value: 3, label: '🐶', description: 'Dog', descriptionKey: 'dog', color: 'bg-teal-600' },
  { value: 5, label: '🐑', description: 'Sheep', descriptionKey: 'sheep', color: 'bg-green-600' },
  { value: 8, label: '🐮', description: 'Cow', descriptionKey: 'cow', color: 'bg-lime-600' },
  { value: 13, label: '🐘', description: 'Elephant', descriptionKey: 'elephant', color: 'bg-amber-500' },
  { ...UNKNOWN_CARD, label: '❓' },
  COFFEE_CARD,
];

export const POKER_SCALES: readonly PokerScale[] = [
  { id: 'fibonacci', numeric: true, cards: FIBONACCI_CARDS },
  { id: 'tshirt', numeric: false, cards: TSHIRT_CARDS },
  { id: 'powersof2', numeric: true, cards: POWERS_OF_TWO_CARDS },
  { id: 'animals', numeric: false, emoji: true, cards: ANIMAL_CARDS },
];

export const DEFAULT_POKER_SCALE: PokerScaleId = 'fibonacci';

export function getPokerScale(id?: string | null): PokerScale {
  return POKER_SCALES.find((scale) => scale.id === id) ?? POKER_SCALES[0];
}

/**
 * Whether a ballot covers every active proposal. This is the single definition
 * of a "complete" poker ballot: the public page uses it to decide whether to
 * offer its ready action, and the server uses it to decide whether a voter can
 * count as a ready participant. An empty proposal set is never complete — a
 * round with no cards has nothing to reveal.
 */
export function pokerBallotCoversEveryProposal(
  activeProposalIds: Iterable<string>,
  isCovered: (proposalId: string) => boolean,
): boolean {
  let count = 0;
  for (const proposalId of activeProposalIds) {
    count += 1;
    if (!isCovered(proposalId)) return false;
  }
  return count > 0;
}

/**
 * Normalise an individually revealed proposal-id list. A missing value stays
 * missing so the field is not forced onto every vote; when a caller provides a
 * list it is deduplicated (first occurrence wins) and non-string entries dropped.
 */
export function normalizeRevealedProposalIds(
  ids?: readonly string[] | null,
): string[] | undefined {
  if (!Array.isArray(ids)) return undefined;
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

export function normalizePokerConfig(
  config?: Partial<PokerConfig> | null,
): PokerConfig {
  const providedRevealedIds = config?.revealedProposalIds;
  const revealedProposalIds =
    providedRevealedIds === undefined
      ? undefined
      : (normalizeRevealedProposalIds(providedRevealedIds) ?? []);
  return {
    ...config,
    ...(revealedProposalIds !== undefined ? { revealedProposalIds } : {}),
    scale: getPokerScale(config?.scale).id,
    round: config?.round ?? 0,
  };
}

export function pokerCardForValue(
  scale: PokerScale,
  value: number,
): PokerCard | undefined {
  return scale.cards.find((card) => card.value === value);
}

export function pokerCardLabel(scale: PokerScale, value: number): string {
  return pokerCardForValue(scale, value)?.label ?? String(value);
}

export function pokerCardDescription(
  card: PokerCard,
  descriptions: PokerDescriptions,
): string | undefined {
  if (!card.descriptionKey) return card.description;
  if (card.descriptionKey === 'unknown') return descriptions.unknown;
  if (card.descriptionKey === 'coffee') return descriptions.coffee;
  return descriptions.animals[card.descriptionKey] ?? card.description;
}

export function isPokerSpecial(value: number): boolean {
  return value >= POKER_UNKNOWN;
}

/** Nearest estimable card to a target, never a `?` or `☕` card. */
export function pokerClosestCard(
  scale: PokerScale,
  target: number,
): PokerCard | undefined {
  let closest: PokerCard | undefined;
  let minDiff = Number.POSITIVE_INFINITY;
  for (const card of scale.cards) {
    if (isPokerSpecial(card.value)) continue;
    const diff = Math.abs(target - card.value);
    if (diff < minDiff) {
      minDiff = diff;
      closest = card;
    }
  }
  return closest;
}

export function computePokerStats(
  values: number[],
  scaleId?: string | null,
): PokerStats {
  const scale = getPokerScale(scaleId);
  const distribution: Record<number, number> = {};
  for (const card of scale.cards) distribution[card.value] = 0;

  const estimates: number[] = [];
  let unknown = 0;
  let coffee = 0;
  for (const value of values) {
    distribution[value] = (distribution[value] ?? 0) + 1;
    if (value === POKER_UNKNOWN) {
      unknown += 1;
    } else if (value === POKER_COFFEE) {
      coffee += 1;
    } else if (value < POKER_UNKNOWN) {
      estimates.push(value);
    }
  }

  const sorted = [...estimates].sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.ceil(sorted.length / 2) - 1] : null;

  let average: number | null = null;
  let standardDeviation: number | null = null;
  let verdict: string;

  if (estimates.length > 0) {
    const sum = estimates.reduce((total, value) => total + value, 0);
    const avg = sum / estimates.length;
    const variance =
      estimates.reduce((total, value) => total + (value - avg) ** 2, 0) /
      estimates.length;
    average = avg;
    standardDeviation = Math.sqrt(variance);
    verdict =
      pokerClosestCard(scale, avg + standardDeviation / 2)?.label ??
      pokerCardLabel(scale, POKER_UNKNOWN);
  } else {
    verdict =
      coffee > 0
        ? pokerCardLabel(scale, POKER_COFFEE)
        : pokerCardLabel(scale, POKER_UNKNOWN);
  }

  return {
    scaleId: scale.id,
    numeric: scale.numeric,
    median,
    average,
    standardDeviation,
    verdict,
    distribution,
    total: values.length,
    estimable: estimates.length,
    unknown,
    coffee,
  };
}
