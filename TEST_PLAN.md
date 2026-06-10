# Тест-план mikof-price (автотесты)

Документ описывает регрессионный набор, который должен оставаться «зелёным», чтобы текущая функциональность сохранялась. Состоит из двух слоёв:

- **API / интеграционные** — `pytest` + `httpx` (`tests/api/`). Быстрые, без браузера, проверяют бэкенд и бизнес-логику.
- **E2E / UI** — `@playwright/test` (`tests/e2e/`). Проверяют интерфейс и роли в браузере.

Фактический ручной прогон (Playwright MCP) зафиксирован в [`TEST_PLAN_RESULTS.md`](TEST_PLAN_RESULTS.md).

---

## Предусловия

1. Поднят стек: `docker compose up -d --build` (см. [README](README.md)).
2. БД наполнена сидом (происходит автоматически при старте backend).
3. Заданы переменные окружения с учётными данными (тесты их читают, **в коде паролей нет**):

```powershell
$env:ADMIN_EMAIL    = "<email администратора>"
$env:ADMIN_PASSWORD = "<ADMIN_PASSWORD из .env>"
$env:SEED_PASSWORD  = "<SEED_PASSWORD из .env>"
```

---

## Запуск API-тестов

```powershell
python -m pip install -r tests/requirements-dev.txt
python -m pytest tests/api -v
```

## Запуск E2E-тестов

```powershell
cd tests/e2e
npm install
npx playwright install chromium
npx playwright test            # baseURL = http://localhost:5173
```

Если `ADMIN_PASSWORD` не задан, тесты помечаются как `skipped` (а не падают).

---

## Покрытие (регрессионный набор)

| ID | Файл / тест | Проверяет | Связь с ТЗ / замечанием |
|----|-------------|-----------|--------------------------|
| AUTH-01 | `test_auth_bad_password_rejected` | Неверный пароль → 401 | Н2 |
| RBAC-01 | `test_rbac_r3_cannot_patch_service` | R3 не правит услугу напрямую → 403 | Ф32 |
| RBAC-02 | `test_rbac_r1_can_patch_service` | R1 правит услугу напрямую → 200 | Ф32 |
| RBAC-03 | `test_rbac_r4_cannot_list_requests` | R4 нет доступа к заявкам | Ф38 |
| WF-01 | `test_workflow_r3_request_full_cycle` | R3 → submit → R2 approve → R1 approve → применено | Ф4–Ф8 |
| HIST-01 | `test_history_has_author_name` | История услуги содержит ФИО автора | Ф34, зам.1 |
| AUDIT-01 | `test_audit_has_user_name` | Аудит возвращает ФИО пользователя | Ф35, зам.12 |
| USER-01 | `test_user_password_reset` | R1 сбрасывает пароль, вход новым паролем работает | Ф36, зам.11 |
| DIR-01 | `test_directory_archive_blocked_when_used` | Архивация справочника при связях блокируется (409) | зам.9 |
| SEED-01 | `test_seed_counts` | Корректность сид-данных (≥10 групп, ≥20 подгрупп) | О3 |
| E2E-01 | `smoke.spec.ts › R1 видит все разделы` | Навигация + кнопка «Выйти» во всех разделах | зам.14 |
| E2E-02 | `smoke.spec.ts › Аудит ФИО/сортировка` | ФИО в аудите, дефолт-сортировка по времени, фильтры | зам.12, зам.13 |

---

## Критерии Pass/Fail

- **API**: HTTP 2xx и ожидаемые поля в ответе; запрещающие сценарии → 401/403/409.
- **E2E**: элемент виден, статус/значение корректны.
- Любое расхождение с таблицей выше — регрессия, блокирующая мердж.
