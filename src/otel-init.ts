// src/otel-init.ts
// Heavy OpenTelemetry SDK initialisation — loaded lazily from telemetry.ts
// ONLY when VITE_OTEL_ENABLED === 'true' and after first paint.

import { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import type { Tracer } from '@opentelemetry/api';

declare const __APP_VERSION__: string;

const exporter = new OTLPTraceExporter({
  url: '/v1/traces',
});

const provider = new WebTracerProvider({
  spanProcessors: [new BatchSpanProcessor(exporter)],
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: 'p3fo-frontend',
    [SemanticResourceAttributes.SERVICE_VERSION]:
      typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0',
  }),
});

provider.register({
  contextManager: new ZoneContextManager(),
});

registerInstrumentations({
  instrumentations: getWebAutoInstrumentations({
    '@opentelemetry/instrumentation-document-load': {
      enabled: false,
    },
    '@opentelemetry/instrumentation-fetch': {
      propagateTraceHeaderCorsUrls: [
        /^http:\/\/localhost:\d+\/api/,
      ],
    },
    '@opentelemetry/instrumentation-xml-http-request': {
      propagateTraceHeaderCorsUrls: [
        /^http:\/\/localhost:\d+\/api/,
      ],
    },
    '@opentelemetry/instrumentation-user-interaction': {
      enabled: false,
    },
  }),
});

console.log('[Telemetry] OpenTelemetry WebTracerProvider initialized (lazy)');

const tracerName = 'p3fo-frontend-react-renderer';
export const tracer: Tracer = provider.getTracer(tracerName);
export { provider };

/** React Profiler callback — converts each component render into a span. */
export function otelProfilerCallback(
  id: string,
  phase: 'mount' | 'update',
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number,
): void {
  if (actualDuration < 16) return; // skip renders faster than 1 frame at 60fps

  // React Profiler startTime / commitTime are DOMHighResTimeStamps
  // (ms since navigation start). Convert to real wall-clock timestamps.
  const timeOrigin =
    typeof performance !== 'undefined'
      ? performance.timeOrigin || Date.now() - performance.now()
      : Date.now();
  const wallStartMs = timeOrigin + startTime;
  const wallEndMs = timeOrigin + commitTime;

  const span = tracer.startSpan(`react.render: ${id}`, {
    attributes: {
      'react.phase': phase,
      'react.actual_duration_ms': actualDuration,
      'react.base_duration_ms': baseDuration,
      'react.start_time': startTime,
      'react.commit_time': commitTime,
      'react.render_overhead_ms': Math.max(0, baseDuration - actualDuration),
    },
    startTime: new Date(wallStartMs),
  });
  span.end(new Date(wallEndMs));
}

/** ── LongTask Observer ────────────────────────────────────────────────────── */
if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
  try {
    const ltOrigin =
      typeof performance !== 'undefined'
        ? performance.timeOrigin || Date.now() - performance.now()
        : Date.now();
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const wallMs = ltOrigin + entry.startTime;
        tracer
          .startSpan('browser.long_task', {
            attributes: {
              'longtask.duration': entry.duration,
              'longtask.start_time': entry.startTime,
            },
            startTime: new Date(wallMs),
          })
          .end(new Date(wallMs + entry.duration));
      }
    });
    // Fallback to first-available entryType
    const entryTypes = ['longtask'] as const;
    const supported = PerformanceObserver.supportedEntryTypes ?? [];
    const type = entryTypes.find((t) => supported.includes(t));
    if (type) {
      observer.observe({ entryTypes: [type], buffered: true });
      console.log('[Telemetry] LongTask observer attached');
    }
  } catch (e) {
    console.warn('[Telemetry] Failed to attach LongTask observer:', e);
  }
}