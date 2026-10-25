import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

export async function createTestDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for PostgreSQL tests');
  const schema = `review_${randomUUID().replaceAll('-', '')}`;
  const admin = new PrismaClient();
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('schema', schema);
  url.searchParams.set('connection_limit', '1');
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  try {
    const root = new URL('../../prisma/migrations/', import.meta.url);
    for (const directory of (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      // These reviewed migrations contain plain DDL, without functions or embedded semicolons.
      const sql = await readFile(new URL(`${directory.name}/migration.sql`, root), 'utf8');
      for (const statement of sql.split(';').filter((s) => s.trim()))
        await db.$executeRawUnsafe(statement);
    }
    return {
      db,
      admin,
      url: url.href,
      schema,
      async close() {
        await db.$disconnect();
        if (!/^review_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema');
        await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.$disconnect();
      },
    };
  } catch (error) {
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
    throw error;
  }
}
