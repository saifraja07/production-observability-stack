// Structured JSON logging (pino + pino-http).
//   - One JSON object per line, written to LOG_FILE (tailed by Grafana Alloy)
//     or to stdout when LOG_FILE is unset.
//   - Level is emitted as a string ("info", "warn", "error") so the Alloy
//     pipeline can use it as a label. (pino defaults to numeric levels, and
//     custom level formatters cannot be combined with `transport` targets,
//     which is why a plain destination is used here.)
//   - Sensitive fields are removed, and request logs carry only the method,
//     path (no query string) and status, never headers or bodies.
//   - trace_id/span_id are added when a span is active, enabling log-to-trace
//     correlation in Grafana.
import pino from "pino";
import { pinoHttp } from "pino-http";
import { trace } from "@opentelemetry/api";

const destination = process.env.LOG_FILE
  ? pino.destination({ dest: process.env.LOG_FILE, mkdir: true, sync: false })
  : pino.destination({ fd: 1, sync: false });

const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: { service: process.env.OTEL_SERVICE_NAME || "example-api" },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    mixin() {
      const ctx = trace.getActiveSpan()?.spanContext();
      return ctx ? { trace_id: ctx.traceId, span_id: ctx.spanId } : {};
    },
    // Defence in depth: remove well-known sensitive keys if they are ever logged.
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers[\"x-api-key\"]",
        "password",
        "token",
        "accessToken",
        "refreshToken",
        "user.email",
      ],
      remove: true,
    },
  },
  destination
);

const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === "/metrics" || req.url === "/health" || req.method === "OPTIONS",
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req: (req) => ({ method: req.method, path: req.url?.split("?")[0] }),
    res: (res) => ({ status_code: res.statusCode }),
    // Type and message only: stack traces leak file paths and bloat log lines.
    err: (err) => ({ type: err.type || err.name, message: err.message }),
  },
});

export { logger, httpLogger, destination };
