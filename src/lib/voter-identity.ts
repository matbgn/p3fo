import { getRandomUsername } from './username-generator';

const NAME_PREFIX = 'voted_voter_name_';
const REMOVAL_TOKEN_PREFIX = 'voted_removal_token_';

function readStored(key: string): string | null {
  try {
    const value = window.localStorage.getItem(key);
    return value !== null && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, disabled cookies); identity is
    // then only kept for this page lifetime.
  }
}

function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // See writeStored.
  }
}

/** Display name previously chosen for this vote on this browser. */
export function getStoredVoterName(voteId: string): string | null {
  if (!voteId) return null;
  return readStored(`${NAME_PREFIX}${voteId}`);
}

/** Persist the attendee-facing display name for one vote. */
export function setStoredVoterName(voteId: string, name: string): void {
  if (!voteId) return;
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    removeStored(`${NAME_PREFIX}${voteId}`);
    return;
  }
  writeStored(`${NAME_PREFIX}${voteId}`, trimmed);
}

/**
 * Return the stored name, or generate and persist a friendly random one.
 * Per-vote so the same browser can hold different names on different events.
 */
export function getOrCreateVoterName(voteId: string): string {
  const existing = getStoredVoterName(voteId);
  if (existing !== null) return existing;
  const generated = getRandomUsername();
  setStoredVoterName(voteId, generated);
  return generated;
}

/** Server-issued token behind the private RSVP removal link. */
export function getStoredRemovalToken(voteId: string): string | null {
  if (!voteId) return null;
  return readStored(`${REMOVAL_TOKEN_PREFIX}${voteId}`);
}

export function setStoredRemovalToken(voteId: string, token: string): void {
  if (!voteId) return;
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    removeStored(`${REMOVAL_TOKEN_PREFIX}${voteId}`);
    return;
  }
  writeStored(`${REMOVAL_TOKEN_PREFIX}${voteId}`, trimmed);
}

export function clearStoredRemovalToken(voteId: string): void {
  if (!voteId) return;
  removeStored(`${REMOVAL_TOKEN_PREFIX}${voteId}`);
}
