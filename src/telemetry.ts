// src/telemetry.ts
// Public API for OpenTelemetry instrumentation.
//
// IMPORTANT: This module must stay LIGHTWEIGHT — it is imported synchronously
// by main.tsx, App.tsx, TaskBoard.tsx, and (transitively) collaboration.ts
// before React's first paint. The heavy @opentelemetry/* SDK is loaded
// lazily ONLY when VITE_OTEL_ENABLED === 'true', and even then deferred until
// after first paint via requestIdleCallback.
//
// When telemetry is disabled (the production default), every export here is a
// zero-cost no-op so the critical render path is unaffected.

import type { Tracer } from '@opentelemetry/api';

/** Whether the OTel SDK should be loaded at all. */
export const isOtelEnabled: boolean =
  import.meta.env.VITE_OTEL_ENABLED === 'true';

// ── No-op stubs (used when disabled, or before the real SDK loads) ──────────

interface NoopSpan {
  end: (_timestamp?: unknown) => void;
  setStatus: (_status: unknown) => void;
  recordException: (_exception: unknown) => void;
  addEvent: (_name: string, _attributes?: unknown) => void;
  setAttributes: (_attrs: unknown) => void;
}

const noopSpan: NoopSpan = {
  end: () => {},
  setStatus: () => {},
  recordException: () => {},
  addEvent: () => {},
  setAttributes: () => {},
};

const noopTracer: Tracer = {
  startSpan: () => noopSpan as never,
} as unknown as Tracer;

// ── Live exports ────────────────────────────────────────────────────────────
// `export let` gives us live ES-module bindings so consumers (yjs-telemetry.ts)
// pick up the real tracer once the SDK finishes loading.

export let tracer: Tracer = noopTracer;
export let provider: unknown = null;

// The real profiler callback, swapped in once the SDK loads.
let realProfilerCallback:
  | ((
      id: string,
      phase: 'mount' | 'update',
      actualDuration: number,
      baseDuration: number,
      startTime: number,
      commitTime: number,
    ) => void)
  | null = null;

/**
 * React Profiler callback — no-op when telemetry is disabled or before the
 * SDK has finished loading. Usage:
 *   <Profiler id="MyComponent" onRender={otelProfilerCallback}>
 */
export function otelProfilerCallback(
  id: string,
  phase: 'mount' | 'update',
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number,
): void {
  if (actualDuration < 16) return; // skip renders faster than 1 frame at 60fps
  if (realProfilerCallback) {
    realProfilerCallback(id, phase, actualDuration, baseDuration, startTime, commitTime);
  }
}

// ── Lazy SDK initialisation ─────────────────────────────────────────────────

if (isOtelEnabled && typeof window !== 'undefined') {
  const loadOtel = () => {
    import('./otel-init')
      .then((mod) => {
        tracer = mod.tracer;
        provider = mod.provider;
        realProfilerCallback = mod.otelProfilerCallback;
      })
      .catch((err) => {
        console.warn('[Telemetry] Failed to load OpenTelemetry SDK:', err);
      });
  };

  // Defer until the browser is idle so first paint is never blocked.
  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(loadOtel);
  } else {
    setTimeout(loadOtel, 2000);
  }
}