#!/usr/bin/env bash
set -euo pipefail
cd /var/www/AI-Office-Agent-Assistant
if ! curl -fsS --max-time 5 http://127.0.0.1:8090/api/health >/dev/null; then
  nohup ./pocketbase serve --http=127.0.0.1:8090 >> pocketbase.log 2>&1 &
fi
if ! curl -fsS --max-time 5 http://127.0.0.1:8788/api/health >/dev/null; then
  nohup npm start >> office-agent.log 2>&1 &
fi
