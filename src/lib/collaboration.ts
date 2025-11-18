import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// Create a shared Yjs document
export const doc = new Y.Doc();

// Connect to the WebSocket provider
// Use the current protocol (ws or wss) and host, connecting to the /ws proxy
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}/ws`;
export const provider = new WebsocketProvider(wsUrl, 'p3fo-room', doc);

// Export awareness instance
export const awareness = provider.awareness;

// Export shared tasks map
export const yTasks = doc.getMap('tasks');
