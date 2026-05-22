/**
 * Fastify-плагин с декораторами requireAuth / requireAdmin.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import * as repo from '../db/repo.ts';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    currentUser?: repo.User;
  }
}

async function authGuard(app: FastifyInstance) {
  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const payload = req.user as { sub: string };
    const user = await repo.getUserById(payload.sub);
    if (!user || user.is_blocked) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    req.currentUser = user;
  });

  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    await (app as any).requireAuth(req, reply);
    if (reply.sent) return;
    if (!req.currentUser?.is_admin) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  });
}

export default fp(authGuard, { name: 'alfa-auth-guard' });
