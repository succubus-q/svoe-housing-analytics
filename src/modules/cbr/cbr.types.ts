// External contracts checked against CBR's official OpenAPI and live responses.
// Additional fields are preserved; these are not the application's domain models.
export interface Publication {
  id: number;
  parent_id: number | null;
  category_name: string;
  NoActive: number;
}

export interface Dataset {
  id: number;
  name: string;
  type: number;
  full_name?: string | null;
  reporting?: string | null;
  updated_time?: string | null;
  link?: string | null;
}

export interface Measure {
  id: number;
  name: string;
  parent_id: number | null;
}

export interface YearRange {
  FromYear: number;
  ToYear: number;
}

export type JsonRecord = Record<string, unknown>;

export interface DataResponse extends JsonRecord {
  RawData: JsonRecord[];
  headerData: JsonRecord[];
  units: JsonRecord[];
}

export class CbrContractError extends Error {
  constructor(context: string) {
    super(`Ответ ЦБ не соответствует проверяемому контракту: ${context}. См. сохранённый raw.`);
    this.name = 'CbrContractError';
  }
}

export function record(value: unknown, context: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CbrContractError(context);
  }
  return value as JsonRecord;
}

export function records(value: unknown, context: string): JsonRecord[] {
  if (!Array.isArray(value)) throw new CbrContractError(context);
  return value.map((item: unknown, i) => record(item, `${context}[${i}]`));
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function requireFields(rows: JsonRecord[], context: string, check: (r: JsonRecord) => boolean) {
  for (const [index, row] of rows.entries()) {
    if (!check(row)) throw new CbrContractError(`${context}[${index}]`);
  }
}

export function parsePublications(value: unknown): Publication[] {
  const rows = records(value, 'publications');
  requireFields(
    rows,
    'publications',
    (r) =>
      integer(r.id) &&
      (integer(r.parent_id) || r.parent_id === null) &&
      typeof r.category_name === 'string' &&
      integer(r.NoActive),
  );
  return rows as unknown as Publication[];
}

export function parseDatasets(value: unknown): Dataset[] {
  const rows = records(value, 'datasets');
  requireFields(
    rows,
    'datasets',
    (r) => integer(r.id) && typeof r.name === 'string' && integer(r.type),
  );
  return rows as unknown as Dataset[];
}

export function parseMeasures(value: unknown): Measure[] {
  const rows = records(record(value, 'measures').measure, 'measures.measure');
  requireFields(
    rows,
    'measures.measure',
    (r) =>
      integer(r.id) && typeof r.name === 'string' && (integer(r.parent_id) || r.parent_id === null),
  );
  return rows as unknown as Measure[];
}

export function parseYears(value: unknown): YearRange[] {
  const rows = records(value, 'years');
  requireFields(
    rows,
    'years',
    (r) => integer(r.FromYear) && integer(r.ToYear) && r.FromYear > 0 && r.ToYear >= r.FromYear,
  );
  return rows as unknown as YearRange[];
}

export function parseData(value: unknown): DataResponse {
  const result = record(value, 'data');
  const raw = records(result.RawData, 'data.RawData');
  records(result.headerData, 'data.headerData');
  records(result.units, 'data.units');
  // Null observations are allowed by CBR's contract. This inspector preserves them;
  // the domain mapper must later decide which observations are importable.
  requireFields(
    raw,
    'data.RawData',
    (r) =>
      (r.obs_val === null || (typeof r.obs_val === 'number' && Number.isFinite(r.obs_val))) &&
      (r.date === null || typeof r.date === 'string') &&
      (r.periodicity === null || typeof r.periodicity === 'string'),
  );
  return result as DataResponse;
}
