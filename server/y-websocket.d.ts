declare module 'y-websocket/bin/utils' {
  import { WebSocket } from 'ws';
  import { IncomingMessage } from 'http';

  export function setupWSConnection(
    ws: WebSocket,
    req: IncomingMessage,
    options: {
      docName?: string;
    }
  ): void;
}