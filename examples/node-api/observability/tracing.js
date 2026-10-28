// OpenTelemetry tracing. Must be loaded with `--import` so it runs before
// express/http are imported; otherwise those modules are not instrumented.
//
// Configuration comes from standard OTEL_* environment variables:
//   OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://127.0.0.1:4318),
//   OTEL_TRACES_SAMPLER, OTEL_SDK_DISABLED, ...
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

export const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(), // endpoint read from OTEL_EXPORTER_OTLP_ENDPOINT
  instrumentations: [
    getNodeAutoInstrumentations({
      // Noisy or not useful for this example.
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
      "@opentelemetry/instrumentation-net": { enabled: false },
      // One span per route handler is useful; one per middleware layer is noise.
      "@opentelemetry/instrumentation-express": { ignoreLayersType: ["middleware"] },
      "@opentelemetry/instrumentation-http": {
        // Keep scrapes, health probes and CORS preflights out of the trace store.
        ignoreIncomingRequestHook: (req) =>
          req.url?.startsWith("/metrics") || req.url?.startsWith("/health") || req.method === "OPTIONS",
      },
    }),
  ],
});

sdk.start();
