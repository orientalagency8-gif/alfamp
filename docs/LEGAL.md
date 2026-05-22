# Alfa MP — Legal Disclaimers

> **Official legal text** для размещения везде, где упоминается продукт:
> лаунчер (footer), сайт (Privacy / Terms / About), GitHub README,
> Discord-сервер (channel #rules или #info), email-подписи, скриншоты для рекламы.

---

## 🇷🇺 Полный текст (русский)

```
Grand Theft Auto и Grand Theft Auto: V являются зарегистрированными торговыми
марками Take-Two Interactive Software. Alfa MP не связана с и не одобрена
Take-Two Interactive Software, Rockstar Games или их аффилированными лицами,
и не несёт ответственности за контент, созданный пользователями. Alfa MP
не размещает пользовательские сервера. Весь пользовательский контент является
собственностью его соответствующих владельцев. Все права защищены.

© 2007–2026 Take-Two Interactive Software и её дочерние предприятия.
Все другие знаки и торговые марки являются собственностью их соответствующих
владельцев. Все права защищены. © 2026 Alfa MP.
```

## 🇬🇧 Full text (English)

```
Grand Theft Auto and Grand Theft Auto: V are registered trademarks of Take-Two
Interactive Software. Alfa MP is not affiliated with or endorsed by Take-Two
Interactive Software, Rockstar Games, or any of their affiliates, and is not
responsible for user-generated content. Alfa MP does not host user servers.
All user content is the property of its respective owners. All rights reserved.

© 2007–2026 Take-Two Interactive Software and its subsidiaries.
All other marks and trademarks are properties of their respective owners.
All rights reserved. © 2026 Alfa MP.
```

## Short version (footer)

```
Alfa MP is not affiliated with Take-Two Interactive or Rockstar Games.
GTA V is a trademark of Take-Two Interactive Software.
© 2026 Alfa MP. All other trademarks belong to their owners.
```

---

## Где обязательно размещать

| Поверхность | Где именно | Версия |
|---|---|---|
| **Лаунчер** | Меню → About | Полный (RU/EN) |
| **Лаунчер** | Footer всегда видимый | Short |
| **Сайт** | Footer на каждой странице | Short |
| **Сайт** | Privacy Policy, Terms, About | Полный |
| **GitHub README** | Внизу | Полный (EN) |
| **Discord** | Канал #info или #rules | Полный |
| **Master Server API** | `GET /v1/legal` | JSON |
| **In-game splash** | При первом запуске клиента | Short |
| **Email-уведомления** | В подписи | Short |

---

## Ключевые юридические тезисы (обоснования)

### Почему мы НЕ нарушаем права Take-Two

1. **Мы не распространяем GTA V**. Игрок обязан иметь легальную копию.
2. **Мы не используем ассеты Rockstar/Take-Two** в нашем дистрибутиве (модели, текстуры, скрипты, музыка — ничего из игры).
3. **Мы не используем торговые марки** «Grand Theft Auto», «GTA», «Rockstar», «GTA Online» в брендинге — только в disclaimer'ах как обязательная атрибуция.
4. **Мы не используем leaked source code** GTA V. Наш форк построен поверх open-source CitizenFX/FiveM (BSD-3 license).
5. **Мы не имитируем GTA Online**. Контент, который запускают пользователи — их собственный, мы не контролируем.
6. **Мы не помогаем обходить копии-защиту**. Игра должна быть купленной.

### Что мы делаем (юридически)

Мы — **программное обеспечение-мод**, аналог FiveM/RAGE MP/alt:V, под лицензией нашего собственного выбора (open-source SDK + proprietary core).

Мы — **техническая платформа** для размещения серверов сторонними хостерами. Каждый хостер сам отвечает за свой контент перед законом.

### Прецеденты (RAGE MP, FiveM, alt:V)

RAGE MP существует с 2017 года, alt:V с 2019, FiveM с 2014 — все используют идентичную юридическую модель и **успешно работают** под Take-Two. Take-Two в 2023 году **купила Cfx.re (FiveM)** вместо иска — это сигнал, что данный модель приемлема.

### Что точно НЕ делать

- ❌ Никогда не использовать слова "GTA", "Rockstar", "Take-Two", "Grand Theft Auto" в маркетинге (кроме обязательных disclaimer'ов).
- ❌ Не использовать логотипы / цвета / шрифты Rockstar.
- ❌ Не давать в дистрибутив ассеты из игры.
- ❌ Не использовать утечку исходного кода GTA V 2023 года ни в одной строке.
- ❌ Не имитировать GTA Online (фичи, лобби, миссии, валюту).
- ❌ Не давать пользователям возможность пиратить игру через наш лаунчер.

### Что обязательно делать

- ✅ Проверять, что у юзера установлена легальная GTA V (steamapps/Rockstar Launcher detection).
- ✅ Disclaimer'ы везде (см. таблицу выше).
- ✅ TOS (Terms of Service): пользователь подтверждает что у него есть GTA V и принимает ответственность за свой контент.
- ✅ DMCA-процедура: реагировать на правомерные takedown'ы серверов с пиратским контентом.
- ✅ Privacy Policy в соответствии с GDPR (для EU юзеров).

---

## TODO к публичному запуску

- [ ] Юр.лицо (UAE / Грузия / Эстония / РФ — на выбор)
- [ ] Юрист просматривает Terms of Service и Privacy Policy
- [ ] DMCA designated agent (если хостимся в США через CDN)
- [ ] Privacy Policy совместимая с GDPR
- [ ] Cookie consent (для сайта в EU)
- [ ] Возрастной gate 18+ (GTA V рейтинг)
