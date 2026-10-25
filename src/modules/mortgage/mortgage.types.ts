import type { Metric } from '../cbr/cbr.catalog.ts';

export interface SourceRegion {
  code: string;
  name: string;
  sourceId: number;
  parentCode: string | null;
}

export interface MortgageObservation {
  regionCode: string;
  period: Date;
  metric: Metric;
  value: number;
  unit: string;
  source: string;
  sourcePublicationId: number;
  sourceDatasetId: number;
  sourceMeasureId: number;
  sourceUpdatedAt: Date | null;
  sourcePeriodDate: Date;
}

export interface SourceResult {
  regions: SourceRegion[];
  observations: MortgageObservation[];
  received: number;
  skipped: number;
  issues: string[];
}

export interface MortgageDataSource {
  getMortgageStats(): Promise<SourceResult>;
}
