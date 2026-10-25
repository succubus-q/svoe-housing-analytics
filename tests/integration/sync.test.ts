import assert from 'node:assert/strict';
import test, { before, after, beforeEach } from 'node:test';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import { SyncService, SyncBusyError } from '../../src/modules/sync/sync.service.ts';
import { createTestDatabase } from '../helpers/postgres.ts';
import { sourceFixture } from '../helpers/source-fixture.ts';

let database: Awaited<ReturnType<typeof createTestDatabase>>;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database?.close();
});
beforeEach(async () => {
  await database.db.mortgageObservation.deleteMany();
  await database.db.region.deleteMany();
  await database.db.syncLog.deleteMany();
});

test('HTTP/normalization runs outside a transaction; RUNNING is visible before data arrives', async () => {
  const [{ pid } = { pid: -1 }] = await database.db.$queryRaw<
    { pid: number }[]
  >`SELECT pg_backend_pid() AS pid`;
  const service = new SyncService(
    database.db,
    {
      async getMortgageStats() {
        const [session] = await database.admin.$queryRaw<
          { state: string; xact_start: Date | null }[]
        >`
      SELECT state, xact_start FROM pg_stat_activity WHERE pid = ${pid}`;
        assert.equal(session?.state, 'idle');
        assert.equal(session.xact_start, null, 'HTTP must not hold an open DB transaction');
        assert.equal((await database.db.syncLog.findFirst())?.status, 'RUNNING');
        await delay(1200); // Longer than the write transaction timeout, deliberately.
        return sourceFixture();
      },
    },
    { writeTimeoutMs: 1000 },
  );
  const result = await service.run();
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.recordsInserted, 1);
  assert.equal(result.leaseExpiresAt, null);
});

test('HTTP failure finishes FAILED and releases ownership for the next import', async () => {
  const result = await new SyncService(database.db, {
    async getMortgageStats() {
      throw new Error('HTTP 503 test');
    },
  }).run();
  assert.equal(result.status, 'FAILED');
  assert.equal(result.errorMessage, 'HTTP 503 test');
  assert.ok(result.finishedAt);
  assert.equal(result.leaseExpiresAt, null);
  assert.equal(
    (await new SyncService(database.db, { getMortgageStats: sourceFixture }).run()).status,
    'SUCCESS',
  );
});

test('PARTIAL, empty FAILED and idempotent SUCCESS preserve meaningful counters', async () => {
  const fixture = await sourceFixture();
  const partial = await new SyncService(database.db, {
    async getMortgageStats() {
      return { ...fixture, issues: ['AVERAGE_RATE: HTTP 503 test'] };
    },
  }).run();
  assert.equal(partial.status, 'PARTIAL');
  assert.equal(partial.recordsInserted, 1);
  const repeated = await new SyncService(database.db, { getMortgageStats: sourceFixture }).run();
  assert.equal(repeated.status, 'SUCCESS');
  assert.equal(repeated.recordsInserted, 0);
  assert.equal(repeated.recordsUpdated, 0);
  assert.equal(repeated.recordsSkipped, 1);
  const empty = await new SyncService(database.db, {
    async getMortgageStats() {
      return { regions: [], observations: [], received: 0, skipped: 0, issues: ['No data test'] };
    },
  }).run();
  assert.equal(empty.status, 'FAILED');
  assert.equal(await database.db.mortgageObservation.count(), 1);
});

test('actual SQL write failure rolls back regions/observations, then finalizes FAILED separately', async () => {
  const result = await new SyncService(database.db, {
    async getMortgageStats() {
      const fixture = await sourceFixture();
      fixture.observations[0]!.value = 1e30; // PostgreSQL numeric(24,6) overflow in this isolated test schema.
      return fixture;
    },
  }).run();
  assert.equal(result.status, 'FAILED');
  assert.ok(result.errorMessage);
  assert.ok(result.finishedAt);
  assert.equal(result.recordsInserted, 0);
  assert.equal(result.recordsUpdated, 0);
  assert.equal(result.recordsReceived, 1);
  assert.equal(result.leaseExpiresAt, null);
  assert.equal(await database.db.mortgageObservation.count(), 0);
  assert.equal(await database.db.region.count(), 0);
});

test('an expired/paused owner is fenced out after another process claims and commits', async () => {
  const { promise: gate, resolve } = deferred();
  const { promise: entered, resolve: ready } = deferred();
  const old = new SyncService(database.db, {
    async getMortgageStats() {
      ready();
      await gate;
      const fixture = await sourceFixture();
      fixture.observations[0]!.value += 1;
      return fixture;
    },
  });
  const oldRun = old.run();
  try {
    await entered;
    assert.throws(() => old.run(), SyncBusyError);
    await database.db
      .$executeRaw`UPDATE "SyncLog" SET "leaseExpiresAt" = clock_timestamp() - interval '1 second' WHERE "status" = 'RUNNING'`;
    const next = await new SyncService(database.db, { getMortgageStats: sourceFixture }).run();
    assert.equal(next.status, 'SUCCESS');
  } finally {
    resolve();
  }
  const result = await oldRun;
  assert.equal(result.status, 'FAILED');
  assert.match(result.errorMessage ?? '', /истёк срок/);
  const stored = await database.db.mortgageObservation.findFirstOrThrow();
  assert.equal(stored.value.toNumber(), (await sourceFixture()).observations[0]!.value);
});

interface WorkerMessage {
  event: string;
  id?: string;
  status?: string;
  message?: string;
}
function worker() {
  const child = fork(new URL('../helpers/sync-worker.ts', import.meta.url), [], {
    env: { ...process.env, SYNC_TEST_DATABASE_URL: database.url },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const messages: WorkerMessage[] = [];
  let errorOutput = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    errorOutput += chunk.toString();
  });
  child.on('message', (message: WorkerMessage) => messages.push(message));
  return {
    child,
    async wait(event: string) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const found = messages.find((m) => m.event === event);
        if (found) return found;
        if (messages.some((m) => m.event === 'error') || child.exitCode !== null) {
          throw new Error(
            `Worker failed waiting for ${event}: ${JSON.stringify(messages)} ${errorOutput}`,
          );
        }
        await delay(20);
      }
      throw new Error(`Worker timed out: ${event} ${errorOutput}`);
    },
  };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
}

test(
  'separate OS processes: heartbeat excludes a competitor; SIGKILL is recovered after expiry',
  { timeout: 20000 },
  async () => {
    const first = worker();
    let second: ReturnType<typeof worker> | undefined;
    let replacement: ReturnType<typeof worker> | undefined;
    try {
      await first.wait('fetching');
      const interrupted = await database.db.syncLog.findFirstOrThrow();
      await delay(1700); // Exceeds the original 1500ms lease: only heartbeat can keep it alive.
      second = worker();
      await second.wait('busy');
      assert.equal(await database.db.syncLog.count({ where: { status: 'RUNNING' } }), 1);
      await stop(first.child);
      const deadline = Date.now() + 5000;
      while (true) {
        const [row] = await database.db.$queryRaw<{ expired: boolean }[]>`
        SELECT "leaseExpiresAt" <= clock_timestamp() AS expired FROM "SyncLog" WHERE "id" = ${interrupted.id}`;
        if (row?.expired) break;
        assert.ok(Date.now() < deadline, 'Crashed process lease failed to expire');
        await delay(50);
      }
      replacement = worker();
      await replacement.wait('fetching');
      assert.equal(
        (await database.db.syncLog.findUniqueOrThrow({ where: { id: interrupted.id } })).status,
        'FAILED',
      );
      replacement.child.send('complete');
      assert.equal((await replacement.wait('finished')).status, 'SUCCESS');
      assert.equal(await database.db.mortgageObservation.count(), 1);
    } finally {
      await stop(first.child);
      if (second) await stop(second.child);
      if (replacement) await stop(replacement.child);
    }
  },
);

test(
  'a competitor is rejected during atomic SQL write even after the lease deadline',
  { timeout: 10000 },
  async () => {
    const other = new PrismaClient({ datasources: { db: { url: database.url } } });
    await database.db
      .$executeRawUnsafe(`CREATE FUNCTION "${database.schema}".review_slow_insert() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(2.5); RETURN NEW; END $$`);
    await database.db
      .$executeRawUnsafe(`CREATE TRIGGER review_slow_insert BEFORE INSERT ON "MortgageObservation"
    FOR EACH ROW EXECUTE FUNCTION "${database.schema}".review_slow_insert()`);
    const first = new SyncService(
      database.db,
      { getMortgageStats: sourceFixture },
      { leaseMs: 1000, heartbeatMs: 200, writeTimeoutMs: 5000 },
    ).run();
    try {
      // Observe the actual INSERT sleeping in PostgreSQL, rather than assuming when it started.
      const deadline = Date.now() + 4000;
      while (true) {
        const [writing] = await database.admin.$queryRaw<{ active: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event = 'PgSleep'
          AND query LIKE ${`%"${database.schema}"."MortgageObservation"%`}) AS active`;
        if (writing?.active) break;
        assert.ok(Date.now() < deadline, 'Write transaction failed to reach the SQL delay');
        await delay(20);
      }
      await delay(1100);
      await assert.rejects(
        new SyncService(other, { getMortgageStats: sourceFixture }).run(),
        SyncBusyError,
      );
      assert.equal((await first).status, 'SUCCESS');
    } finally {
      await first.catch(() => {});
      await other.$disconnect();
      await database.db.$executeRawUnsafe(
        'DROP TRIGGER review_slow_insert ON "MortgageObservation"',
      );
      await database.db.$executeRawUnsafe(
        `DROP FUNCTION "${database.schema}".review_slow_insert()`,
      );
    }
  },
);
