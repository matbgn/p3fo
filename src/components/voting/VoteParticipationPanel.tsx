import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { VoteEntity } from '@/lib/persistence-types';
import {
  deriveBallotParticipationFromStats,
  type BallotParticipationStat,
} from '@/lib/vote-ranking';
import {
  responseVoterAlias,
  useVoteParticipation,
  useVoteResponseDrafts,
  useVoteResults,
} from '@/hooks/useVotes';
import { ParticipationSummary } from '@/components/voting/ParticipationSummary';

interface VoteParticipationPanelProps {
  vote: VoteEntity;
  /**
   * Active moderator link. In-progress selections are served only by the
   * moderator-authenticated draft channel, so without a token the panel shows
   * submitted participants only.
   */
  moderatorToken?: string;
}

const latest = (a: string | null, b: string | null): string | null => {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
};

/**
 * Presence view for the non-comparative modes. A participant appears as soon as
 * the public page opens (Yjs presence), then moves through in-progress/editing
 * to submitted as they interact. The status ladder and summary are shared with
 * the comparative panel so both views agree on what "editing" means.
 */
export const VoteParticipationPanel: React.FC<VoteParticipationPanelProps> = ({ vote, moderatorToken }) => {
  const { t: tt } = useTranslation();
  const isAnonymous = vote.config.isAnonymous ?? true;
  const { responses: submitted } = useVoteResults(vote.id, true, false, moderatorToken);
  // In-progress selections come from the moderator-authenticated channel and
  // only while the vote is open, so a draft from a dead tab never leaks into a
  // closed vote's view.
  const drafts = useVoteResponseDrafts(
    vote.id,
    vote.config.phase === 'OPEN',
    moderatorToken,
  );
  // Presence only exists while the vote is open; the endpoint returns an empty
  // list otherwise, so a closed vote must not keep polling it.
  const presence = useVoteParticipation(
    vote.id,
    vote.config.phase === 'OPEN',
    moderatorToken,
  );

  const summary = React.useMemo(() => {
    const byToken = new Map<
      string,
      {
        voterToken: string;
        submittedCount: number;
        draftCount: number;
        displayName: string | null;
        submittedAt: string | null;
        draftUpdatedAt: string | null;
        lastSeenAt: string | null;
      }
    >();
    const ensure = (identity: string) => {
      const existing = byToken.get(identity);
      if (existing) return existing;
      const created = {
        voterToken: identity,
        submittedCount: 0,
        draftCount: 0,
        displayName: null,
        submittedAt: null,
        draftUpdatedAt: null,
        lastSeenAt: null,
      };
      byToken.set(identity, created);
      return created;
    };

    for (const participant of presence) {
      const row = ensure(participant.participantId ?? participant.voterAlias);
      row.lastSeenAt = latest(row.lastSeenAt, participant.lastSeenAt);
    }
    for (const response of submitted) {
      // Join on the moderator-only participant digest when present; the public
      // projection only has the short alias. A colliding alias must not merge
      // two people into one row (or split one person in two).
      const row = ensure(response.participantId ?? responseVoterAlias(vote.id, response));
      row.submittedCount += 1;
      row.submittedAt = latest(row.submittedAt, response.submittedAt);
      row.lastSeenAt = latest(row.lastSeenAt, response.submittedAt);
      if (!row.displayName && !isAnonymous) {
        row.displayName = response.attendeeData?.displayName ?? null;
      }
    }
    for (const draft of drafts) {
      const row = ensure(draft.participantId ?? draft.voterToken);
      row.draftCount += 1;
      row.draftUpdatedAt = latest(row.draftUpdatedAt, draft.submittedAt);
      row.lastSeenAt = latest(row.lastSeenAt, draft.submittedAt);
      // A draft carries the name only for non-anonymous scheduling votes; it is
      // read through the moderator capability, never published publicly.
      if (!row.displayName && !isAnonymous) {
        row.displayName = draft.attendeeData?.displayName ?? null;
      }
    }

    const stats: BallotParticipationStat[] = Array.from(byToken.values()).map((row) => ({
      voterToken: row.voterToken,
      displayName: row.displayName,
      hasDraft: row.draftCount > 0,
      hasSubmitted: row.submittedCount > 0,
      // Non-comparative modes have no coverage/confidence. Report full coverage
      // so the shared derivation does not flag every submitted ballot as
      // "early converged"; these fields are never shown in this variant.
      draftCoveragePercent: 100,
      draftConfidencePercent: 100,
      submittedCoveragePercent: 100,
      submittedConfidencePercent: 100,
      draftUpdatedAt: row.draftUpdatedAt,
      submittedAt: row.submittedAt,
      lastSeenAt: row.lastSeenAt ?? '',
    }));

    return deriveBallotParticipationFromStats(
      vote.id,
      stats,
      isAnonymous,
    );
  }, [vote.id, isAnonymous, presence, submitted, drafts]);

  if (summary.ballots.length === 0) {
    return <p className="text-sm text-gray-400">{tt('voting.comparative.noParticipation')}</p>;
  }

  return <ParticipationSummary summary={summary} />;
};
