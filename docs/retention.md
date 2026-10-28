# Retention and storage

Each signal has its own retention. Configure all of them; none inherits from another. The values below are **examples**.

| Signal | Where | Example | Notes |
|---|---|---|---|
| Metrics | Prometheus flags | `--storage.tsdb.retention.time=15d --storage.tsdb.retention.size=5GB` | Whichever limit is hit first applies. Size limit covers blocks, not WAL, so leave headroom on the disk. |
| Logs | `configs/loki/config.yml` | `limits_config.retention_period: 168h` + `compactor.retention_enabled: true` | Deletion is performed by the compactor; it requires `delete_request_store`. Not instantaneous (`retention_delete_delay`, compaction interval). |
| Traces | `configs/tempo/config.yml` | `compactor.compaction.block_retention: 168h` | Applied by the compactor to blocks. |
| Local log files | `configs/logrotate/example-api` | `daily`, `rotate 7`, `compress` | Independent of Loki retention. |

## Limitations to be aware of

- **Retention is a minimum-effort deletion policy, not a compliance guarantee.** Data may persist until compaction runs.
- **Object storage (for example Cloudflare R2 or S3):** the bucket's own lifecycle rules, versioning, replication and access policies are separate from Loki's retention. Verify that deleted chunks are actually removed and that no bucket versioning keeps them. Use a least-privilege access key scoped to one bucket.
- **Loki:** changing `schema_config` requires adding a new period with a future `from` date; do not edit the existing entry in place. Per-stream or per-tenant retention needs additional rules.
- **Local disk:** monitor free space. Alert on disk usage (node_exporter filesystem metrics) before retention policies cannot save you.
- **Backups:** this setup does not back up telemetry data. Back up Grafana's database/dashboards (as sensitive-data-free exports) and your config files separately.
- **Right to erasure:** if logs may contain personal data, retention alone is insufficient. Avoid logging it in the first place.

## Sizing hints

Measure before choosing: Prometheus `prometheus_tsdb_head_series` and disk growth per day; Loki ingestion via `loki_distributor_bytes_received_total`; Tempo via block size on disk. Multiply by retention and add 30-50% headroom.
