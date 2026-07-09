#!/usr/bin/env bash
# Samples system/process health every INTERVAL seconds while a k6 scenario
# runs, appends to a timestamped CSV under results/, and prints abort/warning
# banners against the thresholds agreed in the load-test plan:
#   MemAvailable < 400MB -> warn / reduce concurrency
#   MemAvailable < 150MB -> hard abort (Ctrl-C the running k6 scenario)
# Usage: monitor.sh <run-name> [interval-seconds]
set -uo pipefail

RUN_NAME="${1:?usage: monitor.sh <run-name> [interval-seconds]}"
INTERVAL="${2:-2}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULTS_DIR"
OUT="$RESULTS_DIR/monitor-${RUN_NAME}-$(date +%Y%m%dT%H%M%S).csv"

echo "timestamp,mem_available_mb,swap_used_mb,vmstat_si,vmstat_so,office_agent_rss_mb,pocketbase_rss_mb,office_agent_nrestarts,neighbors_active" > "$OUT"
echo "Monitoring to $OUT (interval ${INTERVAL}s). Ctrl-C to stop." >&2

while true; do
  ts="$(date -Iseconds)"

  mem_avail_kb="$(awk '/MemAvailable/ {print $2}' /proc/meminfo)"
  mem_avail_mb=$(( mem_avail_kb / 1024 ))
  swap_used_kb="$(awk '/SwapTotal/ {t=$2} /SwapFree/ {f=$2} END {print t-f}' /proc/meminfo)"
  swap_used_mb=$(( swap_used_kb / 1024 ))

  vmstat_line="$(vmstat 1 2 2>/dev/null | tail -1)"
  vmstat_si="$(echo "$vmstat_line" | awk '{print $7}')"
  vmstat_so="$(echo "$vmstat_line" | awk '{print $8}')"

  # Use the service's cgroup-aggregated memory (MemoryCurrent), not just the
  # MainPID's own RSS: office-agent.service's MainPID is the "npm start"
  # wrapper, not the actual "node server/index.js" child doing the work — a
  # single PID's RSS would badly undercount the service's real footprint.
  office_mem_bytes="$(systemctl show office-agent.service -p MemoryCurrent --value 2>/dev/null)"
  office_rss_mb=0
  if [[ -n "${office_mem_bytes:-}" && "$office_mem_bytes" != "[not set]" ]]; then
    office_rss_mb=$(( office_mem_bytes / 1024 / 1024 ))
  fi

  pb_pid="$(pgrep -f 'pocketbase serve' | head -1)"
  pb_rss_mb=0
  if [[ -n "${pb_pid:-}" ]]; then
    pb_rss_kb="$(ps -o rss= -p "$pb_pid" 2>/dev/null | tr -d ' ')"
    [[ -n "$pb_rss_kb" ]] && pb_rss_mb=$(( pb_rss_kb / 1024 ))
  fi

  nrestarts="$(systemctl show office-agent.service -p NRestarts --value 2>/dev/null || echo 0)"
  neighbors_active="$(systemctl list-units 'o2o@*' --state=running --no-legend 2>/dev/null | wc -l)"

  echo "${ts},${mem_avail_mb},${swap_used_mb},${vmstat_si:-0},${vmstat_so:-0},${office_rss_mb},${pb_rss_mb},${nrestarts:-0},${neighbors_active}" >> "$OUT"

  if (( mem_avail_mb < 150 )); then
    echo "[ABORT] MemAvailable ${mem_avail_mb}MB < 150MB — stop the running k6 scenario now" >&2
  elif (( mem_avail_mb < 400 )); then
    echo "[WARN] MemAvailable ${mem_avail_mb}MB < 400MB — consider reducing concurrency" >&2
  fi

  if [[ "$neighbors_active" -lt 14 ]]; then
    echo "[ABORT] only ${neighbors_active}/14 o2o@* services still running — stop and investigate" >&2
  fi

  sleep "$INTERVAL"
done
