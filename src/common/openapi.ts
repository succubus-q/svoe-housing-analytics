import type { FastifyInstance } from 'fastify';
import { metricCatalog } from '../modules/cbr/cbr.catalog.ts';

const nullableNumber = { type: 'number', nullable: true };
const nullableDate = { type: 'string', format: 'date-time', nullable: true };
const month = { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' };
export function registerSchemas(app: FastifyInstance) {
  app.addSchema({
    $id: 'Region',
    type: 'object',
    additionalProperties: true,
    properties: {
      code: { type: 'string' },
      name: { type: 'string' },
      sourceId: { type: 'integer' },
    },
  });
  app.addSchema({
    $id: 'ValueStat',
    type: 'object',
    required: ['value', 'unit', 'mom', 'yoy'],
    properties: {
      value: nullableNumber,
      unit: { type: 'string' },
      mom: nullableNumber,
      yoy: nullableNumber,
    },
  });
  app.addSchema({
    $id: 'SyncLog',
    type: 'object',
    additionalProperties: true,
    properties: {
      id: { type: 'string' },
      status: { type: 'string', enum: ['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED'] },
      startedAt: { type: 'string', format: 'date-time' },
      finishedAt: nullableDate,
      recordsReceived: { type: 'integer' },
      recordsInserted: { type: 'integer' },
      recordsUpdated: { type: 'integer' },
      recordsSkipped: { type: 'integer' },
      errorMessage: { type: 'string', nullable: true },
      issues: { type: 'array', items: { type: 'string' } },
    },
  });
  app.addSchema({
    $id: 'SyncStatus',
    type: 'object',
    properties: {
      latest: { anyOf: [{ $ref: 'SyncLog#' }, { type: 'null' }] },
      lastSuccessfulAt: nullableDate,
      observations: { type: 'integer' },
      running: { type: 'boolean' },
      source: { type: 'string' },
      currency: { type: 'string' },
    },
  });
  app.addSchema({
    $id: 'Observation',
    type: 'object',
    additionalProperties: true,
    properties: {
      period: month,
      metric: { type: 'string', enum: metricCatalog.map((d) => d.metric) },
      value: { type: 'number' },
      unit: { type: 'string' },
      source: { type: 'string' },
      sourceUpdatedAt: nullableDate,
      sourcePeriodDate: nullableDate,
    },
  });
  app.addSchema({
    $id: 'Stats',
    type: 'object',
    properties: {
      region: { $ref: 'Region#' },
      from: month,
      to: month,
      currency: { type: 'string' },
      observations: { type: 'array', items: { $ref: 'Observation#' } },
    },
  });
  app.addSchema({
    $id: 'Summary',
    type: 'object',
    properties: {
      region: { $ref: 'Region#' },
      period: month,
      availablePeriods: { type: 'array', items: month },
      currency: { type: 'string' },
      source: { type: 'string' },
      sourceUpdatedAt: nullableDate,
      methodology: { type: 'string' },
      metrics: {
        type: 'object',
        properties: Object.fromEntries(
          metricCatalog.map((d) => [d.metric, { $ref: 'ValueStat#' }]),
        ),
      },
      averageLoanSize: { $ref: 'ValueStat#' },
    },
  });
}
