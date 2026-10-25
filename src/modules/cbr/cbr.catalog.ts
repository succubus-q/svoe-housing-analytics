// Verified against live publications/datasets/measures on 2026-10-20.
// Evidence: data/evidence/*/manifest.json. Revalidate these IDs on every sync.
export const metricCatalog = [
  {
    metric: 'MORTGAGE_COUNT',
    publicationId: 21,
    datasetId: 44,
    expectedName: 'Количество кредитов',
    reporting: 'period',
    sourceUnitId: 7,
    unit: 'credits',
    multiplier: 1,
    sample: 'mortgage-count.json',
  },
  {
    metric: 'MORTGAGE_VOLUME',
    publicationId: 21,
    datasetId: 45,
    expectedName: 'Объем кредитов',
    reporting: 'period',
    sourceUnitId: 6,
    unit: 'RUB',
    multiplier: 1_000_000,
    sample: 'mortgage-volume.json',
  },
  {
    metric: 'AVERAGE_RATE',
    publicationId: 15,
    datasetId: 34,
    expectedName: 'Ставки по ипотечным жилищным кредитам',
    reporting: 'period',
    sourceUnitId: 1,
    unit: 'percent_per_year',
    multiplier: 1,
    sample: 'mortgage-rate-moscow.json',
  },
  {
    metric: 'AVERAGE_TERM',
    publicationId: 21,
    datasetId: 48,
    expectedName: 'Средневзвешенный срок по кредитам',
    reporting: 'period',
    sourceUnitId: 5,
    unit: 'months',
    multiplier: 1,
    sample: 'mortgage-term.json',
  },
  {
    metric: 'DEBT',
    publicationId: 21,
    datasetId: 46,
    expectedName: 'Задолженность по кредитам',
    reporting: 'date',
    sourceUnitId: 6,
    unit: 'RUB',
    multiplier: 1_000_000,
    sample: 'mortgage-debt.json',
  },
  {
    metric: 'OVERDUE_DEBT',
    publicationId: 21,
    datasetId: 47,
    expectedName: 'Просроченная задолженность по кредитам',
    reporting: 'date',
    sourceUnitId: 6,
    unit: 'RUB',
    multiplier: 1_000_000,
    sample: 'mortgage-overdue-debt.json',
  },
] as const;

export type MetricDefinition = (typeof metricCatalog)[number];
export type Metric = MetricDefinition['metric'];
export const rubleColumnId = 36;
export const sourceName = 'CBR_DATA_SERVICE';

// CBR IDs use a separate namespace and are never represented as ISO/OKATO codes.
export function regionCode(measureId: number): string {
  return `CBR-${measureId}`;
}
