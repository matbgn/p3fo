import * as React from "react";
import type { VoteEntity } from "@/lib/persistence-types";
import type { PokerState } from "@/lib/poker";

export type { PokerState };

type PokerAction = "ready" | "cancel" | "reveal" | "next-round";

/**
 * Moderator-only: reveal a single proposition's estimates before the round-wide
 * reveal. Unlike the participant actions this carries the moderator capability,
 * so it is a standalone helper rather than part of `usePokerState`.
 */
export const forceRevealPokerProposal = async (
  slug: string,
  proposalId: string,
  moderatorToken: string,
): Promise<VoteEntity | PokerState> => {
  const res = await fetch(`/api/votes/${slug}/poker/reveal-proposal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Moderator-Token": moderatorToken,
    },
    body: JSON.stringify({ proposalId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(
      err && typeof err.error === "string"
        ? err.error
        : "Force reveal request failed",
    );
  }
  return (await res.json()) as VoteEntity | PokerState;
};

const requestState = async (
  slug: string,
  voterToken: string | undefined,
  method: "GET" | "POST",
  action?: PokerAction,
): Promise<PokerState> => {
  const res = await fetch(
    `/api/votes/${slug}/poker${action ? `/${action}` : ""}`,
    {
      method,
      headers: {
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        ...(voterToken ? { "X-Voter-Token": voterToken } : {}),
      },
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(
      err && typeof err.error === "string" ? err.error : "Poker state request failed",
    );
  }
  return (await res.json()) as PokerState;
};

/**
 * Field list for the identity check. Typing it as `Record<keyof PokerState,
 * true>` makes the compiler reject a `PokerState` field that is not listed, so
 * adding a field cannot silently leave it out of the comparison (which would
 * make the poll keep returning the cached object).
 */
const POKER_STATE_FIELDS: Record<keyof PokerState, true> = {
  participantCount: true,
  readyCount: true,
  allReady: true,
  youAreParticipant: true,
  youAreReady: true,
  armedAt: true,
  revealAt: true,
  revealedAt: true,
  round: true,
  scale: true,
};

/**
 * Identity check for the polled projection. The 2-second poll runs for the whole
 * open phase, so an unchanged payload must keep the previous object reference or
 * every tick re-renders the whole public page and re-tallies every proposal.
 */
const samePokerState = (previous: PokerState | null, next: PokerState): boolean => {
  if (previous === null) return false;
  return (Object.keys(POKER_STATE_FIELDS) as Array<keyof PokerState>).every(
    (key) => previous[key] === next[key],
  );
};

/**
 * Live poker readiness/reveal state. Participant counts and readiness are
 * derived by the server from the same submitted responses and participant
 * digests the scheduling tally uses; the client only polls the aggregate.
 *
 * `enabled` gates whether the projection is fetched at all; `poll` gates the
 * repeating 2-second poll. They differ once a round is revealed: the aggregate
 * can no longer change until the next round starts, so polling only burns
 * requests, but a freshly loaded page still needs one fetch to learn the round
 * is revealed and render the participant-gated "Next round" control.
 */
export const usePokerState = (
  slug: string | undefined,
  voterToken: string | undefined,
  enabled: boolean,
  poll: boolean = enabled,
) => {
  const [state, setState] = React.useState<PokerState | null>(null);

  const applyState = React.useCallback((next: PokerState) => {
    setState((previous) => (samePokerState(previous, next) ? previous : next));
  }, []);

  // The projection belongs to the vote's current round. When the hook is
  // disabled (a moderator reset rewinds the vote out of the open phase), the
  // last fetched projection must not survive: consumers OR its `revealedAt`
  // into "cards are visible", which would keep the previous round's reveal on
  // screen after the responses were deleted.
  React.useEffect(() => {
    if (!enabled) setState(null);
  }, [enabled]);

  const refresh = React.useCallback(async () => {
    if (!slug || !enabled) return null;
    try {
      const next = await requestState(slug, voterToken, "GET");
      applyState(next);
      return next;
    } catch {
      // A failed poll is retried on the next tick; there is nothing to surface.
      return null;
    }
  }, [applyState, enabled, slug, voterToken]);

  React.useEffect(() => {
    if (!slug || !enabled) return;
    let mounted = true;
    requestState(slug, voterToken, "GET")
      .then((next) => {
        if (mounted) applyState(next);
      })
      .catch(() => {
        // The interval below retries; an initial failure is not fatal.
      });
    if (!poll) {
      return () => {
        mounted = false;
      };
    }
    const interval = window.setInterval(() => {
      // A background tab cannot show the result of this poll; skip the request
      // so a room full of idle tabs does not keep the state endpoint busy.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void refresh();
    }, 2000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [applyState, enabled, poll, refresh, slug, voterToken]);

  const runAction = React.useCallback(
    async (action: PokerAction) => {
      if (!slug) return null;
      try {
        const next = await requestState(slug, voterToken, "POST", action);
        applyState(next);
        return next;
      } catch {
        return null;
      }
    },
    [applyState, slug, voterToken],
  );

  return {
    state,
    refresh,
    markReady: () => runAction("ready"),
    cancelReveal: () => runAction("cancel"),
    revealNow: () => runAction("reveal"),
    nextRound: () => runAction("next-round"),
  };
};
