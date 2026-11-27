import { VOTE_MODES, type VoteEntity, type VoteMode } from './persistence-types.js';
// The grade range is canonical in the voting UI scale: the tally builds every
// bucket from `MJ_SCALE`, so validation must accept exactly those values.
import { MJ_SCALE } from '../components/planView/constants.js';
import { getPokerScale } from './poker.js';

const MIN_MJ = MJ_SCALE[0].value;
const MAX_MJ = MJ_SCALE[MJ_SCALE.length - 1].value;

/**
 * The vote-update route merges `config` shallowly, so any caller-supplied mode
 * is persisted as-is. A `null` or unknown mode would otherwise slip past every
 * guard that compares against a known mode, so both the create and update
 * routes reject anything outside this list.
 */
export function isVoteMode(value: unknown): value is VoteMode {
  return typeof value === 'string' && (VOTE_MODES as readonly string[]).includes(value);
}

/**
 * Single source of truth for the values a vote mode accepts. The response route
 * and the ephemeral draft channel both use it, so a draft can never carry a
 * value that the submit route would reject.
 */
export function validateVoteResponseValue(
  vote: Pick<VoteEntity, 'config'>,
  value: number,
): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Invalid vote value: must be a finite number';
  }

  switch (vote.config.mode) {
    case 'THUMBS_UP':
      return value === 1 ? null : 'THUMBS_UP votes must have value 1';
    case 'THUMBS_UD_NEUTRAL':
      return [-1, 0, 1].includes(value)
        ? null
        : 'THUMBS_UD_NEUTRAL votes must be -1, 0, or 1';
    case 'ATTENDANCE':
      return [-1, 0, 1].includes(value)
        ? null
        : 'ATTENDANCE votes must be -1, 0, or 1';
    case 'SCHEDULING':
      if (value === 1 || value === -1) return null;
      if (value === 0) {
        return vote.config.scheduling?.allowIfNeeded === true
          ? null
          : 'SCHEDULING votes only allow 0 when "if needed" is enabled';
      }
      return 'SCHEDULING votes must be -1, 0, or 1';
    case 'POINTS': {
      const maxPts = vote.config.maxPointsPerUser ?? 10;
      return Number.isInteger(value) && value >= 0 && value <= maxPts
        ? null
        : `POINTS votes must be an integer between 0 and ${maxPts}`;
    }
    case 'MAJORITY_JUDGMENT':
      return Number.isInteger(value) && value >= MIN_MJ && value <= MAX_MJ
        ? null
        : `MAJORITY_JUDGMENT votes must be an integer between ${MIN_MJ} and ${MAX_MJ}`;
    case 'CONSENT_LOOP':
      return Number.isInteger(value) && value >= MIN_MJ && value <= MAX_MJ
        ? null
        : `CONSENT_LOOP votes must be an integer between ${MIN_MJ} and ${MAX_MJ}`;
    case 'COMPARATIVE_PRIORITIZATION':
      return 'Use the ranking-submissions endpoint for this vote';
    case 'POKER_PLANNING': {
      const scale = getPokerScale(vote.config.poker?.scale);
      return scale.cards.some((card) => card.value === value)
        ? null
        : `POKER_PLANNING votes must be one of ${scale.cards.map((card) => card.label).join(', ')}`;
    }
    default:
      return `Unknown vote mode: ${vote.config.mode}`;
  }
}
