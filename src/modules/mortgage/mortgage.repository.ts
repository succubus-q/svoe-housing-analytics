import { Prisma } from '@prisma/client';
import type { MortgageObservation, SourceRegion } from './mortgage.types.ts';

export class MortgageRepository {
  async save(
    tx: Prisma.TransactionClient,
    regions: SourceRegion[],
    observations: MortgageObservation[],
  ): Promise<{ inserted: number; updated: number; skipped: number }> {
    const ids = new Map<string, string>();
    for (const region of regions) {
      const saved = await tx.region.upsert({
        where: { code: region.code },
        create: region,
        update: region,
      });
      ids.set(region.code, saved.id);
    }
    const counters = { inserted: 0, updated: 0, skipped: 0 };
    for (const observation of observations) {
      const regionId = ids.get(observation.regionCode);
      if (!regionId) throw new Error(`Неизвестный регион: ${observation.regionCode}`);
      const { regionCode: _regionCode, ...fields } = observation;
      void _regionCode;
      const unique = { regionId, period: fields.period, metric: fields.metric };
      const existing = await tx.mortgageObservation.findUnique({
        where: { regionId_period_metric: unique },
      });
      const data = { ...fields, regionId, value: new Prisma.Decimal(String(fields.value)) };
      const changed =
        !existing ||
        !existing.value.equals(data.value) ||
        existing.unit !== data.unit ||
        existing.source !== data.source ||
        existing.sourcePublicationId !== data.sourcePublicationId ||
        existing.sourceDatasetId !== data.sourceDatasetId ||
        existing.sourceMeasureId !== data.sourceMeasureId ||
        existing.sourcePeriodDate?.getTime() !== data.sourcePeriodDate.getTime() ||
        existing.sourceUpdatedAt?.getTime() !== data.sourceUpdatedAt?.getTime();
      if (!changed) {
        counters.skipped++;
        continue;
      }
      await tx.mortgageObservation.upsert({
        where: { regionId_period_metric: unique },
        create: data,
        update: { ...data, importedAt: new Date() },
      });
      if (existing) counters.updated++;
      else counters.inserted++;
    }
    return counters;
  }
}
