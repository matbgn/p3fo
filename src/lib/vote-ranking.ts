import type {
  AttendanceResponseData,
  RankingEngine,
  VoteConfig,
  VoteEntity,
  VoteRankingBallot,
  VoteRankingResult,
  VoteRankingSubmission,
  VoteResponseEntity,
} from './persistence-types';
import {
  computeCondorcetDiagnostics,
  countCoveredPairs,
  estimatePartialRanking,
  poolBallots,
} from './partial-ranking.js';
import { attendanceDisplayName, attendanceVisibility } from './attendance.js';

export const RANKING_ENGINE_VERSION = 'weighted-pr-bt-v1';
export const DEFAULT_RANKING_ENGINE: RankingEngine = 'bt-k4';
/**
 * Ballots are capped at 100 items by the server, so the collective ranking is
 * only well defined for a similarly small set. Rank at most the most-compared
 * proposals so a vote with an unbounded proposal list cannot make the public
 * results endpoint perform an unbounded O(n^4) computation.
 */
export const MAX_RANKED_ITEMS = 100;
const STALLED_AFTER_MS = 10 * 60 * 1000;

export function rankingEngineToK(engine: RankingEngine): 2 | 4 {
  return engine === 'bt-k2' ? 2 : 4;
}

export function expectedRankingPairs(itemCount: number): number {
  return itemCount < 2 ? 0 : (itemCount * (itemCount - 1)) / 2;
}

/**
 * Single source of truth for whether a vote hides participant identities.
 * An absent `isAnonymous` flag means anonymous, matching the rest of the UI
 * (`vote.config.isAnonymous ?? true`). Every server route and export path must
 * use this instead of re-deriving the default from the raw flag.
 */
export function isVoteAnonymous(
  config: Pick<VoteConfig, 'isAnonymous'> | null | undefined,
): boolean {
  return config?.isAnonymous !== false;
}

/**
 * Whether a vote stores a participant display name on its `voteResponses` rows.
 * Attendance is the exception: the RSVP name travels on the attendance payload,
 * so its response rows stay nameless. An anonymous vote never carries a name on
 * any channel. The submit paths, the moderator draft channel and the results
 * restore all derive the rule here so one path cannot persist or publish a name
 * the others drop.
 */
export function voteResponseCarriesDisplayName(
  config: Pick<VoteConfig, 'mode' | 'isAnonymous'> | null | undefined,
): boolean {
  return config?.mode !== 'ATTENDANCE' && !isVoteAnonymous(config);
}

/**
 * The single list of RSVP fields that are private to the organizer or the
 * attendee: an email, the custom-question answers and the private removal
 * token. Kept in one place so the results projection and the shared-document
 * projection cannot drift on which fields are safe to publish.
 */
function stripPrivateAttendeeFields(
  data: AttendanceResponseData | undefined,
): AttendanceResponseData | undefined {
  if (!data) return undefined;
  const {
    email: _email,
    answers: _answers,
    removalToken: _removalToken,
    ...rest
  } = data;
  // A hidden RSVP never names the attendee outside the organizer projection.
  // The moderator scheduling results add the name back, but a moderator client
  // that syncs that authenticated payload into the shared document must not
  // carry the name to every connected, unauthenticated viewer. `attendance.ts`
  // owns the visibility rule so it cannot drift from the results projection.
  if (attendanceVisibility(rest) === 'hidden') {
    const { displayName: _hiddenDisplayName, ...withoutName } = rest;
    return withoutName;
  }
  return rest;
}

/**
 * True when `stripPrivateAttendeeFields` would remove at least one private
 * value from `data`. Implemented by comparing the stripper's output against its
 * input, so a field added to the stripper automatically makes the shared-document
 * scrub detector fire and cannot leave a newly-private field published.
 */
export function hasPrivateAttendeeFields(
  data: AttendanceResponseData | undefined,
): boolean {
  if (!data) return false;
  const stripped = stripPrivateAttendeeFields(data);
  return JSON.stringify(stripped ?? null) !== JSON.stringify(data);
}

/**
 * Replace the bearer withdrawal credential with its stable pseudonym and drop
 * server-only fields. Shared by every path that publishes a response, so the
 * token/alias rule cannot drift between the HTTP route, the Yjs broadcast and a
 * client-side sync.
 */
function withPublicResponseIdentity(
  voteId: string,
  response: VoteResponseEntity,
): VoteResponseEntity {
  // `participantId` is a moderator-only join key: it is handed to a
  // capability-holding reader to merge drafts, and must never reach the shared,
  // unauthenticated document (where it would also make identical rows compare
  // unequal and defeat change detection). The RSVP contact fields are
  // organizer-only too: a moderator client that publishes through
  // `shareVoteResponse` must not leak them to every connected viewer.
  const { participantId: _participantId, attendeeData, ...rest } = response;
  const publicAttendeeData = stripPrivateAttendeeFields(attendeeData);
  return {
    ...rest,
    ...(publicAttendeeData ? { attendeeData: publicAttendeeData } : {}),
    voterToken: '',
    voterAlias: response.voterAlias ?? voterAlias(voteId, response.voterToken),
  };
}

/**
 * Single source of truth for the anonymity transform of a stored vote
 * response. Used by both the HTTP results route and the shared-Yjs broadcast,
 * so a change to the redaction rule cannot silently apply to only one of the
 * two response-producing paths.
 *
 * The raw `voterToken` is a bearer withdrawal credential, so it must never leave
 * the server on a shared or public path. It is replaced by the stable,
 * non-reversible `voterAlias`; callers that already hold an alias keep it
 * (idempotent).
 */
export interface RedactVoteResponseOptions {
  /**
   * Keep the RSVP email and custom-question answers for an authorized moderator
   * reader. The private removal token is always stripped, even for moderators:
   * it is a bearer capability, not organizer data.
   */
  keepAttendeePrivateFields?: boolean;
}

function redactAttendeeDataForVote(
  data: AttendanceResponseData | undefined,
  anonymous: boolean,
  keepPrivateFields: boolean,
): AttendanceResponseData | undefined {
  if (!data) return undefined;
  // Start from the shared public projection (no email/answers/removal token),
  // then re-add the display name only when this view may name the attendee.
  const { displayName: _displayName, ...publicFields } = stripPrivateAttendeeFields(data) ?? {};
  const result: AttendanceResponseData = {
    ...publicFields,
    partySize: data.partySize,
    visibility: attendanceVisibility(data),
  };
  // A hidden RSVP never names the attendee, just like an anonymous vote. The
  // rule lives in attendance.ts so redaction and rendering cannot diverge.
  const publicDisplayName = attendanceDisplayName(data, anonymous);
  if (!anonymous && publicDisplayName !== undefined) {
    result.displayName = publicDisplayName;
  }
  if (keepPrivateFields) {
    if (data.email !== undefined) result.email = data.email;
    if (data.answers !== undefined) result.answers = data.answers;
  }
  return result;
}

export function redactVoteResponseForVote(
  vote: Pick<VoteEntity, 'id' | 'config'>,
  response: VoteResponseEntity,
  options: RedactVoteResponseOptions = {},
): VoteResponseEntity {
  const anonymous = isVoteAnonymous(vote.config);
  const projected: VoteResponseEntity = {
    ...withPublicResponseIdentity(vote.id, response),
    userId: anonymous ? null : response.userId,
  };
  const attendeeData = redactAttendeeDataForVote(
    response.attendeeData,
    anonymous,
    options.keepAttendeePrivateFields === true,
  );
  if (attendeeData) projected.attendeeData = attendeeData;
  return projected;
}

export function redactVoteResponsesForVote(
  vote: Pick<VoteEntity, 'id' | 'config'>,
  responses: VoteResponseEntity[],
  options: RedactVoteResponseOptions = {},
): VoteResponseEntity[] {
  return responses.map((response) => redactVoteResponseForVote(vote, response, options));
}

/**
 * Whether a planning-poker round's estimates must stay out of the shared,
 * public projection. A blind simultaneous reveal is the point of the mode: until
 * the server stamps `revealedAt`, an estimate belongs only to the voter who
 * submitted it. Both the HTTP results projection and the live Yjs broadcast
 * derive the rule from here so one path cannot reveal cards the other still
 * hides.
 *
 * A persisted deck is the round marker: `mode`, `phase` and
 * `showResultsBeforeClose` are all writable through the public vote-update
 * route, so the rule must not fail open when the mode literal is missing or was
 * tampered with. The creation/update routes reject unknown modes and clear any
 * deck when the effective mode is not poker, so a non-poker vote cannot carry
 * one; a vote that still holds a deck is a poker round until the server-owned
 * reveal stamps `revealedAt`.
 */
export function pokerValuesAreHidden(
  vote: Pick<VoteEntity, 'config'> | null | undefined,
): boolean {
  const poker = vote?.config.poker;
  return Boolean(poker) && poker?.revealedAt == null;
}

/**
 * Whether one proposal's estimates are visible for a given poker config. A
 * round-wide `revealedAt` reveals every proposal; otherwise only the ids a
 * moderator force-revealed are visible. This is the single per-proposal rule
 * behind the HTTP results projection and the live Yjs broadcast/scrub.
 */
export function pokerProposalIdIsRevealed(
  poker:
    | { revealedAt?: string | null; revealedProposalIds?: string[] | null }
    | null
    | undefined,
  proposalId: string | null | undefined,
): boolean {
  if (!poker) return false;
  if (poker.revealedAt != null) return true;
  if (!proposalId) return false;
  return Array.isArray(poker.revealedProposalIds)
    ? poker.revealedProposalIds.includes(proposalId)
    : false;
}

export function pokerProposalIsRevealed(
  vote: Pick<VoteEntity, 'config'> | null | undefined,
  proposalId: string | null | undefined,
): boolean {
  return pokerProposalIdIsRevealed(vote?.config.poker, proposalId);
}

/**
 * Boolean form of the poker projection rule for one response. Callers that
 * publish rows to the shared document need the decision, not a stripped copy,
 * so they share this instead of re-composing `pokerValuesAreHidden` and
 * `pokerProposalIsRevealed` at every sync site.
 */
export function pokerResponseValueIsHidden(
  vote: Pick<VoteEntity, 'config'> | null | undefined,
  response: Pick<VoteResponseEntity, 'proposalId'> | null | undefined,
): boolean {
  return (
    pokerValuesAreHidden(vote) &&
    !pokerProposalIsRevealed(vote, response?.proposalId)
  );
}

/**
 * Remove the estimate from a projected poker row while preserving every other
 * field, so the row can still be published (and overwrite a stale value-bearing
 * copy) in the shared Yjs document.
 */
export function stripPokerValue(response: VoteResponseEntity): VoteResponseEntity {
  if (typeof response.value !== 'number') return response;
  const { value: _value, ...rest } = response;
  return rest as VoteResponseEntity;
}

export function hidePokerValueForVote(
  vote: Pick<VoteEntity, 'config'> | null | undefined,
  response: VoteResponseEntity,
): VoteResponseEntity {
  if (!pokerResponseValueIsHidden(vote, response)) return response;
  return stripPokerValue(response);
}

/**
 * Single source of truth for whether a vote's ranking ballots/results may be
 * shown to a non-moderator. The route layer and the backup exporter share this
 * definition so a visibility change cannot silently expose hidden ballots or
 * produce an incomplete backup.
 */
export function areRankingResultsVisible(vote: Pick<VoteEntity, 'config'>): boolean {
  // Match the rest of the UI (`VoteResults`, `PublicVotePage`): results are
  // visible only once the vote is closed, or when the owner opted in. Any other
  // phase, including the default IDLE, must stay hidden so a restored/imported
  // IDLE vote cannot leak its ballots or show premature results.
  const phase = vote.config.phase;
  return (
    phase === 'CLOSED' ||
    phase === 'FINALIZED' ||
    vote.config.showResultsBeforeClose === true
  );
}

/**
 * Single source of truth for whether a comparative vote lets a top-group tie
 * be finalized as a tie. The finalize dialog, the editor and the finalize
 * route must agree, so the default lives here instead of three inline copies.
 */
export function voteAllowsTies(config: Pick<VoteEntity['config'], 'allowTies'>): boolean {
  return config.allowTies !== false;
}

/**
 * Single source of truth for the backup/export shape of a ranking ballot.
 * Backups never carry the participant credential, and anonymous votes must not
 * carry per-ballot identities. An absent `isAnonymous` flag is anonymous, which
 * matches the rest of the UI (`vote.config.isAnonymous ?? true`).
 */
export function redactRankingSubmissionForBackup(
  submission: VoteRankingSubmission,
  isAnonymous: boolean,
): VoteRankingSubmission {
  return {
    ...submission,
    voterToken: '',
    userId: isAnonymous ? null : submission.userId,
    displayName: isAnonymous ? null : submission.displayName,
  };
}

export interface FinalizeWinnerResolution {
  winningProposalId: string | null;
  error?: 'tied-requires-tie' | 'tied-requires-selection';
}

/**
 * Single source of truth for resolving a comparative vote's finalized winner
 * from the top-ranked group. The finalize endpoint and the dialog both use it
 * so their tie/winner rules cannot drift apart.
 */
export function resolveFinalizedWinner(
  topGroup: string[],
  allowTies: boolean,
  requestedWinner: string | null,
): FinalizeWinnerResolution {
  if (topGroup.length === 1) {
    return { winningProposalId: topGroup[0] };
  }
  if (allowTies) {
    if (requestedWinner !== null) {
      return { winningProposalId: null, error: 'tied-requires-tie' };
    }
    return { winningProposalId: null };
  }
  if (!requestedWinner || !topGroup.includes(requestedWinner)) {
    return { winningProposalId: null, error: 'tied-requires-selection' };
  }
  return { winningProposalId: requestedWinner };
}

export function computeBallotCoverage(
  ballot: Pick<VoteRankingBallot, 'comparisons' | 'itemIds'>,
  activeIds?: Set<string>,
): { coveredPairs: number; totalPairs: number; percent: number } {
  // Callers computing coverage for many ballots should pass a shared set so it
  // is not rebuilt per submission.
  const ids = activeIds ?? new Set(ballot.itemIds);
  const coveredPairs = countCoveredPairs(
    { comparisons: ballot.comparisons },
    ids,
  );
  const totalPairs = expectedRankingPairs(ids.size);
  return {
    coveredPairs,
    totalPairs,
    percent: totalPairs === 0 ? 100 : (coveredPairs / totalPairs) * 100,
  };
}

export function activeProposalIds(vote: VoteEntity): string[] {
  return vote.proposals
    .filter((proposal) => proposal.active)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((proposal) => proposal.id);
}

/** Inline content (styled text spans) must concatenate without separators, so a
 * word split across spans is not broken in half. */
function collectInlineText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectInlineText).join('');
  if (node && typeof node === 'object') {
    const inline = node as Record<string, unknown>;
    let text = typeof inline.text === 'string' ? inline.text : '';
    if (inline.content) text += collectInlineText(inline.content);
    if (inline.children) text += collectInlineText(inline.children);
    return text;
  }
  return '';
}

/** Block content (paragraphs, list items) is separated by whitespace, otherwise
 * two sibling paragraphs collapse into one run-together title. */
function collectBlockText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectBlockText).join(' ');
  if (node && typeof node === 'object') {
    const block = node as Record<string, unknown>;
    const text = typeof block.text === 'string' ? block.text : '';
    const content = block.content ? collectInlineText(block.content) : '';
    const children = block.children ? ` ${collectBlockText(block.children)}` : '';
    return `${text}${content}${children}`;
  }
  return '';
}

/**
 * Single source of truth for a proposal's displayable text. Proposal `content`
 * is stored as BlockNote JSON (or legacy HTML/plain text); extracting it here
 * keeps the rendered title and the "has content" check from diverging.
 * Returns null when the proposal has no displayable text at all.
 */
export function proposalPlainText(proposal: {
  description?: string | null;
  content?: string | null;
}): string | null {
  const description = proposal.description?.trim();
  if (description) return description;
  const raw = proposal.content?.trim();
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // BlockNote JSON: a text-less document (empty paragraph, image-only
      // block) has no title and must not fall through to emitting raw JSON.
      const text = collectBlockText(parsed).replace(/\s+/g, ' ').trim();
      return text || null;
    }
  } catch {
    // Not BlockNote JSON; fall back to HTML/plain-text extraction below.
  }
  const plain = raw
    // Replace tags with whitespace, not nothing: stripping block tags would
    // merge separate paragraphs into one run-together title.
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain || null;
}

/**
 * Single source of truth for the human-readable proposal title. Using the raw
 * `content` shows markup/JSON in the UI, so every caller must derive the title
 * here; text-less proposals fall back to their id.
 */
export function proposalDisplayTitle(proposal: {
  id?: string;
  description?: string | null;
  content?: string | null;
}): string {
  return proposalPlainText(proposal) ?? proposal.id ?? '';
}

/** Media blocks (image/video/file) carry their payload in `props` rather than
 * text, so `proposalPlainText` ignores them. Inspect `props` directly or a
 * media-only proposal looks blank and gets dropped on batch import. */
function blocksHaveMedia(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(blocksHaveMedia);
  if (!node || typeof node !== 'object') return false;
  const block = node as Record<string, unknown>;
  const props = block.props;
  if (props && typeof props === 'object') {
    const record = props as Record<string, unknown>;
    const url = typeof record.url === 'string' ? record.url.trim() : '';
    const caption = typeof record.caption === 'string' ? record.caption.trim() : '';
    if (url || caption) return true;
  }
  return blocksHaveMedia(block.children);
}

/**
 * Single source of truth for whether a proposal has any displayable content.
 * Derives from the same extraction as `proposalDisplayTitle` so the "empty
 * proposal" check treats nested block text exactly like the rendered title, and
 * additionally treats media blocks as content so an image-only proposal is not
 * mistaken for a blank placeholder.
 */
export function proposalHasContent(proposal: {
  description?: string | null;
  content?: string | null;
}): boolean {
  if (proposalPlainText(proposal) !== null) return true;
  const raw = proposal.content?.trim();
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return blocksHaveMedia(parsed);
  } catch {
    // Non-JSON content already had its text extracted by `proposalPlainText`.
  }
  return false;
}

/**
 * Single source of truth for the ranked-item cap and ordering. The client uses
 * it to declare its ballot's itemIds and the result builder uses it to pick the
 * set it aggregates, so the two cannot drift apart when the cap or tie-break
 * changes. Callers supply the count key (comparison frequency on the client,
 * ballot-inclusion frequency on the server) that defines "most compared".
 */
export function selectRankedItemIds(
  activeIds: string[],
  counts: Map<string, number>,
  positions: Map<string, number>,
): string[] {
  if (activeIds.length <= MAX_RANKED_ITEMS) return [...activeIds];
  return [...activeIds]
    .sort(
      (a, b) =>
        (counts.get(b) ?? 0) - (counts.get(a) ?? 0) ||
        (positions.get(a) ?? 0) - (positions.get(b) ?? 0) ||
        a.localeCompare(b),
    )
    .slice(0, MAX_RANKED_ITEMS);
}

export function buildVoteRankingResult(
  vote: VoteEntity,
  submissions: VoteRankingSubmission[],
): VoteRankingResult | null {
  const activeIds = activeProposalIds(vote);
  if (activeIds.length === 0) return null;

  const submitted = submissions
    .map((submission) => submission.submitted)
    .filter((ballot): ballot is VoteRankingBallot => ballot !== null);
  if (submitted.length === 0) return null;

  const comparedCount = new Map<string, number>();
  const position = new Map(
    vote.proposals.map((proposal) => [proposal.id, proposal.position]),
  );
  if (activeIds.length > MAX_RANKED_ITEMS) {
    const active = new Set(activeIds);
    for (const ballot of submitted) {
      for (const id of ballot.itemIds) {
        if (active.has(id)) comparedCount.set(id, (comparedCount.get(id) ?? 0) + 1);
      }
    }
  }
  const rankedIds = selectRankedItemIds(activeIds, comparedCount, position);

  const pooled = poolBallots(submitted, rankedIds);
  if (pooled.includedBallots === 0) return null;

  const partial = estimatePartialRanking(rankedIds, pooled.matrix);
  const proposalOrder = new Map(
    vote.proposals.map((proposal) => [proposal.id, proposal.position]),
  );
  let rank = 1;
  const groups = partial.groups.map((group) => {
    const proposalIds = [...group].sort(
      (a, b) =>
        (proposalOrder.get(a) ?? 0) - (proposalOrder.get(b) ?? 0) ||
        a.localeCompare(b),
    );
    const result = {
      rank,
      proposalIds,
      score: Math.log(Math.max(partial.itemStrengths[group[0]] ?? 1, 1e-9)),
    };
    rank += group.length;
    return result;
  });

  const activeSet = new Set(activeIds);
  const coverageValues = submitted.map(
    (ballot) =>
      computeBallotCoverage(
        { itemIds: activeIds, comparisons: ballot.comparisons },
        activeSet,
      ).percent,
  );
  const diagnostics = computeCondorcetDiagnostics(
    rankedIds,
    pooled.majorityMatrix,
  );

  return {
    groups,
    method: 'weighted-partial-ranking-bt',
    engine: vote.config.rankingEngine ?? DEFAULT_RANKING_ENGINE,
    participantCount: submitted.length,
    coverage: {
      mean:
        coverageValues.reduce((sum, value) => sum + value, 0) /
        Math.max(coverageValues.length, 1),
      min: coverageValues.length ? Math.min(...coverageValues) : 0,
      max: coverageValues.length ? Math.max(...coverageValues) : 0,
    },
    condorcetWinnerId: diagnostics.winnerId,
    hasMajorityCycle: diagnostics.hasMajorityCycle,
  };
}

function hashString(value: string): string {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
}

/** Stable anonymous label for a participant across vote modes. */
export function voterAlias(voteId: string, voterToken: string): string {
  return `P-${hashString(`${voteId}:${voterToken}`)}`;
}

/**
 * The pseudonym a response row contributes to a participant union. Merged draft
 * rows already carry the alias; submitted rows carry the raw token and must be
 * hashed the same way the public page hashes its own writes.
 */
export function responseVoterAlias(
  voteId: string,
  response: VoteResponseEntity,
): string {
  // Rows published in the shared document carry the alias explicitly and blank
  // the credential; rows fetched from the server carry the raw token. Drafts
  // already use the alias as their `voterToken`.
  if (response.voterAlias) return response.voterAlias;
  return response.id.startsWith('draft:')
    ? response.voterToken
    : voterAlias(voteId, response.voterToken);
}

/**
 * The single display-name rule for a response row in a voter, comment or
 * attendee list. Anonymity wins over every stored field; otherwise the
 * submitted name, then the user id, then the public alias. Every row uses this
 * so one participant is not labelled as their alias in the attendee list and
 * as their user id in the voter list of the same results view.
 */
export function responseVoterDisplayName(
  voteId: string,
  response: VoteResponseEntity,
  isAnonymous: boolean,
): string {
  const alias = responseVoterAlias(voteId, response);
  if (isAnonymous) return alias;
  return response.attendeeData?.displayName?.trim() || response.userId || alias;
}

/**
 * The representation of a vote response that is safe to publish in the shared,
 * unauthenticated Yjs document. The raw `voterToken` is a bearer credential for
 * withdrawing a response, so it is replaced by the stable, non-reversible
 * `voterAlias`. Idempotent: an already-shared row keeps its alias instead of
 * being hashed again.
 *
 * Moderator-only fields (`participantId`) are stripped here as well: callers
 * that hold a moderator capability hand the digest to the draft merge, but a
 * row published to every client must be byte-identical regardless of which
 * viewer produced it.
 */
export function shareVoteResponse(
  voteId: string,
  response: VoteResponseEntity,
): VoteResponseEntity {
  return withPublicResponseIdentity(voteId, response);
}

export type BallotParticipationStatus =
  | 'in_progress'
  | 'submitted'
  | 'editing'
  | 'stalled';

export interface BallotParticipationRow {
  alias: string;
  displayName: string | null;
  status: BallotParticipationStatus;
  earlyConverged: boolean;
  coveragePercent: number;
  confidencePercent: number;
  lastSeenAt: string;
}

export interface BallotParticipationSummary {
  counts: {
    seen: number;
    submitted: number;
    inProgress: number;
    editing: number;
    stalled: number;
    earlyConverged: number;
  };
  ballots: BallotParticipationRow[];
}

/**
 * Shared draft-vs-submitted freshness rule so the participation summary and the
 * ballot page agree on whether a participant is editing an already-submitted
 * ballot.
 */
export function isDraftNewer(
  hasDraft: boolean,
  draftUpdatedAt: string | null,
  submittedAt: string | null,
): boolean {
  return (
    hasDraft &&
    (!submittedAt || (draftUpdatedAt !== null && draftUpdatedAt > submittedAt))
  );
}

/** Lean participation projection: only the fields the summary needs. */
export interface BallotParticipationStat {
  voterToken: string;
  displayName: string | null;
  hasDraft: boolean;
  hasSubmitted: boolean;
  draftCoveragePercent: number | null;
  draftConfidencePercent: number | null;
  submittedCoveragePercent: number | null;
  submittedConfidencePercent: number | null;
  draftUpdatedAt: string | null;
  submittedAt: string | null;
  lastSeenAt: string;
}

export function deriveBallotParticipationFromStats(
  voteId: string,
  rows: BallotParticipationStat[],
  isAnonymous: boolean,
  now: number = Date.now(),
): BallotParticipationSummary {
  const counts = {
    seen: rows.length,
    submitted: 0,
    inProgress: 0,
    editing: 0,
    stalled: 0,
    earlyConverged: 0,
  };

  const ballots = rows.map((row) => {
    const draftIsNewer = isDraftNewer(row.hasDraft, row.draftUpdatedAt, row.submittedAt);
    const activeCoverage = draftIsNewer
      ? row.draftCoveragePercent
      : row.submittedCoveragePercent ?? row.draftCoveragePercent;
    const activeConfidence = draftIsNewer
      ? row.draftConfidencePercent
      : row.submittedConfidencePercent ?? row.draftConfidencePercent;
    const lastSeenMs = Date.parse(row.lastSeenAt);
    const stalled =
      !row.hasSubmitted &&
      Number.isFinite(lastSeenMs) &&
      now - lastSeenMs > STALLED_AFTER_MS;

    let status: BallotParticipationStatus;
    if (stalled) {
      status = 'stalled';
      counts.stalled++;
    } else if (row.hasSubmitted && draftIsNewer) {
      status = 'editing';
      counts.editing++;
    } else if (row.hasSubmitted) {
      status = 'submitted';
      counts.submitted++;
    } else {
      status = 'in_progress';
      counts.inProgress++;
    }

    const earlyConverged = Boolean(
      row.hasSubmitted && (row.submittedCoveragePercent ?? 0) < 99.5,
    );
    if (earlyConverged) counts.earlyConverged++;

    const alias = voterAlias(voteId, row.voterToken);
    // Fall back to the stable alias rather than a row index: rows are ordered by
    // lastSeenAt, so indexes change between polls.
    const displayName = isAnonymous ? null : row.displayName || alias;

    return {
      alias,
      displayName,
      status,
      earlyConverged,
      coveragePercent: activeCoverage ?? 0,
      confidencePercent: Math.max(0, Math.min(100, activeConfidence ?? 0)),
      lastSeenAt: row.lastSeenAt,
    };
  });

  return { counts, ballots };
}

export function deriveBallotParticipation(
  voteId: string,
  submissions: VoteRankingSubmission[],
  isAnonymous: boolean,
  now: number = Date.now(),
): BallotParticipationSummary {
  const rows: BallotParticipationStat[] = submissions.map((submission) => ({
    voterToken: submission.voterToken,
    displayName: submission.displayName,
    hasDraft: submission.draft !== null,
    hasSubmitted: submission.submitted !== null,
    draftCoveragePercent: submission.draft?.coverage?.percent ?? null,
    draftConfidencePercent: submission.draft?.confidencePercent ?? null,
    submittedCoveragePercent: submission.submitted?.coverage?.percent ?? null,
    submittedConfidencePercent: submission.submitted?.confidencePercent ?? null,
    draftUpdatedAt: submission.draftUpdatedAt,
    submittedAt: submission.submittedAt,
    lastSeenAt: submission.lastSeenAt,
  }));
  return deriveBallotParticipationFromStats(voteId, rows, isAnonymous, now);
}
