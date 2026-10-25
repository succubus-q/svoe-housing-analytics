# Карта исходных материалов

Основные файлы проекта и назначение модулей.

| Файлы                                                                                                                       | Что подтверждают                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [README](../../README.md)                                                                                                   | Запуск, настройка, endpoints, методология и сценарий демонстрации         |
| [Исследование](../cbr-api-research.md)                                                                                      | Проверенные 20.10.2026 ID, реальные ответы и методологические нюансы      |
| [Журнал реализации](../implementation.md)                                                                                   | Выполненные этапы MVP и исходный охват проверок                           |
| [Финальное ревью](../final-review.md)                                                                                       | Блокировки, отказы, 14/9 тестов, Compose, первичный и повторный импорт    |
| [Каталог](../../src/modules/cbr/cbr.catalog.ts)                                                                             | Шесть рабочих определений, RUB и множители                                |
| [Источник](../../src/modules/cbr/cbr.service.ts)                                                                            | Повторная проверка справочников, выбор лет, raw archive, сбор issues      |
| [HTTP-клиент](../../src/modules/cbr/cbr.client.ts)                                                                          | HTTPS, timeout, retries, Retry-After, запись попыток                      |
| [Mapper](../../src/modules/cbr/cbr.mapper.ts)                                                                               | Месяц, исходная дата, единицы, валюта и валидация                         |
| [SyncService](../../src/modules/sync/sync.service.ts)                                                                       | Claim, lease, heartbeat, owner check, атомарная запись, ошибки            |
| [Scheduler](../../src/modules/sync/sync.scheduler.ts)                                                                       | Ежедневный запуск в UTC и опциональный стартовый импорт                   |
| [Repository](../../src/modules/mortgage/mortgage.repository.ts)                                                             | Сравнение значений/метаданных и upsert                                    |
| [Аналитика](../../src/modules/mortgage/mortgage.service.ts)                                                                 | stats, summary, availablePeriods, MoM/YoY                                 |
| [Формулы](../../src/modules/analytics/analytics.service.ts)                                                                 | Средний кредит, относительное изменение, сдвиг месяца                     |
| [Prisma](../../prisma/schema.prisma) и [миграция lease](../../prisma/migrations/202610210001_sync_lease/migration.sql)      | Модели, уникальность наблюдений, один RUNNING                             |
| [Frontend](../../frontend/src/App.tsx)                                                                                      | Фильтры, карточки, графики, CSV, статус и ручной sync                     |
| [Compose](../../compose.yaml), [nginx](../../deploy/nginx.conf), [Dockerfile](../../Dockerfile)                             | Три сервиса, healthcheck, loopback-порты, proxy, завершение Node          |
| [Unit](../../tests/analytics.test.ts), [integration](../../tests/integration/sync.test.ts), [smoke](../../scripts/smoke.ts) | Проверяемые сценарии и реальные ограничения покрытия                      |
| [Samples provenance](../../data/samples/provenance.json), `data/evidence/*/manifest.json`                                   | Происхождение, запросы, SHA-256 и сохранённые ответы ЦБ                   |
| [Упаковщик](../../scripts/package-submission.ps1)                                                                           | Явный состав исходников, исключение runtime и секретов, проверка lockfile |

`node_modules`, `.env`, `.work`, `data/sync-raw`, `data/inspections` нужны локальной
работе или являются её результатом. В конкурсный ZIP они не включаются. Пароли и
содержимое локального `.env` не используются в конкурсных документах.
