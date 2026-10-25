ALTER TABLE "SyncLog" ADD COLUMN "leaseExpiresAt" TIMESTAMPTZ(3);

-- Deployment stops the old backend before migrating. Legacy runs have no lease.
UPDATE "SyncLog"
SET "status" = 'FAILED', "finishedAt" = CURRENT_TIMESTAMP,
    "errorMessage" = 'Запуск прерван обновлением механизма синхронизации'
WHERE "status" = 'RUNNING';

-- Prisma 6 cannot express this partial index in schema.prisma.
CREATE UNIQUE INDEX "SyncLog_single_running"
ON "SyncLog" ("status") WHERE "status" = 'RUNNING';
