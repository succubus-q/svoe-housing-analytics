# Состав поставки

Проект включает backend на Fastify, React dashboard, Prisma-модель и миграции,
Docker Compose, тесты, сохранённые ответы ЦБ и конкурсные материалы.

| Материал             | Путь                                                          |
| -------------------- | ------------------------------------------------------------- |
| Документация         | docs/competition/README.md                                    |
| Презентация PPTX     | assets/competition/presentation/svoe-housing-competition.pptx |
| Версия PDF           | assets/competition/presentation/svoe-housing-competition.pdf  |
| Скриншот интерфейса  | assets/competition/screenshots/01-dashboard-rf.png            |
| Диаграммы            | assets/competition/diagrams/                                  |
| Спецификация слайдов | assets/competition/presentation/deck-spec.json                |
| Проверки             | docs/competition/testing.md                                   |
| Исходный ZIP         | artifacts/competition/svoe-housing-competition-source.zip     |

Архив и отдельные тексты выступления формируются командой:

```powershell
powershell -NoProfile -File scripts/package-competition.ps1
```

Упаковщик проверяет состав, обязательные файлы, локальные ссылки и SHA-256.
Локальные настройки, зависимости, runtime-данные и кэши в поставку не входят.

Презентация содержит одиннадцать слайдов, заметки докладчика, редактируемые схемы
и таблицы. Слайды 6 и 7 показывают два экрана работающего dashboard. Каждый слайд проверен
по экспорту Microsoft PowerPoint.

Результаты первого и повторного импорта зафиксированы в [финальном ревью](../final-review.md).
Границы реализации и план промышленной эксплуатации — в [limitations](limitations.md).
