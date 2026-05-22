import Fastify from 'fastify';
import cors from '@fastify/cors';

import { runMigrations, pool } from './db/pool.ts';
import * as repo from './db/repo.ts';
import { seedIfEmpty } from './seed.ts';
import { healthRoutes } from './routes/health.ts';
import { serversRoutes } from './routes/servers.ts';

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  }
});

await app.register(cors, { origin: true });
await app.register(healthRoutes);
await app.register(serversRoutes);

// ====== Migrations + seed ======

try {
  await runMigrations();
} catch (e) {
  app.log.fatal({ err: e }, 'DB migration failed — aborting boot');
  process.exit(1);
}

let devApiKey = process.env.DEV_API_KEY || 'alfa_dev_owner_local';
if (process.env.DEV_SEED === 'true' || process.env.DEV_SEED === '1') {
  const seed = await seedIfEmpty();
  devApiKey = seed.devApiKey;
}

// ====== Background tasks ======

// Обновляем heartbeat демо-серверов каждые 20 сек + лёгкий дрифт players
setInterval(() => {
  repo.refreshDemoHeartbeats().catch(err => app.log.error({ err }, 'refreshDemoHeartbeats failed'));
}, 20_000);

// Чистим dead-non-demo серверы каждые 60 сек
setInterval(() => {
  repo.pruneDeadServers(120)
    .then(n => { if (n > 0) app.log.warn({ count: n }, 'pruned dead servers'); })
    .catch(err => app.log.error({ err }, 'pruneDeadServers failed'));
}, 60_000);

// ====== Start ======

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info('═══════════════════════════════════════════════════');
  app.log.info(`  Alfa MP Master Server v0.1.0 (PostgreSQL)`);
  app.log.info(`  http://localhost:${PORT}`);
  app.log.info(`  http://localhost:${PORT}/v1/docs`);
  app.log.info('═══════════════════════════════════════════════════');
  app.log.info(`  DEV API KEY: ${devApiKey}`);
  app.log.info('═══════════════════════════════════════════════════');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
async function shutdown(sig: string) {
  app.log.info(`${sig} received, shutting down...`);
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
