import * as React from "react";
import { eventBus } from "@/lib/events";
import { VoteEntity, VoteResponseEntity, VoteKind, VoteDraftEntity, VotePresenceEntity } from "@/lib/persistence-types";
import type { PersistenceAdapter } from "@/lib/persistence-types";
import { getPersistenceAdapter } from "@/lib/persistence-factory";
import { yVoteProposals, yVoteResponses, yVoteDraftRevisions, yVotePresenceRevisions, initializeCollaboration, isCollaborationEnabled, doc } from "@/lib/collaboration";
import { VOTE_SCOPED_YJS_MAPS } from "@/lib/vote-yjs-maps";
import { isDraftNewer, shareVoteResponse, voterAlias } from "@/lib/vote-ranking";
import { PERSISTENCE_CONFIG } from "@/lib/persistence-config";

let votes: VoteEntity[] = [];

if (!PERSISTENCE_CONFIG.FORCE_BROWSER) {
  initializeCollaboration();
}

const parseYjsValue = (v: unknown): VoteEntity | null => {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toJSON" in v) return (v as { toJSON: () => VoteEntity }).toJSON() as VoteEntity;
  return JSON.parse(JSON.stringify(v)) as VoteEntity;
};

const parseYjsResponseValue = (v: unknown): VoteResponseEntity | null => {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toJSON" in v) return (v as { toJSON: () => VoteResponseEntity }).toJSON() as VoteResponseEntity;
  return JSON.parse(JSON.stringify(v)) as VoteResponseEntity;
};

/**
 * Ids of responses this client has seen deleted, with the time the deletion was
 * observed. Results fetches and Yjs updates race: a fetch issued before a
 * withdrawal can resolve after the delete broadcast and still contain the
 * withdrawn row. The response sync is upsert-only (deleting absent keys would
 * erase a concurrent submit), so without this guard the stale fetch would
 * re-publish the row and every client and tally would keep counting a vote that
 * the database no longer has. Bounded by a TTL because the map lives for the tab.
 */
const responseDeletedAt = new Map<string, number>();
const RESPONSE_TOMBSTONE_TTL_MS = 10 * 60 * 1000;
const RESPONSE_TOMBSTONE_MAX = 5000;

export const noteVoteResponseDeletions = (
  responseIds: Iterable<string>,
  now = Date.now(),
): void => {
  for (const id of responseIds) responseDeletedAt.set(id, now);
  if (responseDeletedAt.size > RESPONSE_TOMBSTONE_MAX) {
    for (const [id, deletedAt] of responseDeletedAt) {
      if (now - deletedAt > RESPONSE_TOMBSTONE_TTL_MS) responseDeletedAt.delete(id);
    }
  }
};

const wasDeletedAfter = (responseId: string, since: number): boolean =>
  (responseDeletedAt.get(responseId) ?? 0) > since;

/** Read the `voteId` of a value stored in a vote-scoped Y.Map. */
const yjsVoteId = (value: unknown): string | null => {
  if (!value) return null;
  let parsed: unknown = value;
  if (typeof value === "object" && "toJSON" in (value as object)) {
    try {
      parsed = (value as { toJSON: () => unknown }).toJSON();
    } catch {
      return null;
    }
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    typeof (parsed as { voteId?: unknown }).voteId === "string"
  ) {
    return (parsed as { voteId: string }).voteId;
  }
  return null;
};

const draftToResponseEntities = (draft: VoteDraftEntity): VoteResponseEntity[] =>
  Object.entries(draft.values).map(([proposalId, value]) => ({
    id: `draft:${draft.voteId}:${draft.participantId ?? draft.voterAlias}:${proposalId}`,
    voteId: draft.voteId,
    proposalId,
    userId: null,
    voterToken: draft.voterAlias,
    participantId: draft.participantId,
    value,
    submittedAt: draft.updatedAt,
    // The moderator draft channel carries the participant's chosen name for a
    // non-anonymous vote so the live matrix can name someone before submission.
    ...(draft.displayName
      ? {
          attendeeData: {
            displayName: draft.displayName,
            visibility: 'hidden' as const,
          },
        }
      : {}),
  }));

/**
 * The pseudonym a response row contributes to the live "who joined" union.
 * Merged draft rows already carry the alias; submitted rows carry the raw token
 * and must be hashed the same way the public page hashes its own writes.
 */
export const responseVoterAlias = (voteId: string, response: VoteResponseEntity): string => {
  // Rows published in the shared document carry the alias explicitly and blank
  // the credential; rows fetched from the server carry the raw token. Drafts
  // already use the alias as their `voterToken`.
  if (response.voterAlias) return response.voterAlias;
  return response.id.startsWith('draft:')
    ? response.voterToken
    : voterAlias(voteId, response.voterToken);
};

/**
 * A draft is the participant's complete local selection for the vote. Merge it
 * by replacing that voter's submitted responses, so toggling a selection off
 * (absent from the draft) removes it from the provisional tally too.
 *
 * Rows published in the shared document carry only the alias, while a draft and
 * a moderator-fetched row carry the unforgeable digest. A person must therefore
 * match on the digest when both sides have one, and fall back to the alias when
 * one side is the public projection; matching on the digest alone would split an
 * already-submitted participant into two people as soon as they start editing.
 */
export const mergeDraftResponses = (
  voteId: string,
  responses: VoteResponseEntity[],
  drafts: VoteResponseEntity[],
): VoteResponseEntity[] => {
  if (drafts.length === 0) return responses;
  const aliasOf = (response: VoteResponseEntity): string =>
    responseVoterAlias(voteId, response);
  // The single participant-matching rule, used by both draft enrichment and
  // superseding: compare the moderator-only digest when both sides carry one,
  // otherwise fall back to the public alias. `buildIdentityIndex` compiles a set
  // of participants into O(1) lookups for exactly this rule, so the two
  // directions cannot drift into splitting or merging a participant
  // inconsistently.
  type ParticipantIdentity = { digest: string | undefined; alias: string };
  const identityOf = (response: VoteResponseEntity): ParticipantIdentity => ({
    digest: response.participantId,
    alias: aliasOf(response),
  });
  const buildIdentityIndex = (members: VoteResponseEntity[]) => {
    const digests = new Set<string>();
    const aliases = new Set<string>();
    const aliasOnlyAliases = new Set<string>();
    for (const member of members) {
      const identity = identityOf(member);
      aliases.add(identity.alias);
      if (identity.digest) digests.add(identity.digest);
      else aliasOnlyAliases.add(identity.alias);
    }
    return { digests, aliases, aliasOnlyAliases };
  };
  const matchesAnyIdentity = (
    index: ReturnType<typeof buildIdentityIndex>,
    identity: ParticipantIdentity,
  ): boolean => {
    if (identity.digest) {
      return (
        index.digests.has(identity.digest) ||
        index.aliasOnlyAliases.has(identity.alias)
      );
    }
    return index.aliases.has(identity.alias);
  };
  // A draft only supersedes a submission when it was written after it. A draft
  // left behind by a failed cleanup DELETE, or by a second tab that is still
  // editing, must not replace votes the participant has since submitted; this is
  // the same freshness rule the comparative provisional ranking applies.
  const latestSubmittedAt = new Map<string, string | null>();
  for (const response of responses) {
    const submittedAt = response.submittedAt ?? null;
    const keys = [`alias:${aliasOf(response)}`];
    if (response.participantId) keys.push(`digest:${response.participantId}`);
    for (const key of keys) {
      const previous = latestSubmittedAt.get(key);
      if (
        previous === undefined ||
        previous === null ||
        (submittedAt && submittedAt > previous)
      ) {
        latestSubmittedAt.set(key, submittedAt);
      }
    }
  }
  const latestSubmissionFor = (draft: VoteResponseEntity): string | null => {
    if (draft.participantId) {
      const byDigest = latestSubmittedAt.get(`digest:${draft.participantId}`);
      if (byDigest !== undefined) return byDigest;
    }
    return latestSubmittedAt.get(`alias:${aliasOf(draft)}`) ?? null;
  };
  const freshDrafts = drafts.filter((draft) =>
    isDraftNewer(true, draft.submittedAt ?? null, latestSubmissionFor(draft)),
  );
  if (freshDrafts.length === 0) return responses;
  // Draft rows are identity-less by construction. Carry over the identity,
  // comment and attendee details of the submitted row for the same proposal so
  // an editing participant is not shown as anonymous, does not lose their
  // comment, and keeps the name the moderator matrix displays (scheduling
  // names live in `attendeeData` and are only ever present in the
  // moderator-authenticated projection, so this stays inside this view).
  // Index submitted rows by proposal so enrichment only compares a draft with
  // the participants who answered that same proposal. A scheduling poll expands
  // to one row per slot, so scanning the whole matrix once per draft made this
  // quadratic in participants x slots on every moderator refresh.
  const responsesByProposal = new Map<string | null, VoteResponseEntity[]>();
  for (const response of responses) {
    const bucket = responsesByProposal.get(response.proposalId);
    if (bucket) bucket.push(response);
    else responsesByProposal.set(response.proposalId, [response]);
  }
  const enrichedDrafts = freshDrafts.map((draft) => {
    const draftIdentityIndex = buildIdentityIndex([draft]);
    const previous = responsesByProposal
      .get(draft.proposalId)
      ?.find((response) =>
        matchesAnyIdentity(draftIdentityIndex, identityOf(response)),
      );
    if (!previous) return draft;
    const attendeeData = previous.attendeeData ?? draft.attendeeData;
    return {
      ...draft,
      userId: previous.userId,
      comment: previous.comment,
      ...(attendeeData ? { attendeeData } : {}),
    };
  });
  // Precompute the participants a fresh draft supersedes once, instead of
  // rescanning every draft for every submitted row. The match rule is the same
  // `matchesAnyIdentity`: digest comparison when both sides carry one, alias
  // fallback otherwise.
  const draftIdentityIndex = buildIdentityIndex(freshDrafts);
  const isSuperseded = (response: VoteResponseEntity): boolean =>
    matchesAnyIdentity(draftIdentityIndex, identityOf(response));
  return [
    ...responses.filter((response) => !isSuperseded(response)),
    ...enrichedDrafts,
  ];
};

type VoteLiveSignal = {
  observe: (
    handler: (event: { keysChanged: Set<string> }, transaction: { local: boolean }) => void,
  ) => void;
  unobserve: (
    handler: (event: { keysChanged: Set<string> }, transaction: { local: boolean }) => void,
  ) => void;
};

const loadVoteDrafts = (adapter: PersistenceAdapter, voteId: string, moderatorToken: string) =>
  adapter.listVoteDrafts(voteId, moderatorToken);
const loadVotePresence = (adapter: PersistenceAdapter, voteId: string, moderatorToken: string) =>
  adapter.listVotePresence(voteId, moderatorToken);

/**
 * Read a moderator-authenticated, vote-scoped list and keep it live. The Yjs
 * signal carries only a revision (never the data), so it triggers an immediate
 * authenticated refetch; polling remains as a fallback for a broken WebSocket.
 * Bursts are coalesced so rapid clicks produce one refetch, not one per click.
 */
const useVoteLiveList = <T,>(params: {
  voteId: string;
  enabled: boolean;
  moderatorToken?: string;
  signal: VoteLiveSignal;
  load: (adapter: PersistenceAdapter, voteId: string, moderatorToken: string) => Promise<T[]>;
  coalesceMs?: number;
}): T[] => {
  const { voteId, enabled, moderatorToken, signal, load, coalesceMs = 200 } = params;
  const [items, setItems] = React.useState<T[]>([]);

  React.useEffect(() => {
    if (!enabled || !voteId || !moderatorToken) {
      setItems([]);
      return;
    }
    let mounted = true;
    // The live signal and the polling fallback can both fire close together.
    // Do not stack overlapping authenticated list requests; if a refresh is
    // requested while one is in flight, run exactly one more afterwards so the
    // newer revision is not lost.
    let inFlight = false;
    let pending = false;
    const refresh = async () => {
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      try {
        const adapter = await getPersistenceAdapter();
        const result = await load(adapter, voteId, moderatorToken);
        if (mounted) setItems(result);
      } catch (error) {
        console.error("Error loading vote live data:", error);
      } finally {
        inFlight = false;
        if (pending && mounted) {
          pending = false;
          void refresh();
        }
      }
    };
    void refresh();

    const collaboration = isCollaborationEnabled();
    let coalesceTimer: number | null = null;
    let observer:
      | ((event: { keysChanged: Set<string> }, transaction: { local: boolean }) => void)
      | null = null;
    if (collaboration) {
      observer = (event, transaction) => {
        if (transaction.local) return;
        if (!event.keysChanged.has(voteId)) return;
        if (coalesceTimer !== null) window.clearTimeout(coalesceTimer);
        coalesceTimer = window.setTimeout(() => {
          coalesceTimer = null;
          void refresh();
        }, coalesceMs);
      };
      signal.observe(observer);
    }

    const interval = window.setInterval(refresh, collaboration ? 15000 : 5000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      if (coalesceTimer !== null) window.clearTimeout(coalesceTimer);
      if (observer) signal.unobserve(observer);
    };
  }, [voteId, enabled, moderatorToken, signal, load, coalesceMs]);

  return items;
};

/**
 * Participants who opened the vote, independent of whether they selected or
 * submitted anything. Served by the moderator-authenticated presence channel,
 * so someone whose page is merely open still appears before they touch a
 * ballot.
 */
export const useVoteParticipation = (
  voteId: string,
  enabled = true,
  moderatorToken?: string,
) =>
  useVoteLiveList<VotePresenceEntity>({
    voteId,
    enabled,
    moderatorToken,
    signal: yVotePresenceRevisions,
    load: loadVotePresence,
    coalesceMs: 300,
  });

/**
 * In-progress selections for the moderator view. Participants publish through
 * an authenticated HTTP write, so hidden votes and anonymous identities never
 * reach the shared Yjs room; the draft channel is the only reader.
 */
export const useVoteResponseDrafts = (
  voteId: string,
  enabled: boolean,
  moderatorToken?: string,
) => {
  const drafts = useVoteLiveList<VoteDraftEntity>({
    voteId,
    enabled,
    moderatorToken,
    signal: yVoteDraftRevisions,
    load: loadVoteDrafts,
  });
  return React.useMemo(() => drafts.flatMap(draftToResponseEntities), [drafts]);
};

export const syncVoteToYjs = (id: string, vote: VoteEntity) => {
  if (isCollaborationEnabled()) {
    yVoteProposals.set(id, vote);
  }
};

export const syncResponsesToYjs = (
  voteId: string,
  responses: VoteResponseEntity[],
  fetchStartedAt = 0,
) => {
  if (!isCollaborationEnabled()) return;
  // Upsert only. A fetch that started before a concurrent submit can resolve
  // with a stale list; deleting keys absent from it would erase the submit that
  // the server just broadcast. Removals are explicit (server delete broadcast,
  // withdraw, reset), so a merge is both safer and still convergent. Rows that
  // were deleted after this fetch began are skipped by the tombstone below, so a
  // late-arriving stale list cannot resurrect a withdrawal either.
  // Rows are published through `shareVoteResponse`, which replaces the raw
  // withdrawal credential with its alias before it reaches the shared document.
  // Only write rows whose value actually changed: Y.Map.set always creates a new
  // item even for an identical value, so a periodic poll that re-synced every
  // row would broadcast the whole table to every peer on each tick.
  doc.transact(() => {
    for (const response of responses) {
      if (wasDeletedAfter(response.id, fetchStartedAt)) continue;
      const shared = shareVoteResponse(voteId, response);
      const existing = yVoteResponses.get(response.id);
      if (existing && JSON.stringify(existing) === JSON.stringify(shared)) continue;
      yVoteResponses.set(response.id, shared);
    }
  });
};

const syncVotesToYjs = () => {
  if (!isCollaborationEnabled()) return;
  doc.transact(() => {
    const currentIds = Array.from(yVoteProposals.keys()) as string[];
    const newIds = votes.map(v => v.id);
    currentIds.forEach(id => {
      if (!newIds.includes(id)) {
        yVoteProposals.delete(id);
      }
    });
    votes.forEach(vote => {
      yVoteProposals.set(vote.id, vote);
    });
  });
};

const syncResponseToYjs = (response: VoteResponseEntity) => {
  if (isCollaborationEnabled()) {
    yVoteResponses.set(response.id, response);
  }
};

type VoteScopedYMap = {
  forEach: (callback: (value: unknown, key: string) => void) => void;
  delete: (key: string) => void;
  observe: (callback: (event: unknown, transaction: unknown) => void) => void;
  unobserve: (callback: (event: unknown, transaction: unknown) => void) => void;
};

const clearVoteChildrenFromYjs = (voteId: string) => {
  if (!isCollaborationEnabled()) return;
  // Iterate the shared vote-scoped map registry so the client and server cannot
  // drift on which maps a reset must clear.
  const clearMapForVote = (mapName: string) => {
    const map = doc.getMap(mapName) as unknown as VoteScopedYMap;
    const keysToDelete: string[] = [];
    map.forEach((value, key) => {
      if (yjsVoteId(value) === voteId) keysToDelete.push(key);
    });
    // A reset removes responses too; remember them so an in-flight results fetch
    // cannot restore the cleared rows into the shared map a moment later.
    if (mapName === 'voteResponses' && keysToDelete.length > 0) {
      noteVoteResponseDeletions(keysToDelete);
    }
    keysToDelete.forEach((key) => map.delete(key));
  };
  doc.transact(() => {
    for (const mapName of VOTE_SCOPED_YJS_MAPS) clearMapForVote(mapName);
  });
};

if (isCollaborationEnabled()) {
  // Only react to remote transactions. Local writes below already update the
  // in-memory state and publish their own event; reacting to them would make
  // every Yjs write publish an event that fetches and writes to Yjs again,
  // which is an endless refetch loop.
  yVoteProposals.observe((_event, transaction) => {
    if (transaction.local) return;
    const newVotes = (Array.from(yVoteProposals.values()) as unknown[])
      .map(v => parseYjsValue(v))
      .filter((v): v is VoteEntity => v !== null);
    votes = newVotes;
    invalidateVotesCache();
    eventBus.publish("votesChanged");
  });

  // Record withdrawal/reset broadcasts so a results fetch that was already in
  // flight when the row was deleted cannot resurrect it into the shared map.
  yVoteResponses.observe((event, transaction) => {
    if (transaction.local) return;
    const deletedIds: string[] = [];
    event.changes.keys.forEach((change, key) => {
      if (change.action === 'delete') deletedIds.push(key);
    });
    if (deletedIds.length > 0) noteVoteResponseDeletions(deletedIds);
  });
}

type VotesLoadOptions = { linkedTaskId?: string; ownerId?: string; kind?: VoteKind };
type VotesLoadResult = { ok: true; data: VoteEntity[] } | { ok: false };

const inFlightVotes = new Map<string, Promise<VotesLoadResult>>();
const votesCache = new Map<string, { data: VoteEntity[]; at: number }>();
const VOTES_CACHE_TTL_MS = 30_000;

const invalidateVotesCache = () => {
  votesCache.clear();
};

const votesLoadKey = (opts?: VotesLoadOptions): string =>
  `${opts?.linkedTaskId ?? ''}|${opts?.ownerId ?? ''}|${opts?.kind ?? ''}`;

const loadVotesFromAdapter = async (opts?: VotesLoadOptions): Promise<VotesLoadResult> => {
  try {
    const adapter = await getPersistenceAdapter();
    votes = await adapter.listVotes(opts);
    eventBus.publish("votesChanged");
    syncVotesToYjs();
    return { ok: true, data: votes };
  } catch (error) {
    console.error("Error loading votes:", error);
    return { ok: false };
  }
};

export const loadVotes = async (opts?: VotesLoadOptions): Promise<VoteEntity[]> => {
  const key = votesLoadKey(opts);
  const cached = votesCache.get(key);
  if (cached && Date.now() - cached.at < VOTES_CACHE_TTL_MS) {
    return cached.data;
  }

  const pending = inFlightVotes.get(key);
  if (pending) {
    const result = await pending;
    return result.ok ? result.data : votes;
  }

  const request = loadVotesFromAdapter(opts);
  inFlightVotes.set(key, request);
  try {
    const result = await request;
    if (!result.ok) return votes;
    votesCache.set(key, { data: result.data, at: Date.now() });
    return result.data;
  } finally {
    if (inFlightVotes.get(key) === request) {
      inFlightVotes.delete(key);
    }
  }
};

const loadVoteById = async (id: string): Promise<VoteEntity | null> => {
  try {
    const adapter = await getPersistenceAdapter();
    return await adapter.getVoteById(id);
  } catch (error) {
    console.error("Error loading vote by id:", error);
    return null;
  }
};

const loadVoteBySlug = async (slug: string): Promise<VoteEntity | null> => {
  try {
    const adapter = await getPersistenceAdapter();
    return await adapter.getVoteBySlug(slug);
  } catch (error) {
    console.error("Error loading vote by slug:", error);
    return null;
  }
};

export const createVote = async (input: Partial<VoteEntity>): Promise<VoteEntity | null> => {
  invalidateVotesCache();
  try {
    const adapter = await getPersistenceAdapter();
    const vote = await adapter.createVote(input);
    votes = [...votes, vote];
    syncVoteToYjs(vote.id, vote);
    eventBus.publish("votesChanged");
    return vote;
  } catch (error) {
    console.error("Error creating vote:", error);
    return null;
  }
};

const updateVote = async (id: string, patch: Partial<VoteEntity>): Promise<VoteEntity | null> => {
  invalidateVotesCache();
  try {
    const adapter = await getPersistenceAdapter();
    const updated = await adapter.updateVote(id, patch);
    if (updated) {
      votes = votes.map(v => v.id === id ? updated : v);
      syncVoteToYjs(id, updated);
      eventBus.publish("votesChanged");
    }
    return updated;
  } catch (error) {
    console.error("Error updating vote:", error);
    return null;
  }
};

const finalizeVote = async (id: string, outcome: VoteEntity['outcome']): Promise<VoteEntity | null> => {
  invalidateVotesCache();
  try {
    const adapter = await getPersistenceAdapter();
    const updated = await adapter.finalizeVote(id, outcome);
    if (updated) {
      votes = votes.map(v => v.id === id ? updated : v);
      syncVoteToYjs(id, updated);
      eventBus.publish("votesChanged");
    }
    return updated;
  } catch (error) {
    console.error("Error finalizing vote:", error);
    return null;
  }
};

const deleteVote = async (id: string): Promise<void> => {
  invalidateVotesCache();
  try {
    const adapter = await getPersistenceAdapter();
    await adapter.deleteVote(id);
    votes = votes.filter(v => v.id !== id);
    if (isCollaborationEnabled()) {
      yVoteProposals.delete(id);
    }
    eventBus.publish("votesChanged");
  } catch (error) {
    console.error("Error deleting vote:", error);
  }
};

const resetVote = async (id: string): Promise<VoteEntity | null> => {
  invalidateVotesCache();
  try {
    const adapter = await getPersistenceAdapter();
    const updated = await adapter.resetVote(id);
    if (updated) {
      votes = votes.map(v => v.id === id ? updated : v);
      syncVoteToYjs(id, updated);
      clearVoteChildrenFromYjs(id);
      eventBus.publish("votesChanged");
      eventBus.publish("voteLoopsChanged");
      eventBus.publish("voteResponsesChanged");
    }
    return updated;
  } catch (error) {
    console.error("Error resetting vote:", error);
    return null;
  }
};

const submitVoteResponse = async (voteIdOrSlug: string, response: Partial<VoteResponseEntity>): Promise<VoteResponseEntity | null> => {
  invalidateVotesCache();
  try {
    const adapter = await getPersistenceAdapter();
    const vote = await adapter.getVoteById(voteIdOrSlug) || await adapter.getVoteBySlug(voteIdOrSlug);
    if (!vote) return null;
    throw new Error("submitVoteResponse requires server-side endpoint — use HTTP adapter");
  } catch (error) {
    console.error("Error submitting vote response:", error);
    return null;
  }
};

const subscribeVotes = (listener: () => void) => {
  const handler = () => listener();
  eventBus.subscribe("votesChanged", handler);
  return () => eventBus.unsubscribe("votesChanged", handler);
};

const getVotesSnapshot = () => votes;

export const useLinkedVotes = (ids?: string[]): VoteEntity[] => {
  const allVotes = React.useSyncExternalStore(subscribeVotes, getVotesSnapshot, getVotesSnapshot);
  return React.useMemo(() => {
    if (!ids || ids.length === 0) return [];
    const wanted = new Set(ids);
    return allVotes.filter(vote => wanted.has(vote.id));
  }, [allVotes, ids]);
};

export const useVotes = (opts?: { linkedTaskId?: string; ownerId?: string; kind?: VoteKind }) => {
  const [votesState, setVotesState] = React.useState<VoteEntity[]>(votes);
  const [isLoading, setIsLoading] = React.useState(true);

  const linkedTaskId = opts?.linkedTaskId;
  const ownerId = opts?.ownerId;
  const kind = opts?.kind;

  React.useEffect(() => {
    let mounted = true;

    const fetchVotes = async () => {
      setIsLoading(true);
      const result = await loadVotes({ linkedTaskId, ownerId, kind });
      if (mounted) {
        setVotesState(result);
        setIsLoading(false);
      }
    };

    fetchVotes();

    const handler = () => {
      if (mounted) {
        setVotesState([...votes]);
      }
    };

    eventBus.subscribe("votesChanged", handler);

    return () => {
      mounted = false;
      eventBus.unsubscribe("votesChanged", handler);
    };
  }, [linkedTaskId, ownerId, kind]);

  return {
    votes: votesState,
    isLoading,
    loadVotes,
    loadVoteById,
    loadVoteBySlug,
    createVote,
    updateVote,
    finalizeVote,
    deleteVote,
    resetVote,
  };
};

export const useVoteResults = (
  voteId: string,
  enabled = true,
  includeDrafts = false,
  moderatorToken?: string,
) => {
  const [responses, setResponses] = React.useState<VoteResponseEntity[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  // Mirror of the committed response list, so the Yjs observer can tell
  // whether a broadcast row is one it already holds an authenticated digest
  // for without reading stale state inside the updater.
  const responsesRef = React.useRef<VoteResponseEntity[]>(responses);
  React.useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);
  const authoritativeRefetchAtRef = React.useRef(0);
  const drafts = useVoteResponseDrafts(voteId, enabled && includeDrafts, moderatorToken);
  const mergedResponses = React.useMemo(
    () => (includeDrafts ? mergeDraftResponses(voteId, responses, drafts) : responses),
    [voteId, responses, drafts, includeDrafts],
  );

  const fetchResults = React.useCallback(async () => {
    try {
      // Capture the request start so a response row deleted while this fetch is
      // in flight is not re-published by the upsert-only sync when it resolves.
      const startedAt = Date.now();
      const adapter = await getPersistenceAdapter();
      // The moderator projection adds the collision-resistant participant digest
      // used to merge drafts; the public view never receives it.
      const result = await adapter.listVoteResponses(voteId, moderatorToken);
      setResponses(result);
      syncResponsesToYjs(voteId, result, startedAt);
    } catch (error) {
      console.error("Error loading vote results:", error);
    }
  }, [voteId, moderatorToken]);

  React.useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    let mounted = true;

    const initialFetch = async () => {
      setIsLoading(true);
      try {
        const startedAt = Date.now();
        const adapter = await getPersistenceAdapter();
        const result = await adapter.listVoteResponses(voteId, moderatorToken);
        if (mounted) {
          setResponses(result);
          setIsLoading(false);
        }
        syncResponsesToYjs(voteId, result, startedAt);
      } catch (error) {
        console.error("Error loading vote results:", error);
        if (mounted) setIsLoading(false);
      }
    };

    initialFetch();

    const yjsHandler = (_event: unknown, transaction: { local: boolean }) => {
      // Local writes already updated `responses` from the fetch that produced
      // them. Re-reading the map here would re-apply entries the server just
      // deleted but that a local upsert transaction has not removed yet.
      if (transaction.local) return;
      if (!mounted) return;
      const allResponses = (Array.from(yVoteResponses.values()) as unknown[])
        .map(v => parseYjsResponseValue(v))
        .filter((v): v is VoteResponseEntity => v !== null);
      const voteResponses = allResponses.filter(r => r.voteId === voteId);
      // A batch submit mints fresh row ids for newly selected slots, so the
      // live projection can carry rows this client has no digest for. Do not
      // re-attach one by alias: a participant can brute-force a colliding
      // public alias, and merging on it would fold them into their victim —
      // exactly what the moderator-only digest prevents. Fetch the
      // authenticated copy instead; it carries the digest for every row and
      // heals the transient tally split without trusting the alias. Throttled
      // so the burst of updates from one batch issues a single request and
      // only after the authenticated baseline is loaded.
      if (moderatorToken && responsesRef.current.length > 0) {
        const knownIds = new Set(responsesRef.current.map((row) => row.id));
        const hasUnknownDigest = voteResponses.some(
          (row) => !row.participantId && !knownIds.has(row.id),
        );
        const now = Date.now();
        if (
          hasUnknownDigest &&
          now - authoritativeRefetchAtRef.current >= 1000
        ) {
          authoritativeRefetchAtRef.current = now;
          void fetchResults();
        }
      }
      // The shared projection intentionally omits the moderator-only digest and
      // the private RSVP contact fields. Re-attach them from the authenticated
      // copy this client already holds, so a remote update does not split a
      // participant (draft digest) from their submission (alias only) in the
      // provisional tally, nor blank the organizer's attendee details until the
      // next authenticated refetch.
      setResponses((previous) => {
        if (!moderatorToken) return voteResponses;
        const digestById = new Map(
          previous
            .filter((row) => row.participantId)
            .map((row) => [row.id, row.participantId as string]),
        );
        const attendeeById = new Map(
          previous
            .filter((row) => row.attendeeData)
            .map((row) => [row.id, row.attendeeData]),
        );
        return voteResponses.map((row) => {
          const privateAttendee = attendeeById.get(row.id);
          // The shared projection drops a hidden display name, but the
          // moderator's authenticated copy still has it. Re-attach it locally
          // (this state is never published back to Yjs verbatim) so the
          // scheduling participant matrix keeps its names between polls.
          const attendeeData = row.attendeeData && privateAttendee
            ? {
                ...row.attendeeData,
                email: privateAttendee.email,
                answers: privateAttendee.answers,
                ...(privateAttendee.displayName !== undefined
                  ? { displayName: privateAttendee.displayName }
                  : {}),
                ...(privateAttendee.visibility !== undefined
                  ? { visibility: privateAttendee.visibility }
                  : {}),
              }
            : row.attendeeData;
          return {
            ...row,
            ...(row.participantId ? {} : { participantId: digestById.get(row.id) }),
            ...(attendeeData ? { attendeeData } : {}),
          };
        });
      });
    };

    if (isCollaborationEnabled()) {
      yVoteResponses.observe(yjsHandler);
      // Yjs is the live channel. Keep a slow background refresh as a safety
      // net for a dropped WebSocket or a missed update; it never drives the
      // live path and writes are local-only, so it cannot feed the observers.
      const interval = setInterval(() => {
        if (!mounted) return;
        fetchResults();
      }, 15000);
      return () => {
        mounted = false;
        clearInterval(interval);
        yVoteResponses.unobserve(yjsHandler);
      };
    }

    const interval = setInterval(initialFetch, 5000);
    const eventHandler = () => {
      if (!mounted) return;
      fetchResults();
    };
    eventBus.subscribe("voteResponsesChanged", eventHandler);
    return () => {
      mounted = false;
      clearInterval(interval);
      eventBus.unsubscribe("voteResponsesChanged", eventHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voteId, enabled, moderatorToken]);

  return {
    responses: mergedResponses,
    isLoading,
    refetch: fetchResults,
    // `mergeDraftResponses` returns the submitted list unchanged when every
    // draft is stale, so presence of drafts alone is not enough to claim the
    // tally includes in-progress selections.
    hasDrafts: includeDrafts && mergedResponses !== responses,
    draftCount: includeDrafts ? drafts.length : 0,
  };
};

export const useVoterToken = (slug: string) => {
  const STORAGE_PREFIX = 'voted_vote_';

  const getToken = (): string | null => {
    try {
      return localStorage.getItem(`${STORAGE_PREFIX}${slug}`);
    } catch {
      return null;
    }
  };

  const setToken = (token: string) => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${slug}`, token);
    } catch {
      // ignore
    }
  };

  const hasVoted = getToken() !== null;

  return { voterToken: getToken(), hasVoted, setToken };
};