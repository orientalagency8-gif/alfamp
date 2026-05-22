# Alfa MP — Game Server (FXServer fork)

На текущей стадии используем **upstream FXServer** (FiveM Linux artifacts) с нашим heartbeat-патчем. После форка `citizenfx/fivem` (см. master-plan, M3+) заменим на наш собственный билд.

## Что внутри

- `docker-compose.yml` — поднимает FXServer в контейнере с auto-restart
- `server.cfg` — конфиг сервера (имя, слоты, ресурсы)
- `heartbeat.sh` — sidecar, шлёт heartbeat в наш master-server каждые 30 сек
- `Dockerfile` — на основе официального `cfx-server-data` + наши скрипты
- `resources/` — серверные скрипты (пусто пока)

## Один-командный запуск

На VPS:
```bash
cd /opt/alfamp/repo/game-server
docker compose up -d
docker compose logs -f
```

## Heartbeat-flow

```
FXServer (running) ──┐
                     ├──► heartbeat.sh (cron 30s) ──► curl POST /v1/servers/heartbeat ──► master
                     │
                     └──► UDP :30120 ── waiting for clients
```

При первом запуске `heartbeat.sh` сначала регистрирует сервер через `POST /v1/servers/register` и сохраняет `serverId` в `.alfamp_server_id`, дальше шлёт heartbeat'ы.

## Конфиг

В `server.cfg`:
- `sv_hostname` — имя в каталоге Alfa MP
- `sv_maxclients` — слоты (1-128)
- `sv_licenseKey` — пока что **upstream cfx-key** (бесплатный, регится на keymaster.fivem.net)
  После нашего форка этот ключ не нужен будет

В `.env`:
- `ALFAMP_API_KEY` — наш API-ключ (созданный через POST /v1/me/api-keys)
- `MASTER_URL` — http://104.194.140.221 (нашего master-server'а)
- `SERVER_NAME`, `SERVER_REGION`, `SERVER_TAGS`
