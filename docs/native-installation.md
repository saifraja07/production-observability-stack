# Native installation (Linux, systemd)

Assumes a recent Ubuntu/Debian-style host with `sudo`. Adapt package commands for other distributions. All user names, paths and ports below are **generic examples**; change them for your environment.

Download each component from its official release page, verify checksums/signatures, and install the binary to `/usr/local/bin`. Use the version lines in the root README.

## 1. Service users and directories

```bash
for u in prometheus alertmanager loki tempo alloy exampleapi; do
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$u" 2>/dev/null || true
done
sudo install -d -o prometheus   -g prometheus   /var/lib/prometheus /etc/prometheus
sudo install -d -o alertmanager -g alertmanager /var/lib/alertmanager /etc/alertmanager
sudo install -d -o loki         -g loki         /var/lib/loki /etc/loki
sudo install -d -o tempo        -g tempo        /var/lib/tempo /etc/tempo
sudo install -d -o alloy        -g alloy        /etc/alloy
sudo install -d -o exampleapi   -g exampleapi   /var/log/example-api /opt/example-api /etc/example-api
```

Let Alloy read the app logs: `sudo usermod -aG exampleapi alloy`, and make the log directory group-readable (`chmod 0750 /var/log/example-api`).

## 2. Application instrumentation

```bash
sudo cp -r examples/node-api/. /opt/example-api/
cd /opt/example-api && sudo -u exampleapi npm ci --omit=dev   # uses the committed package-lock.json
```

Create `/etc/example-api/example-api.env` from `.env.example` (mode `0640`, root:exampleapi) with real values. See [security.md](security.md).

`/etc/systemd/system/example-api.service`:

```ini
[Unit]
Description=Example API
After=network.target

[Service]
User=exampleapi
Group=exampleapi
WorkingDirectory=/opt/example-api
EnvironmentFile=/etc/example-api/example-api.env
# The two --import flags load OpenTelemetry before the app (see examples/node-api/README.md).
ExecStart=/usr/bin/node --import ./observability/tracing-loader.js --import ./observability/tracing.js server.js
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/log/example-api

[Install]
WantedBy=multi-user.target
```

## 3. Prometheus

```bash
sudo cp configs/prometheus/*.yml /etc/prometheus/
```

`/etc/systemd/system/prometheus.service`:

```ini
[Unit]
Description=Prometheus
After=network.target

[Service]
User=prometheus
ExecStart=/usr/local/bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus \
  --storage.tsdb.retention.time=15d \
  --storage.tsdb.retention.size=5GB \
  --web.listen-address=127.0.0.1:9090
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/prometheus

[Install]
WantedBy=multi-user.target
```

Also install `node_exporter` (listening on `127.0.0.1:9100` via `--web.listen-address`) for host CPU metrics.

## 4. Alertmanager

```bash
sudo cp configs/alertmanager/alertmanager.yml /etc/alertmanager/
# Edit placeholders, then create the secret file as shown in security.md
```

Unit `ExecStart`:

```ini
ExecStart=/usr/local/bin/alertmanager \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/var/lib/alertmanager \
  --web.listen-address=127.0.0.1:9093 \
  --cluster.listen-address=
```

(`--cluster.listen-address=` disables clustering for a single node.) Use the same `[Service]` hardening and `User=alertmanager`, plus `ReadWritePaths=/var/lib/alertmanager`.

## 5. Alloy (log collection)

```bash
sudo cp configs/alloy/config.alloy /etc/alloy/
printf 'APP_LOG_PATH=/var/log/example-api/app.log\nLOKI_URL=http://127.0.0.1:3100/loki/api/v1/push\n' | sudo tee /etc/alloy/alloy.env >/dev/null
```

```ini
[Service]
User=alloy
EnvironmentFile=/etc/alloy/alloy.env
ExecStart=/usr/local/bin/alloy run --server.http.listen-addr=127.0.0.1:12345 --storage.path=/var/lib/alloy /etc/alloy/config.alloy
StateDirectory=alloy
```

Malformed (non-JSON) lines are forwarded with `level="unknown"` rather than dropped.

## 6. Loki

```bash
sudo cp configs/loki/config.yml /etc/loki/
```

```ini
[Service]
User=loki
EnvironmentFile=-/etc/loki/loki.env
ExecStart=/usr/local/bin/loki -config.file=/etc/loki/config.yml -config.expand-env=true
```

`loki.env` is needed only if you enable the optional object-storage block (`R2_*` variables). See [retention.md](retention.md).

## 7. Tempo

```bash
sudo cp configs/tempo/config.yml /etc/tempo/
```

```ini
[Service]
User=tempo
ExecStart=/usr/local/bin/tempo -config.file=/etc/tempo/config.yml
```

OTLP receivers listen on `127.0.0.1:4317` (gRPC) and `127.0.0.1:4318` (HTTP). Only change this behind TLS and authentication.

## 8. Grafana data sources and dashboards

Install Grafana from its official package repository, bind it to loopback (`http_addr = 127.0.0.1` in `grafana.ini`), then in the UI add:

| Data source | URL |
|---|---|
| Prometheus | `http://127.0.0.1:9090` |
| Loki | `http://127.0.0.1:3100` |
| Tempo | `http://127.0.0.1:3200` |

Suggested panels:

- Request rate: `sum(rate(example_api_http_requests_total[5m]))`
- Error rate: `sum(rate(example_api_http_requests_failed_total[5m])) / sum(rate(example_api_http_requests_total[5m]))`
- p50/p95/p99: `histogram_quantile(0.95, sum by (le) (rate(example_api_http_request_duration_seconds_bucket[5m])))`
- Logs by severity: `sum by (level) (count_over_time({service_name="example-api"}[1m]))`
- Traces: Explore with the Tempo data source (search by service name, minimum duration, or status = error)

Do not commit exported dashboards unless you have reviewed them for sensitive data.

## 9. Log rotation

```bash
sudo cp configs/logrotate/example-api /etc/logrotate.d/example-api
sudo logrotate --debug /etc/logrotate.d/example-api
```

## 10. Validate, start, test

```bash
sudo systemctl daemon-reload
scripts/validate-configs.sh          # run before every restart
sudo systemctl enable --now prometheus alertmanager loki tempo alloy example-api
scripts/health-check.sh
```

End-to-end tests:

1. **Metrics:** generate traffic (see `examples/node-api/README.md`), then query `example_api_http_requests_total` in Prometheus.
2. **Logs:** in Grafana Explore (Loki) run `{service_name="example-api"}`; confirm `level` labels.
3. **Traces:** in Explore (Tempo), search service `example-api`; open a trace from `/api/slow`.
4. **Alerts:** call `/api/error` repeatedly (rate must exceed the rule's request floor) or send a synthetic alert:
   `amtool alert add TestAlert severity=warning --annotation=summary="test" --alertmanager.url=http://127.0.0.1:9093`
   and confirm the notification arrives.

## 11. Final review

Firewall rules and security groups, Grafana authentication, retention values per signal, secret file permissions, and backups. See [security.md](security.md) and [retention.md](retention.md).

Docker is an optional alternative: the same configs can be mounted into the official images, adjusting listen addresses and paths.
