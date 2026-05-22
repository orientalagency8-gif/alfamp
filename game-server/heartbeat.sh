#!/usr/bin/env bash
# Alfa MP heartbeat sidecar.
#
# При первом запуске регистрирует сервер в master, сохраняет server_id в
# /server-data/.alfamp_server_id, дальше шлёт heartbeat каждые HEARTBEAT_INTERVAL_SEC секунд.
#
# Required env vars (передаются из docker-compose):
#   ALFAMP_API_KEY       — наш API-key
#   MASTER_URL           — например http://104.194.140.221
#   SERVER_NAME, SERVER_SLOTS, SERVER_REGION, SERVER_TAGS, SERVER_ENDPOINT
#   HEARTBEAT_INTERVAL_SEC (default 30)
set -euo pipefail

: "${ALFAMP_API_KEY:?ALFAMP_API_KEY required}"
: "${MASTER_URL:?MASTER_URL required}"
: "${SERVER_NAME:=Alfa MP Test Server}"
: "${SERVER_SLOTS:=32}"
: "${SERVER_REGION:=GB}"
: "${SERVER_TAGS:=test,upstream}"
: "${SERVER_ENDPOINT:?SERVER_ENDPOINT required, e.g. 104.194.140.221:30120}"
: "${HEARTBEAT_INTERVAL_SEC:=30}"

STATE_FILE=/server-data/.alfamp_server_id
LOG_PREFIX="[heartbeat]"

log() { echo "$LOG_PREFIX $(date -u +%FT%TZ) $*"; }

register_server() {
    log "Registering server '$SERVER_NAME' at $SERVER_ENDPOINT"
    local tags_json
    tags_json=$(echo "$SERVER_TAGS" | tr ',' '\n' | jq -R . | jq -s . | tr -d '\n')
    local body
    body=$(jq -nc \
        --arg name "$SERVER_NAME" \
        --arg endpoint "$SERVER_ENDPOINT" \
        --argjson slots "$SERVER_SLOTS" \
        --argjson tags "$tags_json" \
        --arg region "$SERVER_REGION" \
        --arg apiKey "$ALFAMP_API_KEY" \
        '{name: $name, endpoint: $endpoint, slots: $slots, tags: $tags, region: $region, apiKey: $apiKey}')

    local resp
    resp=$(curl -fsS -X POST -H "Content-Type: application/json" -d "$body" "${MASTER_URL}/v1/servers/register" || echo "")
    if [ -z "$resp" ]; then
        log "ERROR: register call failed"
        return 1
    fi
    local id
    id=$(echo "$resp" | jq -r '.id // empty')
    if [ -z "$id" ]; then
        log "ERROR: no id in response: $resp"
        return 1
    fi
    echo "$id" > "$STATE_FILE"
    log "Registered with id=$id"
}

heartbeat() {
    local server_id
    server_id=$(cat "$STATE_FILE")
    # Player count: пытаемся достать из info.json FXServer'а на 127.0.0.1:30120 → http endpoint
    local players=0
    if command -v curl >/dev/null; then
        local info
        info=$(curl -fsS -m 2 "http://127.0.0.1:30120/info.json" 2>/dev/null || echo "")
        if [ -n "$info" ]; then
            players=$(echo "$info" | jq -r '.vars.sv_maxClients // 0' 2>/dev/null || echo 0)
            # Actually we want CURRENT players, not max. Use /players.json:
            local plist
            plist=$(curl -fsS -m 2 "http://127.0.0.1:30120/players.json" 2>/dev/null || echo "[]")
            players=$(echo "$plist" | jq 'length' 2>/dev/null || echo 0)
        fi
    fi
    local body
    body=$(jq -nc --arg sid "$server_id" --arg key "$ALFAMP_API_KEY" --argjson p "$players" \
        '{serverId: $sid, apiKey: $key, players: $p}')
    local code
    code=$(curl -fsS -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$body" "${MASTER_URL}/v1/servers/heartbeat" || echo "000")
    if [ "$code" != "200" ]; then
        log "WARN heartbeat http=$code"
        # Если 404 — пересоздать регистрацию
        if [ "$code" = "404" ]; then
            log "server gone from master, re-registering"
            rm -f "$STATE_FILE"
        fi
    fi
}

# Main loop
while true; do
    if [ ! -s "$STATE_FILE" ]; then
        if ! register_server; then
            log "register failed, retry in 10s"
            sleep 10
            continue
        fi
    fi
    heartbeat
    sleep "$HEARTBEAT_INTERVAL_SEC"
done
