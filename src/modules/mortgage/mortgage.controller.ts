import type { FastifyInstance } from 'fastify';
import type { MortgageService, StatsQuery, SummaryQuery } from './mortgage.service.ts';
import { metricCatalog } from '../cbr/cbr.catalog.ts';

const region = {
  type: 'string',
  pattern: '^CBR-[1-9][0-9]*$',
  description: 'Код из GET /api/v1/regions, например CBR-22',
};
const month = {
  type: 'string',
  pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
  description: 'Отчётный месяц YYYY-MM',
};

export function registerMortgageRoutes(app: FastifyInstance, service: MortgageService) {
  app.get(
    '/api/v1/regions',
    {
      schema: {
        tags: ['mortgage'],
        summary: 'Регионы с импортированными данными',
        response: { 200: { type: 'array', items: { $ref: 'Region#' } } },
      },
    },
    async () => service.regions(),
  );
  app.get<{ Querystring: StatsQuery }>(
    '/api/v1/mortgage/stats',
    {
      schema: {
        tags: ['mortgage'],
        summary: 'Нормализованные месячные ряды (валюта RUB)',
        response: { 200: { $ref: 'Stats#' } },
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['region', 'from', 'to'],
          properties: {
            region,
            from: month,
            to: month,
            metric: { type: 'string', enum: metricCatalog.map((d) => d.metric) },
          },
        },
      },
    },
    async (request) => service.stats(request.query),
  );
  app.get<{ Querystring: SummaryQuery }>(
    '/api/v1/mortgage/summary',
    {
      schema: {
        tags: ['analytics'],
        summary: 'Карточки, средний размер кредита, MoM и YoY',
        response: { 200: { $ref: 'Summary#' } },
        description:
          'Без period выбирает последний доступный месяц; null означает отсутствие данных или нулевую базу сравнения. MoM/YoY в процентах для каждой метрики.',
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['region'],
          properties: { region, period: month },
        },
      },
    },
    async (request) => service.summary(request.query),
  );
}
