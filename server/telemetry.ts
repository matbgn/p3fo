// server/telemetry.ts
// Must be imported BEFORE any other modules in server/index.ts

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { readFileSync } from 'fs';
import { join } from 'path';

const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf-8'));

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
});

const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy instrumentation if needed
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: 'p3fo-backend',
    [SemanticResourceAttributes.SERVICE_VERSION]: pkg.version,
  }),
});

sdk.start();

console.log('[Telemetry] OpenTelemetry NodeSDK started');

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('[Telemetry] SDK shut down'))
    .catch((err) => console.error('[Telemetry] Error shutting down SDK', err))
    .finally(() => {
      process.exitCode = 0;
    });
});
