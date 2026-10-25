# Контроль состава поставки

## Исходный код

- [x] Backend и frontend.
- [x] Prisma schema и миграции.
- [x] README, Dockerfile и Compose.
- [x] package-lock.json и .env.example.
- [x] Сохранённые образцы ответов и происхождение данных.
- [x] Локальные настройки, зависимости и runtime-данные исключены из публикации.

## Проверки

Результаты команд и даты прогонов приведены в [testing](testing.md).
Контролируются typecheck, lint, unit, integration, production build и format:check.
Smoke проверяет HTTP, API, nginx, синхронизацию и отказ конкурентному запуску.

## Материалы защиты

- [x] Девять слайдов в PPTX с заметками докладчика.
- [x] Скриншот работающего dashboard на слайде 6.
- [x] Речь и вопросы комиссии.
- [x] Архитектура, поток данных и Mermaid-диаграммы.
- [x] Интеграция, формулы, результаты импорта и ограничения.

## Архив

```powershell
powershell -NoProfile -File scripts/package-competition.ps1
```

Результат: `artifacts/competition/svoe-housing-competition-source.zip`,
manifest с размерами и SHA-256, отчёт проверки и отдельные тексты защиты.
Презентация хранится в `assets/competition/presentation/svoe-housing-competition.pptx`.
