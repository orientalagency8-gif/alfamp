import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';

import { runMigrations, pool } from './db/pool.ts';
import * as repo from './db/repo.ts';
import { seedIfEmpty } from './seed.ts';
import { healthRoutes } from './routes/health.ts';
import { serversRoutes } from './routes/servers.ts';
import { authRoutes } from './routes/auth.ts';
import { meRoutes } from './routes/me.ts';
import { legalRoutes } from './routes/legal.ts';
import { downloadRoutes } from './routes/download.ts';
import { adminRoutes } from './routes/admin.ts';
import authGuard from './auth/guard.ts';
import { loadJwtSecret } from './auth/tokens.ts';

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }
    },
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'req.body.refresh_token']
  },
  trustProxy: true,         // мы за nginx, X-Forwarded-For нужен
  bodyLimit: 1024 * 64      // 64 KB достаточно для API
});

// --- Plugins ----------------------------------------------------------------

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, { origin: true });
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  keyGenerator: (req) => (
    (req.headers['x-real-ip'] as string)
    || (req.headers['x-forwarded-for'] as string || '').split(',')[0]?.trim()
    || req.ip
  )
});
await app.register(jwt, {
  secret: loadJwtSecret(),
  sign: { algorithm: 'HS256' }
});
await app.register(authGuard);

// --- Routes -----------------------------------------------------------------

await app.register(healthRoutes);
await app.register(serversRoutes);
await app.register(authRoutes);
await app.register(meRoutes);
await app.register(legalRoutes);
await app.register(downloadRoutes);
await app.register(adminRoutes);

// --- Migrations + seed ------------------------------------------------------

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

// --- Background tasks -------------------------------------------------------

setInterval(() => {
  repo.refreshDemoHeartbeats().catch(err => app.log.error({ err }, 'refreshDemoHeartbeats'));
}, 20_000);

setInterval(() => {
  repo.pruneDeadServers(120)
    .then(n => { if (n > 0) app.log.warn({ count: n }, 'pruned dead servers'); })
    .catch(err => app.log.error({ err }, 'pruneDeadServers'));
}, 60_000);

setInterval(() => {
  repo.pruneExpiredTokens()
    .then(n => { if (n > 0) app.log.info({ count: n }, 'pruned expired refresh tokens'); })
    .catch(err => app.log.error({ err }, 'pruneExpiredTokens'));
}, 60 * 60 * 1000);  // раз в час

// --- Start ------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info('═══════════════════════════════════════════════════');
  app.log.info(`  Alfa MP Master Server v0.2.0 (Auth + PG)`);
  app.log.info(`  http://localhost:${PORT}`);
  app.log.info(`  http://localhost:${PORT}/v1/docs`);
  app.log.info('═══════════════════════════════════════════════════');
  app.log.info(`  DEV API KEY: ${devApiKey}`);
  app.log.info('═══════════════════════════════════════════════════');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

async function shutdown(sig: string) {
  app.log.info(`${sig} — shutting down...`);
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
