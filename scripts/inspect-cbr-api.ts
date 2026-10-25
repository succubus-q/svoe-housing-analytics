import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { CbrApiClient } from '../src/modules/cbr/cbr.client.ts';
import type { Attempt } from '../src/modules/cbr/cbr.client.ts';
import { atomicWrite } from '../src/common/atomic-file.ts';
import {
  parsePublications,
  parseDatasets,
  parseMeasures,
  parseYears,
  parseData,
  record,
  records,
} from '../src/modules/cbr/cbr.types.ts';

const help = `Исследование официального Data Service API Банка России (без импорта в БД).

npm run inspect:cbr -- [опции]
  --search TEXT             Поиск публикации по названию/пути (без учёта регистра)
  --publication ID          Выбор публикации; ID проверяется по publications
  --dataset ID              Выбор показателя из datasets выбранной публикации
  --dataset-search TEXT     Поиск показателя по name/full_name
  --measure ID              Разрез; ID проверяется по measures (только type=1)
  --measure-search TEXT     Поиск разреза по названию
  --from YEAR --to YEAR     Годы; по умолчанию последний доступный год из years
  --extended                Также сохранить datasetsEx и методологию показателя
  --output PATH             Сырой data JSON (по умолчанию data/raw-cbr-response.json)
  --help                    Справка

Без опций выводится каталог publications. Единственное совпадение поиска выбирается
автоматически. При неоднозначности выводится список без произвольного выбора ID.
CBR_BASE_URL, CBR_TIMEOUT_MS, CBR_RETRIES читаются из окружения/.env.
Все HTTP-ответы, включая ошибочные и промежуточные, сохраняются в data/inspections/.
`;

function numeric(value: string | undefined, label: string, fallback?: number): number | undefined {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${label}: требуется неотрицательное целое число`);
  }
  return Number(value);
}

export function choose<T extends { id: number }>(
  items: T[],
  id: number | undefined,
  search: string | undefined,
  label: (item: T) => string,
  kind: string,
): T | undefined {
  const needle = search?.trim().toLocaleLowerCase('ru');
  if (search !== undefined && !needle) throw new Error(`${kind}: строка поиска пуста`);
  const matches = items.filter(
    (item) =>
      (id === undefined || item.id === id) &&
      (needle === undefined || label(item).toLocaleLowerCase('ru').includes(needle)),
  );
  if (id !== undefined && matches.length !== 1) {
    throw new Error(
      `${kind}: ID ${id} отсутствует в полученном каталоге или не совпадает с поиском`,
    );
  }
  if (id === undefined && search === undefined) return undefined;
  if (matches.length === 1) return matches[0];
  console.log(`${kind}: совпадений ${matches.length}. Уточните поиск или укажите ID.`);
  return undefined;
}

export async function main(args = process.argv.slice(2)) {
  const { values: options } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      search: { type: 'string' },
      publication: { type: 'string' },
      dataset: { type: 'string' },
      'dataset-search': { type: 'string' },
      measure: { type: 'string' },
      'measure-search': { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      extended: { type: 'boolean', default: false },
      output: { type: 'string', default: 'data/raw-cbr-response.json' },
      help: { type: 'boolean', default: false },
    },
  });
  if (options.help) {
    console.log(help);
    return;
  }
  const publicationId = numeric(options.publication, '--publication');
  const datasetId = numeric(options.dataset, '--dataset');
  const measureId = numeric(options.measure, '--measure');
  const fromOption = numeric(options.from, '--from');
  const toOption = numeric(options.to, '--to');
  if ((fromOption !== undefined && fromOption < 1) || (toOption !== undefined && toOption < 1)) {
    throw new Error('Год должен быть положительным');
  }
  const baseUrl = process.env.CBR_BASE_URL ?? 'https://www.cbr.ru/dataservice/';
  const runId =
    new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-') + `-${process.pid}`;
  const runDir = resolve('data/inspections', runId);
  const manifest: Record<string, unknown> = {
    runId,
    startedAt: new Date().toISOString(),
    status: 'RUNNING',
    source: 'LIVE_CBR_API',
    baseUrl,
    requests: [] as unknown[],
  };
  let requestNumber = 0;
  let lastDataBody: string | undefined;
  const client = new CbrApiClient({
    baseUrl,
    timeoutMs: numeric(process.env.CBR_TIMEOUT_MS, 'CBR_TIMEOUT_MS', 20_000)!,
    retries: numeric(process.env.CBR_RETRIES, 'CBR_RETRIES', 2)!,
    log: (message) => console.error(`[cbr] ${message}`),
    onAttempt: async (trace: Attempt) => {
      requestNumber++;
      const filename = `${String(requestNumber).padStart(3, '0')}-${trace.endpoint}-attempt-${trace.attempt}.json`;
      let bodyFile: string | null = null;
      await mkdir(runDir, { recursive: true });
      if (trace.body !== null) {
        bodyFile = join(runDir, filename);
        // Exact response text, without reformatting or a metadata wrapper.
        await writeFile(bodyFile, trace.body, 'utf8');
        if (trace.endpoint === 'data' && trace.status === 200) lastDataBody = trace.body;
      }
      const { body: _body, ...metadata } = trace;
      void _body;
      (manifest.requests as unknown[]).push({ ...metadata, bodyFile });
      await atomicWrite(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    },
  });
  try {
    const publications = parsePublications(await client.get('publications'));
    const byId = new Map(publications.map((p) => [p.id, p]));
    function path(id: number): string {
      const names: string[] = [];
      const visited = new Set<number>();
      let current = byId.get(id);
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        names.unshift(current.category_name);
        current = current.parent_id === null ? undefined : byId.get(current.parent_id);
      }
      return names.join(' / ');
    }
    console.log('\nПубликации (ID | доступность | путь):');
    for (const p of publications) {
      const match =
        !options.search ||
        path(p.id).toLocaleLowerCase('ru').includes(options.search.toLocaleLowerCase('ru'));
      console.log(
        `${p.id} | ${p.NoActive ? 'раздел' : 'данные'} | ${path(p.id)}${options.search && match ? ' ← совпадение' : ''}`,
      );
    }
    const publication = choose(
      publications.filter((p) => p.NoActive === 0),
      publicationId,
      options.search,
      (p) => path(p.id),
      'Публикация',
    );
    if (!publication) {
      if (
        datasetId !== undefined ||
        options['dataset-search'] ||
        measureId !== undefined ||
        options['measure-search'] ||
        fromOption !== undefined ||
        toOption !== undefined
      ) {
        throw new Error('Для следующих шагов сначала выберите однозначную публикацию');
      }
      manifest.status = 'CATALOG_ONLY';
      console.log('\nДля продолжения: --search ипотеч или --publication ID');
      return;
    }
    manifest.publication = publication;
    const datasets = parseDatasets(await client.get('datasets', { publicationId: publication.id }));
    console.log(`\nПоказатели публикации ${publication.id}:`);
    for (const d of datasets) {
      console.log(
        `${d.id} | type=${d.type} | ${d.name} | reporting=${d.reporting ?? '?'} | обновлено=${d.updated_time ?? '?'}`,
      );
      if (d.full_name) console.log(`  ${d.full_name}`);
    }
    if (options.extended) {
      const extended = record(
        await client.get('datasetsEx', { publicationId: publication.id }),
        'datasetsEx',
      );
      for (const key of ['indicators', 'measures_1', 'measures_2', 'units', 'years']) {
        console.log(`datasetsEx.${key}: ${records(extended[key], `datasetsEx.${key}`).length}`);
      }
    }
    const dataset = choose(
      datasets,
      datasetId,
      options['dataset-search'],
      (d) => `${d.name} ${d.full_name ?? ''}`,
      'Показатель',
    );
    if (!dataset) {
      if (
        measureId !== undefined ||
        options['measure-search'] ||
        fromOption !== undefined ||
        toOption !== undefined
      ) {
        throw new Error('Для разреза/данных сначала выберите однозначный показатель');
      }
      manifest.status = 'CATALOG_ONLY';
      console.log('\nДля продолжения добавьте --dataset ID или --dataset-search TEXT');
      return;
    }
    manifest.dataset = dataset;
    if (options.extended) await client.get('DatasetDescription', { datasetId: dataset.id });
    let selectedMeasureId: number | undefined;
    if (dataset.type === 1) {
      const measures = parseMeasures(await client.get('measures', { datasetId: dataset.id }));
      console.log('\nРазрезы (это ID ЦБ, а не коды регионов РФ):');
      for (const m of measures) console.log(`${m.id} | parent=${m.parent_id} | ${m.name}`);
      const measure = choose(
        measures,
        measureId,
        options['measure-search'],
        (m) => m.name,
        'Разрез',
      );
      if (!measure) {
        if (fromOption !== undefined || toOption !== undefined)
          throw new Error('Сначала выберите разрез');
        manifest.status = 'CATALOG_ONLY';
        console.log('\nДля тестового запроса добавьте --measure ID или --measure-search TEXT');
        return;
      }
      selectedMeasureId = measure.id;
      manifest.measure = measure;
    } else {
      if (measureId !== undefined || options['measure-search']) {
        throw new Error('У type != 1 разрез не выбирается: удалите --measure/--measure-search');
      }
      console.log('\nУ показателя type != 1: measures не запрашивается, measureId не передаётся.');
    }
    const years = parseYears(
      await client.get('years', {
        datasetId: dataset.id,
        measureId: selectedMeasureId,
      }),
    );
    manifest.years = years;
    console.log('\nДиапазоны лет:', JSON.stringify(years));
    if (!years.length) throw new Error('API не вернул доступные годы');
    const latestYear = Math.max(...years.map((range) => range.ToYear));
    const from = fromOption ?? toOption ?? latestYear;
    const to = toOption ?? from;
    if (from > to || !years.some((range) => from >= range.FromYear && to <= range.ToYear)) {
      throw new Error('Запрошенные годы не входят в доступный диапазон или from > to');
    }
    const query = {
      publicationId: publication.id,
      datasetId: dataset.id,
      measureId: selectedMeasureId,
      y1: from,
      y2: to,
    };
    const data = parseData(await client.get('data', query));
    if (lastDataBody === undefined) throw new Error('Сырой ответ data не сохранён');
    const output = resolve(options.output);
    await atomicWrite(output, lastDataBody);
    manifest.status = data.RawData.length ? 'SUCCESS' : 'EMPTY_DATA';
    manifest.output = output;
    manifest.query = query;
    manifest.rowCount = data.RawData.length;
    manifest.summary = {
      periodicities: [...new Set(data.RawData.map((row) => row.periodicity))],
      units: data.units,
      headerData: data.headerData,
      firstRows: data.RawData.slice(0, 3),
    };
    console.log(`\nRawData: ${data.RawData.length} строк; столбцов: ${data.headerData.length}`);
    console.log(
      'Периодичности:',
      JSON.stringify((manifest.summary as Record<string, unknown>).periodicities),
    );
    console.log('Единицы:', JSON.stringify(data.units));
    console.log('Заголовки:', JSON.stringify(data.headerData));
    console.log('Первые строки:', JSON.stringify(data.RawData.slice(0, 3), null, 2));
    console.log(`Сырой ответ: ${output}`);
    if (!data.RawData.length)
      console.warn('Ответ пуст: наличие года в years не гарантирует наблюдения.');
  } catch (error) {
    manifest.status = 'FAILED';
    manifest.error = error instanceof Error ? error.message : 'Неизвестная ошибка';
    throw error;
  } finally {
    manifest.finishedAt = new Date().toISOString();
    const text = JSON.stringify(manifest, null, 2) + '\n';
    await atomicWrite(join(runDir, 'manifest.json'), text);
    await atomicWrite(resolve('data/last-inspection.json'), text);
    console.log(`Диагностика: ${join(runDir, 'manifest.json')}`);
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Ошибка диагностики');
    process.exitCode = 1;
  });
}
