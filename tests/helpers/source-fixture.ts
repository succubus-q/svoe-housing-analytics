import { readFile } from 'node:fs/promises';
import { mapCbrObservation } from '../../src/modules/cbr/cbr.mapper.ts';
import { metricCatalog } from '../../src/modules/cbr/cbr.catalog.ts';
import { parseData } from '../../src/modules/cbr/cbr.types.ts';
import type { SourceResult } from '../../src/modules/mortgage/mortgage.types.ts';

export async function sourceFixture(): Promise<SourceResult> {
  const data = parseData(
    JSON.parse(
      await readFile(new URL('../../data/samples/mortgage-count.json', import.meta.url), 'utf8'),
    ) as unknown,
  );
  const row = data.RawData.find((r) => r.colId === 36);
  if (!row) throw new Error('Missing live source fixture');
  const observation = mapCbrObservation(row, metricCatalog[0], 22, null);
  if (!observation) throw new Error('Invalid live source fixture');
  return {
    regions: [{ code: 'CBR-22', sourceId: 22, name: 'Российская Федерация', parentCode: null }],
    observations: [observation],
    received: 1,
    skipped: 0,
    issues: [],
  };
}
