import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// Create a shared Yjs document
export const doc = new Y.Doc();

// Connect to the WebSocket provider
// Using the same host/port as the dev server, but with ws:// protocol
const wsUrl = `ws://${window.location.hostname}:3000`;
export const provider = new WebsocketProvider(wsUrl, 'p3fo-room', doc);

// Export awareness instance
export const awareness = provider.awareness;
