# Example Node.js API

A deliberately small Express 5 service that produces all three telemetry signals for the stack in this repository. Its layout mirrors how a real service is usually organised: all telemetry code lives in one `observability/` folder, and the application only wires it in.

```text
examples/node-api/
├── server.js                      # wiring: middleware, routes, error handler, shutdown
├── observability/
│   ├── tracing-loader.js          # registers the ESM loader hook for OpenTelemetry
│   ├── tracing.js                 # OpenTelemetry SDK + OTLP exporter + auto-instrumentation
│   ├── logger.js                  # pino + pino-http: JSON logs, redaction, trace correlation
│   └── metrics.js                 # prom-client HTTP metrics + GET /metrics handler
├── routes/itemRoutes.js           # example routes
└── controllers/itemController.js  # example handlers, including a custom span
```

## What is implemented

| Signal | Implementation |
|---|---|
| Metrics | `prom-client`. `GET /metrics` exposes `example_api_http_requests_total`, `..._requests_failed_total` (5xx only), `..._requests_in_flight`, `..._request_duration_seconds` and default process metrics. Labels: `method`, `route` (template, never the raw URL), `status_code`. Unmatched paths become `route="unmatched"`. |
| Logs | `pino` writes one JSON object per line to `LOG_FILE` (or stdout). `pino-http` logs one entry per request with method, path (no query string) and status. String levels, ISO timestamps, `trace_id`/`span_id` when a span is active. Sensitive keys are removed; headers and bodies are never logged. |
| Traces | OpenTelemetry Node SDK, auto-instrumentation for HTTP and Express, OTLP/HTTP export. `items.lookup` is a custom span. Health, metrics and `OPTIONS` requests are not traced. |

## What requires additional configuration

- **Tempo, Prometheus, Alloy and Loki** must be installed and running (see `docs/native-installation.md`). The app runs without them; exports simply fail quietly.
- **Cross-service tracing is not automatic.** Context propagates (W3C `traceparent`) only between services that are themselves instrumented.
- **Host metrics** for the CPU alert need `node_exporter`, which is not part of this API.
- **TLS and authentication** are not implemented. The API binds to `127.0.0.1`; put a reverse proxy in front for public traffic. `trust proxy` in `server.js` assumes exactly one proxy; remove it if there is none.

## Why tracing is loaded with `--import`

OpenTelemetry can only instrument modules that load *after* it starts, and ES modules additionally need a loader hook. So the app is started with two preloads (see `package.json`):

```bash
node --import ./observability/tracing-loader.js --import ./observability/tracing.js server.js
```

Importing `tracing.js` from `server.js` instead would be too late. Use the same flags in systemd, PM2 or a container command.

## Run locally

```bash
cd examples/node-api
npm ci                                   # or: npm install
export OTEL_SERVICE_NAME=example-api
export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
export OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,express
export LOG_FILE=./logs/app.log           # git-ignored
npm start
```

Or keep the settings in a git-ignored `.env` (copy values from the repository's `.env.example`) and use `npm run start:env`; `npm run dev` adds `--watch`.

Generate traffic:

```bash
for i in $(seq 1 50); do curl -s http://127.0.0.1:8080/api/items > /dev/null; done
curl -s http://127.0.0.1:8080/api/items/2
curl -s http://127.0.0.1:8080/api/slow
curl -s http://127.0.0.1:8080/api/error
curl -s http://127.0.0.1:8080/metrics | grep example_api_http
```

## Endpoints

| Route | Purpose |
|---|---|
| `GET /health` | Liveness check (not logged, not traced) |
| `GET /metrics` | Prometheus exposition (not logged, not traced) |
| `GET /api/items`, `/api/items/:id` | Normal traffic with small random latency; `:id` lookup adds the `items.lookup` span; unknown ids return 404 |
| `GET /api/slow` | 0.8-2.3 s latency, for latency panels and alerts |
| `GET /api/error` | Always returns 500, for error-rate panels and alerts |

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `HOST` | `127.0.0.1` | Keep loopback unless a proxy needs otherwise |
| `PORT` | `8080` | |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_FILE` | unset (stdout) | File tailed by Alloy |
| `OTEL_*` | | Standard OpenTelemetry variables, see `.env.example` |

## Design notes

- **Route labels survive errors.** Express resets `req.baseUrl` when an error leaves a mounted router, which would label a failing `/api/error` as `/error`. Routers mounted under a prefix therefore start with `router.use(rememberMountPath)` (see `observability/metrics.js`).
- **Only 5xx counts as a failure.** Counting every 4xx makes internet scanners look like an outage in the error-rate alert.
- **One log line per request.** Errors are attached to the response (`res.err`) so `pino-http` logs them once, as type and message only, without stack traces or file paths.
