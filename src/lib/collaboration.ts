import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { PERSISTENCE_CONFIG } from './persistence-config';
import { instrumentYjsProvider, instrumentYMap, instrumentDocTransactions } from './yjs-telemetry';

// Create a shared Yjs document (always safe to create)
export const doc = new Y.Doc();
instrumentDocTransactions(doc);

// Export shared tasks map (always safe to create)
export const yTasks = instrumentYMap(doc.getMap('tasks'), 'tasks');

// Export shared user settings map for cross-client synchronization
export const yUserSettings = instrumentYMap(doc.getMap('userSettings'), 'userSettings');

// Export shared fertilization board maps
export const yFertilizationState = instrumentYMap(doc.getMap('fertilizationState'), 'fertilizationState');
export const yFertilizationCards = instrumentYMap(doc.getMap('fertilizationCards'), 'fertilizationCards');
export const yFertilizationColumns = instrumentYMap(doc.getMap('fertilizationColumns'), 'fertilizationColumns');

// Export shared dream board maps
export const yDreamState = instrumentYMap(doc.getMap('dreamState'), 'dreamState');
export const yDreamCards = instrumentYMap(doc.getMap('dreamCards'), 'dreamCards');
export const yDreamColumns = instrumentYMap(doc.getMap('dreamColumns'), 'dreamColumns');

// Export shared salary board map (transparent salary system)
export const ySalaryState = instrumentYMap(doc.getMap('salaryState'), 'salaryState');

// Export shared circles map for real-time sync
export const yCircles = instrumentYMap(doc.getMap('circles'), 'circles');

// Export shared frameworks map for real-time sync
export const yFrameworks = instrumentYMap(doc.getMap('frameworks'), 'frameworks');

// Export shared app settings map for cross-client synchronization
export const yAppSettings = instrumentYMap(doc.getMap('appSettings'), 'appSettings');

// Export shared system state (for global commands like Clear All)
export const ySystemState = instrumentYMap(doc.getMap('systemState'), 'systemState');

// Export shared vote maps for real-time collaboration
export const yVoteProposals = instrumentYMap(doc.getMap('voteProposals'), 'voteProposals');
export const yVoteLoops = instrumentYMap(doc.getMap('voteLoops'), 'voteLoops');
export const yVoteResponses = instrumentYMap(doc.getMap('voteResponses'), 'voteResponses');
// In-progress selections no longer live in the shared document: they travel
// through the moderator-authenticated draft channel (`/api/votes/:id/drafts`),
// so hidden votes and anonymous identities are never fanned out to every
// client. The legacy `voteResponseDrafts` map is purged once at server start.
// Presence no longer lives in the shared document either: it travels through
// the moderator-authenticated presence channel, so anonymous participation is
// only visible to a facilitator. The legacy `voteParticipation` map is purged
// once at server start.
// Lightweight live signals for non-comparative in-progress drafts. The value
// carries only a revision counter, never draft content or identity: the draft
// itself is served by the moderator-authenticated `/drafts` endpoint. The
// signal exists so a moderator view refetches immediately instead of waiting
// for its polling fallback.
export const yVoteDraftRevisions = instrumentYMap(doc.getMap('voteDraftRevisions'), 'voteDraftRevisions');
// Same signal for the presence channel: a moderator view refetches the
// authenticated participant list immediately after any join/heartbeat.
export const yVotePresenceRevisions = instrumentYMap(doc.getMap('votePresenceRevisions'), 'votePresenceRevisions');
// Lightweight live ranking signals for comparative prioritization votes.
// Keyed by vote id; values carry revisions + counts, never ballots or voter
// identities, so they are safe to fan out to every connected client.
export const yVoteRankingState = instrumentYMap(doc.getMap('voteRankingState'), 'voteRankingState');

// Provider and awareness are nullable - only initialized when NOT in browser-only mode
export let provider: WebsocketProvider | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let awareness: any = null;

// Flag to track if collaboration has been initialized
let isInitialized = false;

/**
 * Initialize collaboration features (WebSocket provider and awareness).
 * This should only be called when NOT in browser-only mode.
 */
export function initializeCollaboration(): void {
    // Don't initialize if we're in forced browser mode
    if (PERSISTENCE_CONFIG.FORCE_BROWSER) {
        console.log('Collaboration: Disabled (browser-only mode)');
        return;
    }

    // Don't initialize multiple times
    if (isInitialized) {
        return;
    }

    try {
        // Connect to the WebSocket provider
        // Use the current protocol (ws or wss) and host, connecting to the /ws proxy
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        provider = new WebsocketProvider(wsUrl, 'p3fo-room', doc);
        awareness = provider.awareness;

        instrumentYjsProvider(provider, 'p3fo-room');

        isInitialized = true;
        console.log('Collaboration: Initialized with WebSocket provider');
    } catch (error) {
        console.error('Collaboration: Failed to initialize WebSocket provider', error);
    }
}

/**
 * Check if collaboration features are available.
 */
export function isCollaborationEnabled(): boolean {
    return !PERSISTENCE_CONFIG.FORCE_BROWSER && isInitialized;
}

/**
 * Check if the collaboration provider is actually connected and has completed
 * its initial sync. Callers can use this to enable polling fallbacks when a
 * proxy blocks the WebSocket upgrade.
 */
export function isCollaborationConnected(): boolean {
    return isCollaborationEnabled() && provider !== null && provider.wsconnected && provider.synced;
}
