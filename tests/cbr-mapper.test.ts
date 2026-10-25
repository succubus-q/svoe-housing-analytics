import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { metricCatalog } from '../src/modules/cbr/cbr.catalog.ts';
import { mapCbrObservation } from '../src/modules/cbr/cbr.mapper.ts';
import { parseData } from '../src/modules/cbr/cbr.types.ts';

test('mapper normalizes all six live snapshots to rubles and the reporting month', async () => {
  for (const definition of metricCatalog) {
    const data = parseData(
      JSON.parse(
        await readFile(new URL(`../data/samples/${definition.sample}`, import.meta.url), 'utf8'),
      ) as unknown,
    );
    const measure = definition.metric === 'AVERAGE_RATE' ? 41 : 22;
    const mapped = data.RawData.map((row) =>
      mapCbrObservation(row, definition, measure, null),
    ).filter((row) => row !== null);
    assert.equal(mapped.length, 8);
    const january = mapped.find((row) => row.period.toISOString().startsWith('2026-01'));
    assert.ok(january);
    assert.equal(january.sourcePeriodDate.toISOString().slice(0, 10), '2026-02-01');
    if (definition.metric === 'MORTGAGE_VOLUME') assert.equal(january.value, 424903000000);
  }
});

test('mapper rejects invalid dates, units, mismatched month and non-finite/negative values', () => {
  const definition = metricCatalog[0];
  const base = {
    colId: 36,
    element_id: 36,
    measure_id: 22,
    unit_id: 7,
    periodicity: 'month',
    date: '2026-02-01T00:00:00',
    dt: 'Январь 2026',
    obs_val: 10,
  };
  for (const overrides of [
    { obs_val: -1 },
    { obs_val: NaN },
    { obs_val: null },
    { obs_val: 1.5 },
    { date: '2026-02-30T00:00:00' },
    { date: '2026-02-02T00:00:00' },
    { unit_id: 6 },
    { measure_id: 999 },
    { dt: 'Февраль 2026' },
  ])
    assert.throws(() => mapCbrObservation({ ...base, ...overrides }, definition, 22, null));
  assert.equal(mapCbrObservation({ ...base, colId: 35 }, definition, 22, null), null);
});
