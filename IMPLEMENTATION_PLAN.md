# План реализации: Mikofai — панель управления прейскурантом

## 1. Обзор проекта

**Цель:** Единая система учёта нормативно-справочной информации (НСИ) для сети офтальмологических клиник «Микоф» (Кишинёв, Тирасполь, Рыбница).

**Домен:** https://mikofai.ru (деплой — после подтверждения; до этого — localhost)

**Базовая валюта:** MDL (молдавский лей)

---

## 2. Технологический стек

| Слой | Технология |
|---|---|
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2.x (async) · Alembic |
| Frontend | React 18 · Vite · TypeScript · TanStack Query · React Hook Form · Zod |
| UI Kit | shadcn/ui + Tailwind CSS |
| Auth | JWT (access + refresh) · bcrypt · httpOnly cookies |
| БД | PostgreSQL 16 (Docker) |
| Миграции | Alembic |
| Email | SMTP-контейнер (smtp.mail.selcloud.ru:1127 TLS) · FastAPI BackgroundTasks |
| Мониторинг | Grafana + Fluent Bit (Docker) |
| Прокси | Nginx (Docker) |
| Оркестрация | Docker Compose · restart: always · health checks |

---

## 3. Docker-контейнеры

```
mikofai/
├── db          — PostgreSQL 16
├── backend     — FastAPI (uvicorn)
├── frontend    — React (served by nginx)
├── nginx       — reverse proxy / SSL termination
├── mailer      — отдельный сервис отправки почты
├── grafana     — Grafana (доступна /bi, только R1)
└── fluent-bit  — сборщик логов → Grafana
```

**Тома (volumes):**
- `pg_data` — данные БД
- `pg_backups` — ежедневные дампы, хранение 30 дней (`pg_dump` по cron)

---

## 4. Ролевая модель

| Код | Роль | Права |
|---|---|---|
| R1 | Генеральный директор | Полный доступ; CRUD без согласований; управление УЗ; аудит |
| R2 | Финансовый директор | Просмотр всего; редактирование цен; согласование/возврат заявок |
| R3 | Медицинский директор | Просмотр/редактирование мед. параметров; создание заявок |
| R4 | Персонал | Только чтение активных услуг |

---

## 5. Бизнес-сущности (БД)

### 5.1 Справочники (неизменяемые данные)

**service_groups** (С2)
```
id, code (G-001…G-010), name_ru, name_ro
```

**service_subgroups** (С3)
```
id, code (CON/DIA/PAK…), name_ru, name_ro
```

**service_group_subgroup** — таблица связи M2M (С2↔С3)

**executors** (С5)
```
id, code (EX-001…EX-011), name_ru
```

**locations** (С6)
```
id, code (LOC-001…LOC-012), name_ru
```

**clinics** (С7)
```
id, code, name_ru, name_ro, address, phone, status (active/closed)
```

### 5.2 Услуги (С1)

**services**
```
id, code (G-001-CON-001) [immutable], name_ru, name_ru_v2,
name_ro, group_id FK, subgroup_id FK,
executor_id FK, location_id FK,
duration_min, sold_separately, additional_service_id FK(self),
is_surgery_addon, note, status (active/inactive/pending),
created_at, created_by FK
```

**service_prices** — цены по клиникам
```
id, service_id FK, clinic_id FK, currency (MDL/…),
price, price_cmn, price_online, price_special,
valid_from, valid_to (nullable = current)
```

### 5.3 Пакеты услуг (С4)

**packages**
```
id, code (G-001-PAK-001) [immutable], name_ru, name_ro,
group_id FK, subgroup_id FK(PAK),
price_fixed (nullable), status (active/inactive),
created_at, created_by FK
```

**package_items**
```
id, package_id FK, service_id FK,
inclusion_type (required/by_prescription)
```

**package_prices** — аналог service_prices, с clinic_id

### 5.4 Workflow согласований

**change_requests**
```
id, title, status (draft/pending_cfd/pending_ceo/approved/rejected/revision),
author_id FK, created_at, updated_at, note
```

**change_request_items** — что именно меняется
```
id, request_id FK,
entity_type (service/package/service_price),
entity_id, field_name, old_value (json), new_value (json)
```

**request_comments**
```
id, request_id FK, author_id FK, text, created_at
```

**request_history** — лог переходов статусов
```
id, request_id FK, from_status, to_status,
actor_id FK, note, created_at
```

### 5.5 Audit & History

**entity_history** — история всех изменений сущностей (F34)
```
id, entity_type, entity_id, field_name,
old_value, new_value, changed_by FK, changed_at
```

**audit_log** — полный аудит действий (F35, только R1)
```
id, user_id FK, action, entity_type, entity_id,
ip, user_agent, created_at
```

### 5.6 Пользователи

**users**
```
id, email, password_hash (bcrypt), name, role (r1/r2/r3/r4),
is_active, last_login, created_at, created_by FK
```

**refresh_tokens**
```
id, user_id FK, token_hash, expires_at, revoked
```

---

## 6. API — эндпоинты FastAPI

### Auth
```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me
```

### Справочники
```
GET/POST/PATCH  /api/groups
GET/POST/PATCH  /api/subgroups
GET/POST/PATCH  /api/executors
GET/POST/PATCH  /api/locations
GET/POST/PATCH  /api/clinics
```

### Услуги
```
GET    /api/services              — список (фильтр: group, subgroup, status, search)
POST   /api/services              — создать черновик (R1 direct, R3 → request)
GET    /api/services/{id}
PATCH  /api/services/{id}         — R1 direct / R3 → request
GET    /api/services/{id}/history
```

### Пакеты
```
GET/POST        /api/packages
GET/PATCH       /api/packages/{id}
GET             /api/packages/{id}/history
```

### Заявки на изменение
```
GET    /api/requests              — список (фильтр: status, author)
POST   /api/requests              — создать (R3)
GET    /api/requests/{id}
PATCH  /api/requests/{id}/submit  — отправить на согласование (R3)
PATCH  /api/requests/{id}/approve — согласовать (R2 → R1, R1 → apply)
PATCH  /api/requests/{id}/reject  — вернуть на доработку (R2/R1)
POST   /api/requests/{id}/comments
```

### Пользователи (только R1)
```
GET/POST        /api/users
GET/PATCH       /api/users/{id}
PATCH           /api/users/{id}/deactivate
```

### Аудит (только R1)
```
GET    /api/audit?user=&action=&date_from=&date_to=
```

---

## 7. Фронтенд — страницы

```
/login                     — форма входа
/dashboard                 — дашборд заявок (R1/R2/R3) / просмотр услуг (R4)
/services                  — каталог услуг
/services/:id              — карточка услуги + история изменений
/packages                  — каталог пакетов
/packages/:id              — карточка пакета
/requests                  — список заявок (R1/R2/R3)
/requests/:id              — детали заявки + комментарии + timeline
/requests/new              — создание заявки (R3)
/directories               — управление справочниками (R1/R3)
/clinics                   — управление клиниками (R1)
/users                     — управление пользователями (R1)
/audit                     — аудит действий (R1)
/profile                   — личный кабинет
```

**Уведомления (F37):** badge в навбаре — количество заявок, ожидающих действия от текущего пользователя.

---

## 8. Email-уведомления

Отправляются через отдельный **mailer**-контейнер (FastAPI + SMTP).

| Событие | Получатели |
|---|---|
| Новая заявка от R3 | R2 |
| Заявка согласована R2 | R1 |
| Заявка возвращена R2 | R3 |
| Заявка утверждена R1 | R3, R2 |
| Заявка возвращена R1 | R2 или R3 (по выбору R1) |
| Новый комментарий | Автор заявки + все кто уже комментировал/согласовывал |
| Health check alert | filippov.ao@phystech.edu |

**SMTP:** хост/порт/логин — из `.env` (TLS)

---

## 9. Фазы разработки

### Фаза 1 — Инфраструктура и Auth (1-2 дня)
- [ ] Структура репозитория (`backend/`, `frontend/`, `docker/`)
- [ ] `docker-compose.yml` (db, backend, frontend, mailer, nginx)
- [ ] Alembic + начальная миграция (все таблицы)
- [ ] Seed-данные: группы, подгруппы, исполнители, места, клиники, пользователи (4 роли)
- [ ] JWT Auth: login, refresh, logout, me
- [ ] Middleware: RBAC, rate limiting, CSRF, audit logging

### Фаза 2 — Каталог услуг (2-3 дня)
- [ ] CRUD API для услуг и справочников
- [ ] Импорт 551 услуги из `source.xlsx` (seed-скрипт)
- [ ] Страницы `/services`, `/services/:id`, `/directories`
- [ ] Фильтрация/поиск по каталогу
- [ ] Цены по клиникам (service_prices)

### Фаза 3 — Пакеты услуг (1 день)
- [ ] CRUD API для пакетов
- [ ] Автоматический расчёт цены пакета = Σ услуг
- [ ] Страницы `/packages`, `/packages/:id`

### Фаза 4 — Workflow согласований (2-3 дня)
- [ ] API заявок: создание, отправка, согласование, возврат
- [ ] Статусная машина: draft → pending_cfd → pending_ceo → approved/rejected/revision
- [ ] Применение изменений при утверждении R1
- [ ] History tracking при каждом изменении
- [ ] Страницы `/requests`, `/requests/:id`, `/requests/new`
- [ ] Dashboard с фильтрами

### Фаза 5 — Уведомления и Аудит (1-2 дня)
- [ ] Mailer-сервис (email templates)
- [ ] Background tasks для отправки уведомлений
- [ ] Health check → email
- [ ] Audit log API + страница `/audit`
- [ ] Badge-уведомления (polling или WebSocket)

### Фаза 6 — Пользователи и безопасность (1 день)
- [ ] CRUD пользователей (только R1)
- [ ] Страница `/users`
- [ ] OWASP: input validation, bcrypt, no JWT in git, rate limit, secure headers

### Фаза 7 — Мониторинг (после деплоя)
- [ ] Grafana + Fluent Bit настройка
- [ ] Dashboard активности пользователей
- [ ] Маршрут `/bi` только для R1
- [ ] SSL (cert из `C:\...\cert`)

---

## 10. Seed-данные

Источник: `C:\Users\nina_\OneDrive\Рабочий стол\Projects\mikof\source.xlsx` (551 услуга)

Seed-скрипт (`backend/scripts/seed.py`):
1. Загружает xlsx через `openpyxl`
2. Парсит код → группа + подгруппа
3. Вставляет в `service_groups`, `service_subgroups`, `services`
4. Устанавливает базовые цены (клиника Кишинёв = основной прейскурант)

---

## 11. Переменные окружения (.env, не в git)

```env
DATABASE_URL=postgresql+asyncpg://mikof:***@db:5432/mikofai
SECRET_KEY=***
SMTP_HOST=***
SMTP_PORT=***
SMTP_LOGIN=***
SMTP_PASSWORD=***
ADMIN_EMAIL=***
ADMIN_PASSWORD=***
SEED_PASSWORD=***
GRAFANA_ADMIN_USER=***
GRAFANA_ADMIN_PASSWORD=***
```

---

## 12. Структура репозитория

```
mikof-price/
├── backend/
│   ├── app/
│   │   ├── api/          — роутеры FastAPI
│   │   ├── models/       — SQLAlchemy ORM
│   │   ├── schemas/      — Pydantic schemas
│   │   ├── services/     — бизнес-логика
│   │   ├── auth/         — JWT + RBAC
│   │   └── core/         — config, db, deps
│   ├── alembic/          — миграции
│   ├── scripts/          — seed, backup
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api/          — TanStack Query hooks
│   │   └── lib/          — utils, zod schemas
│   └── Dockerfile
├── docker/
│   ├── nginx/
│   ├── mailer/
│   ├── grafana/
│   └── fluent-bit/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── diagrams/
├── IMPLEMENTATION_PLAN.md
└── tz_text.txt
```

---

## 13. Ограничения и особенности реализации

| # | Ограничение | Реализация |
|---|---|---|
| О1 | Услуги не удаляются | Поле `status`, нет DELETE endpoint |
| О2 | Полная история изменений | Таблица `entity_history`, триггер/ORM event |
| О4 | Группы-подгруппы M2M | Таблица `service_group_subgroup` |
| О5 | Цена по клиникам, MDL | Таблица `service_prices` с `clinic_id` |
| О6 | Цена пакета = Σ услуг | Computed field + fallback на `price_fixed` |
| Ф38 | Услуга на согласовании невидима для R4 | Фильтр `status != pending` для роли R4 |
| Ф32 | R1 меняет напрямую | Проверка роли: R1 → direct commit, иначе → change_request |

---

## 14. Что НЕ реализуется локально (до деплоя)

- HTTPS / SSL-сертификат
- Grafana + Fluent Bit (требует стабильного домена)
- Health check email alerts (нет внешнего SMTP-доступа с localhost)

Все три пункта будут реализованы после деплоя на `mikofai.ru`.
