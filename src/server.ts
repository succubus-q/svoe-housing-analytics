import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.ts';
import { loadConfig } from './common/config.ts';

const config = loadConfig();
const db = new PrismaClient();
const app = await buildApp(db);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  await db.$disconnect();
}
process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
try {
  await db.$connect();
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await shutdown();
  process.exitCode = 1;
}
