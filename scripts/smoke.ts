import assert from 'node:assert/strict';

const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:8080';
async function get(path: string) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response;
}
const html = await (await get('/')).text();
assert.match(html, /id="root"/);
const asset = html.match(/src="([^"]+\.js)"/)?.[1];
assert.ok(asset, 'Compiled JS asset missing');
const js = await get(asset);
assert.match(js.headers.get('content-type') ?? '', /javascript/);
assert.ok((await js.text()).length > 1000);
assert.equal(((await (await get('/health')).json()) as { database: string }).database, 'ok');
const openapi = (await (await get('/docs/json')).json()) as { paths: Record<string, unknown> };
assert.equal(Object.keys(openapi.paths).length, 6);
const regions = (await (await get('/api/v1/regions')).json()) as { code: string }[];
assert.ok(regions.length > 0, 'Run initial sync first');
for (const region of regions) {
  const summary = (await (await get(`/api/v1/mortgage/summary?region=${region.code}`)).json()) as {
    period: string;
    currency: string;
    metrics: Record<string, { value: number | null }>;
  };
  assert.equal(summary.currency, 'RUB');
  assert.equal(Object.keys(summary.metrics).length, 6);
  assert.ok(summary.metrics.MORTGAGE_VOLUME?.value);
  const stats = (await (
    await get(
      `/api/v1/mortgage/stats?region=${region.code}&from=${summary.period}&to=${summary.period}&metric=MORTGAGE_VOLUME`,
    )
  ).json()) as { observations: { metric: string }[] };
  assert.equal(stats.observations.length, 1);
  assert.equal(stats.observations[0]?.metric, 'MORTGAGE_VOLUME');
  console.log(`${region.code}: summary/stats OK (${summary.period})`);
}
if (process.argv.includes('--sync')) {
  const options = { method: 'POST', signal: AbortSignal.timeout(180000) };
  const first = fetch(new URL('/api/v1/sync/run', base), options);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const second = await fetch(new URL('/api/v1/sync/run', base), options);
  assert.equal(second.status, 409, 'Concurrent sync must be rejected');
  const completed = await first;
  const result = (await completed.json()) as {
    status: string;
    recordsInserted: number;
    recordsUpdated: number;
  };
  assert.equal(completed.status, 200);
  assert.equal(result.status, 'SUCCESS');
  console.log('Live sync + concurrent 409:', result);
}
console.log(
  'Smoke OK: HTML, JS asset, nginx proxy, health, OpenAPI, regions, summaries and stats.',
);
