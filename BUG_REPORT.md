# Bug Report — mikofai.ru

**Дата:** 13.06.2026  
**Метод:** Playwright MCP (прод `https://mikofai.ru`) + SSH-логи Docker (`mikof-price-backend-1`)  
**Роли:** R1 `gen@mikofai.ru`, R2 `cfo@mikofai.ru`, R3 `med@mikofai.ru`, R4 `staff@mikofai.ru`

## Резюме

| Severity | Кол-во |
|----------|--------|
| Critical | 2 |
| High | 6 |
| Medium | 5 |
| Low | 1 |

**Всего:** 14 багов

Ключевые проблемы: отсутствие обратной связи при ошибках форм, архивные клиники/справочники в выпадающих списках и формах цен, неработающее обновление цен услуг в UI, отсутствие записей в журнале аудита для операций с клиниками и ценами, дублирование записей цен в БД (SCD).

---

## B01 — Создание пользователя: нет сообщения об ошибке (дубликат email)

- **Страница / роль:** `/users`, R1 (Генеральный директор)
- **Severity:** High

### Шаги воспроизведения

1. Войти как `gen@mikofai.ru`
2. Открыть `/users`
3. В форме «Новый пользователь» ввести существующий email (например `gen@mikofai.ru`)
4. Заполнить имя и пароль
5. Нажать «Создать»

### Ожидаемое поведение

Сообщение об ошибке «Email already exists», форма остаётся с данными или подсвечивает поле.

### Фактическое поведение

Ничего не меняется визуально: нет toast, нет `.err`, таблица не обновляется. Пользователь не понимает, что произошло.

### Доказательства

- **Network:** `POST /api/users` → **400** `{"detail":"Email already exists"}`
- **Docker logs:** множественные `POST /api/users HTTP/1.0" 400 Bad Request` (в т.ч. 13.06.2026 11:41)
- **audit.log:** запись `create_user` **не создаётся** при 400 (только при успехе)

![Дубликат email без обратной связи](bug-report-screenshots/B01-duplicate-email-no-feedback.png)

### Файлы для исправления

- [`frontend/src/pages/Users.tsx`](frontend/src/pages/Users.tsx) — добавить `onError` в `useMutation`, показ `.err`
- [`backend/app/api/routers/users.py`](backend/app/api/routers/users.py) — опционально логировать неуспешные попытки

### Рекомендация

Добавить обработчик ошибок по аналогии с `CreateServiceForm` в `Services.tsx` (там уже есть `setErr`).

> **Примечание:** при **уникальном** email создание работает (200, строка появляется в таблице). Симптом «ничего не происходит» воспроизводится именно при ошибке API.

---

## B02 — Пароль при создании пользователя нельзя скопировать

- **Страница / роль:** `/users`, R1
- **Severity:** Medium

### Шаги воспроизведения

1. Открыть форму «Новый пользователь»
2. Ввести пароль
3. Попытаться выделить и скопировать пароль

### Ожидаемое поведение

Пароль виден или доступен для копирования (как в диалоге «Сменить пароль»).

### Фактическое поведение

Поле `type="password"` — символы скрыты, кнопки «Копировать» / «Сгенерировать» нет. В диалоге смены пароля копирование **работает** (текстовое поле + кнопка «Копировать»).

### Доказательства

- Код: `Users.tsx` строка 62 — `type="password"` в форме создания
- Диалог смены пароля: `type` не задан (текст), кнопка «Копировать» на строке 83

![Форма создания](bug-report-screenshots/B01-users-form-filled.png)  
![Диалог смены пароля](bug-report-screenshots/B01-password-change-dialog.png)

### Файлы для исправления

- [`frontend/src/pages/Users.tsx`](frontend/src/pages/Users.tsx)

### Рекомендация

Переиспользовать паттерн из диалога смены пароля: текстовое поле + «Сгенерировать» + «Копировать».

---

## B03 — Нет валидации формата телефона клиники

- **Страница / роль:** `/clinics`, R1
- **Severity:** Medium

### Шаги воспроизведения

1. Открыть `/clinics`
2. В форме «Новая клиника» заполнить все поля, в «Телефон» ввести `abc-letters-invalid`
3. Нажать «Добавить»

### Ожидаемое поведение

Отклонение: телефон только цифры/допустимые символы.

### Фактическое поведение

`POST /api/clinics` → **200**, клиника создана с буквенным «телефоном».

### Доказательства

- **Network:** `POST /api/clinics` → 200
- **Docker logs:** `POST /api/clinics HTTP/1.0" 200 OK`
- **audit.log:** операция **не залогирована**

![Клиника с невалидным телефоном](bug-report-screenshots/B03-clinic-invalid-phone-created.png)

### Файлы для исправления

- [`frontend/src/pages/Clinics.tsx`](frontend/src/pages/Clinics.tsx)
- [`backend/app/schemas/schemas.py`](backend/app/schemas/schemas.py) — `ClinicCreate` / `ClinicUpdate`

### Рекомендация

Добавить `field_validator` на backend (regex телефона) и `pattern`/`type="tel"` на frontend.

---

## B04 — Операции с клиниками не отображаются во вкладке «Аудит»

- **Страница / роль:** `/clinics` + `/audit`, R1
- **Severity:** High

### Шаги воспроизведения

1. Создать клинику, изменить адрес, закрыть и открыть клинику (все операции успешны — 200)
2. Перейти на `/audit`

### Ожидаемое поведение

В журнале аудита видны действия: создание клиники, изменение адреса, закрытие/открытие.

### Фактическое поведение

В `/audit` только `login`, `create_user`, `update_user`, `create_service`, `approve_request` и т.п. Операций с клиниками нет.

### Доказательства

- Закрытие/открытие работает в UI (статус «Закрыта» / «Активна») — см. скриншоты
- **audit.log** (последние записи): нет `create_clinic`, `update_clinic`, `archive_clinic`
- **Код:** `directories.py` — `create_clinic`, `directory_archive` не вызывают `log_action()`; изменения идут только в `entity_history`

![Журнал аудита без клиник](bug-report-screenshots/B04-audit-page.png)

### Файлы для исправления

- [`backend/app/api/routers/directories.py`](backend/app/api/routers/directories.py)
- [`backend/app/api/deps.py`](backend/app/api/deps.py) — `log_action`

### Рекомендация

Добавить `log_action` для create/patch/archive клиник и справочников; либо объединить `entity_history` с `/audit`.

---

## B05 — R1 может создавать новые записи справочников (нарушение ТЗ)

- **Страница / роль:** `/directories`, R1
- **Severity:** High

### Шаги воспроизведения

1. Открыть `/directories`
2. В блоке «Группы услуг» ввести новый код и название
3. Нажать «Добавить»

### Ожидаемое поведение (по ТЗ)

Гендиректор может **редактировать** существующие справочники и **архивировать**, но **не создавать** новые записи.

### Фактическое поведение

`POST /api/groups` → **200**, новая группа появляется в таблице (созданы `TGRP2-8829`, `TGRP2-3141` и др. в ходе теста).

### Доказательства

- **Network:** `POST /api/groups` → 200
- **Docker logs:** `POST /api/groups HTTP/1.0" 200 OK`

![Справочник — создание разрешено](bug-report-screenshots/B05-directory-created.png)

### Файлы для исправления

- [`frontend/src/pages/Directories.tsx`](frontend/src/pages/Directories.tsx) — скрыть форму «Добавить» для R1
- [`backend/app/api/routers/directories.py`](backend/app/api/routers/directories.py) — запретить `POST` для groups/subgroups/executors/locations

---

## B06 — Архивные (закрытые) клиники отображаются в формах цен

- **Страница / роль:** `/packages/:id`, `/services/:id`, R1
- **Severity:** High

### Шаги воспроизведения

1. На `/clinics` найти клинику со статусом «Закрыта» (код `1`, название `п`)
2. Открыть любой пакет → блок «Цена по клиникам»
3. Открыть карточку услуги → блок «Цены по клиникам»

### Ожидаемое поведение

Закрытые клиники **не показываются** в формах ценообразования.

### Фактическое поведение

Клиника `п` (статус «Закрыта») отображается в обоих блоках; для неё доступны поля ввода цены.

### Доказательства

- Закрытая клиника: `{ code: "1", name: "п", status: "Закрыта" }`
- В форме цен пакета: `["п", "Кишинёв", "Тирасполь", "Рыбница", ...]`

![Закрытая клиника в ценах пакета](bug-report-screenshots/B06-closed-clinic-in-package-prices.png)  
![Закрытая клиника в ценах услуги](bug-report-screenshots/B07-B09-service-detail-prices.png)

### Файлы для исправления

- [`frontend/src/pages/PackageDetail.tsx`](frontend/src/pages/PackageDetail.tsx) — `PackagePrice`
- [`frontend/src/pages/ServiceDetail.tsx`](frontend/src/pages/ServiceDetail.tsx) — `ServicePriceRow`
- [`frontend/src/lib/useRefs.ts`](frontend/src/lib/useRefs.ts) — фильтр `status === "active"`

### Рекомендация

Фильтровать `clinics.filter(c => c.status === "active")` перед рендером таблиц цен; на backend отклонять `POST .../prices` для закрытых клиник.

---

## B07 — UX формы цен услуги: дублирование полей, непонятная привязка

- **Страница / роль:** `/services/:id`, R1/R2
- **Severity:** Medium

### Шаги воспроизведения

1. Открыть карточку услуги с ценами
2. Посмотреть блок «Цены по клиникам»

### Ожидаемое поведение

Понятно, какое поле редактирует «Цена», какое — «Online», какое — «Спец.»

### Фактическое поведение

В таблице 4 колонки данных (Клиника, Цена, Online, Спец.) **и** отдельно справа 2 поля ввода (Цена, Online) без подписей. Текущие значения дублируются: в колонке «150 MDL» и в input «150». Неясно, что меняется при нажатии OK.

### Доказательства

Компонент `ServicePriceRow` (`ServiceDetail.tsx:219-242`): read-only колонки + edit inputs в одной строке.

![Дублирование полей цен](bug-report-screenshots/B07-B09-service-detail-prices.png)

### Файлы для исправления

- [`frontend/src/pages/ServiceDetail.tsx`](frontend/src/pages/ServiceDetail.tsx) — `ServicePriceRow`

### Рекомендация

Либо inline-edit (только inputs), либо read-only + отдельная форма с labels «Цена (MDL)» / «Цена Online (MDL)».

---

## B08 — Изменение цены услуги не отражается в UI (повторное сохранение бессмысленно)

- **Страница / роль:** `/services/232`, R1
- **Severity:** Critical

### Шаги воспроизведения

1. Открыть услугу `G-001-ADD-001` (`/services/232`)
2. В строке «Кишинёв» ввести цену `1234`, online `1111` → OK
3. Повторить: цена `5678`, online `2222` → OK

### Ожидаемое поведение

После каждого OK колонки «Цена» и «Online» обновляются.

### Фактическое поведение

Оба `POST /api/services/232/prices` → **200**, но колонка «Цена» остаётся **«150 MDL»**, «Online» — **«—»**. Inputs сохраняют введённые значения, но отображаемые данные не меняются.

### Корневая причина (код + логи)

`set_price` в `services.py` всегда делает **INSERT** новой записи `ServicePrice` без закрытия предыдущей (`valid_to` не устанавливается). `list_prices` фильтрует `valid_to IS NULL` — при нескольких активных записях `prices.find()` на frontend берёт **первую** (старую).

**Docker logs:** множественные `POST /api/services/12/prices` и `POST /api/services/232/prices` → 200 (накопление дублей).

![После первого изменения](bug-report-screenshots/B08-price-first-change.png)  
![После второго изменения](bug-report-screenshots/B08-price-second-change.png)

### Файлы для исправления

- [`backend/app/api/routers/services.py`](backend/app/api/routers/services.py) — `set_price`: закрывать старую цену (`valid_to=now()`), писать `EntityHistory`
- [`frontend/src/pages/ServiceDetail.tsx`](frontend/src/pages/ServiceDetail.tsx) — `useEffect` для синхронизации state в `ServicePriceRow`

---

## B09 — История изменений не фиксирует смену цен

- **Страница / роль:** `/services/:id`, R1
- **Severity:** High

### Шаги воспроизведения

1. Изменить цену услуги (B08)
2. Проверить блок «История изменений»

### Ожидаемое поведение

Запись вида `price: 150 → 1234` (или аналог).

### Фактическое поведение

История содержит только мед. поля (`executor_id`, `duration_min`). Записей о ценах — **0**.

### Доказательства

- `GET /api/services/232/history` — нет price-записей
- `set_price` не вызывает `EntityHistory` и `log_action`
- **audit.log:** нет `set_price` / `update_price`

![История без цен](bug-report-screenshots/B09-no-price-history.png)

### Файлы для исправления

- [`backend/app/api/routers/services.py`](backend/app/api/routers/services.py)

---

## B10 — Online-цена не сохраняется и не отображается

- **Страница / роль:** `/services/:id`, R1
- **Severity:** High

### Шаги воспроизведения

1. В строке клиники ввести Online-цену (например `1111`) → OK
2. Проверить колонку «Online»

### Ожидаемое поведение

Колонка «Online» показывает `1111`.

### Фактическое поведение

После POST 200 колонка «Online» остаётся «—». Связано с B08 (неверная запись читается из БД) и отсутствием SCD-логики.

### Файлы для исправления

- [`backend/app/api/routers/services.py`](backend/app/api/routers/services.py)
- [`frontend/src/pages/ServiceDetail.tsx`](frontend/src/pages/ServiceDetail.tsx)

---

## B11 — Нет валидации формата кода и языка названий при создании услуги

- **Страница / роль:** `/services`, R1/R3
- **Severity:** Medium

### Шаги воспроизведения

1. «Новая услуга»
2. Код: `INVALID-CODE-2480`, Название (RU): `LatinNameRU` (латиница), Название (RO): `КириллицаRO` (кириллица)
3. «Создать»

### Ожидаемое поведение

Ошибка валидации: код по шаблону `G-NNN-XXX-NNN`, RU — кириллица, RO — латиница/румынская.

### Фактическое поведение

`POST /api/services` → **200**, услуга создана со статусом `active`.

### Доказательства

- **Network:** 200, `id: 511`
- **audit.log:** `{"action": "create_service", "entity_id": 511}` — некорректная услуга залогирована как успешная
- **Docker logs:** `POST /api/services HTTP/1.0" 200 OK`

![Невалидная услуга создана](bug-report-screenshots/B11-invalid-service-created.png)

### Файлы для исправления

- [`backend/app/schemas/schemas.py`](backend/app/schemas/schemas.py)
- [`frontend/src/pages/Services.tsx`](frontend/src/pages/Services.tsx)

---

## B12 — Архивные записи справочников в select при создании услуги

- **Страница / роль:** `/services`, R1
- **Severity:** Medium

### Шаги воспроизведения

1. На `/directories` архивировать исполнителя (код `1`, имя `к`, статус «Архив»)
2. Открыть форму «Новая услуга»
3. Открыть select «Исполнитель»

### Ожидаемое поведение

Архивный исполнитель `к` **не отображается**.

### Фактическое поведение

В списке «Исполнитель» присутствует пункт `к` (архивная запись).

### Доказательства

- Архивные: `[{ code: "1", name: "к", status: "Архив" }]`
- Select options: `["—", "к", "Медицинская сестра", ...]`

![Форма создания услуги](bug-report-screenshots/B11-B12-service-create-form.png)

### Файлы для исправления

- [`frontend/src/pages/Services.tsx`](frontend/src/pages/Services.tsx) — фильтр `.filter(r => r.status !== "archived")`
- [`frontend/src/lib/useRefs.ts`](frontend/src/lib/useRefs.ts)

---

## B13 — 500 на расчётной цене пакета из-за дублей ServicePrice (Critical)

- **Страница / роль:** `/packages/1`, R1
- **Severity:** Critical

### Шаги воспроизведения

1. Несколько раз изменить цену услуги (B08) — в БД накапливаются записи с `valid_to IS NULL`
2. Открыть `/packages/1`

### Ожидаемое поведение

`GET /api/packages/1/computed-price/{clinic_id}` → 200

### Фактическое поведение

`GET /api/packages/1/computed-price/4` → **500** `MultipleResultsFound: Multiple rows were found when one or none was required`

### Доказательства

**Docker logs (traceback):**

```
File "/app/app/api/routers/packages.py", line 37, in _calc_package_price
    p = price_res.scalar_one_or_none()
sqlalchemy.exc.MultipleResultsFound: Multiple rows were found when one or none was required
```

Связано с B08: отсутствие закрытия старых цен (`valid_to`).

### Файлы для исправления

- [`backend/app/api/routers/services.py`](backend/app/api/routers/services.py) — SCD для `ServicePrice`
- [`backend/app/api/routers/packages.py`](backend/app/api/routers/packages.py) — `_calc_package_price`: `scalar_one_or_none` → выбор последней активной записи

---

## B14 — Нет success-feedback при успешном создании пользователя

- **Страница / роль:** `/users`, R1
- **Severity:** Low

### Фактическое поведение

При успешном создании (200) форма очищается и строка появляется в таблице, но нет явного сообщения «Пользователь создан». При ошибке (B01) — тоже тишина.

### Рекомендация

Toast / зелёный баннер при успехе; красный `.err` при ошибке.

---

## Проверка ролей R2 / R3 / R4

| Проверка | Результат |
|----------|-----------|
| R2 `/users` | Редирект на `/services` (403) — OK |
| R2 изменение цены услуги | Создаётся заявка `POST /api/requests` → редирект `/requests/8` — OK |
| R3 справочники | Кнопки «Через заявку» — OK |
| R3 создание услуги | Тег «будет отправлена на согласование» — OK |
| R4 навигация | Только «Услуги», «Пакеты» — OK |
| R4 `/users`, `/requests` | Редирект на `/services` — OK |

![R2 — нет доступа к пользователям](bug-report-screenshots/R2-users-forbidden.png)  
![R2 — цена через заявку](bug-report-screenshots/R2-price-via-request.png)  
![R3 — справочники через заявку](bug-report-screenshots/R3-directories-via-request.png)  
![R4 — ограниченный доступ](bug-report-screenshots/R4-limited-access.png)

---

## Сводка по логам Docker

### audit.log (`/logs/audit.log` в контейнере)

| Действие | Логируется? | Пример |
|----------|-------------|--------|
| `login` | Да | `user_id: 5` |
| `create_user` | Да (только успех) | `entity_id: 6` |
| `update_user` | Да | смена пароля, деактивация |
| `create_service` | Да (в т.ч. невалидные) | `entity_id: 511` |
| `create_request` / `approve_request` | Да | заявки |
| Создание клиники | **Нет** | — |
| Изменение цены | **Нет** | — |
| Создание справочника | **Нет** | — |
| Ошибки 400 (дубликат email) | **Нет** | — |

### backend stdout (ошибки)

- Множественные `POST /api/users` → 400 (попытки пользователя создать дубликаты)
- `POST /api/clinics`, `POST /api/groups`, `POST /api/services` → 200 (невалидные данные приняты)
- `POST /api/services/*/prices` → 200 (цены не обновляются корректно в UI)
- `GET /api/packages/1/computed-price/4` → **500** `MultipleResultsFound`

---

## Приоритеты для разработчика

1. **B08 + B13** — исправить SCD цен (`valid_to`), иначе ломается UI и расчёт пакетов
2. **B01** — обратная связь при ошибках форм (users, clinics, services)
3. **B06** — фильтр закрытых клиник в ценах
4. **B04** — логирование операций с клиниками в аудит
5. **B05** — запрет создания справочников для R1
6. **B09, B10** — история и online-цена
7. **B11, B12, B03** — валидация данных
8. **B02, B07, B14** — UX-улучшения

---

## Тестовые данные, созданные при аудите

Для очистки на проде (при необходимости):

| Сущность | Идентификатор |
|----------|---------------|
| Пользователь | `test-bug-audit-*@example.com` (id: 6, деактивирован) |
| Клиника | `TBA-704118` |
| Группы | `TGRP-*`, `TGRP2-*` |
| Услуга | `INVALID-CODE-2480` (id: 511) |

---

*Отчёт подготовлен автоматически по результатам Playwright-прогона и анализа логов. Скриншоты — в папке [`bug-report-screenshots/`](bug-report-screenshots/).*
