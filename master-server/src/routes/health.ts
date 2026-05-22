import type { FastifyInstance } from 'fastify';
import * as repo from '../db/repo.ts';
import { healthCheck as dbHealthCheck } from '../db/pool.ts';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    const counts = await repo.getCounts();
    const dbOk = await dbHealthCheck();
    return {
      name: 'Alfa MP Master Server',
      version: '0.2.0',
      status: dbOk ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      db: dbOk ? 'connected' : 'down',
      ...counts,
      docs: '/v1/docs',
      legal: '/v1/legal'
    };
  });

  app.get('/health', async () => ({
    ok: await dbHealthCheck(),
    uptime: Math.floor(process.uptime())
  }));

  app.get('/v1/docs', async (_, reply) => {
    reply.type('text/html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Alfa MP Master — API</title>
<style>body{font-family:system-ui,sans-serif;max-width:840px;margin:40px auto;padding:0 20px;color:#222;line-height:1.5}
code{background:#f0f0f0;padding:2px 6px;border-radius:3px;font-family:Consolas,monospace}
.m{display:inline-block;padding:2px 8px;border-radius:3px;color:white;font-weight:bold;font-size:12px}
.get{background:#0a7}.post{background:#37c}
section{margin:24px 0;border-left:3px solid #ddd;padding:8px 16px}
pre{background:#1e1e1e;color:#dcdcdc;padding:12px;border-radius:4px;overflow-x:auto;font-size:13px}
h3{margin-top:0}
</style></head><body>
<h1>Alfa MP Master Server <small style="font-size:14px;color:#888">v0.1.0 · API v1</small></h1>
<p>Backend для каталога game-серверов и регистрации хостеров.</p>

<h2>Public</h2>
<section><h3><span class="m get">GET</span> /</h3>
<p>Health + статистика.</p></section>

<section><h3><span class="m get">GET</span> /v1/servers</h3>
<p>Все живые серверы (heartbeat &lt; 60 сек). Отсортированы по числу игроков.</p></section>

<section><h3><span class="m get">GET</span> /v1/servers/:id</h3>
<p>Детали одного сервера по UUID.</p></section>

<h2>Game-server protocol</h2>
<section><h3><span class="m post">POST</span> /v1/servers/register</h3>
<pre>{ "name":"...", "endpoint":"1.2.3.4:30120", "slots":64,
  "tags":["drift"], "region":"EU", "apiKey":"alfa_..." }</pre>
<p>Возвращает: <code>{ "id":"&lt;UUID&gt;", "status":"registered" }</code></p></section>

<section><h3><span class="m post">POST</span> /v1/servers/heartbeat</h3>
<pre>{ "serverId":"&lt;UUID&gt;", "apiKey":"alfa_...", "players":12 }</pre>
<p>Шлётся каждые 30 сек. Сервер пропадает из <code>/v1/servers</code> после 60 сек без пинга.</p></section>

<h2>Auth</h2>
<section><h3><span class="m post">POST</span> /v1/auth/register</h3>
<pre>{ "email":"...", "password":"min12chars", "display_name":"optional" }</pre>
<p>Rate-limit: 5 регистраций / 15 мин с IP.</p></section>

<section><h3><span class="m post">POST</span> /v1/auth/login</h3>
<pre>{ "email":"...", "password":"..." }</pre>
<p>Возвращает <code>access_token</code> (15 мин) + <code>refresh_token</code> (30 дней).</p></section>

<section><h3><span class="m post">POST</span> /v1/auth/refresh</h3>
<pre>{ "refresh_token":"..." }</pre>
<p>Rotation — старый токен инвалидируется, выдаётся новый.</p></section>

<section><h3><span class="m post">POST</span> /v1/auth/logout</h3>
<pre>{ "refresh_token":"..." }</pre></section>

<h2>Account (требует Bearer JWT)</h2>
<section><h3><span class="m get">GET</span> /v1/me</h3></section>
<section><h3><span class="m get">GET</span> /v1/me/api-keys</h3></section>
<section><h3><span class="m post">POST</span> /v1/me/api-keys</h3>
<pre>{ "label":"My Drift Server" }</pre></section>
<section><h3><span class="m get">GET</span> /v1/me/servers</h3></section>

</body></html>`);
  });
}
