# Mikofai — панель управления прейскурантом

Единая система учёта нормативно-справочной информации (НСИ) для сети офтальмологических клиник (Кишинёв, Тирасполь, Рыбница). Базовая валюта — MDL.

## Стек
- Backend: Python 3.12 · FastAPI · SQLAlchemy 2 (async) · Alembic · PostgreSQL 16
- Frontend: React 18 · Vite · TypeScript · TanStack Query
- Mailer: отдельный контейнер (SMTP/TLS)
- Оркестрация: docker-compose (`restart: always`, health checks)

## Архитектура (docker-compose)
| Сервис | Образ/сборка | Порт | Назначение |
|--------|--------------|------|------------|
| `db` | postgres:16-alpine | — | БД (том `pg_data`) |
| `backend` | `./backend` (FastAPI) | 8000 | API, авто-сид при старте |
| `frontend` | `./frontend` (Vite) | 5173 | SPA |
| `mailer` | `./mailer` (FastAPI) | 8001 | отправка email (SMTP/TLS) |

## Локальный запуск
```bash
cp .env.example .env   # заполнить значения (.env уже в .gitignore)
docker compose up --build
```
- Frontend: http://localhost:5173
- API / Swagger: http://localhost:8000/api/health · http://localhost:8000/docs

> **Секреты.** `ADMIN_PASSWORD` и `SEED_PASSWORD` — обязательные переменные в `.env`
> (без них backend не стартует). Реальные пароли/логины в репозиторий не коммитятся.

При старте backend автоматически создаёт таблицы и наполняет БД (`scripts/seed.py`):
справочники, ~509 услуг из `source.xlsx`, пакеты, цены по Кишинёву и 4 пользователя.

## Тестирование
Регрессионный набор и инструкции — в [`TEST_PLAN.md`](TEST_PLAN.md):
```bash
python -m pip install -r tests/requirements-dev.txt
python -m pytest tests/api -v            # API/интеграционные
cd tests/e2e && npm install && npx playwright test   # E2E (UI)
```

## Документация
- [`TEST_PLAN.md`](TEST_PLAN.md) — автотесты и как их запускать
- [`TEST_PLAN_RESULTS.md`](TEST_PLAN_RESULTS.md) — результаты ручного прогона
- [`GAP_ANALYSIS.md`](GAP_ANALYSIS.md) — соответствие ТЗ + доп. функции
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) — исходный план разработки

## Учётные записи (после seed)
| Роль | Email | Пароль |
|---|---|---|
| R1 Генеральный директор | `filippov.ao@phystech.edu` | `ADMIN_PASSWORD` из `.env` |
| R2 Финансовый директор | `cfo@mikofai.ru` | `SEED_PASSWORD` |
| R3 Медицинский директор | `med@mikofai.ru` | `SEED_PASSWORD` |
| R4 Персонал | `staff@mikofai.ru` | `SEED_PASSWORD` |

## Деплой (после подтверждения)
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
Добавляет nginx+SSL (`./cert`), Grafana под `/bi`, Loki + Fluent Bit, ежедневные бэкапы БД (хранение 30 дней).

## Соответствие ТЗ
- Локально не реализуются (до деплоя): HTTPS/SSL, Grafana+Fluent Bit, email-алерты health check — см. `docker-compose.prod.yml`.
- О1: услуги не удаляются (только статус). О2: история в `entity_history`. О4: M2M группа↔подгруппа. О5: цены по клиникам. О6: цена пакета = Σ услуг либо фиксированная.
