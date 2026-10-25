import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CbrApiClient } from '../src/modules/cbr/cbr.client.ts';
import type { Attempt } from '../src/modules/cbr/cbr.client.ts';
import { choose } from '../scripts/inspect-cbr-api.ts';
import { metricCatalog, rubleColumnId } from '../src/modules/cbr/cbr.catalog.ts';
import { parseData, parsePublications, parseYears } from '../src/modules/cbr/cbr.types.ts';

function clientWith(fetcher: typeof fetch, attempts: Attempt[], sleeps: number[] = []) {
  return new CbrApiClient({
    baseUrl: 'https://www.cbr.ru/dataservice/',
    timeoutMs: 1000,
    retries: 2,
    fetch: fetcher,
    onAttempt: async (attempt) => {
      attempts.push(attempt);
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
}

test('client retries 429 and 503; saves every exact body before returning', async () => {
  const attempts: Attempt[] = [];
  const sleeps: number[] = [];
  const responses = [
    new Response('busy', { status: 429, headers: { 'Retry-After': '2' } }),
    new Response('unavailable', { status: 503 }),
    new Response('[ { "id": 21 } ]', { headers: { 'content-type': 'application/json' } }),
  ];
  let calls = 0;
  const client = clientWith(
    async (input, init) => {
      calls++;
      assert.equal(String(input), 'https://www.cbr.ru/dataservice/datasets?publicationId=21');
      assert.ok(init?.signal);
      return responses.shift()!;
    },
    attempts,
    sleeps,
  );
  assert.deepEqual(await client.get('datasets', { publicationId: 21 }), [{ id: 21 }]);
  assert.equal(calls, 3);
  assert.deepEqual(
    attempts.map((a) => a.body),
    ['busy', 'unavailable', '[ { "id": 21 } ]'],
  );
  assert.deepEqual(sleeps, [2000, 1000]);
});

test('400 and HTTP 200 with HTML are saved and are not retried', async () => {
  for (const response of [
    new Response('bad input', { status: 400 }),
    new Response('<html>maintenance</html>', { status: 200 }),
  ]) {
    const attempts: Attempt[] = [];
    const client = clientWith(async () => response, attempts);
    await assert.rejects(client.get('publications'));
    assert.equal(attempts.length, 1);
    assert.ok(attempts[0]?.body);
    assert.ok(attempts[0]?.error);
  }
});

test('network errors have bounded retries and do not become an empty success', async () => {
  const attempts: Attempt[] = [];
  const client = clientWith(async () => {
    throw new TypeError('offline');
  }, attempts);
  await assert.rejects(client.get('publications'), /попыток: 3/);
  assert.equal(attempts.length, 3);
  assert.ok(attempts.every((attempt) => attempt.status === null && attempt.body === null));
});

test('timeout also covers response body, not only response headers', async () => {
  const client = new CbrApiClient({
    baseUrl: 'https://www.cbr.ru/dataservice/',
    timeoutMs: 20,
    retries: 0,
    fetch: async (_input, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
          },
        }),
      ),
  });
  // Native timeout timers are unref'ed; this timer keeps the test process alive.
  const keepAlive = setTimeout(() => {}, 500);
  try {
    await assert.rejects(client.get('publications'), /таймаут/);
  } finally {
    clearTimeout(keepAlive);
  }
});

test('archive write error is surfaced without retrying HTTP', async () => {
  let calls = 0;
  const client = new CbrApiClient({
    baseUrl: 'https://www.cbr.ru/dataservice/',
    timeoutMs: 1000,
    retries: 2,
    fetch: async () => {
      calls++;
      return new Response('[]');
    },
    onAttempt: async () => {
      throw new Error('disk full');
    },
  });
  await assert.rejects(client.get('publications'), /disk full/);
  assert.equal(calls, 1);
});

test('unknown IDs are rejected; ambiguous search never selects the first match', () => {
  const rows = [
    { id: 21, name: 'Ипотека' },
    { id: 22, name: 'Ипотека: другой ряд' },
  ];
  assert.throws(() => choose(rows, 999999, undefined, (r) => r.name, 'dataset'));
  assert.equal(
    choose(rows, undefined, 'ипотека', (r) => r.name, 'dataset'),
    undefined,
  );
  assert.equal(choose(rows, 21, 'ИПОТЕКА', (r) => r.name, 'dataset')?.id, 21);
  assert.throws(() => choose(rows, undefined, '  ', (r) => r.name, 'dataset'));
});

test('runtime contracts reject malformed catalogues and invalid year ranges', () => {
  assert.throws(() => parsePublications({ error: 'maintenance' }));
  assert.throws(() => parsePublications([{ id: '21', category_name: 'Mortgage' }]));
  assert.throws(() => parseYears([{ FromYear: 2026, ToYear: 2009 }]));
  assert.throws(() => parseData({ RawData: [{ obs_val: NaN }], headerData: [], units: [] }));
});

test('live CBR fixture retains month label, next-month date and currency columns', async () => {
  const body = await readFile(
    new URL('../data/samples/mortgage-count.json', import.meta.url),
    'utf8',
  );
  const data = parseData(JSON.parse(body) as unknown);
  const january = data.RawData.find((r) => r.dt === 'Январь 2026' && r.colId === 35);
  assert.ok(january);
  assert.equal(january.date, '2026-02-01T00:00:00');
  assert.equal(january.periodicity, 'month');
  assert.deepEqual(
    data.headerData.map((r) => r.id),
    [35, 36, 40],
  );
  assert.ok(data.RawData.every((r) => r.unit_id === 7));
});

test('constructor rejects insecure URLs and credentials', () => {
  for (const baseUrl of ['http://www.cbr.ru/dataservice/', 'https://user:secret@cbr.ru/']) {
    assert.throws(() => new CbrApiClient({ baseUrl, timeoutMs: 1000, retries: 0 }));
  }
});

test('all six reviewed metric definitions match saved live catalogues, units and columns', async () => {
  for (const definition of metricCatalog) {
    const directory = new URL(
      `../data/evidence/${definition.sample.replace('.json', '')}/`,
      import.meta.url,
    );
    const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8')) as {
      query: { publicationId: number; datasetId: number };
      dataset: { name: string; reporting: string };
    };
    assert.equal(manifest.query.publicationId, definition.publicationId);
    assert.equal(manifest.query.datasetId, definition.datasetId);
    assert.equal(manifest.dataset.name, definition.expectedName);
    assert.equal(manifest.dataset.reporting, definition.reporting);
    const data = parseData(
      JSON.parse(
        await readFile(new URL(`../data/samples/${definition.sample}`, import.meta.url), 'utf8'),
      ) as unknown,
    );
    const rubles = data.RawData.filter((row) => row.colId === rubleColumnId);
    assert.equal(rubles.length, 8);
    assert.ok(rubles.every((row) => row.unit_id === definition.sourceUnitId));
  }
});
