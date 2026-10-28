# Architecture

## Data flow

| Signal | Producer | Transport | Storage | Query |
|---|---|---|---|---|
| Metrics | Example API `/metrics`, node_exporter | Prometheus pull (scrape) | Prometheus TSDB | PromQL |
| Logs | Example API JSON file | Alloy tails file, pushes to Loki HTTP API | Loki (TSDB index + chunks) | LogQL |
| Traces | Example API (OpenTelemetry SDK) | OTLP/HTTP push to Tempo (gRPC also enabled) | Tempo blocks | TraceQL / trace ID |
| Alerts | Prometheus rules | Prometheus pushes to Alertmanager | In-memory + silences | Email / webhook |

Grafana queries all three backends. Alloy is used only for logs in this example; traces go directly from the application to Tempo to keep the path short. You could also route OTLP through Alloy to add batching, tail sampling or authentication.

## Ports (all bound to 127.0.0.1)

| Component | Port | Purpose |
|---|---|---|
| Example API | 8080 | App + `/metrics` |
| Prometheus | 9090 | UI/API |
| Alertmanager | 9093 | UI/API |
| node_exporter | 9100 | Host metrics |
| Grafana | 3000 | UI (put behind TLS proxy for remote access) |
| Loki | 3100 (HTTP), 9096 (gRPC) | Push/query |
| Tempo | 3200 (HTTP), 9097 (gRPC), 4317 (OTLP gRPC), 4318 (OTLP HTTP) | Query/ingest |
| Alloy | 12345 | UI/metrics |

## Correlation

- **Logs to traces:** log lines carry `trace_id` (stored in Loki as structured metadata). In the Grafana Loki data source, add a derived field that extracts `trace_id` and links to the Tempo data source.
- **Traces to logs:** in the Tempo data source, enable "Trace to logs", select Loki, and map the `service.name` resource attribute to the `service_name` label.
- **Metrics to traces:** exemplars are not enabled in this example.

## Design decisions

- **Single node, local storage** for clarity. It is not highly available.
- **Low-cardinality labels only.** Route templates, not raw URLs; no user identifiers.
- **Pull for metrics, push for logs and traces**, matching each tool's native model.
- **Loopback by default**, so exposure is always a deliberate choice.

## Tracing limits

Distributed tracing links services only when each one is instrumented and propagates the W3C `traceparent` header. Uninstrumented services, queues without propagation, and third-party APIs appear as gaps or as opaque client spans.
