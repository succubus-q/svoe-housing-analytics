import type { Config } from '../../common/config.ts';
import type { SyncService } from './sync.service.ts';

export function startScheduler(sync: SyncService, config: Config, log: (message: string) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  async function run() {
    try {
      const result = await sync.run();
      log(`Scheduled sync: ${result.status}`);
    } catch (error) {
      log(error instanceof Error ? error.message : 'Ошибка scheduler');
    }
  }
  function schedule() {
    if (stopped || !config.syncEnabled) return;
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(config.syncHour, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    timer = setTimeout(() => {
      void run().finally(schedule);
    }, next.getTime() - now.getTime());
    timer.unref();
    log(`Next sync: ${next.toISOString()}`);
  }
  if (config.syncOnStart) void run();
  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
