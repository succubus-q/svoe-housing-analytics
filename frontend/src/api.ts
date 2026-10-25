export type Metric =
  'MORTGAGE_COUNT' | 'MORTGAGE_VOLUME' | 'AVERAGE_RATE' | 'AVERAGE_TERM' | 'DEBT' | 'OVERDUE_DEBT';
export interface Region {
  code: string;
  name: string;
  sourceId: number;
}
export interface ValueStat {
  value: number | null;
  mom: number | null;
  yoy: number | null;
  unit: string;
}
export interface Summary {
  region: Region;
  period: string;
  availablePeriods: string[];
  currency: string;
  sourceUpdatedAt: string | null;
  metrics: Record<Metric, ValueStat>;
  averageLoanSize: ValueStat;
}
export interface Observation {
  period: string;
  metric: Metric;
  value: number;
  unit: string;
}
export interface SyncLog {
  status: string;
  finishedAt: string | null;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errorMessage: string | null;
  issues: string[];
}
export interface SyncStatus {
  latest: SyncLog | null;
  observations: number;
  running: boolean;
  lastSuccessfulAt: string | null;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error ?? body.errorMessage ?? `Ошибка запроса (${response.status})`);
  return body as T;
}

export function monthLabel(value: string, short = false): string {
  return new Intl.DateTimeFormat('ru-RU', {
    month: short ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(`${value}-01T00:00:00Z`))
    .replace(' г.', '');
}
export function number(value: number | null | undefined, digits = 1): string {
  return value == null
    ? '—'
    : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
}
export function dateLabel(value: string | null | undefined): string {
  return value
    ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'Europe/Moscow' }).format(
        new Date(value),
      )
    : 'Пока нет';
}
