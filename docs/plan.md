# Alfa MP — план разработки

## Неделя 1: Foundation (где мы сейчас)

### День 1 (сегодня) ✅
- [x] Создать структуру проекта `q:\AlfaMP`
- [x] README + план
- [ ] Решить: GitHub organization vs личный аккаунт
- [ ] Зарегистрировать GitHub org `AlfaMP` или `AlfaMP-Project`
- [ ] Создать private repo `AlfaMP/alfa-client`
- [ ] Проверить домены: alfamp.com / alfa-mp.com / alfamp.gg / alfamp.net

### Дни 2–3: Окружение разработки
- [ ] Установить Visual Studio 2022 Community (с workload "Desktop development with C++")
- [ ] Установить Git for Windows + Git LFS
- [ ] Установить Node.js LTS (для тулинга)
- [ ] Установить Python 3.11+
- [ ] Установить CMake 3.20+
- [ ] Установить Docker Desktop
- [ ] Проверить: 64+ ГБ свободно на диске, 16+ ГБ RAM

### Дни 4–5: Клон FiveM upstream
- [ ] Форкнуть `citizenfx/fivem` через GitHub UI
- [ ] Локально склонировать с LFS support
- [ ] Прочитать `code/BUILD.md`, понять схему сборки
- [ ] Запустить первую сборку **немодифицированного** клиента
- [ ] Цель: получить рабочий `FiveM.exe` под нашим именем `AlfaMP.exe`

### Дни 6–7: Первый ребрендинг
- [ ] Заменить упоминания "FiveM" → "Alfa MP" в видимых строках
- [ ] Заменить иконку приложения
- [ ] Заменить splash-экран
- [ ] Собрать → запустить → увидеть свой бренд в окне игры
- [ ] **Веха №1**: «Alfa MP» в title bar при загрузке

## Неделя 2: Бекенд + домен

- [ ] Купить домен (рекомендую `.gg` или `.com`)
- [ ] Арендовать VPS (Hetzner CX22, ~$5/мес для начала)
- [ ] Поднять Postgres + Redis на VPS
- [ ] Написать минимальный мастер-сервер (Node/TypeScript)
- [ ] Endpoint `POST /api/servers/heartbeat`
- [ ] Endpoint `GET /api/servers/list`
- [ ] Базовая аутентификация по API-ключу

## Неделя 3–4: Свой лаунчер

- [ ] Скелет Tauri-проекта (Rust + React)
- [ ] Логин экран (заглушка)
- [ ] Server browser (запрос к нашему мастер-серверу)
- [ ] Скачка клиента с CDN
- [ ] Запуск игры с подключением к выбранному серверу

## Месяц 2: Netcode improvements

- [ ] Поднять tickrate до 60 Hz
- [ ] Расширить vehicle snapshot (velocity, steering, throttle)
- [ ] Soft reconciliation вместо snap
- [ ] Тестирование на дев-сервере вдвоём с другом
- [ ] Метрики: средняя задержка коррекции, % телепортов

## Месяцы 3–4: Vehicle sync rewrite

- [ ] State-authoritative модель
- [ ] Driver handoff protocol
- [ ] Server-side collision resolution
- [ ] Server-side rewind для hit-reg
- [ ] Adaptive tickrate per vehicle distance

## Месяц 5: Анти-чит + полировка

- [ ] Server-side валидация движения
- [ ] Server-side валидация спавна предметов
- [ ] Telemetry: Sentry + Grafana
- [ ] Crash reporter
- [ ] Authoritative weapon hit-confirm

## Месяц 6: Закрытая бета

- [ ] Discord-сервер сообщества
- [ ] 20–50 тестеров по приглашениям
- [ ] Ботов для нагрузочного тестирования
- [ ] Багфиксы по приоритетам
- [ ] Полировка UX лаунчера

## Месяц 7: Публичный релиз

- [ ] Маркетинг-пуш (Twitter, TikTok, стримеры)
- [ ] Первый официальный сервер уровня production
- [ ] Открытая регистрация комьюнити-серверов
- [ ] Партнёрки с RP-проектами
