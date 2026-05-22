import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as repo from '../db/repo.ts';

const RegisterSchema = z.object({
  name: z.string().min(3).max(64),
  endpoint: z.string().regex(/^[a-zA-Z0-9.\-]+:\d+$/, { message: 'endpoint must be host:port' }),
  slots: z.number().int().min(1).max(1024),
  tags: z.array(z.string().max(24)).max(8).default([]),
  region: z.string().length(2).default('XX'),
  apiKey: z.string().min(10)
});

const HeartbeatSchema = z.object({
  serverId: z.string().uuid(),
  apiKey: z.string().min(10),
  players: z.number().int().min(0)
});

export async function serversRoutes(app: FastifyInstance) {
  app.get('/v1/servers', async () => {
    const list = await repo.listAliveServers();
    return { servers: list, count: list.length };
  });

  app.post('/v1/servers/register', async (req, reply) => {
    const parse = RegisterSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'validation', issues: parse.error.flatten() });
    }
    const { name, endpoint, slots, tags, region, apiKey } = parse.data;

    const key = await repo.validateApiKey(apiKey);
    if (!key) return reply.code(401).send({ error: 'invalid_api_key' });

    const srv = await repo.registerServer({
      name, endpoint, slots, tags, region, api_key: apiKey
    });

    app.log.info({ id: srv.id, name, endpoint, region }, 'server registered');
    return { id: srv.id, status: 'registered' };
  });

  app.post('/v1/servers/heartbeat', async (req, reply) => {
    const parse = HeartbeatSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'validation', issues: parse.error.flatten() });
    }
    const { serverId, apiKey, players } = parse.data;

    const key = await repo.validateApiKey(apiKey);
    if (!key) return reply.code(401).send({ error: 'invalid_api_key' });

    const ok = await repo.heartbeatServer(serverId, apiKey, players);
    if (!ok) return reply.code(404).send({ error: 'server_not_found_or_wrong_owner' });

    return { status: 'ok' };
  });

  app.get<{ Params: { id: string } }>('/v1/servers/:id', async (req, reply) => {
    const id = req.params.id;
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      return reply.code(400).send({ error: 'invalid_id' });
    }
    const srv = await repo.getServer(id);
    if (!srv || srv.banned_at) return reply.code(404).send({ error: 'not_found' });
    const { api_key, banned_at, ...pub } = srv;
    return pub;
  });
}
