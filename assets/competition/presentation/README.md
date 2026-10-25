# Презентация

[Скачать PPTX](svoe-housing-competition.pptx) — девять слайдов формата 16:9.
Схемы и таблицы редактируются, у каждого слайда есть заметки докладчика.
Слайд 6 показывает скриншот работающего dashboard.

- [Содержание и заметки](../../../docs/competition/presentation-content.md).
- [План выступления](../../../docs/competition/presentation-outline.md).
- [Речь](../../../docs/competition/defense-script.md).
- [Спецификация слайдов](deck-spec.json).

Для повторной локальной сборки требуется Microsoft PowerPoint:

```powershell
powershell -NoProfile -File scripts/build-competition-presentation.ps1
```

Команда создаёт PPTX и PNG-превью в `.work/presentation/`.
