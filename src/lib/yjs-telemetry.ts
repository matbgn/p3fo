/** src/lib/yjs-telemetry.ts
 *  OpenTelemetry instrumentation for Yjs (CRDT) operations.
 *
 *  Usage:
 *    import { tracer } from '@/telemetry';
 *    import { instrumentYjsProvider, withYjsTransaction, instrumentYMap } from '@/lib/yjs-telemetry';
 *
 *    instrumentYjsProvider(websocketProvider, docName);
 *    const instrumentedMap = instrumentYMap(yMap, 'tasks');
 */

import { tracer } from '@/telemetry';
import { SpanStatusCode } from '@opentelemetry/api';
import type { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';

/* ── Provider lifecycle ─────────────────────────────────────────────── */

function serializeConnectionEvent(event: unknown): string {
  if (event instanceof Error) return event.message;
  if (event instanceof CloseEvent) return `code=${event.code} reason=${event.reason}`;
  if (typeof event === 'object' && event !== null) {
    const e = event as Record<string, unknown>;
    if (e.reason) return String(e.reason);
    if (e.message) return String(e.message);
    if (e.code) return `code=${String(e.code)}`;
    try {
      return JSON.stringify(event);
    } catch {
      return String(event);
    }
  }
  return String(event);
}

export function instrumentYjsProvider(provider: WebsocketProvider, room: string) {
  /* Track actual connect latency (from constructor → first sync) */
  let connectStart = performance.now();
  let connectSpan: ReturnType<typeof tracer.startSpan> | null = null;

  provider.on('status', (event: { status: string }) => {
    /* Start a new connect span on every fresh 'connecting' event */
    if (event.status === 'connecting') {
      connectStart = performance.now();
      if (connectSpan) {
        connectSpan.end();
      }
      connectSpan = tracer.startSpan('yjs.provider.connect', {
        attributes: { 'yjs.room': room, 'yjs.status': event.status },
        startTime: new Date(performance.timeOrigin + connectStart),
      });
    } else if (!connectSpan) {
      connectSpan = tracer.startSpan('yjs.provider.connect', {
        attributes: { 'yjs.room': room, 'yjs.status': event.status },
        startTime: new Date(performance.timeOrigin + connectStart),
      });
    }

    /* Only emit a short status span when status actually changes */
    const span = tracer.startSpan(`yjs.provider.status`, {
      attributes: {
        'yjs.room': room,
        'yjs.status': event.status,
      },
    });
    span.end();
  });

  provider.on('sync', (isSynced: boolean) => {
    const span = tracer.startSpan(`yjs.provider.sync`, {
      attributes: {
        'yjs.room': room,
        'yjs.synced': isSynced,
      },
    });
    span.end();

    /* End connect span on first successful sync so it doesn't leak */
    if (isSynced && connectSpan) {
      connectSpan.end();
      connectSpan = null;
    }
  });

  provider.on('connection-error', (event: unknown) => {
    const message = serializeConnectionEvent(event);
    const span = tracer.startSpan(`yjs.provider.connection-error`, {
      attributes: {
        'yjs.room': room,
        'error.message': message,
      },
    });
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();

    if (connectSpan) {
      connectSpan.setStatus({ code: SpanStatusCode.ERROR, message });
      connectSpan.end();
      connectSpan = null;
    }
  });

  provider.on('connection-close', (event: unknown) => {
    const message = serializeConnectionEvent(event);
    const span = tracer.startSpan(`yjs.provider.close`, {
      attributes: {
        'yjs.room': room,
        'error.message': message,
      },
    });
    span.end();

    if (connectSpan) {
      connectSpan.end();
      connectSpan = null;
    }
  });
}

/* ── Doc / Transaction ──────────────────────────────────────────────── */

export function withYjsTransaction<T>(
  doc: Y.Doc,
  transactionName: string,
  fn: () => T,
  extraAttrs?: Record<string, unknown>
): T {
  const span = tracer.startSpan('yjs.doc.transaction', {
    attributes: {
      'yjs.transaction.name': transactionName,
      'yjs.doc.guid': doc.guid,
      ...extraAttrs,
    },
  });
  try {
    return doc.transact(() => {
      span.addEvent('transaction-executing');
      return fn();
    });
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end();
  }
}

const instrumentedDocs = new WeakSet<Y.Doc>();

/** Wrap `doc.transact` once so every bare `doc.transact(...)` in the
 *  codebase reports a generic transaction span. */
export function instrumentDocTransactions(doc: Y.Doc) {
  if (instrumentedDocs.has(doc)) return;
  instrumentedDocs.add(doc);
  const original = doc.transact.bind(doc);
  doc.transact = <T,>(f: (transaction: Y.Transaction) => T, origin?: unknown): T => {
    const span = tracer.startSpan('yjs.doc.transaction', {
      attributes: {
        'yjs.doc.guid': doc.guid,
        'yjs.transaction.origin': String(origin ?? 'default'),
      },
    });
    try {
      const result = original(f, origin);
      if ((result as unknown) instanceof Promise) {
        (result as unknown as Promise<T>).catch((err: unknown) => {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
        }).finally(() => span.end());
        return result;
      }
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  };
}

/* ── Y.Map ──────────────────────────────────────────────────────────── */

export interface InstrumentedYMap<T = unknown> {
  get: (key: string) => T | undefined;
  set: (key: string, value: T) => void;
  delete: (key: string) => void;
  has: (key: string) => boolean;
  clear: () => void;
  observe: (handler: (event: Y.YMapEvent<T>) => void) => void;
  unobserve: (handler: (event: Y.YMapEvent<T>) => void) => void;
  keys: () => IterableIterator<string>;
  values: () => IterableIterator<T>;
  forEach: (callback: (value: T, key: string, map: Y.Map<T>) => void) => void;
  size: number;
  toJSON: () => Record<string, T>;
  /* ref to raw map for advanced usage */
  _raw: Y.Map<T>;
}

let yjsWriteSpanCounter = 0;

export function instrumentYMap<T = unknown>(
  yMap: Y.Map<T>,
  mapName: string
): InstrumentedYMap<T> {
  return {
    get(key: string): T | undefined {
      return yMap.get(key);
    },

    set(key: string, value: T) {
      yMap.set(key, value);
      yjsWriteSpanCounter++;
      if (yjsWriteSpanCounter % 10 === 1) {
        const span = tracer.startSpan('yjs.map.set', {
          attributes: { 'yjs.map.name': mapName, 'yjs.map.key': key, 'telemetry.sampled': true },
        });
        span.end();
      }
    },

    delete(key: string) {
      const span = tracer.startSpan('yjs.map.delete', {
        attributes: { 'yjs.map.name': mapName, 'yjs.map.key': key },
      });
      try {
        yMap.delete(key);
      } catch (e) {
        span.recordException(e as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw e;
      } finally {
        span.end();
      }
    },

    clear() {
      const span = tracer.startSpan('yjs.map.clear', {
        attributes: { 'yjs.map.name': mapName, 'yjs.map.size_before': yMap.size },
      });
      try {
        yMap.clear();
      } catch (e) {
        span.recordException(e as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw e;
      } finally {
        span.end();
      }
    },

    has(key: string) {
      return yMap.has(key);
    },

    observe(handler: (event: Y.YMapEvent<T>) => void) {
      yMap.observe(handler);
    },

    unobserve(handler: (event: Y.YMapEvent<T>) => void) {
      yMap.unobserve(handler);
    },

    get size() {
      return yMap.size;
    },

    keys() {
      return yMap.keys();
    },

    values() {
      return yMap.values();
    },

    forEach(callback: (value: T, key: string, map: Y.Map<T>) => void) {
      return yMap.forEach(callback);
    },

    toJSON() {
      return yMap.toJSON();
    },

    _raw: yMap,
  };
}
