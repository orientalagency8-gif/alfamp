import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import crypto from 'node:crypto';

// ============================================================
// Types
// ============================================================

interface ServerInfo {
  id: string;
  name: string;
  endpoint: string;       // host:port (UDP game-server)
  slots: number;
  players: number;
  tags: string[];
  region: string;
  ownerKey: string;       // не отдаём наружу
  lastHeartbeat: number;
  registeredAt: number;
  verified: boolean;
}

type PublicServer = Omit<ServerInfo, 'ownerKey'>;

interface ApiKey {
  ownerEmail: string;
  createdAt: number;
  label: string;
}

// ============================================================
// Storage (in-memory; заменим на Postgres позже)
// ============================================================

const servers = new Map<string, ServerInfo>();
const apiKeys = new Map<string, ApiKey>();

// Bootstrap dev API-key — печатается в консоль при старте,
// используется в тестовых командах ниже
const DEV_OWNER_KEY = `alfa_dev_${crypto.randomBytes(12).toString('hex')}`;
apiKeys.set(DEV_OWNER_KEY, {
  ownerEmail: 'owner@alfamp.local',
  createdAt: Date.now(),
  label: 'Bootstrap dev key (auto-generated on startup)'
});

// ============================================================
// Schemas
// ============================================================

const RegisterSchema = z.object({
  name: z.string().min(3).max(64),
  endpoint: z.string().regex(/^[a-zA-Z0-9.\-]+:\d+$/, {
    message: 'endpoint must be host:port'
  }),
  slots: z.number().int().min(1).max(1024),
  tags: z.array(z.string().max(24)).max(8).default([]),
  region: z.string().length(2).toUpperCase().default('XX'),
  apiKey: z.string().min(10)
});

const HeartbeatSchema = z.object({
  serverId: z.string().length(24),
  apiKey: z.string().min(10),
  players: z.number().int().min(0)
});

const HEARTBEAT_TIMEOUT_MS = 60_000;      // сервер считается мёртвым после 60 сек тишины
const PRUNE_THRESHOLD_MS = 120_000;       // удаляем из реестра через 2 минуты

// ============================================================
// Server
// ============================================================

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

// Root — простой health check
app.get('/', async () => ({
  name: 'Alfa MP Master Server',
  version: '0.0.1',
  status: 'ok',
  uptime: Math.floor(process.uptime()),
  serversRegistered: servers.size,
  serversAlive: Array.from(servers.values()).filter(
    s => Date.now() - s.lastHeartbeat < HEARTBEAT_TIMEOUT_MS
  ).length,
  docs: '/v1/docs'
}));

// API docs (минимальная страница)
app.get('/v1/docs', async (_, reply) => {
  reply.type('text/html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Alfa MP Master — API</title>
<style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#222}
code{background:#f0f0f0;padding:2px 6px;border-radius:3px}
.method{display:inline-block;padding:2px 8px;border-radius:3px;color:white;font-weight:bold;font-size:12px}
.get{background:#0a7}.post{background:#37c}
section{margin:24px 0;border-left:3px solid #ddd;padding-left:16px}
</style></head><body>
<h1>Alfa MP — Master Server API <small style="font-size:14px;color:#888">v1</small></h1>

<section><h3><span class="method get">GET</span> /</h3>
<p>Health check + сводка.</p></section>

<section><h3><span class="method get">GET</span> /v1/servers</h3>
<p>Список всех живых game-серверов (heartbeat был в последние 60 сек).</p>
<p>Возвращает: <code>{ servers: [...] }</code></p></section>

<section><h3><span class="method post">POST</span> /v1/servers/register</h3>
<p>Регистрация нового game-сервера. Требует валидный API-ключ.</p>
<pre>{
  "name": "Drift Madness",
  "endpoint": "1.2.3.4:30120",
  "slots": 64,
  "tags": ["drift", "freeroam"],
  "region": "RU",
  "apiKey": "alfa_dev_xxx..."
}</pre>
<p>Ответ: <code>{ id, status }</code></p></section>

<section><h3><span class="method post">POST</span> /v1/servers/heartbeat</h3>
<p>Game-сервер шлёт каждые 30 сек.</p>
<pre>{
  "serverId": "abcdef123...",
  "apiKey": "alfa_dev_xxx...",
  "players": 12
}</pre></section>

<p style="margin-top:40px;color:#888">Status: development. См. <a href="https://github.com/">repo</a> когда будет.</p>
</body></html>`);
});

// GET /v1/servers — публичный список
app.get('/v1/servers', async () => {
  const now = Date.now();
  const alive: PublicServer[] = Array.from(servers.values())
    .filter(s => now - s.lastHeartbeat < HEARTBEAT_TIMEOUT_MS)
    .map(({ ownerKey, ...pub }) => pub)
    .sort((a, b) => b.players - a.players);  // сначала самые заполненные
  return { servers: alive, count: alive.length };
});

// POST /v1/servers/register
app.post('/v1/servers/register', async (req, reply) => {
  const parse = RegisterSchema.safeParse(req.body);
  if (!parse.success) {
    return reply.code(400).send({ error: 'validation', issues: parse.error.flatten() });
  }
  const { name, endpoint, slots, tags, region, apiKey } = parse.data;
  if (!apiKeys.has(apiKey)) {
    return reply.code(401).send({ error: 'invalid_api_key' });
  }

  const id = crypto.randomBytes(12).toString('hex');
  const now = Date.now();
  const server: ServerInfo = {
    id, name, endpoint, slots,
    players: 0,
    tags, region,
    ownerKey: apiKey,
    lastHeartbeat: now,
    registeredAt: now,
    verified: false
  };
  servers.set(id, server);

  app.log.info({ id, name, endpoint, region }, '✓ server registered');
  return { id, status: 'registered' };
});

// POST /v1/servers/heartbeat
app.post('/v1/servers/heartbeat', async (req, reply) => {
  const parse = HeartbeatSchema.safeParse(req.body);
  if (!parse.success) {
    return reply.code(400).send({ error: 'validation', issues: parse.error.flatten() });
  }
  const { serverId, apiKey, players } = parse.data;
  const server = servers.get(serverId);
  if (!server) return reply.code(404).send({ error: 'server_not_found' });
  if (server.ownerKey !== apiKey) return reply.code(403).send({ error: 'wrong_owner' });

  server.players = players;
  server.lastHeartbeat = Date.now();
  return { status: 'ok' };
});

// Cleanup мёртвых серверов каждые 30 сек
setInterval(() => {
  const now = Date.now();
  for (const [id, srv] of servers) {
    if (now - srv.lastHeartbeat > PRUNE_THRESHOLD_MS) {
      servers.delete(id);
      app.log.warn({ id, name: srv.name }, '✗ server pruned (no heartbeat 2min)');
    }
  }
}, 30_000);

// ============================================================
// Start
// ============================================================

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info('═══════════════════════════════════════════════════');
  app.log.info(`  Alfa MP Master Server v0.0.1`);
  app.log.info(`  http://localhost:${PORT}`);
  app.log.info(`  http://localhost:${PORT}/v1/docs`);
  app.log.info('═══════════════════════════════════════════════════');
  app.log.info(`  DEV API KEY (использовать для теста):`);
  app.log.info(`    ${DEV_OWNER_KEY}`);
  app.log.info('═══════════════════════════════════════════════════');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
