# Проверки и доказательства

## Предыдущее финальное ревью

Источник — сохранённый [отчёт от 21.10.2026](../final-review.md). Он фиксирует
успешные typecheck, lint, npm test, production build и format:check; 14 unit-тестов
и 9 integration-тестов. Integration прошли на хосте и в backend-контейнере
на PostgreSQL с отдельными временными схемами. Сценарии включали два OS-процесса,
принудительное завершение, потерю владения, SQL rollback и восстановление.

В том же ревью подтверждены `docker compose up --build -d`, healthcheck PostgreSQL
и backend, frontend HTML/JS, nginx proxy, Swagger HTML/JS, шесть OpenAPI endpoints
и smoke. Это исторические проверки, а не утверждение, что полная пересборка
контейнеров выполнялась при подготовке текущих документов.

### Первый живой импорт и повторение

В ревью использовался отдельный Compose-проект с новыми volumes и портами
55433/3002/8081. После проверки временный стенд был удалён, основная БД сохранена.

| Проверка                    | Первый импорт | Повторный импорт |
| --------------------------- | ------------- | ---------------- |
| Status                      | SUCCESS       | SUCCESS          |
| Received                    | 1280          | 1280             |
| Inserted                    | 480           | 0                |
| Updated                     | 0             | 0                |
| Skipped                     | 800           | 1280             |
| Наблюдений после завершения | 480           | 480              |

Дубли по `(region, period, metric)` отсутствуют. В БД регион представлен `regionId`.
Счётчики относятся к импортным строкам, а не к числу пользователей, клиентов банка
или физических кредитов, выданных приложением. Raw включает валютные колонки;
480 — количество сохранённых значений метрик.

Первичный импорт в новую пустую БД в ходе подготовки этого комплекта не повторяли.
Его основание — сохранённое ревью, а не вновь созданный скриншот или сырой лог.

## Повторная проверка при подготовке комплекта · 21.10.2026

Команды выполнялись из текущей папки на Node.js 24.13.0, npm 11.6.2.
Исходники `src/`, `frontend/src/`, Prisma-модели и подтверждённые ID не изменялись.
Логи команд сохранены как UTF-8 в `docs/competition/evidence/`.

| Команда / проверка                       | Фактический результат                                               | Доказательство                         |
| ---------------------------------------- | ------------------------------------------------------------------- | -------------------------------------- |
| npm run typecheck                        | Exit 0                                                              | [Лог](evidence/typecheck.txt)          |
| npm run lint                             | Exit 0                                                              | [Лог](evidence/lint.txt)               |
| npm test                                 | 14 passed, 0 failed                                                 | [Лог](evidence/unit.txt)               |
| npm run test:integration                 | 9 passed, 0 failed                                                  | [Лог](evidence/integration.txt)        |
| npm run build                            | TypeScript + frontend production build, exit 0                      | [Лог](evidence/build.txt)              |
| npm run format:check                     | Exit 0, все поддерживаемые файлы отформатированы                    | [Лог](evidence/format-check.txt)       |
| npm run smoke -- --sync                  | SUCCESS, конкурентный POST вернул 409                               | [Лог](evidence/smoke.txt)              |
| docker compose ps                        | Три сервиса running, backend и PostgreSQL healthy                   | [Состояние](evidence/compose.txt)      |
| SELECT count и GROUP BY HAVING count > 1 | 480 наблюдений, 0 групп дублей                                      | [SQL-результат](evidence/database.txt) |
| GET /docs и Swagger JS                   | Результаты HTTP-проверки в manifest                                 | [HTTP](evidence/http.json)             |
| node scripts/verify-competition.mjs      | Проверка структуры, ссылок, 9 слайдов, ≥25 ответов и Mermaid source | [Лог](evidence/documents.txt)          |

В текущем живом smoke повторный импорт вернул Received=1280, Inserted=0,
Updated=0, Skipped=1280, status=SUCCESS. SyncLog ID:
`cmvijyv4q000amw01dahvyewt`. Завершение — 21.10.2026 23:16:48 по Москве
(`2026-10-21T20:16:48.372Z`). После него SQL подтвердил 480 записей и отсутствие дублей.

Integration создаёт отдельные схемы `review_<uuid>`, применяет миграции и удаляет
только свои схемы. Это изолирует тестовые записи от прикладной схемы, но не означает
новый отдельный PostgreSQL-сервер в этом прогоне. Существующий helper запускает
отдельные OS-процессы и проверяет SIGKILL/recovery автоматически.

Полная пересборка образов Compose и первичный импорт в пустой volume при этой
документальной подготовке не запускались. Контейнерный стенд уже работал.
Production build проверен локально. HTTP smoke относится к запущенному стенду.

## Воспроизведение

```powershell
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run format:check
docker compose ps
npm run smoke -- --sync
node scripts/verify-competition.mjs
powershell -NoProfile -File scripts/package-competition.ps1
```

Для integration нужен доступный PostgreSQL и DATABASE_URL, как описано в
[README](../../README.md). Для smoke нужен уже запущенный стек с импортированными
данными на `http://localhost:8080`. Флаг `--sync` реально вызывает источник ЦБ
и записывает новый SyncLog. Он не является dry run.

## Границы проверки

Build и HTTP smoke не доказывают визуальную корректность dashboard. Browser E2E
отсутствуют. Скриншот работающего dashboard получен 25.10.2026. Проверка Mermaid подтверждает наличие
и согласованность source, но не рендеринг. Проверка ZIP подтверждает состав,
контрольные суммы и исключения, но не заменяет запуск на чистой машине.
Метрики покрытия тестами в процентах и нагрузочная производительность не измерялись.
