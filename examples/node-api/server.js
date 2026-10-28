// Example API. Start it with the tracing preloads (see package.json):
//   npm start    ->  node --import ./observability/tracing-loader.js --import ./observability/tracing.js server.js
import express from "express";
import { trace } from "@opentelemetry/api";

import itemRoutes from "./routes/itemRoutes.js";
import { httpLogger, logger, destination } from "./observability/logger.js";
import { trackHttpMetrics, serveHttpMetrics } from "./observability/metrics.js";
import { sdk } from "./observability/tracing.js"; // same module instance the --import preload created

const HOST = process.env.HOST || "127.0.0.1"; // safe default: loopback only
const PORT = Number(process.env.PORT || 8080);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // only if behind exactly one reverse proxy; remove otherwise

app.use(httpLogger);
app.use(trackHttpMetrics);

app.get("/metrics", serveHttpMetrics);
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", itemRoutes);

app.use((_req, res) => res.status(404).json({ error: "not found" }));

// Error handler: records the error on the active span and hands it to pino-http
// (one log entry per request), but never leaks details to clients.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  trace.getActiveSpan()?.recordException(err);
  res.err = err; // pino-http logs it as part of the single "request errored" entry
  res.status(500).json({ error: "internal server error" });
});

const server = app.listen(PORT, HOST, () => {
  logger.info({ host: HOST, port: PORT }, "server started");
});

// Graceful shutdown: stop accepting connections, flush spans and logs.
function shutdown(signal) {
  logger.info({ signal }, "shutting down");
  server.close(async () => {
    try {
      await sdk.shutdown();
    } catch (err) {
      logger.error({ err: { message: err.message } }, "telemetry shutdown failed");
    }
    destination.flushSync?.();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
