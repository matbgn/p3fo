import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getVotingStrings } from "@/lib/voting-i18n";
import type { PokerState } from "@/hooks/usePokerState";

interface PokerReadyPanelProps {
  state: PokerState | null;
  hasSubmitted: boolean;
  onCancel: () => Promise<PokerState | null>;
  onRevealNow: () => Promise<PokerState | null>;
  onNextRound: () => Promise<void>;
}

export const PokerReadyPanel: React.FC<PokerReadyPanelProps> = ({
  state,
  hasSubmitted,
  onCancel,
  onRevealNow,
  onNextRound,
}) => {
  const ts = getVotingStrings();
  const [now, setNow] = React.useState(() => Date.now());
  const [busy, setBusy] = React.useState(false);
  const revealedRef = React.useRef(false);
  const revealNowRef = React.useRef(onRevealNow);
  React.useEffect(() => {
    revealNowRef.current = onRevealNow;
  }, [onRevealNow]);

  const revealAtMs = state?.revealAt ? Date.parse(state.revealAt) : null;
  const secondsLeft = revealAtMs
    ? Math.max(0, Math.ceil((revealAtMs - now) / 1000))
    : 0;

  React.useEffect(() => {
    if (!revealAtMs) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [revealAtMs]);

  React.useEffect(() => {
    revealedRef.current = false;
  }, [state?.revealAt]);

  React.useEffect(() => {
    if (!revealAtMs || secondsLeft > 0 || revealedRef.current) return;
    revealedRef.current = true;
    void revealNowRef.current();
  }, [revealAtMs, secondsLeft]);

  if (!state) return null;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  if (state.revealedAt) {
    return (
      <div className="animate-in fade-in-0 slide-in-from-bottom-2 rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge className="bg-green-700 text-white">{ts.poker.revealed}</Badge>
            <span className="text-sm text-green-900">
              {ts.poker.round} {state.round + 1}
            </span>
          </div>
          {state.youAreParticipant && (
            <Button
              size="sm"
              onClick={() => void run(onNextRound)}
              disabled={busy}
            >
              {ts.poker.nextRound}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (state.revealAt) {
    return (
      <div className="animate-in fade-in-0 slide-in-from-bottom-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium text-amber-900">
            {ts.poker.revealingIn} <span className="text-lg">{secondsLeft}s</span>
          </div>
          {state.youAreParticipant && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void run(onCancel)}
              disabled={busy}
            >
              {ts.poker.cancelReveal}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {state.participantCount === 0
                ? ts.poker.noVotesYet
                : `${state.readyCount}/${state.participantCount} ${ts.poker.ready}`}
            </Badge>
            <span className="text-xs text-gray-500">
              {ts.poker.round} {state.round + 1}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            {state.youAreReady
              ? ts.poker.waitingForOthers
              : hasSubmitted
                ? ts.poker.readyHint
                : ts.poker.submitFirst}
          </p>
        </div>
        {hasSubmitted && state.youAreReady && (
          <Badge className="bg-green-700 text-white">{ts.poker.readyDone}</Badge>
        )}
      </div>
    </div>
  );
};
