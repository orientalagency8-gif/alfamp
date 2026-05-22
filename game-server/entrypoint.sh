#!/usr/bin/env bash
# Alfa MP — game-server entrypoint.
# Стартует FXServer в фоне + heartbeat-цикл.
set -e

# Стартуем heartbeat в фоне
if [ -n "${ALFAMP_API_KEY:-}" ] && [ -n "${MASTER_URL:-}" ]; then
    /usr/local/bin/heartbeat.sh &
    echo "[entrypoint] heartbeat sidecar started (PID $!)"
else
    echo "[entrypoint] WARN: ALFAMP_API_KEY/MASTER_URL not set, skipping heartbeat"
fi

# Оригинальный entrypoint FiveM-образа
exec /entrypoint.sh "$@"
