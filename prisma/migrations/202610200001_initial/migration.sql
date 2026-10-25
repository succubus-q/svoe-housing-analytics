-- CreateEnum
CREATE TYPE "Metric" AS ENUM ('MORTGAGE_COUNT', 'MORTGAGE_VOLUME', 'AVERAGE_RATE', 'AVERAGE_TERM', 'DEBT', 'OVERDUE_DEBT');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "parentCode" TEXT,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MortgageObservation" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "metric" "Metric" NOT NULL,
    "value" DECIMAL(24,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourcePublicationId" INTEGER,
    "sourceDatasetId" INTEGER,
    "sourceMeasureId" INTEGER,
    "sourceUpdatedAt" TIMESTAMP(3),
    "sourcePeriodDate" DATE,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MortgageObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "recordsReceived" INTEGER NOT NULL DEFAULT 0,
    "recordsInserted" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "issues" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Region_sourceId_key" ON "Region"("sourceId");

-- CreateIndex
CREATE INDEX "MortgageObservation_metric_period_idx" ON "MortgageObservation"("metric", "period");

-- CreateIndex
CREATE UNIQUE INDEX "MortgageObservation_regionId_period_metric_key" ON "MortgageObservation"("regionId", "period", "metric");

-- CreateIndex
CREATE INDEX "SyncLog_startedAt_idx" ON "SyncLog"("startedAt");

-- AddForeignKey
ALTER TABLE "MortgageObservation" ADD CONSTRAINT "MortgageObservation_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
