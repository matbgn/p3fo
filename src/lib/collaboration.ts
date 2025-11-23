import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { PERSISTENCE_CONFIG } from './persistence-config';

// Create a shared Yjs document (always safe to create)
export const doc = new Y.Doc();

// Export shared tasks map (always safe to create)
export const yTasks = doc.getMap('tasks');

// Export shared user settings map for cross-client synchronization
export const yUserSettings = doc.getMap('userSettings');

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
