# Troubleshooting

General approach: check the service (`systemctl status <unit>`), then its log (`journalctl -u <unit> -e --no-pager`), then connectivity (`curl` to its health endpoint), then permissions.

| Symptom | Likely cause | What to check |
|---|---|---|
| Prometheus target `DOWN` | App not running, wrong port, bound to another interface | `curl http://127.0.0.1:8080/metrics`; Prometheus UI, Status, Targets for the error text |
| Prometheus fails to start | Invalid YAML or rule file | `promtool check config` and `promtool check rules` |
| No alert emails | SMTP details wrong, secret file unreadable, port blocked | `journalctl -u alertmanager`; file owner/mode of the password file; try `amtool alert add` for a test alert; check the cloud provider's outbound SMTP restrictions (EC2 throttles port 25) |
| Alert stays `pending` | `for:` duration not elapsed | Prometheus UI, Alerts |
| CPU alert never fires | node_exporter not installed or not scraped | Targets page, job `node` |
| No logs in Loki | Alloy cannot read the file, wrong path, `tail_from_end` skipping old lines | `journalctl -u alloy`; `namei -l <log path>`; Alloy UI (port 12345) component health; write new log lines after Alloy starts |
| Logs have `level="unknown"` | Lines are not JSON or lack `level` | Expected for malformed lines; inspect the raw lines in Loki |
| Loki rejects entries (`entry too far behind` / `rate limit`) | Old timestamps or ingestion limits | Loki logs; `reject_old_samples_max_age`; `limits_config` |
| Loki: `invalid structured metadata` | `allow_structured_metadata` disabled or schema older than v13 | `limits_config`, `schema_config` |
| Loki retention does nothing | Compactor not enabled or no `delete_request_store` | `compactor` block; compaction logs; wait for `retention_delete_delay` |
| No traces in Tempo | Exporter endpoint wrong, tracing not preloaded with `--import` (ESM needs the loader too), sampling 0 | `OTEL_EXPORTER_OTLP_ENDPOINT`; `ss -ltnp \| grep 4318`; the two `--import` flags in the service's `ExecStart` / `npm start`; set `OTEL_LOG_LEVEL=debug` temporarily |
| Trace shows only one service | Downstream services not instrumented or not propagating `traceparent` | Instrument them; verify headers |
| Grafana data source "connection refused" | Wrong URL or component down | Use `http://127.0.0.1:<port>` when Grafana is on the same host; run `scripts/health-check.sh` |
| Port already in use | Another component on same port | `ss -ltnp`; defaults in this repo avoid known clashes (Tempo gRPC 9097, Loki gRPC 9096) |
| Permission denied writing data | Directory ownership | `ls -ld /var/lib/<component>`; `chown` to the service user |
| `validate-configs.sh` shows SKIP | Tool not installed | Install the binary of the same version you deploy |

If a configuration key is rejected, compare with the documentation for your exact version; option names change between releases.
