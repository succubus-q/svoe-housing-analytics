import { regionCode, rubleColumnId, sourceName } from './cbr.catalog.ts';
import type { MetricDefinition } from './cbr.catalog.ts';
import type { JsonRecord } from './cbr.types.ts';
import type { MortgageObservation } from '../mortgage/mortgage.types.ts';

const months = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

function sourceDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z?)?$/.test(value)) {
    throw new Error('Некорректная исходная дата');
  }
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value.slice(0, 10) ||
    date.getUTCDate() !== 1
  )
    throw new Error('Ожидалась валидная дата первого числа месяца');
  return date;
}

export function mapCbrObservation(
  row: JsonRecord,
  definition: MetricDefinition,
  measureId: number,
  updatedAt: string | null,
): MortgageObservation | null {
  if (row.colId !== rubleColumnId) return null;
  if (row.element_id !== rubleColumnId || row.measure_id !== measureId) {
    throw new Error('Неожиданный валютный столбец/разрез');
  }
  if (row.unit_id !== definition.sourceUnitId || row.periodicity !== 'month') {
    throw new Error('Неожиданные единица измерения/периодичность');
  }
  if (typeof row.obs_val !== 'number' || !Number.isFinite(row.obs_val) || row.obs_val < 0) {
    throw new Error('Отсутствующее, отрицательное или нечисловое значение');
  }
  if (definition.metric === 'MORTGAGE_COUNT' && !Number.isSafeInteger(row.obs_val)) {
    throw new Error('Количество кредитов должно быть целым');
  }
  // A zero rate/term is not an actual average: absent lending is not a free loan.
  if (
    (definition.metric === 'AVERAGE_RATE' || definition.metric === 'AVERAGE_TERM') &&
    row.obs_val === 0
  ) {
    return null;
  }
  const date = sourceDate(row.date);
  const period = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  const label = typeof row.dt === 'string' ? row.dt.trim().toLocaleLowerCase('ru') : '';
  if (definition.reporting === 'period') {
    if (label !== `${months[period.getUTCMonth()]} ${period.getUTCFullYear()}`) {
      throw new Error('Метка отчётного месяца не согласуется с исходной датой');
    }
  } else {
    const expected = `01.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`;
    if (label !== expected) throw new Error('Метка даты остатка не согласуется с исходной датой');
  }
  const sourceUpdatedAt =
    updatedAt === null ? null : new Date(updatedAt.endsWith('Z') ? updatedAt : `${updatedAt}Z`);
  if (sourceUpdatedAt && !Number.isFinite(sourceUpdatedAt.getTime())) {
    throw new Error('Некорректная дата обновления источника');
  }
  const value = row.obs_val * definition.multiplier;
  if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER)
    throw new Error('Переполнение значения');
  return {
    regionCode: regionCode(measureId),
    period,
    metric: definition.metric,
    value,
    unit: definition.unit,
    source: sourceName,
    sourcePublicationId: definition.publicationId,
    sourceDatasetId: definition.datasetId,
    sourceMeasureId: measureId,
    sourceUpdatedAt,
    sourcePeriodDate: date,
  };
}
