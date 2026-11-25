import * as React from "react";
import { useTranslation } from "react-i18next";
import { ComparativeVotePage } from './ComparativeVotePage';
import { VoteOutcomeBanner } from '@/components/voting/VoteResults';
import { useParams } from "react-router-dom";
import { VoteEntity, VoteResponseEntity, VoteProposal, VoteLoop, AttendanceResponseData } from "@/lib/persistence-types";
import { MJ_SCALE } from "@/components/planView/constants";
import { tallyThumbsUp as tallyThumbsUpShared, tallyUDNeutral as tallyUDNeutralShared, tallyPoints as tallyPointsShared, tallyMajorityJudgment as tallyMJShared, tallyConsentLoop as tallyConsentLoopShared, getBestConsentRound, EVENT_RSVP_PROPOSAL_ID } from "@/lib/vote-tally";
import {
  attendanceCapacityErrorFromTotal,
  attendancePartySize,
  findAttendanceAnswerIssue,
  formatEventMoment,
  isBasicEmail,
  resolveMaxPartySize,
  sanitizeAttendanceData,
} from "@/lib/attendance";
import { AttendanceRsvpSummary } from "@/components/voting/AttendanceRsvpSummary";
import { getVotingStrings, type VotingStrings } from "@/lib/voting-i18n";
import {
  getOrCreateVoterName,
  getStoredRemovalToken,
  getStoredVoterName,
  setStoredRemovalToken,
  setStoredVoterName,
  clearStoredRemovalToken,
} from "@/lib/voter-identity";
import { buildEventIcs, downloadEventIcs, safeHttpUrl } from "@/lib/ics";
import {
  activeSchedulingSlots,
  buildSchedulingHeatmap,
  countSchedulingParticipants,
  formatSchedulingDateKey,
  getViewerTimeZone,
  normalizeSchedulingConfig,
  schedulingBestSlotIds,
  tallyScheduling,
} from "@/lib/scheduling";
import { SchedulingSummary } from "@/components/voting/SchedulingSummary";
import { SchedulingCalendar } from "@/components/voting/SchedulingCalendar";
import { SchedulingMonthCalendar } from "@/components/voting/SchedulingMonthCalendar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { VoterIdentityBar } from "@/components/voting/VoterIdentityBar";
import { getRandomUsername } from "@/lib/username-generator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import QRCodeBlock from "@/components/voting/QRCodeBlock";
import { LoopRoundProposalTooltip } from "@/components/voting/LoopRoundProposalTooltip";
import { LoopRoundDiffDialog } from "@/components/voting/LoopRoundDiffDialog";
import { ProposalContentDisplay } from "@/components/voting/ProposalContentDisplay";
import { doc, yVoteProposals, yVoteLoops, yVoteResponses, isCollaborationEnabled, initializeCollaboration } from "@/lib/collaboration";
import { PERSISTENCE_CONFIG } from "@/lib/persistence-config";
import { responseVoterAlias, noteVoteResponseDeletions, syncResponsesToYjs } from "@/hooks/useVotes";
import { voterAlias } from "@/lib/vote-ranking";
import {
  Vote,
  Clock,
  Users,
  Link2,
  ThumbsUp,
  ThumbsDown,
  Minus,
  MessageSquare,
  Plus,
  MinusCircle,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowDownWideNarrow,
  ArrowUpDown,
  CalendarDays,
  CalendarPlus,
  Check,
  Copy,
  MapPin,
  Trash2,
  X,
} from "lucide-react";

if (!PERSISTENCE_CONFIG.FORCE_BROWSER) {
  initializeCollaboration();
}

const parseYjsValue = (v: unknown): VoteEntity | null => {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toJSON" in v) return (v as { toJSON: () => VoteEntity }).toJSON() as VoteEntity;
  return JSON.parse(JSON.stringify(v)) as VoteEntity;
};

const parseYjsLoopValue = (v: unknown): VoteLoop | null => {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toJSON" in v) return (v as { toJSON: () => VoteLoop }).toJSON() as VoteLoop;
  return JSON.parse(JSON.stringify(v)) as VoteLoop;
};

const parseYjsResponseValue = (v: unknown): VoteResponseEntity | null => {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toJSON" in v) return (v as { toJSON: () => VoteResponseEntity }).toJSON() as VoteResponseEntity;
  return JSON.parse(JSON.stringify(v)) as VoteResponseEntity;
};



async function fetchVote(slug: string): Promise<VoteEntity | null> {
  try {
    const res = await fetch(`/api/votes/${slug}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchResults(slug: string): Promise<{
  responses: VoteResponseEntity[];
  totalVotes: number;
} | null> {
  try {
    const res = await fetch(`/api/votes/${slug}/results`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function submitResponse(
  slug: string,
  body: {
    proposalId: string;
    value: number;
    voterToken: string;
    comment?: string;
    loopId?: string;
    attendeeData?: AttendanceResponseData;
  }
): Promise<{ response: VoteResponseEntity | null; error: string | null }> {
  try {
    const res = await fetch(`/api/votes/${slug}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      console.error("Vote submission error:", err.error);
      return {
        response: null,
        error: typeof err.error === "string" ? err.error : null,
      };
    }
    return { response: await res.json(), error: null };
  } catch {
    return { response: null, error: null };
  }
}

/** Replace all of a voter's SCHEDULING availability in one request. */
async function submitSchedulingAvailability(
  slug: string,
  body: {
    voterToken: string;
    values: Record<string, number>;
    attendeeData?: AttendanceResponseData;
  },
): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`/api/votes/${slug}/responses/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // Require the route's 204 rather than any 2xx: the production catch-all
    // serves index.html with 200 for an unmatched path, so a request routed to
    // an instance that predates the batch route during a rolling deploy would
    // otherwise be reported as saved while nothing was persisted.
    if (res.status !== 204) {
      const err = await res.json().catch(() => null);
      console.error("Scheduling submission error:", err);
      return {
        error:
          err && typeof err.error === "string" ? err.error : "__network_error__",
      };
    }
    // Success is 204: the server broadcasts the persisted rows over Yjs and the
    // caller refreshes the matrix, so there is no body to read.
    return { error: null };
  } catch {
    // A network error or aborted request must not look like a successful save,
    // or the voter is shown as submitted with nothing persisted and no retry.
    return { error: "__network_error__" };
  }
}

/** Update the voter's claimed display name on every existing response. */
async function updateVoterIdentity(
  slug: string,
  voterToken: string,
  displayName: string,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/votes/${slug}/identity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterToken, displayName }),
    });
    // Same strict check as the batch submit: a 200 HTML catch-all response
    // must not be mistaken for a persisted rename.
    if (res.status !== 204) {
      const err = await res.json().catch(() => null);
      console.error("Identity update error:", err);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Withdraw exactly the RSVP row identified by its private removal token. */
async function deleteResponseByRemovalToken(
  slug: string,
  removalToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/votes/${slug}/responses`, {
      method: "DELETE",
      // Send the bearer token in a header (like X-Voter-Token) so it does not
      // end up in access/proxy logs or browser history.
      headers: { "X-Removal-Token": removalToken },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      console.error("RSVP removal error:", err.error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function deleteResponse(
  slug: string,
  body: { voterToken: string; proposalId: string; loopId?: string | null }
): Promise<boolean> {
  try {
    const params = new URLSearchParams({ proposalId: body.proposalId });
    if (body.loopId) params.set("loopId", body.loopId);
    const res = await fetch(`/api/votes/${slug}/responses?${params.toString()}`, {
      method: "DELETE",
      // The voter token is a bearer credential: send it as a header so it does
      // not land in access/proxy logs or browser history.
      headers: { "X-Voter-Token": body.voterToken },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      console.error("Vote withdrawal error:", err.error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Publish the participant's in-progress selections to the moderator-only draft
 * channel. The server authenticates the write with the voter token, stores the
 * values in memory and expires them; nothing is persisted as a vote.
 */
async function publishVoteDraft(
  slug: string,
  body: {
    voterToken: string;
    values: Record<string, number>;
    publisherId: string;
    /** Non-anonymous scheduling only: lets the moderator view name a draft. */
    displayName?: string;
  },
): Promise<void> {
  try {
    const res = await fetch(`/api/votes/${slug}/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      console.error("Vote draft publish error:", err.error);
    }
  } catch {
    // Drafts are best effort; a failed write must never block voting.
  }
}

async function deleteVoteDraft(
  slug: string,
  body: { voterToken: string; publisherId: string },
): Promise<void> {
  try {
    const query = body.publisherId
      ? `?${new URLSearchParams({ publisherId: body.publisherId }).toString()}`
      : "";
    await fetch(`/api/votes/${slug}/drafts${query}`, {
      method: "DELETE",
      // The voter token is a bearer credential: send it as a header so it does
      // not land in access/proxy logs or browser history.
      headers: { "X-Voter-Token": body.voterToken },
      // Best effort on pagehide: keepalive lets the request outlive the page.
      keepalive: true,
    });
  } catch {
    // Drafts are best effort; the server also expires them on its own.
  }
}

/** Presence heartbeat: "this participant has the page open", selection-free. */
async function publishVotePresence(
  slug: string,
  body: { voterToken: string },
): Promise<void> {
  try {
    const res = await fetch(`/api/votes/${slug}/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      console.error("Vote presence error:", err.error);
    }
  } catch {
    // Presence is best effort; it must never block voting.
  }
}

async function submitAudienceProposal(
  slug: string,
  content: string
): Promise<VoteProposal | null> {
  try {
    const res = await fetch(`/api/votes/${slug}/proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchLoops(voteId: string): Promise<VoteLoop[]> {
  try {
    const res = await fetch(`/api/votes/${voteId}/loops`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function getVoterToken(slug: string): string | null {
  try {
    return localStorage.getItem(`voted_vote_${slug}`);
  } catch {
    return null;
  }
}

function setVoterToken(slug: string, token: string): void {
  try {
    localStorage.setItem(`voted_vote_${slug}`, token);
  } catch { /* localStorage unavailable in some contexts */ }
}

function ensureVoterToken(slug: string): string {
  let token = getVoterToken(slug);
  if (!token) {
    token = crypto.randomUUID();
    setVoterToken(slug, token);
  }
  return token;
}

/**
 * The display name a scheduling participant's ballot and live draft share.
 * Anonymous votes never name the participant; both the submit path and the
 * moderator draft channel use this one rule, so the moderator's live view
 * cannot disagree with the name stored on the final ballot.
 */
function schedulingParticipantName(
  voteId: string,
  storedName: string,
  mode: string | undefined,
  isAnonymous: boolean,
): string | undefined {
  if (mode !== "SCHEDULING" || isAnonymous) return undefined;
  return storedName || getStoredVoterName(voteId) || getOrCreateVoterName(voteId);
}

/**
 * Shared header for every public vote mode: phase/kind/mode badges plus the
 * title and description. The attendance, scheduling and generic branches render
 * the same block, so a phase or badge change must not have to be applied three
 * times.
 */
const PublicVoteHeading: React.FC<{
  vote: VoteEntity;
  ts: VotingStrings;
  isFinalized: boolean;
  isClosed: boolean;
  isActive: boolean;
}> = ({ vote, ts, isFinalized, isClosed, isActive }) => (
  <>
    <div className="flex items-center gap-2 flex-wrap mb-3">
      <Badge
        variant={
          isFinalized
            ? "destructive"
            : isClosed
              ? "outline"
              : isActive
                ? "default"
                : "secondary"
        }
      >
        {ts.phases[vote.config.phase] || vote.config.phase}
      </Badge>
      <Badge variant="outline">
        {ts.kinds[vote.config.kind] || vote.config.kind}
      </Badge>
      <Badge variant="outline">
        {ts.modes[vote.config.mode] ?? vote.config.mode}
      </Badge>
    </div>

    <h1 className="text-2xl font-bold text-gray-900 mb-2">{vote.title}</h1>
    {vote.description && (
      <p className="text-gray-600 mb-4">{vote.description}</p>
    )}
  </>
);

/**
 * Voter count, closing time and linked-task marker shared by the public vote
 * headers. `leading` carries the mode-specific badge or action; the generic
 * header lists the close time first, hence the order flag.
 */
const PublicVoteCounters: React.FC<{
  ts: VotingStrings;
  closesPrefix: string;
  totalVoters: number;
  closeAt?: string;
  linkedTaskId?: string | null;
  className?: string;
  leading?: React.ReactNode;
  closeAtFirst?: boolean;
}> = ({
  ts,
  closesPrefix,
  totalVoters,
  closeAt,
  linkedTaskId,
  className,
  leading,
  closeAtFirst = false,
}) => {
  const voters = (
    <span className="flex items-center gap-1 text-sm text-gray-400">
      <Users className="w-4 h-4" />
      {totalVoters} {totalVoters !== 1 ? ts.labels.voters : ts.labels.voter}
    </span>
  );
  const closes = closeAt ? (
    <span className="flex items-center gap-1 text-sm text-gray-400">
      <Clock className="w-4 h-4" />
      {closesPrefix} {new Date(closeAt).toLocaleString()}
    </span>
  ) : null;
  return (
    <div className={className ?? "mt-4 flex flex-wrap items-center gap-3"}>
      {leading}
      {closeAtFirst ? (
        <>
          {closes}
          {voters}
        </>
      ) : (
        <>
          {voters}
          {closes}
        </>
      )}
      {linkedTaskId && (
        <span className="flex items-center gap-1 text-sm text-violet-500">
          <ExternalLink className="w-4 h-4" />
          {ts.labels.linkedTask}
        </span>
      )}
    </div>
  );
};

const PublicVotePage: React.FC = () => {
  const ts = getVotingStrings();
  const { t: tt } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [vote, setVote] = React.useState<VoteEntity | null>(null);
  const [responses, setResponses] = React.useState<VoteResponseEntity[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [voterValues, setVoterValues] = React.useState<Record<string, number>>({});
  const [comment, setComment] = React.useState("");
  const [hasSubmitted, setHasSubmitted] = React.useState(false);
  const [justVoted, setJustVoted] = React.useState(false);
  const [submittedVoterValues, setSubmittedVoterValues] = React.useState<Record<string, number>>({});
  const [schedulingSubmitError, setSchedulingSubmitError] = React.useState<string | null>(null);
  const [schedulingPaintMode, setSchedulingPaintMode] = React.useState<number>(1);
  const [schedulingShowGroup, setSchedulingShowGroup] = React.useState(false);
  const canChangeVote = vote ? (vote.config.allowVoteChangeUntilClose ?? true) : true;
  const votedAndLocked = hasSubmitted && !canChangeVote;
  const showResultsBeforeClose = vote ? (vote.config.showResultsBeforeClose ?? false) : false;
  const isClosed = vote?.config.phase === "CLOSED" || vote?.config.phase === "FINALIZED";
  const isSingleProposal = vote
    ? vote.config.mode === "SCHEDULING"
      ? false
      : !(vote.config.multipleChoiceVote ?? true) ||
        vote.config.mode === "ATTENDANCE"
    : false;
  const showResults = vote ? (isClosed || showResultsBeforeClose) : false;
  const isSchedulingMode = vote?.config.mode === "SCHEDULING";
  const hasPendingVotes =
    !isSingleProposal &&
    (Object.keys(voterValues).length > 0 || (isSchedulingMode && hasSubmitted)) &&
    (!hasSubmitted || JSON.stringify(voterValues) !== JSON.stringify(submittedVoterValues));
  const [pointsBudget, setPointsBudget] = React.useState<Record<string, number>>({});
  const [audienceProposalText, setAudienceProposalText] = React.useState("");
  const [showPrevRounds, setShowPrevRounds] = React.useState(false);

  const [diffOpen, setDiffOpen] = React.useState(false);
  const [diffProposalId, setDiffProposalId] = React.useState<string>("");

  const [resultsSortMetric, setResultsSortMetric] = React.useState<"original" | "median" | "average">("original");
  const [resultsSortDir, setResultsSortDir] = React.useState<"asc" | "desc">("desc");

  const [loops, setLoops] = React.useState<VoteLoop[]>([]);

  const [rsvpDialogValue, setRsvpDialogValue] = React.useState<number | null>(null);
  const [rsvpName, setRsvpName] = React.useState("");
  const [rsvpEmail, setRsvpEmail] = React.useState("");
  const [rsvpPartySize, setRsvpPartySize] = React.useState(1);
  const [rsvpVisibility, setRsvpVisibility] = React.useState<"public" | "hidden">("public");
  const [rsvpAnswers, setRsvpAnswers] = React.useState<Record<string, string>>({});
  const [rsvpComment, setRsvpComment] = React.useState("");
  const [rsvpError, setRsvpError] = React.useState<string | null>(null);
  const [rsvpSubmitting, setRsvpSubmitting] = React.useState(false);
  const [storedName, setStoredName] = React.useState("");
  const [welcomeOpen, setWelcomeOpen] = React.useState(false);
  const [welcomeName, setWelcomeName] = React.useState("");
  const [removalToken, setRemovalToken] = React.useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = React.useState<string | null>(null);
  const [removalNotice, setRemovalNotice] = React.useState<string | null>(null);
  const [removalBusy, setRemovalBusy] = React.useState(false);
  const [removalCopied, setRemovalCopied] = React.useState(false);
  const welcomeShownRef = React.useRef<string | null>(null);
  const processedRemovalRef = React.useRef<string | null>(null);
  const activeVoteId = vote?.id;

  const loopById = React.useMemo(() => {
    const m = new Map<string, VoteLoop>();
    for (const l of loops) m.set(l.id, l);
    return m;
  }, [loops]);

  const voteRef = React.useRef(vote);
  voteRef.current = vote;

  const voterToken = slug ? ensureVoterToken(slug) : "";

  const myRsvpAlias = vote ? voterAlias(vote.id, voterToken) : "";
  const ownRsvp = React.useMemo(
    () =>
      vote
        ? responses.find(
            (response) =>
              response.proposalId === EVENT_RSVP_PROPOSAL_ID &&
              responseVoterAlias(vote.id, response) === myRsvpAlias,
          )
        : undefined,
    [responses, vote, myRsvpAlias],
  );
  const hasOwnResponses = React.useMemo(
    () =>
      vote
        ? responses.some(
            (response) =>
              responseVoterAlias(vote.id, response) === myRsvpAlias,
          )
        : false,
    [responses, vote, myRsvpAlias],
  );

  const refreshData = React.useCallback(async () => {
    if (!slug || !vote) return;
    const resultsStartedAt = Date.now();
    const [r, v] = await Promise.all([fetchResults(slug), fetchVote(slug)]);
    if (r) {
      setResponses(r.responses);
      if (isCollaborationEnabled() && v) {
        syncResponsesToYjs(v.id, r.responses, resultsStartedAt);
      }
    }
    if (v) {
      setVote(v);
      if (isCollaborationEnabled()) {
        yVoteProposals.set(v.id, v);
      }
    }
    if (v && v.config.mode === "CONSENT_LOOP") {
      const loopData = await fetchLoops(v.id);
      setLoops(loopData);
      if (isCollaborationEnabled()) {
        loopData.forEach(l => yVoteLoops.set(l.id, l));
      }
    }
  }, [slug, vote]);

  const voteNotFoundMsg = ts.messages.voteNotFound;

  React.useEffect(() => {
    if (!slug) return;
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      const v = await fetchVote(slug);
      if (!mounted) return;
      if (!v) {
        setError(voteNotFoundMsg);
        setIsLoading(false);
        return;
      }
      setVote(v);
      if (isCollaborationEnabled()) {
        yVoteProposals.set(v.id, v);
      }

      const resultsStartedAt = Date.now();
      const r = v.config.mode === "COMPARATIVE_PRIORITIZATION" ? null : await fetchResults(slug);
      if (!mounted) return;
      if (r) {
        setResponses(r.responses);
        if (isCollaborationEnabled()) {
          syncResponsesToYjs(v.id, r.responses, resultsStartedAt);
        }
        const myToken = getVoterToken(slug);
        if (myToken) {
          // The public results route blanks the withdrawal credential and
          // returns the stable alias instead, so own-response matching uses the
          // same alias the withdraw and draft paths already use.
          const myAlias = voterAlias(v.id, myToken);
          const myResponses = r.responses.filter(
            (x) => responseVoterAlias(v.id, x) === myAlias,
          );
          if (myResponses.length > 0) {
            setHasSubmitted(true);
            const vals: Record<string, number> = {};
            myResponses.forEach((x) => {
              if (x.proposalId) vals[x.proposalId] = x.value;
            });
            setVoterValues(vals);
            // Treat the loaded server values as the submitted baseline so an
            // untouched reload is not published as a "dirty" draft.
            setSubmittedVoterValues(vals);
          }
        }
      }

      if (v.config.mode === "CONSENT_LOOP") {
        const loopData = await fetchLoops(v.id);
        if (mounted) {
          setLoops(loopData);
          if (isCollaborationEnabled()) {
            loopData.forEach(l => yVoteLoops.set(l.id, l));
          }
        }
      }
      setIsLoading(false);
    };
    load();

    const yjsVoteHandler = (_event: unknown, transaction: { local: boolean }) => {
      if (transaction.local) return;
      if (!mounted) return;
      if (isCollaborationEnabled()) {
        const allVotes = (Array.from(yVoteProposals.values()) as unknown[])
          .map(v => parseYjsValue(v))
          .filter((v): v is VoteEntity => v !== null);
        const matched = allVotes.find(vt => vt.slug === slug);
        if (matched) setVote(matched);
      }
    };

    const yjsResponseHandler = (_event: unknown, transaction: { local: boolean }) => {
      // Local upserts already updated `responses` from the fetch that produced
      // them; re-reading the map here would replay a withdrawn response that
      // the server's delete broadcast has not reached this client yet.
      if (transaction.local) return;
      if (!mounted) return;
      if (isCollaborationEnabled()) {
        const allResponses = (Array.from(yVoteResponses.values()) as unknown[])
          .map(v => parseYjsResponseValue(v))
          .filter((v): v is VoteResponseEntity => v !== null);
        const currentVoteId = voteRef.current?.id;
        if (currentVoteId) {
          setResponses(allResponses.filter(r => r.voteId === currentVoteId));
        }
      }
    };

    const yjsLoopHandler = (_event: unknown, transaction: { local: boolean }) => {
      if (transaction.local) return;
      if (!mounted) return;
      if (isCollaborationEnabled()) {
        const allLoops = (Array.from(yVoteLoops.values()) as unknown[])
          .map(v => parseYjsLoopValue(v))
          .filter((v): v is VoteLoop => v !== null);
        const currentVoteId = voteRef.current?.id;
        if (currentVoteId) {
          setLoops(allLoops.filter(l => l.voteId === currentVoteId));
        }
      }
    };

    if (isCollaborationEnabled()) {
      yVoteProposals.observe(yjsVoteHandler);
      yVoteResponses.observe(yjsResponseHandler);
      yVoteLoops.observe(yjsLoopHandler);
    } else {
      const interval = setInterval(async () => {
        // Comparative votes store ranking ballots, not vote responses; skip the
        // responses request so every public viewer does not repeatedly fetch and
        // discard a payload the comparative page never reads.
        const skipResponses =
          voteRef.current?.config.mode === "COMPARATIVE_PRIORITIZATION";
        const [v, r] = await Promise.all([
          fetchVote(slug!),
          skipResponses ? Promise.resolve(null) : fetchResults(slug!),
        ]);
        if (!mounted) return;
        if (r) setResponses(r.responses);
        if (v) setVote(v);
        if (v && v.config.mode === "CONSENT_LOOP") {
          const loopData = await fetchLoops(v.id);
          if (mounted) setLoops(loopData);
        }
      }, 5000);
      return () => {
        mounted = false;
        clearInterval(interval);
      };
    }

    return () => {
      mounted = false;
      yVoteProposals.unobserve(yjsVoteHandler);
      yVoteResponses.unobserve(yjsResponseHandler);
      yVoteLoops.unobserve(yjsLoopHandler);
    };
  }, [slug, voteNotFoundMsg]);

  const handleToggleVoteLocal = (proposalId: string, value: number) => {
    setVoterValues((prev) => {
      if (prev[proposalId] === value) {
        const next = { ...prev };
        delete next[proposalId];
        return next;
      }
      return { ...prev, [proposalId]: value };
    });
  };

  const handleSubmitVote = async (proposalId: string, value: number, loopId?: string) => {
    if (!slug || !vote) return;

    if (!isSingleProposal && mode !== "CONSENT_LOOP") {
      handleToggleVoteLocal(proposalId, value);
      return;
    }

    // In single-choice mode, withdraw any existing vote on a different proposal
    // before submitting the new one, so the server tally reflects the switch.
    if (isSingleProposal) {
      const previousProposalId = Object.keys(voterValues).find(
        (id) => id !== proposalId,
      );
      if (previousProposalId) {
        const withdrawn = await deleteResponse(slug, {
          voterToken,
          proposalId: previousProposalId,
        });
        if (!withdrawn) return;
      }
    }

    const { response: result } = await submitResponse(slug, {
      proposalId,
      value,
      voterToken,
      comment: comment || undefined,
      loopId,
    });
    if (result) {
      setHasSubmitted(true);
      setJustVoted(true);
      if (isSingleProposal) {
        setVoterValues({ [proposalId]: value });
      } else {
        setVoterValues((prev) => ({ ...prev, [proposalId]: value }));
      }
      refreshData();
    }
  };

  const handleWithdrawVote = async (proposalId: string) => {
    if (!slug || !vote) return;
    const ok = await deleteResponse(slug, { voterToken, proposalId });
    if (ok) {
      // Remove the withdrawn rows from the shared map here as well: the server
      // broadcast is fire-and-forget, and an upsert-only client would otherwise
      // keep the deleted response in the map and replay it on the next remote
      // Yjs event.
      if (isCollaborationEnabled()) {
        const keysToDelete: string[] = [];
        yVoteResponses.forEach((value, key) => {
          const parsed = parseYjsResponseValue(value);
          if (
            parsed &&
            parsed.voteId === vote.id &&
            responseVoterAlias(vote.id, parsed) === voterAlias(vote.id, voterToken) &&
            parsed.proposalId === proposalId
          ) {
            keysToDelete.push(key as string);
          }
        });
        if (keysToDelete.length > 0) {
          // Remember the ids so a results fetch already in flight cannot restore
          // this withdrawal into the shared map.
          noteVoteResponseDeletions(keysToDelete);
          doc.transact(() => keysToDelete.forEach((key) => yVoteResponses.delete(key)));
        }
      }
      setVoterValues((prev) => {
        const next = { ...prev };
        delete next[proposalId];
        if (Object.keys(next).length === 0) {
          setHasSubmitted(false);
          setJustVoted(false);
        }
        return next;
      });
      // Keep the submitted baseline in step with what the server now holds;
      // otherwise `hasPendingVotes` stays true and re-publishes a phantom draft
      // for a withdrawal that was already persisted.
      setSubmittedVoterValues((prev) => {
        if (!(proposalId in prev)) return prev;
        const next = { ...prev };
        delete next[proposalId];
        return next;
      });
      refreshData();
    }
  };

  const handleSubmitAllVotes = async () => {
    if (!slug || !vote) return;
    const isSchedulingVote = vote.config.mode === "SCHEDULING";
    const isAnonymousVote = vote.config.isAnonymous ?? true;
    // Scheduling keeps a display name on the ballot for the moderator matrix;
    // anonymous votes never send one, and scheduling never sends a comment.
    const schedulingDisplayName = schedulingParticipantName(
      vote.id,
      storedName,
      vote.config.mode,
      isAnonymousVote,
    );
    const attendeeData =
      schedulingDisplayName !== undefined
        ? { displayName: schedulingDisplayName, visibility: "hidden" as const }
        : undefined;

    if (isSchedulingVote) {
      setSchedulingSubmitError(null);
      const activeSlotIds = new Set(
        activeSchedulingSlots(vote.proposals).map((proposal) => proposal.id),
      );
      const values = Object.fromEntries(
        Object.entries(voterValues).filter(([proposalId]) =>
          activeSlotIds.has(proposalId),
        ),
      );
      const { error } = await submitSchedulingAvailability(slug, {
        voterToken,
        values,
        attendeeData,
      });
      if (error) {
        setSchedulingSubmitError(
          error === "__network_error__" ? ts.scheduling.submitError : error,
        );
        return;
      }
    } else {
      const entries = Object.entries(voterValues);
      for (const [proposalId, value] of entries) {
        await submitResponse(slug, {
          proposalId,
          value,
          voterToken,
          comment: comment || undefined,
        });
      }
    }
    setHasSubmitted(true);
    setJustVoted(true);
    setSubmittedVoterValues({ ...voterValues });
    refreshData();
  };

  const handlePointsChange = (proposalId: string, delta: number) => {
    if (!vote) return;
    const maxBudget = vote.config.maxPointsPerUser || 10;
    const allowMultiple = vote.config.allowMultiple ?? false;
    const perProposalCap = allowMultiple ? maxBudget : 1;
    const currentTotal = Object.entries(pointsBudget)
      .filter(([id]) => id !== proposalId)
      .reduce((sum, [, v]) => sum + v, 0);
    const current = pointsBudget[proposalId] || 0;
    const newVal = Math.max(
      0,
      Math.min(perProposalCap, Math.min(maxBudget - currentTotal, current + delta)),
    );
    setPointsBudget((prev) => ({ ...prev, [proposalId]: newVal }));
    setVoterValues((prev) => ({ ...prev, [proposalId]: newVal }));
  };

  const handleAudienceProposal = async () => {
    if (!slug || !audienceProposalText.trim()) return;
    const result = await submitAudienceProposal(slug, audienceProposalText.trim());
    if (result) {
      setAudienceProposalText("");
      refreshData();
    }
  };

  const isActive = vote?.config.phase === "OPEN";
  const isFinalized = vote?.config.phase === "FINALIZED";
  const isAnonymous = vote?.config.isAnonymous ?? true;

  const mode = vote?.config.mode;
  const isAttendance = mode === "ATTENDANCE";
  const isScheduling = mode === "SCHEDULING";
  const attendance = vote?.config.attendance;

  const attendanceMaxPartySize = resolveMaxPartySize(attendance);
  const attendanceMaxAttendees = Number(attendance?.maxAttendees);
  const hasAttendanceCapacity =
    Number.isFinite(attendanceMaxAttendees) && attendanceMaxAttendees > 0;
  // Single memoized projection of the response list shared by every RSVP metric
  // (voter count, going-party total, the capacity checks). The RSVP dialog
  // re-renders the page on each keystroke, but these full scans only run when
  // the responses actually change. `otherGoingPartyTotal` excludes this voter's
  // own row once, instead of rescanning for each capacity decision.
  const rsvpProjection = React.useMemo(() => {
    if (!activeVoteId) {
      return { totalVoters: 0, goingPartyTotal: 0, otherGoingPartyTotal: 0 };
    }
    if (!isAttendance) {
      return {
        totalVoters: new Set(
          responses.map((response) => responseVoterAlias(activeVoteId, response)),
        ).size,
        goingPartyTotal: 0,
        otherGoingPartyTotal: 0,
      };
    }
    const aliases = new Set<string>();
    let goingPartyTotal = 0;
    let otherGoingPartyTotal = 0;
    for (const response of responses) {
      if (response.proposalId !== EVENT_RSVP_PROPOSAL_ID) continue;
      const alias = responseVoterAlias(activeVoteId, response);
      aliases.add(alias);
      if (response.value === 1) {
        const partySize = attendancePartySize(response.attendeeData);
        goingPartyTotal += partySize;
        if (alias !== myRsvpAlias) otherGoingPartyTotal += partySize;
      }
    }
    return { totalVoters: aliases.size, goingPartyTotal, otherGoingPartyTotal };
  }, [responses, activeVoteId, isAttendance, myRsvpAlias]);
  const myCurrentRsvpValue =
    voterValues[EVENT_RSVP_PROPOSAL_ID] ?? ownRsvp?.value;
  // Both capacity decisions use the same precomputed total, so the button
  // disable state and the submit-time check cannot disagree if the rule changes.
  const attendanceFullForVoter = React.useMemo(
    () =>
      myCurrentRsvpValue !== 1 &&
      attendanceCapacityErrorFromTotal(attendance, rsvpProjection.otherGoingPartyTotal, {
        value: 1,
        partySize: 1,
      }) !== null,
    [attendance, rsvpProjection.otherGoingPartyTotal, myCurrentRsvpValue],
  );
  const rsvpCapacityError = React.useMemo(
    () =>
      rsvpDialogValue === null
        ? null
        : attendanceCapacityErrorFromTotal(
            attendance,
            rsvpProjection.otherGoingPartyTotal,
            { value: rsvpDialogValue, partySize: rsvpPartySize },
          ),
    [attendance, rsvpProjection.otherGoingPartyTotal, rsvpDialogValue, rsvpPartySize],
  );
  const removalUrl =
    removalToken && slug && typeof window !== "undefined"
      ? // Keep the bearer capability in the URL fragment: fragments are never
        // sent to the server, so the token cannot land in access/proxy logs, a
        // Referer header, or a chat link unfurl the way a query string would.
        `${window.location.origin}/v/${slug}#remove=${encodeURIComponent(removalToken)}`
      : null;
  const safeInfoUrl = safeHttpUrl(attendance?.infoUrl);
  const eventStartLabel = formatEventMoment(attendance?.eventStartAt);
  const eventEndLabel = formatEventMoment(attendance?.eventEndAt);

  const openRsvpDialog = (value: number) => {
    if (!vote) return;
    const existing = ownRsvp;
    const existingData = existing?.attendeeData;
    setRsvpName(
      isAnonymous
        ? ""
        : storedName ||
            getStoredVoterName(vote.id) ||
            existingData?.displayName ||
            getOrCreateVoterName(vote.id),
    );
    setRsvpEmail(existingData?.email ?? "");
    setRsvpPartySize(
      Math.min(attendanceMaxPartySize, attendancePartySize(existingData)),
    );
    setRsvpVisibility(existingData?.visibility === "hidden" ? "hidden" : "public");
    setRsvpAnswers(existingData?.answers ? { ...existingData.answers } : {});
    setRsvpComment(existing?.comment ?? "");
    setRsvpError(null);
    setRsvpDialogValue(value);
  };

  const handleSaveWelcomeName = () => {
    if (!vote) return;
    const name = welcomeName.trim();
    if (!name) return;
    const previousName = storedName;
    setStoredVoterName(vote.id, name);
    setStoredName(name);
    setRsvpName(name);
    setWelcomeOpen(false);
    if (
      slug &&
      previousName !== name &&
      vote.config.isAnonymous === false &&
      (vote.config.mode === "ATTENDANCE" ||
        vote.config.mode === "SCHEDULING") &&
      hasOwnResponses
    ) {
      void updateVoterIdentity(slug, voterToken, name).then((ok) => {
        if (ok) refreshData();
      });
    }
  };

  const handleSubmitRsvpDialog = async () => {
    if (!slug || !vote || rsvpDialogValue === null) return;
    setRsvpError(null);

    if (!isAnonymous) {
      if (!rsvpName.trim()) {
        setRsvpError(ts.attendance.nameRequired);
        return;
      }
    }
    const email = rsvpEmail.trim();
    if (attendance?.askEmail && email && !isBasicEmail(email)) {
      setRsvpError(ts.attendance.invalidEmail);
      return;
    }
    // Reuse the shared attendance validator instead of re-implementing the
    // required/choice rules. An existing RSVP's stored answers are stripped from
    // the public results projection and carried over server-side, so skip the
    // pre-submit gate for it: otherwise every edit would force a retype of
    // answers the client can never receive.
    if (!ownRsvp) {
      const issue = findAttendanceAnswerIssue(attendance, { answers: rsvpAnswers });
      if (issue) {
        const label =
          issue.kind === "required"
            ? ts.attendance.requiredAnswer
            : ts.attendance.invalidAnswer;
        setRsvpError(`${label}: ${issue.prompt}`);
        return;
      }
    }
    if (rsvpCapacityError) {
      setRsvpError(rsvpCapacityError);
      return;
    }

    // Single source of truth for RSVP normalization: the same sanitizer the
    // server applies, so the client and server cannot drift on name length,
    // email casing/validation, party caps or answer rules.
    const attendeeData = sanitizeAttendanceData(
      attendance,
      {
        displayName: isAnonymous ? undefined : rsvpName,
        email,
        partySize: rsvpPartySize,
        visibility: rsvpVisibility,
        answers: rsvpAnswers,
      },
      { isAnonymous },
    );

    setRsvpSubmitting(true);
    try {
      const { response: result, error: submitError } = await submitResponse(slug, {
        proposalId: EVENT_RSVP_PROPOSAL_ID,
        value: rsvpDialogValue,
        voterToken,
        comment:
          vote.config.allowFreeText && rsvpComment.trim()
            ? rsvpComment.trim()
            : undefined,
        attendeeData,
      });
      if (!result) {
        setRsvpError(submitError || ts.attendance.submitError);
        return;
      }

      const savedName = result.attendeeData?.displayName ?? rsvpName.trim();
      if (!isAnonymous && savedName) {
        setStoredVoterName(vote.id, savedName);
        setStoredName(savedName);
      }
      const savedToken = result.attendeeData?.removalToken;
      if (savedToken) {
        setStoredRemovalToken(vote.id, savedToken);
        setRemovalToken(savedToken);
      }

      setHasSubmitted(true);
      setJustVoted(true);
      setVoterValues({ [EVENT_RSVP_PROPOSAL_ID]: rsvpDialogValue });
      setSubmittedVoterValues({ [EVENT_RSVP_PROPOSAL_ID]: rsvpDialogValue });
      setComment(vote.config.allowFreeText ? rsvpComment : "");
      setRsvpDialogValue(null);
      refreshData();
    } finally {
      setRsvpSubmitting(false);
    }
  };

  const handleAddToCalendar = () => {
    if (!vote) return;
    const startAt = vote.config.attendance?.eventStartAt;
    if (!startAt) return;
    try {
      const content = buildEventIcs({
        title: vote.title,
        description: vote.description,
        startAt,
        endAt: vote.config.attendance?.eventEndAt,
        location: vote.config.attendance?.location,
        url:
          vote.config.attendance?.infoUrl ||
          (typeof window !== "undefined"
            ? `${window.location.origin}/v/${vote.slug}`
            : undefined),
      });
      downloadEventIcs(`${vote.slug || "event"}.ics`, content);
    } catch {
      // A malformed event date cannot be turned into a calendar file.
    }
  };

  const handleCopyRemovalLink = async () => {
    if (!removalUrl) return;
    try {
      await navigator.clipboard.writeText(removalUrl);
      setRemovalCopied(true);
      window.setTimeout(() => setRemovalCopied(false), 2000);
    } catch {
      setRemovalCopied(false);
    }
  };

  // Shared reset for both removal paths (the stored private link and the
  // in-session button) so their state cleanup cannot drift apart. The stored
  // token is only dropped when it belongs to the removed RSVP.
  const resetAfterRsvpRemoval = (voteId: string, token?: string | null) => {
    if (!token || getStoredRemovalToken(voteId) === token) {
      clearStoredRemovalToken(voteId);
    }
    setRemovalToken(null);
    setVoterValues((prev) => {
      const next = { ...prev };
      delete next[EVENT_RSVP_PROPOSAL_ID];
      return next;
    });
    setSubmittedVoterValues((prev) => {
      const next = { ...prev };
      delete next[EVENT_RSVP_PROPOSAL_ID];
      return next;
    });
    setHasSubmitted(false);
    setJustVoted(false);
  };

  const handleRemoveMyRsvp = async () => {
    if (!slug || !vote) return;
    setRemovalBusy(true);
    let ok = false;
    if (removalToken) {
      ok = await deleteResponseByRemovalToken(slug, removalToken);
      if (!ok) {
        ok = await deleteResponse(slug, {
          voterToken,
          proposalId: EVENT_RSVP_PROPOSAL_ID,
        });
      }
    } else {
      ok = await deleteResponse(slug, {
        voterToken,
        proposalId: EVENT_RSVP_PROPOSAL_ID,
      });
    }

    if (ok) {
      resetAfterRsvpRemoval(vote.id, removalToken);
      setRemovalNotice(ts.attendance.removalNotice);
      refreshData();
    } else {
      setRemovalNotice(ts.attendance.removalError);
    }
    setRemovalBusy(false);
  };

  const handleConfirmRemovalLink = async () => {
    if (!slug || !pendingRemoval) return;
    setRemovalBusy(true);
    const ok = await deleteResponseByRemovalToken(slug, pendingRemoval);
    if (ok) {
      const currentVote = voteRef.current;
      if (currentVote) {
        resetAfterRsvpRemoval(currentVote.id, pendingRemoval);
        void refreshData();
      }
      setRemovalNotice(ts.attendance.removalNotice);
    } else {
      setRemovalNotice(ts.attendance.removalError);
    }
    setPendingRemoval(null);
    setRemovalBusy(false);
  };

  // Publish pending local selections so the moderator tally can evolve before
  // "Submit all votes" is pressed. Nothing is persisted as a vote: this is an
  // ephemeral entry on the server, removed on submit/unload and expired after a
  // TTL.
  const draftVoteId = vote?.id;
  const draftVotePhase = vote?.config.phase;
  // Identifies this tab's writes: a second tab of the same voter (same alias)
  // must not delete the draft the editing tab is publishing.
  const draftPublisherId = React.useRef<string>("");
  // Tracks whether this tab currently has a draft on the server, so leaving the
  // pending state deletes exactly once instead of issuing a DELETE on mount.
  const draftPublishedRef = React.useRef(false);
  if (!draftPublisherId.current) {
    draftPublisherId.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
  }
  React.useEffect(() => {
    if (!slug || !draftVoteId || !voterToken) return;
    if (mode === "CONSENT_LOOP" || mode === "COMPARATIVE_PRIORITIZATION" || mode === "ATTENDANCE") return;
    // Drafts go to the moderator-authenticated channel, never to the shared
    // Yjs room, so hidden-result and anonymous votes can publish them without
    // exposing in-progress selections to other clients.
    const shouldPublish =
      draftVotePhase === "OPEN" && !votedAndLocked && hasPendingVotes;
    if (!shouldPublish) {
      if (!draftPublishedRef.current) return;
      draftPublishedRef.current = false;
      void deleteVoteDraft(slug, {
        voterToken,
        publisherId: draftPublisherId.current,
      });
      return;
    }
    const timer = window.setTimeout(() => {
      if (Object.keys(voterValues).length === 0) {
        draftPublishedRef.current = false;
        void deleteVoteDraft(slug, {
          voterToken,
          publisherId: draftPublisherId.current,
        });
        return;
      }
      draftPublishedRef.current = true;
      void publishVoteDraft(slug, {
        voterToken,
        values: { ...voterValues },
        publisherId: draftPublisherId.current,
        // Scheduling keeps a display name for the moderator matrix; the draft
        // is read only through the moderator capability, so an in-progress
        // participant is named instead of shown as their alias. Anonymous votes
        // never carry a name.
        displayName: schedulingParticipantName(
          draftVoteId,
          storedName,
          mode,
          isAnonymous,
        ),
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    slug,
    draftVoteId,
    draftVotePhase,
    mode,
    isAnonymous,
    storedName,
    votedAndLocked,
    hasPendingVotes,
    voterValues,
    voterToken,
  ]);

  React.useEffect(() => {
    if (!slug || !draftVoteId || !voterToken) return;
    const clear = () => {
      if (!draftPublishedRef.current) return;
      draftPublishedRef.current = false;
      void deleteVoteDraft(slug, {
        voterToken,
        publisherId: draftPublisherId.current,
      });
    };
    window.addEventListener("pagehide", clear);
    return () => {
      window.removeEventListener("pagehide", clear);
      clear();
    };
  }, [slug, draftVoteId, voterToken]);

  // Presence is independent of selections: a participant who only opened the
  // page still appears in the moderator's participation view, before touching a
  // ballot. The channel is moderator-authenticated, so an anonymous/hidden
  // vote can report "someone is here" without exposing who to other clients.
  // Comparative votes use the server-side ranking participation panel instead.
  React.useEffect(() => {
    if (!slug || !draftVoteId || !voterToken) return;
    if (mode === "COMPARATIVE_PRIORITIZATION") return;
    if (draftVotePhase !== "OPEN") return;
    let cancelled = false;
    const publish = () => {
      if (cancelled) return;
      void publishVotePresence(slug, { voterToken });
    };
    publish();
    const timer = window.setInterval(publish, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [slug, draftVoteId, draftVotePhase, voterToken, mode]);

  // Load the attendee identity and removal token once per vote.
  React.useEffect(() => {
    if (!activeVoteId) return;
    setStoredName(getStoredVoterName(activeVoteId) ?? "");
    setRemovalToken(getStoredRemovalToken(activeVoteId));
  }, [activeVoteId]);

  // Welcome dialog: non-anonymous attendance and scheduling votes, and only
  // until this browser has a stored display name for the vote.
  React.useEffect(() => {
    if (!activeVoteId || !vote) return;
    const voteMode = vote.config.mode;
    if (voteMode !== "ATTENDANCE" && voteMode !== "SCHEDULING") return;
    if (isAnonymous) return;
    // Scheduling always asks non-anonymous voters for a name; attendance keeps
    // its explicit moderator toggle.
    const welcomeDisabled =
      voteMode === "ATTENDANCE"
        ? vote.config.attendance?.welcomeModal === false
        : false;
    if (welcomeDisabled) {
      // The bar must still show the name silently attached to responses when
      // the moderator opted out of the dialog.
      if (!getStoredVoterName(activeVoteId)) {
        const generated = getOrCreateVoterName(activeVoteId);
        setStoredName(generated);
        setWelcomeName(generated);
      }
      return;
    }
    if (welcomeShownRef.current === activeVoteId) return;
    welcomeShownRef.current = activeVoteId;

    const existing = getStoredVoterName(activeVoteId);
    if (existing) {
      setStoredName(existing);
      return;
    }
    const generated = getOrCreateVoterName(activeVoteId);
    setStoredName(generated);
    setWelcomeName(generated);
    setWelcomeOpen(true);
  }, [activeVoteId, vote, isAnonymous]);

  // Private removal links: read the token from the fragment (never sent to the
  // server), strip it from the address bar, and ask the visitor to confirm.
  // Only the fragment form is accepted, so a removal token can never arrive in
  // a request line or access log.
  // Never delete on a bare GET: prefetchers and mail scanners load these links,
  // and a removal is irreversible.
  React.useEffect(() => {
    if (!slug || typeof window === "undefined") return;
    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(rawHash);
    const token = hashParams.get("remove");
    if (!token || processedRemovalRef.current === token) return;
    processedRemovalRef.current = token;

    hashParams.delete("remove");
    const nextHash = hashParams.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ""}`,
    );
    setPendingRemoval(token);
  }, [slug]);

  const mjGradeLabel = React.useCallback(
    (value: number) => {
      const key = value === -1 ? "reject" : value === 0 ? "insufficient" : value === 1 ? "passable" : value === 2 ? "acceptable" : value === 3 ? "good" : "excellent";
      return tt(`voting.mjGrade.${key}`);
    },
    [tt],
  );
  const showObjectionNudge =
    vote?.config.requireObjectionComment &&
    (mode === "THUMBS_UD_NEUTRAL" ||
      mode === "MAJORITY_JUDGMENT" ||
      mode === "CONSENT_LOOP");

  const objectionThreshold =
    mode === "THUMBS_UD_NEUTRAL"
      ? -1
      : mode === "MAJORITY_JUDGMENT" || mode === "CONSENT_LOOP"
        ? 0
        : Number.MIN_SAFE_INTEGER;

  const isNegativeVote = Object.values(voterValues).some(
    (v) => v <= objectionThreshold
  );

  const sortedFinalProposals = React.useMemo((): VoteProposal[] => {
    if (!vote || mode === "CONSENT_LOOP" || mode === "ATTENDANCE") return [];
    const active = vote.proposals.filter((p) => p.active);
    if (resultsSortMetric === "original" || active.length <= 1) return active;
    const metricFor = (p: VoteProposal): number => {
      if (mode === "THUMBS_UP") return tallyThumbsUpShared(responses, p.id).count;
      if (mode === "THUMBS_UD_NEUTRAL") {
        const t = tallyUDNeutralShared(responses, p.id);
        return t.up - t.down;
      }
      if (mode === "POINTS") return tallyPointsShared(responses, p.id).total;
      if (mode === "MAJORITY_JUDGMENT") {
        const t = tallyMJShared(responses, p.id);
        if (resultsSortMetric === "average") {
          const total = MJ_SCALE.reduce((sum, g) => sum + (t.distribution[g.value] || 0) * g.value, 0);
          const count = MJ_SCALE.reduce((sum, g) => sum + (t.distribution[g.value] || 0), 0);
          return count > 0 ? total / count : 0;
        }
        return t.median;
      }
      return 0;
    };
    const sorted = [...active].sort((a, b) => metricFor(a) - metricFor(b));
    return resultsSortDir === "desc" ? sorted.reverse() : sorted;
  }, [vote, mode, responses, resultsSortMetric, resultsSortDir]);

  const schedulingConfig = React.useMemo(
    () => normalizeSchedulingConfig(vote?.config.scheduling),
    [vote?.config.scheduling],
  );
  const viewerTimeZone = React.useMemo(() => getViewerTimeZone(), []);
  const isDayScheduling = isScheduling && schedulingConfig.unit === "day";
  // The group heatmap is only meaningful while results are visible. Deriving it
  // from `showResults` prevents a stale toggle from keeping the aggregate
  // availability on screen (and the calendar read-only) after the moderator
  // hides results or reopens the poll, when the toggle button is not rendered
  // and the viewer cannot switch back.
  const schedulingGroupView = showResults && schedulingShowGroup;
  // The full tally (participant matrix + contiguous-run search) is only needed
  // once results are rendered. While a poll is open with hidden results the
  // header shows just the voter count, so a cheap distinct-voter scan avoids
  // rebuilding the whole projection on every poll refresh.
  const schedulingNeedsTally = showResults || schedulingGroupView;
  const schedulingTally = React.useMemo(
    () =>
      vote && vote.config.mode === "SCHEDULING" && schedulingNeedsTally
        ? tallyScheduling(responses, vote.proposals, schedulingConfig)
        : null,
    [vote, responses, schedulingConfig, schedulingNeedsTally],
  );
  const schedulingVoterCount = React.useMemo(() => {
    if (!vote || vote.config.mode !== "SCHEDULING") return 0;
    return schedulingTally
      ? schedulingTally.totalVoters
      : countSchedulingParticipants(responses, vote.proposals);
  }, [vote, responses, schedulingTally]);
  const schedulingHeatmap = React.useMemo(
    () => (schedulingTally ? buildSchedulingHeatmap(schedulingTally) : null),
    [schedulingTally],
  );

  // Keep the slot array reference stable between renders; otherwise the
  // calendar's date grouping and label memoization rerun on every paint.
  const schedulingSlots = React.useMemo(() => {
    if (!vote || vote.config.mode !== "SCHEDULING") return [];
    return activeSchedulingSlots(vote.proposals);
  }, [vote]);

  // Distinct calendar days the poll actually offers, in chronological order.
  // Pruning every slot of a day removes it from the calendar but leaves it in
  // `config.dates`, so the header must derive its day count/coverage from the
  // remaining slots rather than the raw config.
  const schedulingDisplayDates = React.useMemo(() => {
    const keys = new Set<string>();
    for (const slot of schedulingSlots) {
      const key = formatSchedulingDateKey(
        slot.timeSlot?.startAt ?? "",
        schedulingConfig.timeZone,
      );
      if (key) keys.add(key);
    }
    return [...keys].sort();
  }, [schedulingSlots, schedulingConfig.timeZone]);

  // Highlight every tied best run, matching the summary cards instead of
  // arbitrarily ringing only the first one.
  const schedulingBestIds = React.useMemo(
    () =>
      showResults && schedulingTally
        ? schedulingBestSlotIds(schedulingTally)
        : [],
    [showResults, schedulingTally],
  );

  React.useEffect(() => {
    if (!schedulingConfig.allowIfNeeded && schedulingPaintMode === 0) {
      setSchedulingPaintMode(1);
    }
  }, [schedulingConfig.allowIfNeeded, schedulingPaintMode]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto mb-3" />
          <p>{ts.messages.loadingVote}</p>
        </div>
      </div>
    );
  }

  if (error || !vote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <Vote className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg">{error || ts.messages.voteNotFound}</p>
        </div>
      </div>
    );
  }

  if (vote.config.mode === "COMPARATIVE_PRIORITIZATION") {
    return (
      <ComparativeVotePage
        vote={vote}
        slug={slug || vote.slug}
        voterToken={voterToken}
      />
    );
  }

  const activeProposals = vote.proposals.filter((p) => p.active);
  const totalVoters = isScheduling
    ? schedulingVoterCount
    : rsvpProjection.totalVoters;
  const goingPartyTotal = rsvpProjection.goingPartyTotal;

  // Active scheduling slots in chronological order. The calendar groups them
  // by local date for display.
  const schedulingSlotCount = schedulingSlots.length;
  const schedulingDateCoverage =
    schedulingDisplayDates.length === 0
      ? ""
      : schedulingDisplayDates.length === 1
        ? schedulingDisplayDates[0]
        : `${schedulingDisplayDates[0]} – ${schedulingDisplayDates[schedulingDisplayDates.length - 1]}`;

  const handleSelectAllSchedulingAvailable = () => {
    setVoterValues((prev) => {
      const next = { ...prev };
      for (const slot of schedulingSlots) next[slot.id] = 1;
      return next;
    });
  };

  const handleClearSchedulingSelections = () => {
    setVoterValues((prev) => {
      const next = { ...prev };
      for (const slot of schedulingSlots) delete next[slot.id];
      return next;
    });
  };

  const handlePaintScheduling = (
    slotIds: string[],
    value: number | null,
  ) => {
    setVoterValues((prev) => {
      const next = { ...prev };
      for (const id of slotIds) {
        if (value === null) delete next[id];
        else next[id] = value;
      }
      return next;
    });
  };

  const tallyThumbsUpResult = (proposalId: string) =>
    tallyThumbsUpShared(responses, proposalId).count;

  const tallyUDNResult = (proposalId: string) =>
    tallyUDNeutralShared(responses, proposalId);

  const tallyPointsResult = (proposalId: string) =>
    tallyPointsShared(responses, proposalId).total;

  const tallyMJResult = (proposalId: string) =>
    tallyMJShared(responses, proposalId);

  const canSortResults = mode !== "CONSENT_LOOP" && activeProposals.length > 1;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          {(isAttendance || isScheduling) && !isAnonymous && storedName ? (
            <VoterIdentityBar
              displayName={storedName}
              onEdit={() => {
                setWelcomeName(storedName);
                setWelcomeOpen(true);
              }}
              editDisabled={isClosed}
            />
          ) : (
            <span />
          )}
          <LanguageSwitcher />
        </div>

        {isFinalized && vote.outcome && (
          <div className="mb-6">
            <VoteOutcomeBanner vote={vote} />
          </div>
        )}

        {isAttendance ? (
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden mb-6">
            {attendance?.coverImageUrl && (
              <img
                src={attendance.coverImageUrl}
                alt={vote.title}
                className="w-full h-48 object-cover"
              />
            )}
            <div className="p-6">
              <PublicVoteHeading
                vote={vote}
                ts={ts}
                isFinalized={isFinalized}
                isClosed={isClosed}
                isActive={isActive}
              />

              <div className="space-y-2 text-sm text-gray-600">
                {(eventStartLabel || eventEndLabel) && (
                  <div className="flex items-start gap-2">
                    <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                    <span>
                      <span className="font-medium text-gray-700">
                        {ts.attendance.dateTime}:
                      </span>{" "}
                      {eventStartLabel}
                      {eventStartLabel && eventEndLabel ? " – " : ""}
                      {eventEndLabel}
                    </span>
                  </div>
                )}
                {attendance?.location && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                    <span>{attendance.location}</span>
                  </div>
                )}
                {safeInfoUrl && (
                  <a
                    href={safeInfoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline flex items-center gap-1"
                  >
                    <Link2 className="w-4 h-4" />
                    {ts.attendance.eventInfo}
                  </a>
                )}
              </div>

              <PublicVoteCounters
                ts={ts}
                closesPrefix={tt("voting.closesPrefix")}
                totalVoters={totalVoters}
                closeAt={vote.config.closeAt}
                linkedTaskId={vote.linkedTaskId}
                leading={
                  <>
                    <Badge variant="outline">
                      {goingPartyTotal}
                      {hasAttendanceCapacity
                        ? ` / ${attendanceMaxAttendees}`
                        : ""}{" "}
                      {ts.attendanceOptions.going}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAddToCalendar}
                      disabled={!attendance?.eventStartAt}
                    >
                      <CalendarPlus className="w-4 h-4 mr-1" />
                      {ts.attendance.addToCalendar}
                    </Button>
                  </>
                }
              />
            </div>
          </div>
        ) : isScheduling ? (
          <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
            <PublicVoteHeading
              vote={vote}
              ts={ts}
              isFinalized={isFinalized}
              isClosed={isClosed}
              isActive={isActive}
            />

            <div className="space-y-2 text-sm text-gray-600">
              {schedulingDateCoverage && (
                <div className="flex items-start gap-2">
                  <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                  <span>
                    <span className="font-medium text-gray-700">
                      {ts.scheduling.dateRange}:
                    </span>{" "}
                    {schedulingDateCoverage}
                  </span>
                </div>
              )}
              {!isDayScheduling && (
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                  <span>
                    <span className="font-medium text-gray-700">
                      {ts.scheduling.dailyStart} – {ts.scheduling.dailyEnd}:
                    </span>{" "}
                    {schedulingConfig.dayStart} – {schedulingConfig.dayEnd}
                  </span>
                </div>
              )}
              {!isDayScheduling && (
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                  <span>
                    <span className="font-medium text-gray-700">
                      {ts.scheduling.duration}:
                    </span>{" "}
                    {schedulingConfig.durationMinutes} {ts.scheduling.minutes}
                  </span>
                </div>
              )}
              {isDayScheduling && (
                <div className="flex items-start gap-2">
                  <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                  <span className="font-medium text-gray-700">
                    {ts.scheduling.allDay}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                <span>
                  <span className="font-medium text-gray-700">
                    {ts.scheduling.timezone}:
                  </span>{" "}
                  {schedulingConfig.timeZone}
                </span>
              </div>
              {viewerTimeZone && viewerTimeZone !== schedulingConfig.timeZone && (
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                  <span>
                    <span className="font-medium text-gray-700">
                      {ts.scheduling.yourTimezone}:
                    </span>{" "}
                    {viewerTimeZone}
                  </span>
                </div>
              )}
            </div>

            <PublicVoteCounters
              ts={ts}
              closesPrefix={tt("voting.closesPrefix")}
              totalVoters={totalVoters}
              closeAt={vote.config.closeAt}
              linkedTaskId={vote.linkedTaskId}
              leading={
                <Badge variant="outline">
                  {isDayScheduling
                    ? ts.scheduling.dayCount.replace(
                        "{{count}}",
                        String(schedulingDisplayDates.length),
                      )
                    : ts.scheduling.slotCount.replace(
                        "{{count}}",
                        String(schedulingSlotCount),
                      )}
                </Badge>
              }
            />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
            <PublicVoteHeading
              vote={vote}
              ts={ts}
              isFinalized={isFinalized}
              isClosed={isClosed}
              isActive={isActive}
            />

            <PublicVoteCounters
              ts={ts}
              closesPrefix={tt("voting.closesPrefix")}
              totalVoters={totalVoters}
              closeAt={vote.config.closeAt}
              linkedTaskId={vote.linkedTaskId}
              className="flex items-center gap-4 text-sm text-gray-400"
              closeAtFirst
            />
          </div>
        )}

        {pendingRemoval && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-center">
            <p className="text-amber-800 mb-3">{ts.attendance.removalConfirm}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmRemovalLink}
                disabled={removalBusy}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {ts.attendance.removeRsvp}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingRemoval(null)}
                disabled={removalBusy}
              >
                {ts.buttons.cancel}
              </Button>
            </div>
          </div>
        )}

        {removalNotice && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-center">
            <p className="text-blue-700">{removalNotice}</p>
          </div>
        )}

        {!isActive && !isClosed && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-center">
               <p className="text-yellow-700">
                 {ts.messages.notOpenForResponses}
               </p>
          </div>
        )}

        {isClosed && !isFinalized && (
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 mb-6 text-center">
             <p className="text-gray-600">
               {ts.messages.closedNoMoreResponses}
             </p>
          </div>
        )}

        {isActive && hasSubmitted && !votedAndLocked && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-center">
             <p className="text-green-700">
               {ts.messages.thanksVoted}
             </p>
          </div>
        )}
        {isActive && votedAndLocked && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-center">
             <p className="text-blue-700">
               {ts.messages.thanksVotedNoChange}
             </p>
          </div>
        )}

        {isAttendance && !isClosed && (
          <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              {ts.attendance.rsvpTitle}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {ts.messages.attendancePrompt}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={
                  voterValues[EVENT_RSVP_PROPOSAL_ID] === -1
                    ? "default"
                    : "outline"
                }
                onClick={() => openRsvpDialog(-1)}
                disabled={!isActive || votedAndLocked}
                className={
                  voterValues[EVENT_RSVP_PROPOSAL_ID] === -1
                    ? "bg-red-600 hover:bg-red-700"
                    : ""
                }
              >
                <X className="w-4 h-4 mr-1" />
                {ts.attendanceOptions.notGoing}
              </Button>
              <Button
                size="sm"
                variant={
                  voterValues[EVENT_RSVP_PROPOSAL_ID] === 0
                    ? "default"
                    : "outline"
                }
                onClick={() => openRsvpDialog(0)}
                disabled={!isActive || votedAndLocked}
                className={
                  voterValues[EVENT_RSVP_PROPOSAL_ID] === 0
                    ? "bg-yellow-500 hover:bg-yellow-600"
                    : ""
                }
              >
                <Minus className="w-4 h-4 mr-1" />
                {ts.attendanceOptions.maybe}
              </Button>
              <Button
                size="sm"
                variant={
                  voterValues[EVENT_RSVP_PROPOSAL_ID] === 1
                    ? "default"
                    : "outline"
                }
                onClick={() => openRsvpDialog(1)}
                disabled={!isActive || votedAndLocked || attendanceFullForVoter}
                className={
                  voterValues[EVENT_RSVP_PROPOSAL_ID] === 1
                    ? "bg-green-600 hover:bg-green-700"
                    : ""
                }
              >
                <ThumbsUp className="w-4 h-4 mr-1" />
                {ts.attendanceOptions.going}
              </Button>
            </div>
            {attendanceFullForVoter && (
              <p className="mt-2 text-sm text-amber-600">{ts.attendance.full}</p>
            )}
            {voterValues[EVENT_RSVP_PROPOSAL_ID] !== undefined && (
              <p className="mt-3 text-sm text-green-700">
                {ts.attendance.rsvpThanks}
              </p>
            )}
            {showResults && (
              <div className="mt-4 pt-3 border-t">
                <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
                  {ts.labels.results}
                </h4>
                <AttendanceRsvpSummary
                  responses={responses}
                  isAnonymous={isAnonymous}
                  showComments={vote.config.allowFreeText === true}
                />
              </div>
            )}
            {(removalToken || ownRsvp) && (
              <div className="mt-4 pt-3 border-t space-y-3">
                <h4 className="text-xs font-medium text-gray-400 uppercase">
                  {ts.attendance.manageRsvp}
                </h4>
                {removalUrl && (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">
                      {ts.attendance.privateRemovalLink}
                    </Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        readOnly
                        value={removalUrl}
                        className="flex-1 min-w-[10rem] text-xs"
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCopyRemovalLink}
                      >
                        {removalCopied ? (
                          <Check className="w-4 h-4 mr-1" />
                        ) : (
                          <Copy className="w-4 h-4 mr-1" />
                        )}
                        {removalCopied ? ts.attendance.linkCopied : ts.buttons.copy}
                      </Button>
                    </div>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRemoveMyRsvp}
                  disabled={removalBusy || !isActive}
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {ts.attendance.removeRsvp}
                </Button>
              </div>
            )}
          </div>
        )}

        {isScheduling && !isClosed && (
          <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
            <div className="space-y-2 mb-3">
              <p className="text-sm text-gray-500">{ts.scheduling.helpText}</p>
              <div className="flex flex-wrap items-center gap-2">
                {!schedulingGroupView && (
                  <>
                    <Button
                      size="sm"
                      variant={schedulingPaintMode === 1 ? "default" : "outline"}
                      onClick={() => setSchedulingPaintMode(1)}
                      disabled={!isActive || votedAndLocked}
                      className={
                        schedulingPaintMode === 1
                          ? "bg-green-600 hover:bg-green-700"
                          : ""
                      }
                    >
                      {ts.scheduling.available}
                    </Button>
                    {schedulingConfig.allowIfNeeded && (
                      <Button
                        size="sm"
                        variant={schedulingPaintMode === 0 ? "default" : "outline"}
                        onClick={() => setSchedulingPaintMode(0)}
                        disabled={!isActive || votedAndLocked}
                        className={
                          schedulingPaintMode === 0
                            ? "bg-yellow-500 hover:bg-yellow-600"
                            : ""
                        }
                      >
                        {ts.scheduling.ifNeeded}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={schedulingPaintMode === -1 ? "default" : "outline"}
                      onClick={() => setSchedulingPaintMode(-1)}
                      disabled={!isActive || votedAndLocked}
                      className={
                        schedulingPaintMode === -1
                          ? "bg-red-600 hover:bg-red-700"
                          : ""
                      }
                    >
                      {ts.scheduling.unavailable}
                    </Button>
                  </>
                )}
                <span className="mx-1 h-5 w-px bg-gray-200" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelectAllSchedulingAvailable}
                  disabled={!isActive || votedAndLocked || schedulingGroupView}
                >
                  {ts.scheduling.selectAllAvailable}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearSchedulingSelections}
                  disabled={!isActive || votedAndLocked || schedulingGroupView}
                >
                  {ts.scheduling.clearAll}
                </Button>
                {showResults && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSchedulingShowGroup((value) => !value)}
                  >
                    {schedulingGroupView
                      ? ts.scheduling.myAvailability
                      : ts.scheduling.groupAvailability}
                  </Button>
                )}
              </div>
            </div>

            {isDayScheduling ? (
              <SchedulingMonthCalendar
                slots={schedulingSlots}
                timeZone={schedulingConfig.timeZone}
                values={voterValues}
                paintMode={schedulingPaintMode}
                onPaint={handlePaintScheduling}
                readOnly={!isActive || votedAndLocked || schedulingGroupView}
                heatmap={schedulingGroupView ? schedulingHeatmap : null}
                bestSlotIds={schedulingBestIds}
              />
            ) : (
              <SchedulingCalendar
                slots={schedulingSlots}
                timeZone={schedulingConfig.timeZone}
                values={voterValues}
                paintMode={schedulingPaintMode}
                onPaint={handlePaintScheduling}
                readOnly={!isActive || votedAndLocked || schedulingGroupView}
                heatmap={schedulingGroupView ? schedulingHeatmap : null}
                bestSlotIds={schedulingBestIds}
              />
            )}

            {schedulingSubmitError && (
              <p className="mt-3 text-sm text-red-600">{schedulingSubmitError}</p>
            )}
            {isActive && hasPendingVotes && (
              <div className="flex justify-center mt-4">
                <Button onClick={handleSubmitAllVotes}>
                  {ts.buttons.submitAllVotes}
                </Button>
              </div>
            )}
          </div>
        )}

        {isScheduling && showResults && (
          <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              {ts.labels.results}
            </h3>
            <SchedulingSummary
              vote={vote}
              responses={responses}
              tally={schedulingTally}
            />
          </div>
        )}

        {mode !== "CONSENT_LOOP" && mode !== "ATTENDANCE" && mode !== "SCHEDULING" && !isClosed && (
          <>
          <div className="space-y-4 mb-6">
            {activeProposals.map((proposal) => (
              <div
                key={proposal.id}
                className="bg-white rounded-lg shadow-sm border p-5"
              >
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                  {tt("voting.proposalN", { n: proposal.position + 1 })}
                </h3>
                {proposal.description && (
                  <p className="text-sm text-gray-500 mb-3">
                    {proposal.description}
                  </p>
                )}
                {proposal.content && <ProposalContentDisplay content={proposal.content} className="mb-3" />}
                {proposal.infoUrl && (
                  <a
                    href={proposal.infoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-500 hover:underline flex items-center gap-1 mb-3"
                  >
                     <Link2 className="w-3 h-3" />
                     {ts.buttons.moreInfo}
                  </a>
                )}

                {isActive && (
                  <div className="mt-3">
                    {mode === "THUMBS_UP" && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={
                            voterValues[proposal.id] === 1
                              ? "default"
                              : "outline"
                          }
                          onClick={() => {
                            if (voterValues[proposal.id] === 1) {
                              if (!isSingleProposal) {
                                handleToggleVoteLocal(proposal.id, 1);
                              } else {
                                handleWithdrawVote(proposal.id);
                              }
                            } else {
                              handleSubmitVote(proposal.id, 1);
                            }
                          }}
                          disabled={votedAndLocked}
                          className={
                            voterValues[proposal.id] === 1
                              ? "bg-green-600 hover:bg-green-700"
                              : ""
                          }
                        >
                          <ThumbsUp className="w-4 h-4 mr-1" />
                          {voterValues[proposal.id] === 1
                            ? ts.buttons.voted
                            : ts.buttons.vote}
                        </Button>
                        {voterValues[proposal.id] === 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleWithdrawVote(proposal.id)}
                            disabled={votedAndLocked}
                            title={ts.buttons.withdraw}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                        {showResults &&
                          (() => {
                            const count = tallyThumbsUpResult(proposal.id);
                            return (
                              <span className="text-sm text-gray-500">
                                 {count} vote{count !== 1 ? "s" : ""}
                              </span>
                            );
                          })()}
                      </div>
                    )}

                    {mode === "THUMBS_UD_NEUTRAL" && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={
                            voterValues[proposal.id] === -1
                              ? "default"
                              : "outline"
                          }
                          onClick={() => handleSubmitVote(proposal.id, -1)}
                          disabled={votedAndLocked}
                          className={
                            voterValues[proposal.id] === -1
                              ? "bg-red-600 hover:bg-red-700"
                              : ""
                          }
                        >
                          <ThumbsDown className="w-4 h-4 mr-1" />
                          {tt("voting.no")}
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            voterValues[proposal.id] === 0
                              ? "default"
                              : "outline"
                          }
                          onClick={() => handleSubmitVote(proposal.id, 0)}
                          disabled={votedAndLocked}
                          className={
                            voterValues[proposal.id] === 0
                              ? "bg-yellow-500 hover:bg-yellow-600"
                              : ""
                          }
                        >
                          <Minus className="w-4 h-4 mr-1" />
                          {tt("voting.neutral")}
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            voterValues[proposal.id] === 1
                              ? "default"
                              : "outline"
                          }
                          onClick={() => handleSubmitVote(proposal.id, 1)}
                          disabled={votedAndLocked}
                          className={
                            voterValues[proposal.id] === 1
                              ? "bg-green-600 hover:bg-green-700"
                              : ""
                          }
                        >
                          <ThumbsUp className="w-4 h-4 mr-1" />
                          {tt("voting.yes")}
                        </Button>
                      </div>
                    )}

                    {mode === "POINTS" && (() => {
                      const maxBudget = vote.config.maxPointsPerUser || 10;
                      const allowMultiple = vote.config.allowMultiple ?? false;
                      const perProposalCap = allowMultiple ? maxBudget : 1;
                      const currentVal = pointsBudget[proposal.id] || 0;
                      const otherTotal = Object.entries(pointsBudget)
                        .filter(([id]) => id !== proposal.id)
                        .reduce((sum, [, v]) => sum + v, 0);
                      const canIncrement =
                        currentVal < perProposalCap && currentVal < maxBudget - otherTotal;
                      return (
                        <div className="flex items-center gap-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePointsChange(proposal.id, -1)}
                            disabled={currentVal <= 0 || votedAndLocked}
                          >
                            <MinusCircle className="w-4 h-4" />
                          </Button>
                          <span className="text-lg font-medium w-8 text-center">
                            {currentVal}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePointsChange(proposal.id, 1)}
                            disabled={!canIncrement || votedAndLocked}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                          <span className="text-xs text-gray-400">
                            / {allowMultiple ? maxBudget : 1} {ts.labels.points}
                          </span>
                        </div>
                      );
                    })()}

                    {mode === "MAJORITY_JUDGMENT" && (
                      <div className="flex flex-wrap gap-2">
                        {MJ_SCALE.map((grade) => (
                          <button
                            key={grade.value}
                            onClick={() =>
                              handleSubmitVote(proposal.id, grade.value)
                            }
                            disabled={votedAndLocked}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium text-white transition-colors ${
                              voterValues[proposal.id] === grade.value
                                ? `${grade.color} ring-2 ring-offset-1 ring-gray-400`
                                : `${grade.color} opacity-70 hover:opacity-100`
                            }`}
                          >
                            {grade.icon} {mjGradeLabel(grade.value)}
                          </button>
                        ))}
                      </div>
                     )}
                   </div>
                 )}

                {showResults && !isClosed && (
                  <div className="mt-4 pt-3 border-t">
                     <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
                       {ts.labels.results}
                     </h4>
                    {mode === "THUMBS_UP" && (() => {
                      const count = tallyThumbsUpResult(proposal.id);
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-lg">&#x1F44D;</span>
                          <span className="font-medium">{count}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden ml-2">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{
                                width: `${totalVoters > 0 ? (count / totalVoters) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {mode === "THUMBS_UD_NEUTRAL" && (() => {
                      const t = tallyUDNResult(proposal.id);
                      const total = t.up + t.neutral + t.down || 1;
                      return (
                        <div className="space-y-1">
                          <div className="flex gap-3 text-sm">
                            <span className="text-red-600">
                              &#x1F44E; {t.down}
                            </span>
                            <span className="text-yellow-600">
                              &#x1F610; {t.neutral}
                            </span>
                            <span className="text-green-600">
                              &#x1F44D; {t.up}
                            </span>
                          </div>
                          <div className="flex h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-red-500"
                              style={{ width: `${(t.down / total) * 100}%` }}
                            />
                            <div
                              className="bg-yellow-400"
                              style={{
                                width: `${(t.neutral / total) * 100}%`,
                              }}
                            />
                            <div
                              className="bg-green-500"
                              style={{ width: `${(t.up / total) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
 
                    {mode === "POINTS" && (() => {
                      const total = tallyPointsResult(proposal.id);
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-lg">&#x1FA99;</span>
                          <span className="font-medium">{total} {ts.labels.points}</span>
                        </div>
                      );
                    })()}

                    {mode === "MAJORITY_JUDGMENT" && (() => {
                      const t = tallyMJResult(proposal.id);
                      const medianGrade = MJ_SCALE.find(
                        (g) => g.value === t.median
                      );
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{ts.labels.medianColon}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-xs text-white ${medianGrade?.color || "bg-gray-500"}`}
                            >
                              {medianGrade?.icon} {medianGrade ? mjGradeLabel(medianGrade.value) : ""}
                            </span>
                          </div>
                          <div className="flex h-3 rounded-full overflow-hidden">
                            {MJ_SCALE.map((grade) => (
                              <div
                                key={grade.value}
                                className={`${grade.color}`}
                                style={{
                                  width: `${((t.distribution[grade.value] || 0) / (responses.length || 1)) * 100}%`,
                                }}
                                title={`${mjGradeLabel(grade.value)}: ${t.distribution[grade.value] || 0}`}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
          {!isSingleProposal && isActive && hasPendingVotes && (
            <div className="flex justify-center mt-2">
              <Button onClick={handleSubmitAllVotes}>
                {ts.buttons.submitAllVotes}
              </Button>
            </div>
          )}
          </>
        )}

        {mode === "CONSENT_LOOP" && !isClosed && (() => {
          const allTally = tallyConsentLoopShared(loops, responses, activeProposals.map((p) => p.id));

          return (
            <div className="space-y-4 mb-6">
              <div className="bg-white rounded-lg shadow-sm border p-5">
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                   {ts.modes.CONSENT_LOOP}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  {ts.messages.consentLoopProcess}
                </p>
              </div>

              {activeProposals.map((proposal, proposalIndex) => {
                const proposalLoops = [...loops]
                  .filter((l) => l.proposalId === proposal.id)
                  .sort((a, b) => a.roundNumber - b.roundNumber);
                const currentOpenLoop = proposalLoops.find((l) => !l.closedAt);
                const proposalTally = allTally.proposals.find((p) => p.proposalId === proposal.id);

                const displayContent = currentOpenLoop?.proposalContent || proposal.content || "";

                return (
                  <div key={proposal.id} className="bg-white rounded-lg shadow-sm border p-5">
                    <h4 className="text-base font-medium text-gray-900 mb-2">
                      {activeProposals.length > 1 && (
                        <span className="text-gray-500 font-normal mr-1">{tt("voting.proposalNColon", { n: proposalIndex + 1 })}</span>
                      )}
                      {proposal.description || tt("voting.proposalN", { n: proposalIndex + 1 })}
                    </h4>

                    {currentOpenLoop && (
                      <span className="text-xs text-green-600 font-medium">
                        {ts.labels.round} {currentOpenLoop.roundNumber} — {ts.phases.OPEN}
                      </span>
                    )}

                    {displayContent && (
                      <div className="mb-4 p-3 bg-gray-50 rounded border">
                        <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
                          {ts.labels.currentRoundProposal}
                        </h4>
                        <ProposalContentDisplay content={displayContent} />
                      </div>
                    )}

                    {isActive && currentOpenLoop && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {MJ_SCALE.map((grade) => (
                          <button
                            key={grade.value}
                            onClick={() => handleSubmitVote(proposal.id, grade.value, currentOpenLoop.id)}
                            disabled={!!voterValues[proposal.id] && !canChangeVote}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium text-white transition-colors ${
                              voterValues[proposal.id] === grade.value
                                ? `${grade.color} ring-2 ring-offset-1 ring-gray-400`
                                : `${grade.color} opacity-70 hover:opacity-100`
                            }`}
                          >
                            {grade.icon} {mjGradeLabel(grade.value)}
                          </button>
                        ))}
                      </div>
                    )}

                    {(isClosed || showResultsBeforeClose) && proposalTally && proposalTally.current && (
                      <div className="mt-4 pt-3 border-t">
                        <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
                          {ts.labels.currentRoundResults}
                        </h4>
                        {(() => {
                          const medianGrade = MJ_SCALE.find((g) => g.value === proposalTally.current!.median);
                          return (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{ts.labels.medianColon}</span>
                                <span className={`px-2 py-0.5 rounded text-xs text-white ${medianGrade?.color || "bg-gray-500"}`}>
                              {medianGrade?.icon} {medianGrade ? mjGradeLabel(medianGrade.value) : ""}
                                </span>
                              </div>
                              <div className="flex h-3 rounded-full overflow-hidden">
                                {MJ_SCALE.map((grade) => {
                                  const count = proposalTally.current!.distribution[grade.value] || 0;
                                  const total = Object.values(proposalTally.current!.distribution).reduce((s, v) => s + v, 0);
                                  return (
                                    <div
                                      key={grade.value}
                                      className={`${grade.color}`}
                                      style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
                                      title={`${mjGradeLabel(grade.value)}: ${count}`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}

              {(() => {
                const closedLoops = [...loops].filter((l) => l.closedAt);
                if (closedLoops.length === 0) return null;
                return (
                  <>
                    <button
                      onClick={() => setShowPrevRounds(!showPrevRounds)}
                      className="text-sm text-blue-500 hover:underline flex items-center gap-1"
                    >
                      {showPrevRounds ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      {showPrevRounds ? ts.buttons.hide : ts.buttons.show} {tt("voting.previousRounds")}
                      {tt("voting.nClosed", { n: closedLoops.length })}
                    </button>

                    {showPrevRounds && allTally.proposals.some((p) => p.perRound.length > 0) && (
                      <div className="bg-white rounded-lg shadow-sm border p-5">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">
                          {ts.labels.roundByRoundSummary}
                        </h4>
                        {activeProposals.map((proposal) => {
                          const proposalTally = allTally.proposals.find((p) => p.proposalId === proposal.id);
                          if (!proposalTally || proposalTally.perRound.length === 0) return null;
                          return (
                            <div key={proposal.id} className="mb-4 last:mb-0">
                              {activeProposals.length > 1 && (
                                <div className="flex items-center gap-2 mb-1">
                                  <h5 className="text-xs font-medium text-gray-500">
                                    {proposal.description || tt("voting.proposalN", { n: activeProposals.indexOf(proposal) + 1 })}
                                  </h5>
                                  {[...loops].filter((l) => l.proposalId === proposal.id && l.closedAt).length >= 2 && (
                                    <button
                                      onClick={() => {
                                        setDiffProposalId(proposal.id);
                                        setDiffOpen(true);
                                      }}
                                      className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                                    >
                                      <ChevronDown className="w-3 h-3 rotate-[-90deg]" />
                                      {ts.labels.roundComparison}
                                    </button>
                                  )}
                                </div>
                              )}
                              {activeProposals.length <= 1 && [...loops].filter((l) => l.proposalId === proposal.id && l.closedAt).length >= 2 && (
                                <div className="flex items-center gap-2 mb-2">
                                  <button
                                    onClick={() => {
                                      setDiffProposalId(proposal.id);
                                      setDiffOpen(true);
                                    }}
                                    className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                                  >
                                    <ChevronDown className="w-3 h-3 rotate-[-90deg]" />
                                    {ts.labels.roundComparison}
                                  </button>
                                </div>
                              )}
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                  <thead>
                                    <tr>
                                      <th className="text-left py-2 px-3 border-b font-medium text-gray-600">
                                        {ts.labels.round}
                                      </th>
                                      <th className="text-center py-2 px-3 border-b font-medium text-gray-600">
                                        {ts.labels.median}
                                      </th>
                                      <th className="text-center py-2 px-3 border-b font-medium text-gray-600">
                                        {ts.labels.status}
                                      </th>
                                      {MJ_SCALE.map((grade) => (
                                        <th
                                          key={grade.value}
                                          className="text-center py-2 px-2 border-b font-medium text-gray-600"
                                        >
                                          <div className="flex items-center justify-center gap-1">
                                            <div className={`w-3 h-3 rounded ${grade.color}`}></div>
                                            <span className="text-[10px]">{mjGradeLabel(grade.value)}</span>
                                          </div>
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {proposalTally.perRound.map((round) => {
                                      const medianGrade = MJ_SCALE.find((g) => g.value === round.median);
                                      const isOpen = !round.closed;
                                      const roundTotal = MJ_SCALE.reduce(
                                        (sum, grade) => sum + (round.distribution[grade.value] || 0),
                                        0
                                      );
                                      const roundSegments = MJ_SCALE
                                        .map((grade) => ({
                                          ...grade,
                                          count: round.distribution[grade.value] || 0,
                                          percentage:
                                            roundTotal > 0
                                              ? ((round.distribution[grade.value] || 0) / roundTotal) * 100
                                              : 0,
                                        }))
                                        .filter((d) => d.count > 0);
                                      const loopForRound = loopById.get(round.loopId);
                                      const proposalContent = loopForRound?.proposalContent;
                                      return (
                                        <LoopRoundProposalTooltip
                                          key={round.loopId}
                                          proposalContent={proposalContent}
                                          roundNumber={round.roundNumber}
                                        >
                                          <tr
                                            className={isOpen ? "bg-blue-50 border-l-4 border-l-blue-400" : "hover:bg-gray-50"}
                                          >
                                            <td className="py-2 px-3 border-b font-medium">
                                              {ts.labels.round} {round.roundNumber}
                                            </td>
                                            <td className="py-2 px-3 border-b text-center">
                                              {medianGrade && (
                                                <span className={`inline-block px-2 py-0.5 rounded text-xs text-white ${medianGrade.color}`}>
                                                  {medianGrade.icon} {medianGrade ? mjGradeLabel(medianGrade.value) : ""}
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-2 px-3 border-b text-center text-xs text-gray-500">
                                              {isOpen ? ts.phases.OPEN : ts.phases.CLOSED}
                                            </td>
                                            <td
                                              colSpan={MJ_SCALE.length}
                                              className="py-2 px-2 border-b"
                                            >
                                              {roundTotal > 0 ? (
                                                <div className="relative w-full h-6 flex rounded overflow-hidden bg-gray-100">
                                                  {roundSegments.map((item, index) => {
                                                    const isMedian = item.value === round.median;
                                                    const isFirst = index === 0;
                                                    const isLast = index === roundSegments.length - 1;
                                                    return (
                                                      <div
                                                        key={item.value}
                                                        className={`h-full flex items-center justify-center relative ${item.color} ${
                                                          isFirst ? "rounded-l" : ""
                                                        } ${isLast ? "rounded-r" : ""} ${
                                                          isMedian
                                                            ? "ring-2 ring-white z-20 shadow-md scale-y-125 mx-0.5 rounded-sm origin-center"
                                                            : ""
                                                        }`}
                                                        style={{ width: `${item.percentage}%` }}
                                                        title={`${mjGradeLabel(item.value)}: ${item.count} votes (${item.percentage.toFixed(1)}%)`}
                                                      >
                                                        {item.percentage >= 10 && (
                                                          <span
                                                            className={`text-[10px] font-bold ${
                                                              [1, 2].includes(item.value) ? "text-black" : "text-white"
                                                            } drop-shadow-md`}
                                                          >
                                                            {item.percentage.toFixed(1)}%
                                                          </span>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              ) : (
                                                <div className="w-full h-6 bg-gray-50 rounded flex items-center justify-center text-[10px] text-gray-400">
                                                  —
                                                </div>
                                              )}
                                            </td>
                                          </tr>
                                        </LoopRoundProposalTooltip>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          );
        })()}

        {mode === "POINTS" && isActive && (
          <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">{ts.buttons.submitPoints}</h3>
              <Button size="sm" onClick={handleSubmitAllVotes} disabled={votedAndLocked}>
                {ts.buttons.submit}
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              {ts.messages.allocatePointsBudget} {tt("voting.totalBudget")} {vote.config.maxPointsPerUser || 10} {ts.labels.points}.
            </p>
          </div>
        )}

        {isActive && vote.config.allowFreeText && mode !== "ATTENDANCE" && mode !== "SCHEDULING" && (
          <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1 mb-2">
              <MessageSquare className="w-4 h-4" />
              {ts.labels.comment}
            </label>
            {showObjectionNudge && isNegativeVote && (
              <p className="text-xs text-amber-600 flex items-center gap-1 mb-2">
                <AlertTriangle className="w-3 h-3" />
                {ts.messages.negativeCommentNudge}
              </p>
            )}
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={ts.placeholders.comment}
              rows={2}
              disabled={votedAndLocked}
            />
          </div>
        )}

        {isActive &&
          vote.config.kind === "consultation" &&
          vote.config.allowAudienceProposals &&
          mode !== "SCHEDULING" && (
            <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                {ts.labels.suggestProposal}
              </h3>
              <div className="flex gap-2">
                <Input
                  value={audienceProposalText}
                  onChange={(e) => setAudienceProposalText(e.target.value)}
                  placeholder={ts.placeholders.proposal}
                  className="flex-1"
                  disabled={votedAndLocked}
                />
                <Button
                  size="sm"
                  onClick={handleAudienceProposal}
                  disabled={!audienceProposalText.trim() || votedAndLocked}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {ts.buttons.add}
                </Button>
              </div>
            </div>
          )}

        {isClosed && !isScheduling && (
          <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              {ts.labels.finalResults}
            </h3>
            {isAttendance ? (
              <AttendanceRsvpSummary
                responses={responses}
                isAnonymous={isAnonymous}
                showComments={vote.config.allowFreeText === true}
              />
            ) : mode !== "CONSENT_LOOP" && (
              <div className="space-y-3">
                {canSortResults && (
                  <div className="flex items-center gap-2 flex-wrap pb-3 border-b">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      <span>{ts.labels.sortResults}:</span>
                    </div>
                    <select
                      value={resultsSortMetric}
                      onChange={(e) => setResultsSortMetric(e.target.value as typeof resultsSortMetric)}
                      className="text-xs border rounded px-2 py-1 bg-white"
                    >
                      <option value="original">{ts.labels.sortByOriginal}</option>
                      {(mode === "MAJORITY_JUDGMENT") && (
                        <option value="median">{ts.labels.sortByMedian}</option>
                      )}
                      <option value="average">{ts.labels.sortByAverage}</option>
                    </select>
                    {resultsSortMetric !== "original" && (
                      <button
                        onClick={() => setResultsSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                        className="text-xs border rounded px-2 py-1 bg-white hover:bg-gray-50 flex items-center gap-1"
                        title={resultsSortDir === "asc" ? ts.labels.sortAscending : ts.labels.sortDescending}
                      >
                        <ArrowDownWideNarrow className={`w-3.5 h-3.5 transition-transform ${resultsSortDir === "asc" ? "rotate-180" : ""}`} />
                        {resultsSortDir === "asc" ? ts.labels.sortAscending : ts.labels.sortDescending}
                      </button>
                    )}
                  </div>
                )}
                {sortedFinalProposals.map((proposal) => (
                  <div key={proposal.id} className="border rounded-lg p-3">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      {proposal.description?.trim() || tt("voting.proposalN", { n: proposal.position + 1 })}
                    </h4>
                    {proposal.content && <ProposalContentDisplay content={proposal.content} className="mb-2" />}
                    {mode === "THUMBS_UP" && (() => {
                      const count = tallyThumbsUpResult(proposal.id);
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-lg">&#x1F44D;</span>
                          <span className="font-medium">{count}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden ml-2">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{
                                width: `${totalVoters > 0 ? (count / totalVoters) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                    {mode === "THUMBS_UD_NEUTRAL" && (() => {
                      const t = tallyUDNResult(proposal.id);
                      const total = t.up + t.neutral + t.down || 1;
                      return (
                        <div className="space-y-1">
                          <div className="flex gap-3 text-sm">
                            <span className="text-red-600">
                              &#x1F44E; {t.down}
                            </span>
                            <span className="text-yellow-600">
                              &#x1F610; {t.neutral}
                            </span>
                            <span className="text-green-600">
                              &#x1F44D; {t.up}
                            </span>
                          </div>
                          <div className="flex h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-red-500"
                              style={{ width: `${(t.down / total) * 100}%` }}
                            />
                            <div
                              className="bg-yellow-400"
                              style={{
                                width: `${(t.neutral / total) * 100}%`,
                              }}
                            />
                            <div
                              className="bg-green-500"
                              style={{ width: `${(t.up / total) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                    {mode === "POINTS" && (() => {
                       const total = tallyPointsResult(proposal.id);
                       return (
                         <div className="flex items-center gap-2">
                           <span className="text-lg">&#x1FA99;</span>
                           <span className="font-medium">{total} {ts.labels.points}</span>
                        </div>
                      );
                    })()}
                    {mode === "MAJORITY_JUDGMENT" && (() => {
                      const t = tallyMJResult(proposal.id);
                      const medianGrade = MJ_SCALE.find(
                        (g) => g.value === t.median
                      );
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span>{ts.labels.medianColon}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-xs text-white ${medianGrade?.color || "bg-gray-500"}`}
                            >
                              {medianGrade?.icon} {medianGrade ? mjGradeLabel(medianGrade.value) : ""}
                            </span>
                          </div>
                          <div className="flex h-3 rounded-full overflow-hidden">
                            {MJ_SCALE.map((grade) => (
                              <div
                                key={grade.value}
                                className={`${grade.color}`}
                                style={{
                                  width: `${((t.distribution[grade.value] || 0) / (responses.length || 1)) * 100}%`,
                                }}
                                title={`${mjGradeLabel(grade.value)}: ${t.distribution[grade.value] || 0}`}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
            {mode === "CONSENT_LOOP" && (() => {
              const allTally = tallyConsentLoopShared(loops, responses, activeProposals.map((p) => p.id));
              const anyAdopted = allTally.proposals.some((p) => {
                const best = getBestConsentRound(p);
                return best?.adopted;
              });
              return (
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
                    {ts.messages.consentLoopFinalOutcome}
                  </h4>
                  {!anyAdopted && (
                    <p className="text-sm text-gray-500 italic">
                      {ts.messages.consentLoopNoAdoptedRound}
                    </p>
                  )}
                  {activeProposals.map((proposal) => {
                    const proposalTally = allTally.proposals.find((p) => p.proposalId === proposal.id);
                    if (!proposalTally) return null;
                    const best = getBestConsentRound(proposalTally);
                    if (!best) return null;
                    const outcomeLoopId = vote.outcome?.winningLoopId;
                    const selectedRound = outcomeLoopId
                      ? proposalTally.perRound.find((r) => r.loopId === outcomeLoopId) ?? best
                      : best;
                    const isManualOverride = !!outcomeLoopId && outcomeLoopId !== best.loopId;
                    const medianGrade = MJ_SCALE.find((g) => g.value === selectedRound.median);
                    const totalVotes = MJ_SCALE.reduce(
                      (sum, g) => sum + (selectedRound.distribution[g.value] || 0),
                      0
                    );
                    const bestLoop = loopById.get(selectedRound.loopId);
                    const proposalContent = bestLoop?.proposalContent || proposal.content;
                    const segments = MJ_SCALE
                      .map((g) => ({
                        ...g,
                        count: selectedRound.distribution[g.value] || 0,
                        percentage: totalVotes > 0 ? ((selectedRound.distribution[g.value] || 0) / totalVotes) * 100 : 0,
                      }))
                      .filter((d) => d.count > 0);
                    return (
                      <div
                        key={proposal.id}
                        className={`border rounded-lg p-3 ${
                          selectedRound.adopted ? "border-green-500 bg-green-50" : "bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium text-gray-900">
                              {proposal.description?.trim() || tt("voting.proposalN", { n: proposal.position + 1 })}
                            </h4>
                            {loops.filter((l) => l.proposalId === proposal.id && l.closedAt).length >= 2 && (
                              <button
                                onClick={() => {
                                  setDiffProposalId(proposal.id);
                                  setDiffOpen(true);
                                }}
                                className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                              >
                                <ChevronDown className="w-3 h-3 rotate-[-90deg]" />
                                {ts.labels.roundComparison}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              {ts.labels.round} {selectedRound.roundNumber}
                              {isManualOverride && (
                                <span className="ml-1 text-blue-500">({ts.messages.consentLoopBestRound}: {ts.labels.round} {best.roundNumber})</span>
                              )}
                            </span>
                            {selectedRound.adopted ? (
                              <span className="inline-block px-2 py-0.5 rounded text-xs text-white bg-green-600">
                                {ts.messages.consentLoopAdopted.split("\u2014")[0].trim()}
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded text-xs text-white bg-gray-400">
                                {ts.messages.consentLoopBlocked.split("\u2014")[0].trim()}
                              </span>
                            )}
                          </div>
                        </div>
                        {proposalContent && (
                          <div className="mb-2 p-2 bg-gray-50 rounded border">
                            <ProposalContentDisplay content={proposalContent} />
                          </div>
                        )}
                        {totalVotes > 0 ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-600">{ts.labels.medianColon}</span>
                              {medianGrade && (
                                <span className={`px-2 py-0.5 rounded text-xs text-white ${medianGrade.color}`}>
                                  {medianGrade.icon} {medianGrade ? mjGradeLabel(medianGrade.value) : ""}
                                </span>
                              )}
                              <span className="text-xs text-gray-500">
                                ({totalVotes} {totalVotes !== 1 ? ts.labels.voters : ts.labels.voter})
                              </span>
                            </div>
                            <div className="relative w-full h-6 flex rounded overflow-hidden bg-gray-100">
                              {segments.map((item, index) => {
                                const isMedian = item.value === selectedRound.median;
                                const isFirst = index === 0;
                                const isLast = index === segments.length - 1;
                                return (
                                  <div
                                    key={item.value}
                                    className={`h-full flex items-center justify-center relative ${item.color} ${
                                      isFirst ? "rounded-l" : ""
                                    } ${isLast ? "rounded-r" : ""} ${
                                      isMedian ? "ring-2 ring-white z-20 shadow-md scale-y-125 mx-0.5 rounded-sm origin-center" : ""
                                    }`}
                                    style={{ width: `${item.percentage}%` }}
                                    title={`${mjGradeLabel(item.value)}: ${item.count} votes (${item.percentage.toFixed(1)}%)`}
                                  >
                                    {item.percentage >= 10 && (
                                      <span className={`text-[10px] font-bold ${
                                        [1, 2].includes(item.value) ? "text-black" : "text-white"
                                      } drop-shadow-md`}>
                                        {item.percentage.toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">{ts.messages.noVotesYet}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {!isAnonymous && responses.length > 0 && mode !== "ATTENDANCE" && (
              <div className="mt-4 pt-3 border-t">
                <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
                  {ts.labels.voters}
                </h4>
                <div className="space-y-1">
                  {responses.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 text-xs text-gray-500"
                    >
                      <span>{r.userId || tt("voting.anonymous")}</span>
                      {r.comment && (
                        <span className="italic text-gray-400">
                          &mdash; {r.comment}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <Separator className="my-6" />

        <div className="bg-white rounded-lg shadow-sm border p-5">
          {vote.slug && <QRCodeBlock slug={vote.slug} />}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          {ts.messages.poweredBy}
        </p>
      </div>

      {(isAttendance || isScheduling) && !isAnonymous && (
        <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {isScheduling
                  ? ts.scheduling.namePrompt
                  : ts.attendance.welcomeTitle}
              </DialogTitle>
              <DialogDescription>
                {isScheduling
                  ? ts.scheduling.namePromptHelp
                  : ts.attendance.welcomeDescription}
              </DialogDescription>
              <p className="text-xs text-gray-500">
                {ts.attendance.nameAttachedNote}
              </p>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="welcome-display-name">
                {ts.attendance.displayName}
              </Label>
              <Input
                id="welcome-display-name"
                value={welcomeName}
                onChange={(event) => setWelcomeName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSaveWelcomeName();
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="px-0 text-blue-600 hover:bg-transparent hover:text-blue-700"
                onClick={() => setWelcomeName(getRandomUsername())}
              >
                {ts.attendance.useRandomName}
              </Button>
            </div>
            <DialogFooter>
              <Button
                onClick={handleSaveWelcomeName}
                disabled={!welcomeName.trim()}
              >
                {ts.attendance.saveName}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isAttendance && (
        <Dialog
          open={rsvpDialogValue !== null}
          onOpenChange={(open) => {
            if (!open && !rsvpSubmitting) setRsvpDialogValue(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{ts.attendance.rsvpTitle}</DialogTitle>
              <DialogDescription>
                {rsvpDialogValue === 1
                  ? ts.attendanceOptions.going
                  : rsvpDialogValue === 0
                    ? ts.attendanceOptions.maybe
                    : ts.attendanceOptions.notGoing}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {!isAnonymous && (
                <div className="space-y-2">
                  <Label htmlFor="rsvp-display-name">
                    {ts.attendance.displayName}
                  </Label>
                  <Input
                    id="rsvp-display-name"
                    value={rsvpName}
                    onChange={(event) => setRsvpName(event.target.value)}
                  />
                </div>
              )}

              {attendance?.askEmail && (
                <div className="space-y-2">
                  <Label htmlFor="rsvp-email">{ts.attendance.email}</Label>
                  <Input
                    id="rsvp-email"
                    type="email"
                    value={rsvpEmail}
                    onChange={(event) => setRsvpEmail(event.target.value)}
                  />
                </div>
              )}

              {attendance?.allowPartySize && (
                <div className="space-y-2">
                  <Label htmlFor="rsvp-party-size">{ts.attendance.partySize}</Label>
                  <Input
                    id="rsvp-party-size"
                    type="number"
                    min={1}
                    max={attendanceMaxPartySize}
                    value={rsvpPartySize}
                    onChange={(event) => {
                      const next = Math.floor(Number(event.target.value));
                      setRsvpPartySize(
                        Math.min(
                          attendanceMaxPartySize,
                          Math.max(1, Number.isFinite(next) ? next : 1),
                        ),
                      );
                    }}
                  />
                  <p className="text-xs text-gray-400">1–{attendanceMaxPartySize}</p>
                </div>
              )}

              {attendance?.allowHiddenAttendance && (
                <div className="space-y-2">
                  <Label>{ts.attendance.visibility}</Label>
                  <RadioGroup
                    value={rsvpVisibility}
                    onValueChange={(value) =>
                      setRsvpVisibility(value === "hidden" ? "hidden" : "public")
                    }
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="public" id="rsvp-visibility-public" />
                      <Label htmlFor="rsvp-visibility-public" className="font-normal">
                        {ts.attendance.visibilityPublic}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="hidden" id="rsvp-visibility-hidden" />
                      <Label htmlFor="rsvp-visibility-hidden" className="font-normal">
                        {ts.attendance.visibilityHidden}
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {(attendance?.customQuestions?.length ?? 0) > 0 && (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700">
                    {ts.attendance.customQuestions}
                  </h4>
                  {attendance?.customQuestions?.map((question) => (
                    <div key={question.id} className="space-y-2">
                      <Label htmlFor={`rsvp-question-${question.id}`}>
                        {question.prompt}
                        {question.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </Label>
                      {question.type === "choice" ? (
                        <select
                          id={`rsvp-question-${question.id}`}
                          className="w-full text-sm border rounded px-3 py-2 bg-white"
                          value={rsvpAnswers[question.id] ?? ""}
                          onChange={(event) =>
                            setRsvpAnswers((prev) => ({
                              ...prev,
                              [question.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">—</option>
                          {(question.options ?? []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          id={`rsvp-question-${question.id}`}
                          value={rsvpAnswers[question.id] ?? ""}
                          onChange={(event) =>
                            setRsvpAnswers((prev) => ({
                              ...prev,
                              [question.id]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {vote.config.allowFreeText && (
                <div className="space-y-2">
                  <Label htmlFor="rsvp-comment" className="flex items-center gap-1">
                    <MessageSquare className="w-4 h-4" />
                    {ts.labels.comment}
                  </Label>
                  <Textarea
                    id="rsvp-comment"
                    value={rsvpComment}
                    onChange={(event) => setRsvpComment(event.target.value)}
                    placeholder={ts.placeholders.comment}
                    rows={2}
                  />
                </div>
              )}

              {rsvpCapacityError && (
                <p className="text-sm text-red-600">{rsvpCapacityError}</p>
              )}
              {rsvpError && <p className="text-sm text-red-600">{rsvpError}</p>}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRsvpDialogValue(null)}
                disabled={rsvpSubmitting}
              >
                {ts.buttons.cancel}
              </Button>
              <Button
                onClick={handleSubmitRsvpDialog}
                disabled={
                  rsvpSubmitting ||
                  (rsvpDialogValue === 1 && rsvpCapacityError !== null)
                }
              >
                {rsvpSubmitting ? ts.buttons.saving : ts.buttons.submit}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {mode === "CONSENT_LOOP" && (
        <LoopRoundDiffDialog
          open={diffOpen}
          onOpenChange={setDiffOpen}
          loops={loops}
          proposalId={diffProposalId}
          proposalLabel={
            activeProposals.find((p) => p.id === diffProposalId)?.description?.trim()
            || (diffProposalId ? tt("voting.proposalN", { n: (activeProposals.find((p) => p.id === diffProposalId)?.position ?? 0) + 1 }) : undefined)
          }
        />
      )}
    </div>
  );
};

export default PublicVotePage;