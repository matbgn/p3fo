import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  listVotes: vi.fn(),
}));

vi.mock('@/lib/persistence-factory', () => ({
  getPersistenceAdapter: async () => ({
    listVotes: mocks.listVotes,
  }),
}));

vi.mock('@/lib/collaboration', () => ({
  yVoteProposals: {},
  yVoteResponses: {},
  yVoteLoops: {},
  initializeCollaboration: vi.fn(),
  isCollaborationEnabled: () => false,
  doc: {},
}));

import { useVotes } from './useVotes';

const VoteCard = () => {
  useVotes();
  return null;
};

const ManyVoteCards = () => (
  <>
    {Array.from({ length: 25 }, (_, index) => (
      <VoteCard key={index} />
    ))}
  </>
);

describe('useVotes - shared in-flight load', () => {
  beforeEach(() => {
    mocks.listVotes.mockReset();
    mocks.listVotes.mockResolvedValue([]);
  });

  it('shares one listVotes request across many mounted cards', async () => {
    render(<ManyVoteCards />);

    await waitFor(() => {
      expect(mocks.listVotes).toHaveBeenCalledTimes(1);
    });
  });
});
