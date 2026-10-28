# Production Observability Stack

A production-oriented observability setup for a Node.js backend running on Linux, using Prometheus, Grafana, Loki, Grafana Alloy, Tempo, and Alertmanager.

This repository demonstrates how metrics, logs, and distributed traces can be collected, stored, queried, and used for alerting on a self-hosted backend.

The examples are designed for a native Linux installation on an AWS EC2 instance. Docker is not required.

> **Important:** This repository is a reusable reference implementation, not a backup of any production server. All credentials, paths, hostnames, and project-specific identifiers must be replaced with appropriate values for your environment.

## Observability pillars

The three commonly recognized pillars of observability are metrics, logs, and traces.

| Pillar | What it answers | Technology |
|---|---|---|
| Metrics | How is the system performing? | Prometheus |
| Logs | What happened? | Grafana Loki |
| Traces | Where did a request spend its time? | Grafana Tempo |
| Visualization | How can the signals be explored together? | Grafana |
| Collection and processing | How are telemetry data collected and forwarded? | Grafana Alloy |
| Alerting | When should an operator be notified? | Prometheus and Alertmanager |

**MELT** is a useful acronym for Metrics, Events, Logs, and Traces. Events can be valuable telemetry, but they are not generally described as a fourth core pillar alongside metrics, logs, and traces.

## Architecture

```text
                         Node.js API
                              |
                 +------------+------------+
                 |            |            |
              Metrics        Logs        Traces
                 |            |            |
                 v            v            v
             Prometheus     Alloy        Tempo
                 |            |            |
                 |            v            |
                 |           Loki          |
                 |            |            |
                 +------------+------------+
                              |
                           Grafana
                              |
                       Alertmanager
                              |
                      Email / Webhook
```

This is a conceptual diagram. The actual data paths and alerting integrations depend on the configurations enabled in your deployment.

## Technology stack

- **Prometheus:** metrics collection and alert-rule evaluation.
- **Alertmanager:** alert grouping, routing, and notifications.
- **Grafana Loki:** centralized log storage and querying.
- **Grafana Alloy:** telemetry collection, processing, and forwarding.
- **Grafana Tempo:** distributed trace storage.
- **Grafana:** dashboards and cross-signal investigation.
- **Node.js and Express:** example backend instrumentation.
- **Linux systemd:** native service management.
- **Logrotate:** rotation of local application log files.
- **Cloudflare R2:** optional object storage for Loki.

## Versions

The configuration files were syntax-checked with the official validators of these releases:

| Component | Version | Validator |
|---|---|---|
| Prometheus | 3.15.1 | `promtool check config` / `check rules` |
| Alertmanager | 0.34.1 | `amtool check-config` |
| Loki | 3.7.9 | `loki -verify-config` |
| Grafana Alloy | 1.21.2 | `alloy validate` |
| Tempo | 2.8.2 | `tempo -config.verify=true` |

The Tempo configuration uses the 2.x layout (`ingester`, `compactor`) and is **rejected by Tempo 3.x**, which replaced those blocks. Use a 2.x release, or adapt the file to the 3.x configuration reference.

These are syntax checks only. Retention behaviour, storage permissions and alert delivery still need testing on your own host (see [Validation](#validation)).

## Repository structure

```text
production-observability-stack/
├── README.md
├── LICENSE
├── .gitignore
├── .env.example
├── configs/
│   ├── prometheus/
│   │   ├── prometheus.yml
│   │   └── alert-rules.yml
│   ├── alertmanager/
│   │   └── alertmanager.yml
│   ├── loki/
│   │   └── config.yml
│   ├── alloy/
│   │   └── config.alloy
│   ├── tempo/
│   │   └── config.yml
│   └── logrotate/
│       └── example-api
├── examples/
│   └── node-api/
│       ├── package.json
│       ├── package-lock.json
│       ├── server.js
│       ├── observability/
│       │   ├── logger.js
│       │   ├── metrics.js
│       │   ├── tracing.js
│       │   └── tracing-loader.js
│       ├── routes/
│       │   └── itemRoutes.js
│       ├── controllers/
│       │   └── itemController.js
│       └── README.md
├── scripts/
│   ├── validate-configs.sh
│   └── health-check.sh
└── docs/
    ├── architecture.md
    ├── native-installation.md
    ├── retention.md
    ├── security.md
    └── troubleshooting.md
```

The generated project should include all listed files. If a file is intentionally omitted, document the reason rather than silently leaving the repository incomplete.

## How the system works

### 1. Metrics

Prometheus scrapes the example Node.js API's metrics endpoint at a configurable address.

The example application should expose HTTP request metrics, including:

- Total HTTP requests.
- Failed HTTP requests.
- Requests currently in flight.
- Request duration histograms.

The example must use generic metric names and labels. Avoid user identifiers, email addresses, request bodies, and other high-cardinality or sensitive values in metric labels.

### 2. Logs

Grafana Alloy reads structured application logs from a configurable local file path.

The example pipeline should:

1. Read JSON-formatted application logs.
2. Parse relevant fields, such as severity and timestamp.
3. Normalize severity labels where appropriate.
4. Forward the logs to Loki.
5. Avoid attaching sensitive data as labels.

The example must not assume that every log entry is valid JSON. Explain how malformed records are handled.

### 3. Traces

The example Node.js API should demonstrate OpenTelemetry instrumentation and OTLP export.

Tempo should accept OTLP over gRPC and HTTP on configurable, appropriately secured interfaces.

The example should explain how trace context connects requests across instrumented services. It must not claim that distributed tracing works automatically for services that have not been instrumented.

### 4. Dashboards

Grafana should be configured to connect to Prometheus, Loki, and Tempo.

Document how to add these data sources and create dashboards for:

- Request rate and error rate.
- Request duration percentiles.
- Application logs grouped by severity.
- Trace inspection and latency analysis.

Do not include real Grafana credentials, session cookies, API keys, or dashboard exports containing sensitive data.

### 5. Alerting

Prometheus evaluates example alert rules and sends notifications to Alertmanager.

Include illustrative alerts for:

- Elevated HTTP error rates.
- High CPU utilization.
- Prometheus target availability.
- Application or service availability, where suitable metrics exist.

Clearly distinguish illustrative thresholds from values that should be tuned for an actual workload.

Alertmanager must use environment variables or another secure secret-injection mechanism for SMTP credentials. Never place working passwords or tokens in the repository.

## Installation overview

The repository should explain the following workflow:

1. Provision a Linux server and install the required software.
2. Create dedicated service users and directories where appropriate.
3. Configure application instrumentation.
4. Configure Prometheus scraping and alert rules.
5. Configure Alloy log collection.
6. Configure Loki storage and retention.
7. Configure Tempo trace storage and OTLP receivers.
8. Configure Grafana data sources and dashboards.
9. Configure Alertmanager notification delivery.
10. Configure log rotation and service management.
11. Validate every configuration before restarting services.
12. Test metrics, logs, traces, and alert notifications.
13. Review firewall rules, authentication, retention, and backups.

See `docs/native-installation.md` for the detailed installation workflow.

## Retention and storage

Retention must be configured separately for each signal.

- **Prometheus:** configure its retention period and disk allocation explicitly.
- **Loki:** configure retention and compaction according to the selected storage backend.
- **Tempo:** configure trace retention and storage maintenance appropriate to the installed version.
- **Local application logs:** configure logrotate or the application's own rotation mechanism.

Cloud object storage does not automatically guarantee correct retention, access control, or deletion. Verify the behavior of the selected backend and version.

The example configuration may use a seven-day log-retention target. Treat this as an example, not a universal recommendation.

## Security

Before deploying this stack:

- Replace all placeholder values with your own configuration.
- Never commit `.env` files containing real secrets.
- Never commit private keys, access tokens, passwords, session cookies, or production logs.
- Keep `.env.example` limited to dummy values.
- Bind internal telemetry endpoints to loopback or private interfaces unless remote access is required.
- Restrict access with firewall rules and suitable authentication.
- Do not expose Prometheus, Loki, Tempo, or Alloy administrative interfaces directly to the public internet without appropriate controls.
- Use least-privilege permissions for service users and object-storage credentials.
- Avoid logging passwords, authorization headers, tokens, and sensitive personal information.
- Review Git history before publishing an existing repository.
- Rotate any credential that has previously been exposed.

See `docs/security.md` for additional guidance.

## Validation

Before deploying the example configurations, validate them against the exact versions installed.

Where applicable, use:

- `promtool check config` for Prometheus.
- `promtool check rules` for Prometheus alert rules.
- `amtool check-config` for Alertmanager.
- The supported configuration-validation commands for Loki, Alloy, and Tempo.

Also validate shell scripts, inspect service logs, and test each telemetry pipeline end to end.

A configuration that parses successfully is not necessarily operationally correct. Test connectivity, storage permissions, retention behavior, and alert delivery.

## Project goals

This project demonstrates practical experience with:

- Production observability concepts.
- Backend instrumentation.
- Metrics, logs, and distributed tracing.
- Linux service management.
- Cloud object storage.
- Alerting and operational troubleshooting.
- Configuration management and security-conscious deployment.

## Contributing

Contributions and improvements are welcome.

Please do not submit production credentials, private configuration files, server logs containing personal information, or other sensitive data in issues or pull requests.

## License

See the `LICENSE` file for the license governing this repository.