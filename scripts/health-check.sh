#!/usr/bin/env bash
# Check that each component's local health endpoint responds.
# Override defaults with environment variables, e.g. API_URL=http://127.0.0.1:8080
set -uo pipefail

PROM_URL="${PROM_URL:-http://127.0.0.1:9090}"
ALERTMANAGER_URL="${ALERTMANAGER_URL:-http://127.0.0.1:9093}"
LOKI_URL_BASE="${LOKI_URL_BASE:-http://127.0.0.1:3100}"
TEMPO_URL="${TEMPO_URL:-http://127.0.0.1:3200}"
ALLOY_URL="${ALLOY_URL:-http://127.0.0.1:12345}"
GRAFANA_URL="${GRAFANA_URL:-http://127.0.0.1:3000}"
API_URL="${API_URL:-http://127.0.0.1:8080}"
NODE_EXPORTER_URL="${NODE_EXPORTER_URL:-http://127.0.0.1:9100}"
TIMEOUT="${HEALTH_TIMEOUT:-5}"

command -v curl >/dev/null 2>&1 || { echo "curl is required"; exit 2; }

FAIL=0
check() { # check <name> <url>
  local code
  code="$(curl -s -o /dev/null -m "$TIMEOUT" -w '%{http_code}' "$2" || true)"
  if [ "$code" = "200" ]; then printf 'OK    %-14s %s\n' "$1" "$2"
  else printf 'FAIL  %-14s %s (HTTP %s)\n' "$1" "$2" "${code:-none}"; FAIL=1; fi
}

check prometheus   "$PROM_URL/-/healthy"
check alertmanager "$ALERTMANAGER_URL/-/healthy"
check loki         "$LOKI_URL_BASE/ready"
check tempo        "$TEMPO_URL/ready"
check alloy        "$ALLOY_URL/-/ready"
check grafana      "$GRAFANA_URL/api/health"
check example-api  "$API_URL/health"
check node-exporter "$NODE_EXPORTER_URL/metrics"

# Optional: report any Prometheus targets that are not up.
if command -v python3 >/dev/null 2>&1; then
  curl -s -m "$TIMEOUT" "$PROM_URL/api/v1/targets" | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)["data"]["activeTargets"]
except Exception:
    sys.exit(0)
down = [t["scrapePool"] + " " + t["scrapeUrl"] for t in data if t["health"] != "up"]
print("Targets not up: " + (", ".join(down) if down else "none"))
' || true
fi

exit "$FAIL"
