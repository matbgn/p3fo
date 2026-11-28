import { describe, it, expect } from 'vitest';
import {
  normalizePokerConfig,
  normalizeRevealedProposalIds,
  pokerBallotCoversEveryProposal,
} from './poker';

describe('pokerBallotCoversEveryProposal', () => {
  it('accepts a ballot that covers every active proposal', () => {
    const covered = new Set(['a', 'b']);
    expect(
      pokerBallotCoversEveryProposal(['a', 'b'], (id) => covered.has(id)),
    ).toBe(true);
  });

  it('rejects a partial ballot', () => {
    const covered = new Set(['a']);
    expect(
      pokerBallotCoversEveryProposal(['a', 'b'], (id) => covered.has(id)),
    ).toBe(false);
  });

  it('rejects an empty proposal set', () => {
    expect(pokerBallotCoversEveryProposal([], () => true)).toBe(false);
  });

  it('ignores covered ids that are not active proposals', () => {
    const covered = new Set(['a', 'b', 'stale']);
    expect(
      pokerBallotCoversEveryProposal(['a', 'b'], (id) => covered.has(id)),
    ).toBe(true);
  });
});

describe('normalizeRevealedProposalIds', () => {
  it('deduplicates while preserving first-seen order', () => {
    expect(normalizeRevealedProposalIds(['b', 'a', 'b'])).toEqual(['b', 'a']);
  });

  it('keeps an explicitly provided empty list', () => {
    expect(normalizeRevealedProposalIds([])).toEqual([]);
  });

  it('leaves the field absent when no list is provided', () => {
    expect(normalizePokerConfig({ scale: 'fibonacci' })).not.toHaveProperty(
      'revealedProposalIds',
    );
  });

  it('normalizes a provided list on the config', () => {
    const config = normalizePokerConfig({
      scale: 'fibonacci',
      revealedProposalIds: ['a', 'a', 'b'],
    });
    expect(config.revealedProposalIds).toEqual(['a', 'b']);
  });
});
