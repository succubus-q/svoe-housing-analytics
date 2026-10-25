import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createTestDatabase } from '../helpers/postgres.ts';
import { sourceFixture } from '../helpers/source-fixture.ts';
import { MortgageRepository } from '../../src/modules/mortgage/mortgage.repository.ts';
import { mapCbrObservation } from '../../src/modules/cbr/cbr.mapper.ts';
import { metricCatalog } from '../../src/modules/cbr/cbr.catalog.ts';
import { parseData } from '../../src/modules/cbr/cbr.types.ts';
import { buildApp } from '../../src/app.ts';

test('real PostgreSQL: upsert inserts, skips unchanged, updates changed and remains unique', async () => {
  const database = await createTestDatabase();
  const db = database.db;
  const rollback = new Error('TEST_ROLLBACK');
  try {
    const raw = parseData(
      JSON.parse(
        await readFile(new URL('../../data/samples/mortgage-count.json', import.meta.url), 'utf8'),
      ) as unknown,
    );
    const row = raw.RawData.find((r) => r.colId === 36);
    assert.ok(row);
    const observation = mapCbrObservation(row, metricCatalog[0], 22, null);
    assert.ok(observation);
    await assert.rejects(
      db.$transaction(
        async (tx) => {
          await tx.mortgageObservation.deleteMany({
            where: {
              region: { code: 'CBR-22' },
              period: observation.period,
              metric: observation.metric,
            },
          });
          const repository = new MortgageRepository();
          const regions = [
            { code: 'CBR-22', sourceId: 22, name: 'Российская Федерация', parentCode: null },
          ];
          assert.deepEqual(await repository.save(tx, regions, [observation]), {
            inserted: 1,
            updated: 0,
            skipped: 0,
          });
          assert.deepEqual(await repository.save(tx, regions, [observation]), {
            inserted: 0,
            updated: 0,
            skipped: 1,
          });
          assert.deepEqual(
            await repository.save(tx, regions, [{ ...observation, value: observation.value + 1 }]),
            { inserted: 0, updated: 1, skipped: 0 },
          );
          assert.equal(
            await tx.mortgageObservation.count({
              where: {
                region: { code: 'CBR-22' },
                period: observation.period,
                metric: observation.metric,
              },
            }),
            1,
          );
          throw rollback;
        },
        { timeout: 30000 },
      ),
      (error: unknown) => error === rollback,
    );
  } finally {
    await database.close();
  }
});

test('integration: /health checks the actual PostgreSQL connection', async () => {
  const database = await createTestDatabase();
  const db = database.db;
  const observations: NonNullable<ReturnType<typeof mapCbrObservation>>[] = [];
  for (const definition of metricCatalog.slice(0, 2)) {
    const data = parseData(
      JSON.parse(
        await readFile(new URL(`../../data/samples/${definition.sample}`, import.meta.url), 'utf8'),
      ) as unknown,
    );
    for (const row of data.RawData) {
      const observation = mapCbrObservation(row, definition, 22, null);
      if (observation) observations.push(observation);
    }
  }
  const fixture = await sourceFixture();
  await db.$transaction((tx) => new MortgageRepository().save(tx, fixture.regions, observations));
  const app = await buildApp(db, { scheduler: false, logger: false });
  try {
    const response = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok', database: 'ok' });
    const invalid = await app.inject({
      method: 'GET',
      url: '/api/v1/mortgage/stats?region=CBR-22&from=2026-13&to=2026-08',
    });
    assert.equal(invalid.statusCode, 400);
    const unknown = await app.inject({
      method: 'GET',
      url: '/api/v1/mortgage/summary?region=CBR-999999',
    });
    assert.equal(unknown.statusCode, 404);
    const summary = await app.inject({
      method: 'GET',
      url: '/api/v1/mortgage/summary?region=CBR-22&period=2026-08',
    });
    assert.equal(summary.statusCode, 200);
    const body = summary.json();
    assert.equal(body.currency, 'RUB');
    assert.ok(body.metrics.MORTGAGE_VOLUME.value > 0);
    assert.equal(body.metrics.MORTGAGE_VOLUME.yoy, null);
    assert.ok(body.metrics.MORTGAGE_VOLUME.mom !== null);
    assert.equal(
      body.averageLoanSize.value,
      body.metrics.MORTGAGE_VOLUME.value / body.metrics.MORTGAGE_COUNT.value,
    );
    const openapi = await app.inject({ method: 'GET', url: '/docs/json' });
    assert.equal(openapi.statusCode, 200);
    for (const path of [
      '/health',
      '/api/v1/regions',
      '/api/v1/mortgage/stats',
      '/api/v1/mortgage/summary',
      '/api/v1/sync/status',
      '/api/v1/sync/run',
    ]) {
      assert.ok(openapi.json().paths[path], `OpenAPI missing ${path}`);
    }
  } finally {
    await app.close();
    await database.close();
  }
});
