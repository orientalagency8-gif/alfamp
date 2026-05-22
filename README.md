# Alfa MP

Мультиплеер-платформа для GTA 5. Форк CitizenFX (FiveM) с собственным netcode, лаунчером и инфраструктурой.

**Статус:** day 1, инициализация репозитория.

## Главная техническая цель

Сделать синхронизацию транспорта **заметно плавнее**, чем в RAGE MP и стоковом FiveM, через:

- 60 Hz tickrate (vs 30 у конкурентов)
- State-authoritative модель vehicle sync вместо owner-authoritative
- Soft reconciliation (плавная коррекция) вместо телепортов
- Server-side rewind для hit-registration
- Velocity/steering/throttle sync вместо чистой position-snapshot
- Driver handoff protocol для пересадок без подбросов
- Server-arbitrated collision resolution

## Архитектура

- **client/** — форк CitizenFX (GTA 5 only, RedM-код вырезан), наши патчи netcode
- **launcher/** — собственный лаунчер (Tauri), регистрация/логин, server browser, авто-апдейт
- **master-server/** — реестр игровых серверов, heartbeat, валидация API-ключей
- **backend/** — аккаунты, регистрация серверов, админ-дашборд, banlist
- **infra/** — Docker, deploy-скрипты, мониторинг

## Только GTA 5

RedM, RDR2, любые другие игры — **не поддерживаем**. Это сознательное решение для упрощения кода и фокуса.

## Команда

- **Owner** — стратегия, маркетинг, тестирование, сообщество
- **Claude Opus 4.7** — весь код, DevOps, документация

## Цели по таймлайну

| Этап | Срок |
|---|---|
| Сборка чистого форка под нашим брендом | 2 недели |
| Свой лаунчер + мастер-сервер | 4 недели |
| Базовые улучшения netcode | 2 месяца |
| Полная переделка vehicle sync | 3–4 месяца |
| Закрытая бета (20–50 игроков) | 4–6 месяц |
| Публичный запуск | 5–7 месяц |

## Лицензия

Форк CitizenFX распространяется под Modified BSD 3-clause (см. оригинал). Наши собственные модули — будет выбрана позже (вероятно proprietary для лаунчера/backend, open для SDK).
