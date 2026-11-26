import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredRemovalToken,
  getOrCreateVoterName,
  getStoredRemovalToken,
  getStoredVoterName,
  setStoredRemovalToken,
  setStoredVoterName,
} from './voter-identity';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createMemoryStorage(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('voter identity', () => {
  it('generates and persists one display name per vote', () => {
    expect(getStoredVoterName('vote-a')).toBeNull();

    const created = getOrCreateVoterName('vote-a');
    expect(created.length).toBeGreaterThan(0);
    expect(getStoredVoterName('vote-a')).toBe(created);
    expect(getOrCreateVoterName('vote-a')).toBe(created);
    expect(getStoredVoterName('vote-b')).toBeNull();
  });

  it('stores a trimmed custom display name', () => {
    setStoredVoterName('vote-a', '  Ada Lovelace  ');
    expect(getStoredVoterName('vote-a')).toBe('Ada Lovelace');
  });

  it('clears a display name when set to blank', () => {
    setStoredVoterName('vote-a', 'Ada');
    setStoredVoterName('vote-a', '   ');
    expect(getStoredVoterName('vote-a')).toBeNull();
  });

  it('stores and clears the removal token independently from the name', () => {
    setStoredVoterName('vote-a', 'Ada');
    setStoredRemovalToken('vote-a', 'token-1');

    expect(getStoredRemovalToken('vote-a')).toBe('token-1');
    expect(getStoredVoterName('vote-a')).toBe('Ada');

    clearStoredRemovalToken('vote-a');
    expect(getStoredRemovalToken('vote-a')).toBeNull();
    expect(getStoredVoterName('vote-a')).toBe('Ada');
  });

  it('swallows storage errors', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('storage unavailable');
        },
        setItem: () => {
          throw new Error('storage unavailable');
        },
        removeItem: () => {
          throw new Error('storage unavailable');
        },
      },
    });

    expect(getStoredVoterName('vote-a')).toBeNull();
    expect(getStoredRemovalToken('vote-a')).toBeNull();
    expect(() => setStoredVoterName('vote-a', 'Ada')).not.toThrow();
    expect(() => setStoredRemovalToken('vote-a', 'token-1')).not.toThrow();
    expect(() => clearStoredRemovalToken('vote-a')).not.toThrow();
    expect(() => getOrCreateVoterName('vote-a')).not.toThrow();
  });
});
