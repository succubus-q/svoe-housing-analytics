# Презентация

[Скачать PPTX](svoe-housing-competition.pptx) · [Скачать PDF](svoe-housing-competition.pdf) — одиннадцать слайдов формата 16:9.
Схемы и таблицы редактируются, у каждого слайда есть заметки докладчика.
Слайды 6 и 7 показывают два экрана работающего dashboard.

- [Содержание и заметки](../../../docs/competition/presentation-content.md).
- [План выступления](../../../docs/competition/presentation-outline.md).
- [Речь](../../../docs/competition/defense-script.md).
- [Спецификация слайдов](deck-spec.json).

Редактируемый PPTX — основной файл презентации. Спецификация содержит структуру
и заметки. Экспорт использует PPTX напрямую, сохраняя шрифты, размеры и расположение объектов.
Для повторного экспорта требуется Microsoft PowerPoint:

```powershell
powershell -NoProfile -File scripts/build-competition-presentation.ps1
```

Команда создаёт PPTX, PDF и PNG-превью в `.work/presentation/`.
