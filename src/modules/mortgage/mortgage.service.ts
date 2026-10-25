import type { PrismaClient, MortgageObservation as StoredObservation } from '@prisma/client';
import { metricCatalog } from '../cbr/cbr.catalog.ts';
import type { Metric } from '../cbr/cbr.catalog.ts';
import {
  averageLoanSize,
  percentageChange,
  monthDate,
  shiftMonth,
} from '../analytics/analytics.service.ts';
import { HttpError } from '../../common/http-error.ts';

export interface StatsQuery {
  region: string;
  from: string;
  to: string;
  metric?: Metric;
}
export interface SummaryQuery {
  region: string;
  period?: string;
}

function dto(row: StoredObservation) {
  return { ...row, period: row.period.toISOString().slice(0, 7), value: row.value.toNumber() };
}

export class MortgageService {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) {
    this.db = db;
  }

  async regions() {
    return this.db.region.findMany({
      where: { observations: { some: {} } },
      orderBy: { sourceId: 'asc' },
      select: { code: true, name: true, sourceId: true, parentCode: true },
    });
  }

  private async region(code: string) {
    const region = await this.db.region.findUnique({ where: { code } });
    if (!region)
      throw new HttpError(404, 'Регион не найден. Доступные регионы: GET /api/v1/regions');
    return region;
  }

  async stats(query: StatsQuery) {
    const region = await this.region(query.region);
    const from = monthDate(query.from);
    const to = monthDate(query.to);
    if (from > to || to.getTime() - from.getTime() > 25 * 366 * 86400000) {
      throw new HttpError(400, 'Требуется from <= to; максимальный диапазон — 25 лет');
    }
    const observations = await this.db.mortgageObservation.findMany({
      where: {
        regionId: region.id,
        period: { gte: from, lte: to },
        ...(query.metric ? { metric: query.metric } : {}),
      },
      orderBy: [{ period: 'asc' }, { metric: 'asc' }],
    });
    return {
      region,
      from: query.from,
      to: query.to,
      currency: 'RUB',
      observations: observations.map(dto),
    };
  }

  async summary(query: SummaryQuery) {
    const region = await this.region(query.region);
    const periods = await this.db.mortgageObservation.findMany({
      where: { regionId: region.id },
      distinct: ['period'],
      select: { period: true },
      orderBy: { period: 'desc' },
    });
    const availablePeriods = periods.map((row) => row.period.toISOString().slice(0, 7));
    const period = query.period ?? availablePeriods[0];
    if (!period || !availablePeriods.includes(period))
      throw new HttpError(404, 'Нет данных за выбранный месяц');
    const previous = shiftMonth(period, -1);
    const lastYear = shiftMonth(period, -12);
    const rows = await this.db.mortgageObservation.findMany({
      where: { regionId: region.id, period: { in: [period, previous, lastYear].map(monthDate) } },
    });
    function value(month: string, metric: Metric): number | null {
      return (
        rows
          .find((row) => row.metric === metric && row.period.toISOString().startsWith(month))
          ?.value.toNumber() ?? null
      );
    }
    const metrics = Object.fromEntries(
      metricCatalog.map((definition) => [
        definition.metric,
        {
          value: value(period, definition.metric),
          unit: definition.unit,
          mom: percentageChange(
            value(period, definition.metric),
            value(previous, definition.metric),
          ),
          yoy: percentageChange(
            value(period, definition.metric),
            value(lastYear, definition.metric),
          ),
        },
      ]),
    );
    function average(month: string) {
      return averageLoanSize(value(month, 'MORTGAGE_VOLUME'), value(month, 'MORTGAGE_COUNT'));
    }
    const currentRows = rows.filter((row) => row.period.toISOString().startsWith(period));
    const sourceUpdatedAt =
      currentRows
        .map((row) => row.sourceUpdatedAt)
        .filter((date): date is Date => date !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      region,
      period,
      availablePeriods,
      currency: 'RUB',
      source: 'Банк России',
      sourceUpdatedAt,
      metrics,
      averageLoanSize: {
        value: average(period),
        unit: 'RUB',
        mom: percentageChange(average(period), average(previous)),
        yoy: percentageChange(average(period), average(lastYear)),
      },
      methodology:
        'Выдачи в рублях за месяц; остатки на первое число следующего месяца. Срок в месяцах, ставка в % годовых.',
    };
  }
}
