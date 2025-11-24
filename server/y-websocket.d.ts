declare module 'y-websocket/bin/utils' {
  export function setupWSConnection(
    ws: any,
    req: any,
    options: {
      docName?: string;
    }
  ): void;
}