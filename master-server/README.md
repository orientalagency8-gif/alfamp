# Alfa MP — Master Server

Центральный реестр всех game-серверов. Сюда стучатся game-серверы (heartbeat), отсюда лаунчер берёт список серверов для отображения игрокам.

## Что умеет (v0.0.1)

- `GET /` — health check
- `GET /v1/docs` — мини-документация
- `GET /v1/servers` — публичный список живых серверов
- `POST /v1/servers/register` — регистрация нового сервера (нужен API-ключ)
- `POST /v1/servers/heartbeat` — пинг от сервера каждые 30 сек

## Стек

- **Node.js** 22+ (используется нативная поддержка TypeScript, без сборки)
- **Fastify** 5 — HTTP-фреймворк
- **Zod** — валидация входов
- **Pino-pretty** — красивые логи
- **In-memory store** (Map) — пока без БД; PostgreSQL добавим в M2

## Как запустить

### Первый раз
```bash
cd q:\AlfaMP\master-server
npm install
npm run dev
```

### Дальше (после первого npm install)
```bash
npm run dev
```

Или просто двойной клик по `run.bat` в этой папке.

Откроется на http://localhost:8080

## Как протестировать вручную

### 1. Открыть в браузере
- http://localhost:8080/ — health
- http://localhost:8080/v1/docs — документация
- http://localhost:8080/v1/servers — список (пока пустой)

### 2. Зарегистрировать фейковый сервер
Скопируй `DEV API KEY` из консоли при старте — она печатается жирно в логах.

PowerShell:
```powershell
$key = "PASTE_DEV_API_KEY_HERE"
Invoke-RestMethod -Uri "http://localhost:8080/v1/servers/register" -Method Post -ContentType "application/json" -Body (@{
    name = "Test Drift Server"
    endpoint = "127.0.0.1:30120"
    slots = 64
    tags = @("drift", "freeroam")
    region = "RU"
    apiKey = $key
} | ConvertTo-Json)
```

Получишь `{ id: "...", status: "registered" }`.

### 3. Открыть список серверов снова
http://localhost:8080/v1/servers — теперь там твой Test Drift Server.

### 4. Послать heartbeat
PowerShell:
```powershell
$serverId = "PASTE_ID_FROM_PREVIOUS_RESPONSE"
Invoke-RestMethod -Uri "http://localhost:8080/v1/servers/heartbeat" -Method Post -ContentType "application/json" -Body (@{
    serverId = $serverId
    apiKey = $key
    players = 12
} | ConvertTo-Json)
```

Обнови `/v1/servers` — увидишь что у сервера 12 игроков.

### 5. Если heartbeat не приходит >2 минут
Сервер автоматически удалится из реестра. Это нормально.

## Структура

```
master-server/
├── package.json
├── tsconfig.json
├── README.md
├── run.bat              ← двойной клик для запуска
└── src/
    └── index.ts         ← весь код (пока в одном файле)
```

## TODO (следующие итерации)

- [ ] PostgreSQL вместо in-memory
- [ ] Rate limiting (anti-spam регистрации)
- [ ] API endpoints для админа: list keys, revoke key, ban server
- [ ] Метрики (Prometheus exporter)
- [ ] Авторизация юзеров (не только серверов)
- [ ] WebSocket для real-time обновлений списка серверов
- [ ] Geolocation auto-detect по IP сервера
