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

// Export shared circles map for real-time sync
export const yCircles = instrumentYMap(doc.getMap('circles'), 'circles');

// Export shared frameworks map for real-time sync
export const yFrameworks = instrumentYMap(doc.getMap('frameworks'), 'frameworks');

// Export shared app settings map for cross-client synchronization
export const yAppSettings = instrumentYMap(doc.getMap('appSettings'), 'appSettings');

// Export shared system state (for global commands like Clear All)
export const ySystemState = instrumentYMap(doc.getMap('systemState'), 'systemState');

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
