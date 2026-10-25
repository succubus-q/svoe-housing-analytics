import { PrismaClient } from '@prisma/client';
import { SyncService, SyncBusyError } from '../../src/modules/sync/sync.service.ts';
import { sourceFixture } from './source-fixture.ts';

const url = process.env.SYNC_TEST_DATABASE_URL;
if (!url) throw new Error('SYNC_TEST_DATABASE_URL missing');
const db = new PrismaClient({ datasources: { db: { url } } });
let complete!: () => void;
const gate = new Promise<void>((resolve) => {
  complete = resolve;
});
process.on('message', (message) => {
  if (message === 'complete') complete();
});
const service = new SyncService(
  db,
  {
    async getMortgageStats() {
      process.send?.({ event: 'fetching' });
      await gate;
      return sourceFixture();
    },
  },
  { leaseMs: 1500, heartbeatMs: 200 },
);
try {
  const result = await service.run();
  process.send?.({ event: 'finished', id: result.id, status: result.status });
} catch (error) {
  process.send?.({
    event: error instanceof SyncBusyError ? 'busy' : 'error',
    message: error instanceof Error ? error.message : 'unknown',
  });
} finally {
  await db.$disconnect();
  process.disconnect?.();
}
