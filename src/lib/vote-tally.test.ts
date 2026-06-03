import { describe, it, expect } from 'vitest'
import {
  tallyThumbsUp,
  tallyUDNeutral,
  tallyPoints,
  tallyMajorityJudgment,
  computeMJFromValues,
  getMJMedianFromRecord,
  tallyConsentLoop,
  calculateCardVoteScore,
} from './vote-tally'
import type { VoteResponseEntity, VoteLoop } from './persistence-types'

function makeResponse(overrides: Partial<VoteResponseEntity> = {}): VoteResponseEntity {
  return {
    id: 'r1',
    voteId: 'v1',
    proposalId: 'p1',
    userId: null,
    voterToken: 'token1',
    value: 0,
    submittedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeLoop(overrides: Partial<VoteLoop> = {}): VoteLoop {
  return {
    id: 'loop1',
    voteId: 'v1',
    proposalId: 'p1',
    roundNumber: 1,
    proposalContent: '[]',
    openedAt: '2026-01-01T00:00:00Z',
    openedByUserId: 'owner1',
    ...overrides,
  }
}

describe('tallyThumbsUp', () => {
  it('counts thumbs-up (value=1) for a proposal', () => {
    const responses = [
      makeResponse({ proposalId: 'p1', value: 1 }),
      makeResponse({ proposalId: 'p1', value: 1, id: 'r2', voterToken: 't2' }),
      makeResponse({ proposalId: 'p1', value: 0, id: 'r3', voterToken: 't3' }),
      makeResponse({ proposalId: 'p2', value: 1, id: 'r4', voterToken: 't4' }),
    ]
    expect(tallyThumbsUp(responses, 'p1')).toEqual({ count: 2 })
  })

  it('returns 0 when no responses match', () => {
    expect(tallyThumbsUp([], 'p1')).toEqual({ count: 0 })
    expect(tallyThumbsUp([makeResponse({ proposalId: 'p2', value: 1 })], 'p1')).toEqual({ count: 0 })
  })

  it('ignores negative values', () => {
    const responses = [
      makeResponse({ proposalId: 'p1', value: -1, id: 'r2', voterToken: 't2' }),
    ]
    expect(tallyThumbsUp(responses, 'p1')).toEqual({ count: 0 })
  })
})

describe('tallyUDNeutral', () => {
  it('counts up, neutral, and down for a proposal', () => {
    const responses = [
      makeResponse({ proposalId: 'p1', value: 1 }),
      makeResponse({ proposalId: 'p1', value: 1, id: 'r2', voterToken: 't2' }),
      makeResponse({ proposalId: 'p1', value: 0, id: 'r3', voterToken: 't3' }),
      makeResponse({ proposalId: 'p1', value: -1, id: 'r4', voterToken: 't4' }),
      makeResponse({ proposalId: 'p2', value: 1, id: 'r5', voterToken: 't5' }),
    ]
    expect(tallyUDNeutral(responses, 'p1')).toEqual({ up: 2, neutral: 1, down: 1 })
  })

  it('returns zeros for no responses', () => {
    expect(tallyUDNeutral([], 'p1')).toEqual({ up: 0, neutral: 0, down: 0 })
  })

  it('handles all neutral votes', () => {
    const responses = [
      makeResponse({ proposalId: 'p1', value: 0 }),
      makeResponse({ proposalId: 'p1', value: 0, id: 'r2', voterToken: 't2' }),
    ]
    expect(tallyUDNeutral(responses, 'p1')).toEqual({ up: 0, neutral: 2, down: 0 })
  })
})

describe('tallyPoints', () => {
  it('sums point values for a proposal', () => {
    const responses = [
      makeResponse({ proposalId: 'p1', value: 3 }),
      makeResponse({ proposalId: 'p1', value: 2, id: 'r2', voterToken: 't2' }),
      makeResponse({ proposalId: 'p1', value: -1, id: 'r3', voterToken: 't3' }),
    ]
    expect(tallyPoints(responses, 'p1')).toEqual({ total: 4 })
  })

  it('returns 0 for empty responses', () => {
    expect(tallyPoints([], 'p1')).toEqual({ total: 0 })
  })

  it('handles negative points reducing total', () => {
    const responses = [
      makeResponse({ proposalId: 'p1', value: 5 }),
      makeResponse({ proposalId: 'p1', value: -3, id: 'r2', voterToken: 't2' }),
    ]
    expect(tallyPoints(responses, 'p1')).toEqual({ total: 2 })
  })
})

describe('tallyMajorityJudgment', () => {
  it('computes median and distribution from MJ votes', () => {
    const responses = [
      makeResponse({ proposalId: 'p1', value: 4 }),
      makeResponse({ proposalId: 'p1', value: 3, id: 'r2', voterToken: 't2' }),
      makeResponse({ proposalId: 'p1', value: 2, id: 'r3', voterToken: 't3' }),
    ]
    const result = tallyMajorityJudgment(responses, 'p1')
    expect(result.median).toBe(3)
    expect(result.distribution[4]).toBe(1)
    expect(result.distribution[3]).toBe(1)
    expect(result.distribution[2]).toBe(1)
  })

  it('returns 0 median for empty responses', () => {
    const result = tallyMajorityJudgment([], 'p1')
    expect(result.median).toBe(0)
    expect(result.distribution[-1]).toBe(0)
  })
})

describe('computeMJFromValues', () => {
  it('computes lower median for odd count', () => {
    const result = computeMJFromValues([1, 2, 3])
    expect(result.median).toBe(2)
  })

  it('computes lower median for even count', () => {
    const result = computeMJFromValues([1, 2, 3, 4])
    expect(result.median).toBe(2)
  })

  it('computes single value', () => {
    expect(computeMJFromValues([4]).median).toBe(4)
  })

  it('computes empty array returns 0 median', () => {
    expect(computeMJFromValues([]).median).toBe(0)
  })

  it('computes median for all same values', () => {
    expect(computeMJFromValues([3, 3, 3]).median).toBe(3)
  })

  it('distribution covers all MJ_SCALE grades', () => {
    const result = computeMJFromValues([4, -1])
    const grades = [-1, 0, 1, 2, 3, 4]
    for (const g of grades) {
      expect(result.distribution).toHaveProperty(String(g))
    }
  })

  it('handles negative values correctly in sorted median', () => {
    const result = computeMJFromValues([-1, 0, 1, 2])
    expect(result.median).toBe(0)
  })

  it('MJ_SCALE values: 5 votes, median at ceil(5/2)-1=2', () => {
    const result = computeMJFromValues([4, 3, 2, 1, -1])
    expect(result.median).toBe(2)
  })
})

describe('getMJMedianFromRecord', () => {
  it('returns median from a vote Record<string, number>', () => {
    expect(getMJMedianFromRecord({ a: 4, b: 2, c: 3 })).toBe(3)
  })

  it('returns null for empty record', () => {
    expect(getMJMedianFromRecord({})).toBeNull()
  })

  it('returns value for single entry', () => {
    expect(getMJMedianFromRecord({ a: 2 })).toBe(2)
  })

  it('computes lower median for even number of entries', () => {
    expect(getMJMedianFromRecord({ a: 1, b: 4, c: 2, d: 3 })).toBe(2)
  })
})

describe('tallyConsentLoop', () => {
  it('returns empty proposals when no proposal IDs given', () => {
    const result = tallyConsentLoop([], [], [])
    expect(result.proposals).toEqual([])
  })

  it('returns empty per-proposal result when loops exist for a different proposal', () => {
    const loops = [makeLoop({ id: 'l1', proposalId: 'p1' })]
    const result = tallyConsentLoop(loops, [], ['p2'])
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0].proposalId).toBe('p2')
    expect(result.proposals[0].perRound).toEqual([])
    expect(result.proposals[0].current).toBeNull()
  })

  it('computes per-proposal per-round MJ tallies', () => {
    const loops = [
      makeLoop({ id: 'l1', proposalId: 'p1', roundNumber: 1, closedAt: '2026-01-02T00:00:00Z' }),
      makeLoop({ id: 'l2', proposalId: 'p1', roundNumber: 2, closedAt: '2026-01-03T00:00:00Z' }),
      makeLoop({ id: 'l3', proposalId: 'p2', roundNumber: 1 }),
    ]
    const responses = [
      makeResponse({ proposalId: 'p1', loopId: 'l1', value: 4 }),
      makeResponse({ proposalId: 'p1', loopId: 'l1', value: 3, id: 'r2', voterToken: 't2' }),
      makeResponse({ proposalId: 'p1', loopId: 'l2', value: 2, id: 'r3', voterToken: 't3' }),
      makeResponse({ proposalId: 'p1', loopId: 'l2', value: 1, id: 'r4', voterToken: 't4' }),
      makeResponse({ proposalId: 'p2', loopId: 'l3', value: 4, id: 'r5', voterToken: 't5' }),
    ]
    const result = tallyConsentLoop(loops, responses, ['p1', 'p2'])

    expect(result.proposals).toHaveLength(2)

    const p1 = result.proposals[0]
    expect(p1.proposalId).toBe('p1')
    expect(p1.perRound).toHaveLength(2)
    expect(p1.perRound[0].roundNumber).toBe(1)
    expect(p1.perRound[0].median).toBe(3)
    expect(p1.perRound[0].closed).toBe(true)
    expect(p1.perRound[0].adopted).toBe(true)
    expect(p1.perRound[1].roundNumber).toBe(2)
    expect(p1.perRound[1].median).toBe(1)
    expect(p1.perRound[1].closed).toBe(true)
    expect(p1.current).toBeNull()

    const p2 = result.proposals[1]
    expect(p2.proposalId).toBe('p2')
    expect(p2.perRound).toHaveLength(1)
    expect(p2.perRound[0].adopted).toBe(true)
    expect(p2.current).not.toBeNull()
    expect(p2.current!.median).toBe(4)
  })

  it('sets adopted=false when bottom grades have votes', () => {
    const loop = makeLoop({ id: 'l1', proposalId: 'p1', roundNumber: 1 })
    const responses = [
      makeResponse({ proposalId: 'p1', loopId: 'l1', value: 4 }),
      makeResponse({ proposalId: 'p1', loopId: 'l1', value: -1, id: 'r2', voterToken: 't2' }),
    ]
    const result = tallyConsentLoop([loop], responses, ['p1'])
    expect(result.proposals[0].perRound[0].adopted).toBe(false)
  })

  it('sets adopted=false when only grade 0 is present', () => {
    const loop = makeLoop({ id: 'l1', proposalId: 'p1', roundNumber: 1 })
    const responses = [
      makeResponse({ proposalId: 'p1', loopId: 'l1', value: 3 }),
      makeResponse({ proposalId: 'p1', loopId: 'l1', value: 0, id: 'r2', voterToken: 't2' }),
    ]
    const result = tallyConsentLoop([loop], responses, ['p1'])
    expect(result.proposals[0].perRound[0].adopted).toBe(false)
  })

  it('handles 3-round lifecycle for single proposal', () => {
    const loops = [
      makeLoop({ id: 'round1', proposalId: 'p1', roundNumber: 1, closedAt: '2026-01-02T00:00:00Z' }),
      makeLoop({ id: 'round2', proposalId: 'p1', roundNumber: 2, closedAt: '2026-01-03T00:00:00Z' }),
      makeLoop({ id: 'round3', proposalId: 'p1', roundNumber: 3 }),
    ]
    const responses = [
      makeResponse({ id: 'r1', proposalId: 'p1', loopId: 'round1', value: 2 }),
      makeResponse({ id: 'r2', proposalId: 'p1', loopId: 'round1', value: -1, voterToken: 't2' }),
      makeResponse({ id: 'r3', proposalId: 'p1', loopId: 'round2', value: 3 }),
      makeResponse({ id: 'r4', proposalId: 'p1', loopId: 'round2', value: 0, voterToken: 't3' }),
      makeResponse({ id: 'r5', proposalId: 'p1', loopId: 'round3', value: 4 }),
      makeResponse({ id: 'r6', proposalId: 'p1', loopId: 'round3', value: 3, voterToken: 't4' }),
    ]
    const result = tallyConsentLoop(loops, responses, ['p1'])

    const p1 = result.proposals[0]
    expect(p1.perRound).toHaveLength(3)
    expect(p1.perRound[0].adopted).toBe(false)
    expect(p1.perRound[0].closed).toBe(true)
    expect(p1.perRound[1].adopted).toBe(false)
    expect(p1.perRound[1].closed).toBe(true)
    expect(p1.perRound[2].adopted).toBe(true)
    expect(p1.perRound[2].closed).toBe(false)
    expect(p1.current).not.toBeNull()
    expect(p1.current!.median).toBe(3)
  })

  it('sorts loops by roundNumber regardless of input order', () => {
    const loops = [
      makeLoop({ id: 'l2', proposalId: 'p1', roundNumber: 2, closedAt: '2026-01-03T00:00:00Z' }),
      makeLoop({ id: 'l1', proposalId: 'p1', roundNumber: 1, closedAt: '2026-01-02T00:00:00Z' }),
    ]
    const responses = [
      makeResponse({ id: 'r1', proposalId: 'p1', loopId: 'l1', value: 1 }),
      makeResponse({ id: 'r2', proposalId: 'p1', loopId: 'l2', value: 3, voterToken: 't2' }),
    ]
    const result = tallyConsentLoop(loops, responses, ['p1'])
    expect(result.proposals[0].perRound[0].roundNumber).toBe(1)
    expect(result.proposals[0].perRound[1].roundNumber).toBe(2)
  })

  it('handles multiple proposals independently', () => {
    const loops = [
      makeLoop({ id: 'l1', proposalId: 'p1', roundNumber: 1 }),
      makeLoop({ id: 'l2', proposalId: 'p2', roundNumber: 1 }),
    ]
    const responses = [
      makeResponse({ proposalId: 'p1', loopId: 'l1', value: 4 }),
      makeResponse({ proposalId: 'p2', loopId: 'l2', value: 1 }),
    ]
    const result = tallyConsentLoop(loops, responses, ['p1', 'p2'])

    expect(result.proposals).toHaveLength(2)
    expect(result.proposals[0].proposalId).toBe('p1')
    expect(result.proposals[0].current!.median).toBe(4)
    expect(result.proposals[1].proposalId).toBe('p2')
    expect(result.proposals[1].current!.median).toBe(1)
  })
})

describe('calculateCardVoteScore', () => {
  it('returns 0 for empty votes', () => {
    expect(calculateCardVoteScore({}, 'THUMBS_UP')).toBe(0)
  })

  it('counts positive votes for THUMBS_UP', () => {
    expect(calculateCardVoteScore({ a: 1, b: 1, c: -1 }, 'THUMBS_UP')).toBe(2)
  })

  it('sums values for THUMBS_UD_NEUTRAL', () => {
    expect(calculateCardVoteScore({ a: 1, b: 0, c: -1 }, 'THUMBS_UD_NEUTRAL')).toBe(0)
  })

  it('sums values for POINTS', () => {
    expect(calculateCardVoteScore({ a: 5, b: 3 }, 'POINTS')).toBe(8)
  })

  it('computes median for MAJORITY_JUDGMENT', () => {
    expect(calculateCardVoteScore({ a: 4, b: 2, c: 1 }, 'MAJORITY_JUDGMENT')).toBe(2)
  })

  it('returns 0 for unknown mode', () => {
    expect(calculateCardVoteScore({ a: 1 }, 'THUMBS_UP')).toBe(1)
  })
})