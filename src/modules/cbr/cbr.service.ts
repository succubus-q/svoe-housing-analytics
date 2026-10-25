import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CbrApiClient } from './cbr.client.ts';
import { metricCatalog, regionCode } from './cbr.catalog.ts';
import {
  parseData,
  parseDatasets,
  parseMeasures,
  parsePublications,
  parseYears,
} from './cbr.types.ts';
import { mapCbrObservation } from './cbr.mapper.ts';
import type { Dataset } from './cbr.types.ts';
import type { Config } from '../../common/config.ts';
import type { MortgageDataSource, SourceResult } from '../mortgage/mortgage.types.ts';

export class CbrApiDataSource implements MortgageDataSource {
  private readonly config: Config;
  private readonly log: (message: string) => void;

  constructor(config: Config, log: (message: string) => void = console.info) {
    this.config = config;
    this.log = log;
  }

  async getMortgageStats(): Promise<SourceResult> {
    const archive = join('data', 'sync-raw', randomUUID());
    let sequence = 0;
    const client = new CbrApiClient({
      baseUrl: this.config.cbrBaseUrl,
      timeoutMs: this.config.timeoutMs,
      retries: this.config.retries,
      log: this.log,
      onAttempt: async (attempt) => {
        await mkdir(archive, { recursive: true });
        const prefix = `${String(++sequence).padStart(3, '0')}-${attempt.endpoint}`;
        const { body, ...metadata } = attempt;
        if (body !== null) await writeFile(join(archive, `${prefix}.json`), body, 'utf8');
        await writeFile(
          join(archive, `${prefix}.meta.json`),
          JSON.stringify(metadata, null, 2),
          'utf8',
        );
      },
    });
    const result: SourceResult = {
      regions: [],
      observations: [],
      received: 0,
      skipped: 0,
      issues: [],
    };
    const publications = parsePublications(await client.get('publications'));
    const catalogues = new Map<number, Dataset[]>();
    const seenRegions = new Set<string>();
    for (const definition of metricCatalog) {
      try {
        if (!publications.some((p) => p.id === definition.publicationId && p.NoActive === 0)) {
          throw new Error('Публикация отсутствует/недоступна');
        }
        let datasets = catalogues.get(definition.publicationId);
        if (!datasets) {
          datasets = parseDatasets(
            await client.get('datasets', { publicationId: definition.publicationId }),
          );
          catalogues.set(definition.publicationId, datasets);
        }
        const dataset = datasets.find((d) => d.id === definition.datasetId);
        if (
          !dataset ||
          dataset.name !== definition.expectedName ||
          dataset.type !== 1 ||
          dataset.reporting !== definition.reporting
        ) {
          throw new Error('Контракт выбранного показателя изменился; повторите inspect:cbr');
        }
        const measures = parseMeasures(await client.get('measures', { datasetId: dataset.id }));
        for (const id of this.config.regionIds) {
          const measure = measures.find((m) => m.id === id);
          if (!measure) {
            const issue = `${definition.metric}: неизвестный разрез ЦБ ${id}`;
            result.issues.push(issue);
            this.log(issue);
            continue;
          }
          const code = regionCode(id);
          if (!seenRegions.has(code)) {
            seenRegions.add(code);
            result.regions.push({
              code,
              sourceId: id,
              name: measure.name,
              parentCode:
                measure.parent_id !== null && measure.parent_id > 0
                  ? regionCode(measure.parent_id)
                  : null,
            });
          }
          try {
            const years = parseYears(
              await client.get('years', { datasetId: dataset.id, measureId: id }),
            );
            const range = years.findLast((r) => r.ToYear >= this.config.fromYear);
            if (!range) throw new Error('Нет доступных лет для настроенного периода');
            const data = parseData(
              await client.get('data', {
                publicationId: definition.publicationId,
                datasetId: dataset.id,
                measureId: id,
                y1: Math.max(this.config.fromYear, range.FromYear),
                y2: range.ToYear,
              }),
            );
            result.received += data.RawData.length;
            if (!data.RawData.length)
              result.issues.push(`${definition.metric}/${code}: пустой ряд`);
            for (const row of data.RawData) {
              try {
                const observation = mapCbrObservation(
                  row,
                  definition,
                  id,
                  dataset.updated_time ?? null,
                );
                if (observation) result.observations.push(observation);
                else result.skipped++;
              } catch (error) {
                result.skipped++;
                result.issues.push(
                  `${definition.metric}/${code}: ${error instanceof Error ? error.message : 'Ошибка mapper'}`,
                );
              }
            }
          } catch (error) {
            result.issues.push(
              `${definition.metric}/${code}: ${error instanceof Error ? error.message : 'Ошибка ряда'}`,
            );
          }
        }
      } catch (error) {
        result.issues.push(
          `${definition.metric}: ${error instanceof Error ? error.message : 'Ошибка показателя'}`,
        );
      }
    }
    this.log(
      `CBR: ${result.observations.length} наблюдений, ${result.issues.length} замечаний; raw=${archive}`,
    );
    return result;
  }
}
