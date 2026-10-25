import type { Prisma, PrismaClient, SyncLog } from '@prisma/client';
import type { MortgageDataSource, SourceResult } from '../mortgage/mortgage.types.ts';
import { MortgageRepository } from '../mortgage/mortgage.repository.ts';

export class SyncBusyError extends Error {
  readonly statusCode = 409;
  constructor() {
    super('Синхронизация уже выполняется');
  }
}

export class SyncLeaseLostError extends Error {
  constructor() {
    super('Утрачено владение синхронизацией; запись данных запрещена');
  }
}

interface SyncOptions {
  leaseMs?: number;
  heartbeatMs?: number;
  writeTimeoutMs?: number;
}

const shortTransaction = { timeout: 10_000, maxWait: 5000 };

export class SyncService {
  private readonly db: PrismaClient;
  private readonly source: MortgageDataSource;
  private readonly leaseMs: number;
  private readonly heartbeatMs: number;
  private readonly writeTimeoutMs: number;
  private active: Promise<SyncLog> | null = null;

  constructor(db: PrismaClient, source: MortgageDataSource, options: SyncOptions = {}) {
    this.db = db;
    this.source = source;
    this.leaseMs = options.leaseMs ?? 60_000;
    this.heartbeatMs = options.heartbeatMs ?? 10_000;
    this.writeTimeoutMs = options.writeTimeoutMs ?? 30_000;
    if (
      ![this.leaseMs, this.heartbeatMs, this.writeTimeoutMs].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      ) ||
      this.heartbeatMs * 2 >= this.leaseMs
    )
      throw new Error('Некорректные интервалы синхронизации');
  }

  run(): Promise<SyncLog> {
    if (this.active) throw new SyncBusyError();
    this.active = this.execute().finally(() => {
      this.active = null;
    });
    return this.active;
  }

  async waitForIdle() {
    await this.active?.catch(() => {});
  }

  async status() {
    const [latest, latestSuccessful, observations, live] = await Promise.all([
      this.db.syncLog.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.db.syncLog.findFirst({
        where: { status: { in: ['SUCCESS', 'PARTIAL'] } },
        orderBy: { finishedAt: 'desc' },
      }),
      this.db.mortgageObservation.count(),
      this.db.$queryRaw<{ running: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM "SyncLog" WHERE "status" = 'RUNNING'
          AND "leaseExpiresAt" > clock_timestamp()) AS running`,
    ]);
    return {
      latest,
      lastSuccessfulAt: latestSuccessful?.finishedAt ?? null,
      observations,
      running: !!this.active || !!live[0]?.running,
      source: 'Банк России',
      currency: 'RUB',
    };
  }

  private async claim(): Promise<SyncLog> {
    return this.db.$transaction(async (tx) => {
      // Short claims and writes share a guard; no connection/transaction is held during HTTP.
      // A contender during the write phase is rejected instead of waiting for a second import.
      const [guard] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(current_schema()::text), 742819023) AS locked`;
      if (!guard?.locked) throw new SyncBusyError();
      const [running] = await tx.$queryRaw<{ id: string; live: boolean }[]>`
        SELECT "id", COALESCE("leaseExpiresAt" > clock_timestamp(), false) AS live
        FROM "SyncLog" WHERE "status" = 'RUNNING' FOR UPDATE`;
      if (running?.live) throw new SyncBusyError();
      await tx.syncLog.updateMany({
        where: { status: 'RUNNING' },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          leaseExpiresAt: null,
          errorMessage: 'Запуск прерван: истёк срок владения синхронизацией',
        },
      });
      const [clock] = await tx.$queryRaw<{ expiresAt: Date }[]>`
        SELECT clock_timestamp() + (${this.leaseMs}::double precision * interval '1 millisecond') AS "expiresAt"`;
      if (!clock) throw new Error('Не удалось получить время PostgreSQL');
      return tx.syncLog.create({ data: { leaseExpiresAt: clock.expiresAt } });
    }, shortTransaction);
  }

  private heartbeat(id: string) {
    let stopped = false;
    let failure: unknown;
    let pending = Promise.resolve();
    let timer: ReturnType<typeof setTimeout>;
    const beat = () => {
      pending = (async () => {
        const changed = await this.db.$executeRaw`
          UPDATE "SyncLog" SET "leaseExpiresAt" = clock_timestamp()
            + (${this.leaseMs}::double precision * interval '1 millisecond')
          WHERE "id" = ${id} AND "status" = 'RUNNING' AND "leaseExpiresAt" > clock_timestamp()`;
        if (changed !== 1) throw new SyncLeaseLostError();
      })()
        .catch((error: unknown) => {
          failure = error;
        })
        .then(() => {
          if (!stopped && failure === undefined) {
            timer = setTimeout(beat, this.heartbeatMs);
            timer.unref();
          }
        });
    };
    timer = setTimeout(beat, this.heartbeatMs);
    timer.unref();
    return async () => {
      stopped = true;
      clearTimeout(timer);
      await pending;
      if (failure !== undefined) throw failure;
    };
  }

  private async assertOwner(tx: Prisma.TransactionClient, id: string) {
    const [owner] = await tx.$queryRaw<{ live: boolean }[]>`
      SELECT COALESCE("leaseExpiresAt" > clock_timestamp(), false) AS live
      FROM "SyncLog" WHERE "id" = ${id} AND "status" = 'RUNNING' FOR UPDATE`;
    if (!owner?.live) throw new SyncLeaseLostError();
    // The row lock remains held until commit: takeover must wait even if the lease expires
    // during the bounded write transaction. An old/paused process can never write after takeover.
  }

  private async persist(id: string, result: SourceResult): Promise<SyncLog> {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(current_schema()::text), 742819023)`;
        await this.assertOwner(tx, id);
        const counts = result.observations.length
          ? await new MortgageRepository().save(tx, result.regions, result.observations)
          : { inserted: 0, updated: 0, skipped: 0 };
        const status = !result.observations.length
          ? 'FAILED'
          : result.issues.length
            ? 'PARTIAL'
            : 'SUCCESS';
        return tx.syncLog.update({
          where: { id },
          data: {
            status,
            finishedAt: new Date(),
            leaseExpiresAt: null,
            recordsReceived: result.received,
            recordsInserted: counts.inserted,
            recordsUpdated: counts.updated,
            recordsSkipped: result.skipped + counts.skipped,
            issues: result.issues,
            errorMessage: status === 'FAILED' ? 'Нет пригодных наблюдений; см. issues' : null,
          },
        });
      },
      { ...shortTransaction, timeout: this.writeTimeoutMs },
    );
  }

  private async fail(
    id: string,
    error: unknown,
    result: SourceResult | undefined,
  ): Promise<SyncLog> {
    return this.db.$transaction(async (tx) => {
      // Only this run can be finalized; a recovered/finalized log is never overwritten.
      await tx.syncLog.updateMany({
        where: { id, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          leaseExpiresAt: null,
          errorMessage:
            error instanceof Error ? error.message.slice(0, 4000) : 'Неизвестная ошибка',
          recordsReceived: result?.received ?? 0,
          recordsSkipped: result?.skipped ?? 0,
          recordsInserted: 0,
          recordsUpdated: 0,
          issues: result?.issues ?? [],
        },
      });
      return tx.syncLog.findUniqueOrThrow({ where: { id } });
    }, shortTransaction);
  }

  private async execute(): Promise<SyncLog> {
    const log = await this.claim();
    const stopHeartbeat = this.heartbeat(log.id);
    let result: SourceResult | undefined;
    try {
      // All external I/O and normalization complete BEFORE the atomic DB write begins.
      result = await this.source.getMortgageStats();
      await stopHeartbeat();
      return await this.persist(log.id, result);
    } catch (error) {
      await stopHeartbeat().catch(() => {});
      try {
        return await this.fail(log.id, error, result);
      } catch (logError) {
        // A total DB outage cannot be logged in that DB. Preserve both errors and let
        // lease expiry + the next claimant recover RUNNING instead of reporting success.
        throw new AggregateError([error, logError], `Не удалось завершить SyncLog ${log.id}`);
      }
    }
  }
}
