import type { FastifyInstance } from 'fastify';
import type { SyncService } from './sync.service.ts';

export function registerSyncRoutes(app: FastifyInstance, sync: SyncService) {
  app.get(
    '/api/v1/sync/status',
    {
      schema: {
        tags: ['sync'],
        summary: 'Последний запуск, результат, счётчики и доступность данных',
        response: { 200: { $ref: 'SyncStatus#' } },
      },
    },
    async () => sync.status(),
  );
  app.post(
    '/api/v1/sync/run',
    {
      schema: {
        tags: ['sync'],
        summary: 'Выполнить синхронизацию и вернуть итоговый SyncLog',
        description:
          'Ожидает завершения импорта. HTTP 409 при параллельном запуске. Данные реального API ЦБ; валюта RUB.',
        response: {
          200: { $ref: 'SyncLog#' },
          502: { $ref: 'SyncLog#' },
          409: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (_request, reply) => {
      const result = await sync.run();
      return reply.code(result.status === 'FAILED' ? 502 : 200).send(result);
    },
  );
}
