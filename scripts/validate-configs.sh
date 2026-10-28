#!/usr/bin/env bash
# Validate repository configs using whichever tools are installed.
# Missing tools are reported as SKIP, not as success. Exit code is non-zero if any check FAILs.
# Run against the same component versions you deploy (see README "Versions").
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0; PASS=0; SKIP=0

pass() { echo "PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }
skip() { echo "SKIP  $1 ($2)"; SKIP=$((SKIP+1)); }
have() { command -v "$1" >/dev/null 2>&1; }

run() { # run <label> <cmd...>
  local label="$1"; shift
  if out="$("$@" 2>&1)"; then pass "$label"; else fail "$label"; echo "$out" | sed 's/^/      /'; fi
}

# --- Shell syntax ---
for f in "$ROOT"/scripts/*.sh; do run "bash -n $(basename "$f")" bash -n "$f"; done
if have shellcheck; then
  for f in "$ROOT"/scripts/*.sh; do run "shellcheck $(basename "$f")" shellcheck "$f"; done
else skip "shellcheck" "not installed"; fi

# --- YAML syntax ---
if python3 -c 'import yaml' 2>/dev/null; then
  for f in "$ROOT"/configs/*/*.yml; do
    run "yaml $(basename "$(dirname "$f")")/$(basename "$f")" \
      python3 -c 'import sys,yaml; yaml.safe_load(open(sys.argv[1]))' "$f"
  done
else skip "YAML syntax" "python3 + PyYAML not installed"; fi

# --- Node example ---
if have node; then
  while IFS= read -r f; do run "node --check ${f#"$ROOT"/}" node --check "$f"; done \
    < <(find "$ROOT/examples/node-api" -name node_modules -prune -o -name '*.js' -print | sort)
else skip "node --check" "node not installed"; fi

# --- Prometheus (paths rewritten to the repo copy so referenced files exist) ---
if have promtool; then
  sed "s#/etc/prometheus/alert-rules.yml#$ROOT/configs/prometheus/alert-rules.yml#" \
    "$ROOT/configs/prometheus/prometheus.yml" > "$TMP/prometheus.yml"
  run "promtool check config" promtool check config "$TMP/prometheus.yml"
  run "promtool check rules"  promtool check rules "$ROOT/configs/prometheus/alert-rules.yml"
else skip "promtool" "not installed"; fi

# --- Alertmanager (password file replaced with a throwaway empty file) ---
if have amtool; then
  : > "$TMP/smtp_password"
  sed "s#/etc/alertmanager/secrets/smtp_password#$TMP/smtp_password#" \
    "$ROOT/configs/alertmanager/alertmanager.yml" > "$TMP/alertmanager.yml"
  run "amtool check-config" amtool check-config "$TMP/alertmanager.yml"
else skip "amtool" "not installed"; fi

# --- Loki ---
if have loki; then
  run "loki -verify-config" loki -config.file="$ROOT/configs/loki/config.yml" -verify-config
else skip "loki" "not installed"; fi

# --- Alloy ---
if have alloy; then
  export APP_LOG_PATH="/tmp/example-api/app.log" LOKI_URL="http://127.0.0.1:3100/loki/api/v1/push"
  run "alloy validate" alloy validate "$ROOT/configs/alloy/config.alloy"
else skip "alloy" "not installed"; fi

# --- Tempo ---
if have tempo; then
  # -config.verify exists in Tempo 2.x and 3.x; the shipped config targets 2.x (see README "Versions").
  run "tempo -config.verify" tempo -config.file="$ROOT/configs/tempo/config.yml" -config.verify=true
else skip "tempo" "not installed"; fi

echo
echo "Summary: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
