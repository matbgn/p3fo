declare module 'y-websocket/bin/utils' {
  import { WebSocket } from 'ws';
  import { IncomingMessage } from 'http';
  import * as Y from 'yjs';

  export function setupWSConnection(
    ws: WebSocket,
    req: IncomingMessage,
    options: {
      docName?: string;
    }
  ): void;

  export function getYDoc(docname: string, gc?: boolean): Y.Doc;
}