# «Своё Жильё»: ипотечная аналитика

Конкурсный MVP для автоматического сбора статистики Банка России и будущего раздела
«Аналитика» портала «Своё Жильё».

**Реализованы этапы 1–8:** исследование API, проверенный каталог, Fastify backend,
Prisma/PostgreSQL и миграция, адаптер, идемпотентный импорт, аналитика, React dashboard,
Swagger и Docker Compose.

![Ипотечная аналитика](assets/competition/screenshots/01-dashboard-rf.png)

## Competition materials

Комплект конкурсной подачи и защиты находится в [docs/competition](docs/competition/README.md).

- [Architecture](docs/competition/architecture.md) — модули, поток данных и Mermaid-диаграммы.
- [Testing](docs/competition/testing.md) — подтверждённые результаты и повторные проверки.
- [Presentation](docs/competition/presentation-content.md) — девять слайдов и заметки докладчика.
- [Submission checklist](docs/competition/submission-checklist.md) — состав поставки и проверки.

## Быстрый запуск всего MVP

Требуется запущенный Docker Desktop/Engine с Compose. Из корня проекта:

```powershell
docker compose up --build
```

Работает без `.env`: backend ждёт PostgreSQL, применяет миграцию и начинает загрузку
реальных данных ЦБ. Для фонового запуска добавьте `-d`. Во время первого импорта
интерфейс может показывать пустое состояние; после завершения обновите страницу.

| Компонент                     | Адрес                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Dashboard                     | [http://localhost:8080](http://localhost:8080)                               |
| Backend API                   | [http://localhost:3001/api/v1/regions](http://localhost:3001/api/v1/regions) |
| Swagger                       | [http://localhost:3001/docs](http://localhost:3001/docs)                     |
| OpenAPI JSON                  | [http://localhost:3001/docs/json](http://localhost:3001/docs/json)           |
| Health / PostgreSQL readiness | [http://localhost:3001/health](http://localhost:3001/health)                 |
| PostgreSQL                    | `localhost:55432`, база/пользователь `housing`, пароль `housing_local`       |

Compose запускает `postgres`, `backend` и `frontend` (nginx). Порты привязаны к loopback.
Данные сохраняются в volume `postgres_data`, raw синхронизации — в `cbr_raw`.
`docker compose down` останавливает сервисы с сохранением volumes.

```powershell
docker compose ps
docker compose logs --tail 60 backend
```

## Локальная разработка

Node.js 24.13+, `.env` из примера; предварительно освободите порт 3001, если работает
контейнер backend (`docker compose stop backend frontend`).

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run prisma:generate
docker compose up -d postgres
npm.cmd run prisma:migrate
npm.cmd run dev
```

Во втором терминале `npm.cmd run dev:frontend`. Vite доступен на
[http://localhost:5173](http://localhost:5173) и проксирует API на 3001.
На Linux/macOS используйте `npm` и `cp` вместо Windows-команд.

## Запуск этапа 1

Требуется Node.js **24.13+**. TypeScript запускается встроенными средствами Node.js;
для самого CLI сторонние runtime-зависимости не требуются.

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run inspect:cbr -- --help
```

На Linux/macOS используются `npm` вместо `npm.cmd` и `cp .env.example .env`.
Без `.env` действуют безопасные значения по умолчанию; Node.js выводит уведомление
об отсутствии файла. Сетевой доступ к `https://www.cbr.ru` обязателен.

Вывести весь каталог публикаций:

```powershell
npm.cmd run inspect:cbr
```

Найти ипотечную публикацию и вывести её показатели:

```powershell
npm.cmd run inspect:cbr -- --search ипотеч --extended
```

Пройти всю цепочку по названиям, получить количество кредитов в РФ за последний
доступный год и сохранить `data/raw-cbr-response.json`:

```powershell
npm.cmd run inspect:cbr -- --search ипотеч --dataset-search "Количество кредитов" --measure-search "Российская Федерация" --extended
```

Выбрать проверенные на этапе исследования ID и ограничить годы:

```powershell
npm.cmd run inspect:cbr -- --publication 21 --dataset 45 --measure 22 --from 2025 --to 2026
```

Проверить ставку по РФ, у которой `type=2` и разрез не передаётся:

```powershell
npm.cmd run inspect:cbr -- --publication 14 --dataset 29 --extended --output data/samples/mortgage-rate.json
```

Проверить ставку в Москве:

```powershell
npm.cmd run inspect:cbr -- --publication 15 --dataset 34 --measure 41 --extended --output data/samples/mortgage-rate-moscow.json
```

Каждый запуск заново получает справочники. Введённый ID проверяется на принадлежность
выбранной публикации/показателю. При нескольких совпадениях поиска произвольный ID
не выбирается: CLI печатает варианты и останавливается на каталоге.
`--extended` дополнительно получает `datasetsEx` и методологию `DatasetDescription`.

## Настройки

| Переменная       | По умолчанию                      | Назначение                                          |
| ---------------- | --------------------------------- | --------------------------------------------------- |
| `CBR_BASE_URL`   | `https://www.cbr.ru/dataservice/` | Базовый HTTPS URL без credentials, query и fragment |
| `CBR_TIMEOUT_MS` | `20000`                           | Таймаут одной попытки, включая чтение тела ответа   |
| `CBR_RETRIES`    | `2`                               | Число повторов после первой попытки, от 0 до 5      |

Повторяются сетевые ошибки, таймауты, HTTP 408/429/5xx. Используется экспоненциальная
задержка с учётом `Retry-After`, максимум 30 секунд. Другие 4xx и невалидный JSON
не повторяются. TLS-проверка включена. Заголовки и переменные окружения в HTTP-логи
не выводятся.

## Артефакты исследования

- `scripts/inspect-cbr-api.ts` — CLI: поиск, проверка ID, последовательность запросов,
  валидация внешнего контракта и отчёт.
- `src/modules/cbr/cbr.client.ts` — HTTP-клиент, таймауты, retries и callback аудита.
- `src/modules/cbr/cbr.types.ts` — внешний контракт ЦБ и runtime-проверки.
- `src/common/atomic-file.ts` — атомарная запись с обработкой кратковременных блокировок Windows/OneDrive.
- `data/raw-cbr-response.json` — точный текст последнего успешно проверенного `/data`
  при использовании пути по умолчанию; без обёртки и преобразований.
- `data/inspections/<runId>/` — все тела HTTP-ответов каждого нового запуска, включая
  промежуточные/ошибочные, и `manifest.json` с параметрами, статусами, длительностью и путями.
- `data/last-inspection.json` — итог последнего запуска, в том числе неудачного.
- `data/samples/` — зафиксированные реальные примеры от 20.10.2026; `provenance.json`
  содержит параметры получения, количество строк и SHA-256 файлов.
- `data/evidence/` — сохранённые исходные справочники, методологии, ответы `/data` и
  переносимые журналы семи успешных проверок.
- [docs/cbr-api-research.md](docs/cbr-api-research.md) — результаты и ограничения исследования.

Пути в обычных runtime-манифестах абсолютные. В зафиксированных `data/evidence/`
`requests[].bodyFile` отсчитывается от каталога конкретного манифеста.
Автоматические runtime-артефакты исключены из Git; зафиксированные evidence и samples
можно версионировать. При ошибке существующий успешный raw-файл не затирается:
актуальный исход запуска определяется по `last-inspection.json`, а не наличию raw-файла.
HTTP-ответ с пустым `RawData` явно отмечается как `EMPTY_DATA`; он не подтверждает наличие
наблюдений. `CATALOG_ONLY` означает успешное исследование справочников без запроса данных.

## Проверки

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
```

Тесты работают без интернета: проверяются retries, сохранение ответов, ограничение
числа попыток, таймаут тела ответа, ошибки архива, выбор ID, внешние контракты и реальные
зафиксированные данные. Подменённые HTTP-ответы используются только в тестах клиента.
Дополнительно сам CLI проверен живыми запросами к официальному API ЦБ.

## Настройки backend и синхронизации

Дополнительные переменные `.env`:

| Переменная          | По умолчанию             | Назначение                                                    |
| ------------------- | ------------------------ | ------------------------------------------------------------- |
| `DATABASE_URL`      | см. `.env.example`       | Локальное подключение Prisma к PostgreSQL                     |
| `POSTGRES_PASSWORD` | `housing_local`          | Пароль БД Compose; специальные символы в URL нужно кодировать |
| `HOST`, `PORT`      | `127.0.0.1`, `3001`      | Backend на хосте; Compose использует внутри `0.0.0.0:3001`    |
| `CBR_REGIONS`       | `22,41,33,54`            | ID ЦБ: РФ, Москва, Московская область, Санкт-Петербург        |
| `CBR_FROM_YEAR`     | `2025`                   | Начало истории, конец определяется `/years`                   |
| `SYNC_ON_START`     | `true` в Compose/примере | Получать данные при запуске                                   |
| `SYNC_ENABLED`      | `true`                   | Ежедневная проверка обновлений                                |
| `SYNC_UTC_HOUR`     | `5`                      | 05:00 UTC / 08:00 по Москве                                   |

Compose формирует `DATABASE_URL` с внутренним хостом `postgres`; значение из `.env`
используется локальным Node.js. Изменение `POSTGRES_PASSWORD` не меняет пароль
роли уже созданной БД: его нужно обновить отдельно.

Кнопка dashboard и API запускают один pipeline:

```powershell
Invoke-RestMethod -Method Post http://localhost:3001/api/v1/sync/run
Invoke-RestMethod http://localhost:3001/api/v1/sync/status
```

POST ждёт завершения. HTTP 409 — другой запуск уже выполняется; HTTP 502 — полный сбой.
Синхронизация использует `RUNNING` как сохраняемое в PostgreSQL владение запуском:
срок 60 секунд, heartbeat каждые 10 секунд, время берётся у PostgreSQL.
Короткая транзакция создаёт лог и восстанавливает просроченные запуски. **HTTP и
нормализация выполняются вне транзакции**. Затем короткая транзакция (лимит 30 секунд)
проверяет актуальность владения, блокирует строку лога, выполняет upsert и атомарно
завершает лог. Все её операции используют один `TransactionClient`.

Короткий advisory lock защищает переходы владения и фазу записи; частичный уникальный
индекс допускает только один `RUNNING`. Ручной запуск, scheduler и разные процессы
используют одинаковый механизм. Просроченный владелец не может записать данные после
перехвата другим процессом. Истечение срока во время уже начатой записи не открывает
параллельный импорт: блокировки удерживаются до её commit/rollback.

Сбой отдельного ряда даёт `PARTIAL` и список `issues`. Ошибка HTTP завершает лог как
`FAILED`. Ошибка записи БД откатывает данные; отдельная короткая транзакция фиксирует
`FAILED` с нулевыми вставками/изменениями. При полном отключении БД немедленно записать
лог невозможно: сохраняются обе причины ошибки, а следующий запуск после истечения
владения восстанавливает `RUNNING` в `FAILED`. При аварии процесса восстановление также
происходит при следующем запуске после истечения срока (до 60 секунд после heartbeat).
Миграция `202610210001_sync_lease` обязательна; старые backend нужно остановить перед
её применением. Обычный Compose делает это при пересоздании контейнера.

Импорт делает upsert по `(regionId, period, metric)`. Неизменившиеся строки пропускаются;
изменение метаданных источника тоже считается обновлением. `recordsReceived` включает
все валютные строки; `recordsSkipped` — другие валюты, невалидные и неизменившиеся записи.
При корректно полученных ответах `Received = Inserted + Updated + Skipped`.
Вся настроенная история запрашивается повторно для учёта ревизий ЦБ.
Raw каждого запуска сохраняется в `data/sync-raw/` / volume `cbr_raw`.

## Данные и аналитические API

Все шесть показателей используют только рублёвый столбец 36. Объём и задолженность
из млн руб. переводятся в рубли × 1 000 000. Срок хранится в месяцах; карточка UI
показывает годы. Регионы имеют собственное пространство кодов `CBR-22`, `CBR-41`,
а не ISO/ОКАТО. Текущий справочник метрик: `src/modules/cbr/cbr.catalog.ts`.

Для выдач «Январь 2026» источник возвращает `date=2026-02-01`. Mapper проверяет
согласованность даты с `dt` и сохраняет `period=2026-01-01`. Остатки на 1 февраля
относятся к концу января, а исходная дата сохраняется в `sourcePeriodDate`.
Неверные даты/единицы, NaN/null, отрицательные значения и неизвестные разрезы не импортируются.
Нулевая ставка/срок не выдаётся за реальную среднюю величину.

| Метод | Endpoint                   | Параметры                                                       |
| ----- | -------------------------- | --------------------------------------------------------------- |
| GET   | `/api/v1/regions`          | Регионы с импортированными наблюдениями                         |
| GET   | `/api/v1/mortgage/stats`   | `region`, `from`, `to`; опционально `metric`                    |
| GET   | `/api/v1/mortgage/summary` | `region`; `period` опционален, по умолчанию последний доступный |
| GET   | `/api/v1/sync/status`      | Результат и счётчики последнего запуска                         |
| POST  | `/api/v1/sync/run`         | Без body; запуск импорта                                        |
| GET   | `/health`                  | Readiness приложения и PostgreSQL; 200/503                      |

Месяцы — `YYYY-MM`, регионы — коды из `/regions`. Максимальный диапазон stats — 25 лет.
Summary возвращает шесть метрик `value/unit/mom/yoy`, `averageLoanSize`,
`availablePeriods`, валюту и дату обновления источника. Формулы:

```text
averageLoanSize = mortgageVolumeRubles / mortgageCount
MoM = (current - previousMonth) / previousMonth × 100
YoY = (current - sameMonthPreviousYear) / sameMonthPreviousYear × 100
```

Отсутствует база сравнения или она нулевая → `null`, а не NaN/Infinity.
Для ставки MoM/YoY — относительные проценты, не процентные пункты.

## Архитектура и структура БД

```text
React/Vite → nginx → Fastify REST
                       ├─ MortgageService → Prisma → PostgreSQL
                       └─ SyncService → MortgageDataSource → CbrApiDataSource → API ЦБ
                             └─ MortgageRepository → Prisma → PostgreSQL
```

`cbr` изолирует внешний формат; интерфейс `MortgageDataSource` допускает будущий
XLSX-адаптер. Модули `sync`, `mortgage`, `analytics` разделяют импорт, хранение/API
и расчёты. Runtime-зависимости: Fastify 5, Prisma 6; frontend — React 19/Vite 7.
Транзитивные зависимости зафиксированы с исправлениями; `npm audit` дал 0 уязвимостей.

Схема `prisma/schema.prisma`, миграция `prisma/migrations/`:

- `Region`: уникальные code/sourceId, название, код родителя.
- `MortgageObservation`: регион, месяц, enum-метрика, `Decimal(24,6)`, единица,
  источник и его ID, исходная дата, время обновления/импорта/создания/изменения.
  Уникальность `(regionId, period, metric)`.
- `SyncLog`: начало/окончание, статус, четыре счётчика, errorMessage и JSON issues.

## Дополнительные проверки и демонстрация

```powershell
npm.cmd run build
# При работающем PostgreSQL (не зависит от первичного импорта и доступности ЦБ):
npm.cmd run test:integration
# Или в Compose:
docker compose exec backend npm run test:integration
npm.cmd run smoke
# Дополнительно: живой sync и проверка параллельного 409
npm.cmd run smoke -- --sync
```

Unit-тесты включают mapper, MoM/YoY и средний кредит. Интеграционные тесты создают
изолированные временные схемы в настоящем PostgreSQL и удаляют только эти схемы:
upsert insert/skip/update, API, OpenAPI, HTTP/SQL-сбои, rollback, статусы лога,
heartbeat, перехват просроченного запуска, два отдельных OS-процесса и `SIGKILL`.
Они используют сохранённые реальные fixtures; данные приложения не меняются.

Живой импорт подтвердил 480 наблюдений: четыре региона, шесть показателей,
январь 2025 — август 2026. Второй запуск дал 0 вставок и 0 изменений; число строк
осталось 480. При новых публикациях ЦБ диапазон и числа будут меняться.

Сценарий демо: выберите регион и месяц, сравните карточки/графики, скачайте CSV,
запустите обновление и проверьте счётчики в Swagger.

## Ограничения и развитие

По умолчанию импортируются четыре проверенных разреза. Все 96 разрезов и вся глубина
истории не проверены. SLA и гарантированный график ЦБ не установлены. При сбое источника
остаются сохранённые данные и явный статус ошибки.
XLSX fallback не понадобился и не реализован. Банковский сектор вне шести ипотечных
показателей — дальнейшее расширение.

Браузер для визуальной QA в этой сессии недоступен: проверены сборка, TypeScript,
HTTP и интеграции; скриншоты и браузерные клики не проверены. Перед конкурсом
проверьте внешний вид и CSV в своём браузере.
Compose предназначен для локальной демонстрации. Для публичного размещения нужны
авторизация sync, TLS, rate limiting, резервные копии и ограничение хранения raw.
Дальнейшее развитие: XLSX-адаптер, регионы, отслеживание ревизий, progress API и UI-тесты.

## Архив конкурсной сдачи

```powershell
& .\scripts\package-submission.ps1
```

Создаёт `release/svoe-housing-mvp.zip` по явному списку исходников и проверяет его
содержимое. Включены `package-lock.json`, `.env.example`, миграции, тесты и проверенные
`data/samples`/`data/evidence`. Исключены `node_modules`, `.env*` (кроме примера),
runtime raw dumps, логи, build output, caches, `.git` и локальные архивы.
SHA-256 lockfile в ZIP сверяется с исходным. `.gitignore` и `.gitattributes`
задают аналогичные исключения для Git и `git archive`. Сам проект пока не инициализирован
как Git-репозиторий, поэтому отслеживаемых Git-файлов здесь нет.
