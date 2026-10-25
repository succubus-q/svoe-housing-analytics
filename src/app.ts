import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registerSchemas } from './common/openapi.ts';
import { CbrApiDataSource } from './modules/cbr/cbr.service.ts';
import { SyncService } from './modules/sync/sync.service.ts';
import { registerSyncRoutes } from './modules/sync/sync.controller.ts';
import { loadConfig } from './common/config.ts';
import { startScheduler } from './modules/sync/sync.scheduler.ts';
import { MortgageService } from './modules/mortgage/mortgage.service.ts';
import { registerMortgageRoutes } from './modules/mortgage/mortgage.controller.ts';

export async function buildApp(
  db = new PrismaClient(),
  options: { scheduler?: boolean; logger?: boolean } = {},
) {
  const app = Fastify({ logger: options.logger ?? true });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Своё Жильё — ипотечная аналитика',
        version: '1.0.0',
        description:
          'Нормализованные реальные месячные данные Банка России. Валюта RUB. Исходные даты остатков сохранены отдельно.',
      },
      servers: [{ url: '/' }],
      tags: [
        { name: 'mortgage', description: 'Регионы и месячные ряды' },
        { name: 'analytics', description: 'Производные показатели' },
        { name: 'sync', description: 'Управление синхронизацией' },
        { name: 'health', description: 'Работоспособность' },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  registerSchemas(app);
  const config = loadConfig();
  const sync = new SyncService(db, new CbrApiDataSource(config, (msg) => app.log.info(msg)));
  registerSyncRoutes(app, sync);
  registerMortgageRoutes(app, new MortgageService(db));
  app.setErrorHandler((error, request, reply) => {
    const status =
      error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (status >= 500) request.log.error(error);
    void reply.code(status).send({
      error:
        status >= 500
          ? 'Внутренняя ошибка сервиса'
          : error instanceof Error
            ? error.message
            : 'Ошибка запроса',
    });
  });
  let stopScheduler = () => {};
  app.addHook('onReady', async () => {
    if (options.scheduler !== false)
      stopScheduler = startScheduler(sync, config, (msg) => app.log.info(msg));
  });
  app.addHook('onClose', async () => {
    stopScheduler();
    await sync.waitForIdle();
  });
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Проверка приложения и соединения с PostgreSQL',
        response: {
          200: {
            type: 'object',
            properties: { status: { type: 'string' }, database: { type: 'string' } },
          },
          503: {
            type: 'object',
            properties: { status: { type: 'string' }, database: { type: 'string' } },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        await db.$queryRaw`SELECT 1`;
        return { status: 'ok', database: 'ok' };
      } catch {
        return reply.code(503).send({ status: 'degraded', database: 'unavailable' });
      }
    },
  );
  return app;
}
