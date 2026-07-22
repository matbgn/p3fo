import type { TFunction } from 'i18next';

export const MJ_SCALE = [
    { value: -1, label: 'Reject', color: 'bg-red-600', hoverColor: 'hover:bg-red-700', icon: '⛔' },
    { value: 0, label: 'Insufficient', color: 'bg-orange-500', hoverColor: 'hover:bg-orange-600', icon: '👎' },
    { value: 1, label: 'Passable', color: 'bg-yellow-400', hoverColor: 'hover:bg-yellow-500', icon: '😐' },
    { value: 2, label: 'Acceptable', color: 'bg-lime-500', hoverColor: 'hover:bg-lime-600', icon: '🙂' },
    { value: 3, label: 'Good', color: 'bg-green-600', hoverColor: 'hover:bg-green-700', icon: '👍' },
    { value: 4, label: 'Excellent', color: 'bg-green-900', hoverColor: 'hover:bg-green-950', icon: '🌟' },
];

export const VOTING_MODES_LABELS = {
    'THUMBS_UP': 'Thumbs Up',
    'THUMBS_UD_NEUTRAL': 'Up / Down / Neutral',
    'POINTS': 'Points Budget',
    'MAJORITY_JUDGMENT': 'Majority Judgment',
    'CONSENT_LOOP': 'Consent Loop'
};

const MJ_GRADE_KEYS: Record<number, string> = {
    [-1]: 'voting.mjGrade.reject',
    0: 'voting.mjGrade.insufficient',
    1: 'voting.mjGrade.passable',
    2: 'voting.mjGrade.acceptable',
    3: 'voting.mjGrade.good',
    4: 'voting.mjGrade.excellent',
};

export function mjGradeLabel(t: TFunction, value: number): string {
    return t(MJ_GRADE_KEYS[value] ?? '');
}

const VOTING_MODE_KEYS: Record<string, string> = {
    'THUMBS_UP': 'voting.mode.thumbsUp',
    'THUMBS_UD_NEUTRAL': 'voting.mode.thumbsUdNeutral',
    'POINTS': 'voting.mode.points',
    'MAJORITY_JUDGMENT': 'voting.mode.majorityJudgment',
    'CONSENT_LOOP': 'voting.mode.consentLoop',
};

export function votingModeLabel(t: TFunction, mode: string): string {
    return t(VOTING_MODE_KEYS[mode] ?? '');
}