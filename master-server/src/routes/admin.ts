import type { FastifyInstance } from 'fastify';
import * as repo from '../db/repo.ts';
import crypto from 'node:crypto';

// Simple session-based admin protection: hash(ADMIN_PASS) compared on each request.
// In production we'd swap for full RBAC; this is sufficient for early hosters.
const ADMIN_PASS_HASH = (() => {
  const raw = process.env.ADMIN_PASS || 'change-me-now';
  return crypto.createHash('sha256').update(raw).digest('hex');
})();

const SESSIONS = new Set<string>();
const SESSION_TTL_MS = 60 * 60 * 1000; // 1h

function newSession(): string {
  const id = crypto.randomBytes(32).toString('hex');
  SESSIONS.add(id);
  setTimeout(() => SESSIONS.delete(id), SESSION_TTL_MS);
  return id;
}

function checkSession(req: any): boolean {
  const cookie = (req.headers.cookie || '') as string;
  const m = cookie.match(/alfa_admin=([a-f0-9]+)/);
  return m ? SESSIONS.has(m[1]) : false;
}

export async function adminRoutes(app: FastifyInstance) {
  // ── Login page ──────────────────────────────────────────────────────────
  app.get('/admin', async (req, reply) => {
    if (!checkSession(req)) return reply.type('text/html').send(loginPage());
    return reply.type('text/html').send(dashboardPage());
  });

  // ── Login submit ────────────────────────────────────────────────────────
  app.post<{ Body: { password?: string } }>('/admin/login', async (req, reply) => {
    const pass = (req.body?.password || '').toString();
    const hash = crypto.createHash('sha256').update(pass).digest('hex');
    if (hash !== ADMIN_PASS_HASH) {
      return reply.type('text/html').send(loginPage('Неверный пароль'));
    }
    const sess = newSession();
    reply.header('Set-Cookie', `alfa_admin=${sess}; HttpOnly; Path=/; Max-Age=3600; SameSite=Strict`);
    return reply.redirect('/admin', 303);
  });

  // ── Logout ──────────────────────────────────────────────────────────────
  app.post('/admin/logout', async (req, reply) => {
    reply.header('Set-Cookie', 'alfa_admin=; HttpOnly; Path=/; Max-Age=0');
    return reply.redirect('/admin', 303);
  });

  // ── JSON API for the dashboard (called from JS in dashboard.html) ──────
  app.get('/admin/api/servers', async (req, reply) => {
    if (!checkSession(req)) return reply.code(401).send({ error: 'unauthorized' });
    const list = await repo.listAllServers();
    return { servers: list };
  });

  app.post<{ Body: any }>('/admin/api/servers', async (req, reply) => {
    if (!checkSession(req)) return reply.code(401).send({ error: 'unauthorized' });
    const b = req.body || {};
    if (!b.name || !b.endpoint) return reply.code(400).send({ error: 'name+endpoint required' });
    // Allocate or reuse API key
    const apiKey = b.apiKey || ('alfa_' + crypto.randomBytes(16).toString('hex'));
    await repo.ensureApiKey(apiKey, b.owner || 'admin-added');
    const srv = await repo.registerServer({
      name: b.name, endpoint: b.endpoint,
      slots: Number(b.slots) || 32,
      tags: Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
      region: b.region || 'XX',
      api_key: apiKey,
    });
    return { id: srv.id, apiKey };
  });

  app.delete<{ Params: { id: string } }>('/admin/api/servers/:id', async (req, reply) => {
    if (!checkSession(req)) return reply.code(401).send({ error: 'unauthorized' });
    await repo.deleteServer(req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { reason?: string } }>('/admin/api/servers/:id/ban', async (req, reply) => {
    if (!checkSession(req)) return reply.code(401).send({ error: 'unauthorized' });
    await repo.banServer(req.params.id, req.body?.reason || 'banned by admin');
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// HTML pages (vanilla, no build step)
// ════════════════════════════════════════════════════════════════════════════
const SHARED_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;background:#0e0e16;color:#f3f3f7;
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    -webkit-font-smoothing:antialiased}
  a{color:#ff5c75;text-decoration:none} a:hover{text-decoration:underline}
  button,input,select,textarea{font-family:inherit;font-size:14px}
  button{background:#d63a51;color:#fff;border:0;padding:9px 18px;border-radius:6px;
    cursor:pointer;font-weight:600;transition:background .12s}
  button:hover{background:#ff5c75}
  button.alt{background:transparent;border:1px solid #2a2a36;color:#b6b6c2}
  button.alt:hover{background:#1c1c25;color:#fff}
  button.danger{background:#82182a}button.danger:hover{background:#a31d35}
  input,select,textarea{background:#15151c;color:#fff;border:1px solid #2a2a36;
    border-radius:6px;padding:9px 12px;outline:none}
  input:focus,select:focus,textarea:focus{border-color:#d63a51}
`;

function loginPage(error?: string) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Alfa MP — Admin</title><style>${SHARED_CSS}
.login{display:flex;align-items:center;justify-content:center;height:100vh;
  background:radial-gradient(ellipse 80% 50% at 50% 0%,rgba(214,58,81,.1),transparent 60%),
             linear-gradient(180deg,#15151c 0%,#0e0e16 100%)}
.card{background:#15151c;border:1px solid #2a2a36;border-radius:12px;
  padding:40px;width:380px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.logo{width:64px;height:64px;fill:#d63a51;margin-bottom:24px;
  filter:drop-shadow(0 0 20px rgba(214,58,81,.5))}
h1{font-size:24px;margin-bottom:8px}.sub{color:#8b8b9a;font-size:13px;margin-bottom:28px}
form{display:flex;flex-direction:column;gap:14px}
.err{color:#ff5c75;font-size:12px;margin-top:8px}
</style></head><body><div class="login"><div class="card">
<svg class="logo" viewBox="0 0 24 24"><path d="M12 2 L22 22 H17 L15 18 H9 L7 22 H2 Z M10 14 H14 L12 8 Z"/></svg>
<h1>Alfa MP Admin</h1><div class="sub">Hoster dashboard — login</div>
<form method="POST" action="/admin/login">
<input type="password" name="password" placeholder="Admin password" autofocus required>
<button type="submit">Войти</button>
${error ? `<div class="err">${error}</div>` : ''}
</form></div></div></body></html>`;
}

function dashboardPage() {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Alfa MP — Admin Dashboard</title><style>${SHARED_CSS}
.topbar{display:flex;align-items:center;justify-content:space-between;
  padding:14px 28px;border-bottom:1px solid #2a2a36;background:#15151c}
.topbar .left{display:flex;align-items:center;gap:14px}
.topbar .logo{width:28px;height:28px;fill:#d63a51}
.topbar h1{font-size:16px;font-weight:600}
.container{padding:28px;max-width:1200px;margin:0 auto}
.section{background:#15151c;border:1px solid #2a2a36;border-radius:8px;
  padding:24px;margin-bottom:24px}
.section h2{font-size:18px;margin-bottom:16px}
.section .desc{color:#8b8b9a;font-size:13px;margin-bottom:18px}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.field{display:flex;flex-direction:column;gap:6px;flex:1;min-width:160px}
.field label{font-size:11px;color:#8b8b9a;text-transform:uppercase;letter-spacing:.08em}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 12px;color:#8b8b9a;font-weight:500;
  font-size:11px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #2a2a36}
td{padding:12px;border-bottom:1px solid #1a1a23;color:#e0e0e8}
td.ip{font-family:'JetBrains Mono','Consolas',monospace;font-size:12px}
.pill{display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;
  font-weight:600;letter-spacing:.06em;background:#2a2a36;color:#8b8b9a}
.pill.green{background:#1f4d2c;color:#4ade80}
.pill.red{background:#4d1f1f;color:#ff7a7a}
.actions{display:flex;gap:6px}
.actions button{padding:5px 10px;font-size:11px}
.alert{background:#1f4d2c;color:#a3f7c7;padding:12px 16px;border-radius:6px;
  margin-bottom:16px;display:none}
.alert.err{background:#4d1f1f;color:#ffd5d5}
.code{font-family:'JetBrains Mono',monospace;background:#0e0e16;padding:6px 10px;
  border-radius:4px;color:#ff5c75;font-size:11px;border:1px solid #2a2a36;
  word-break:break-all;user-select:all}
</style></head><body>
<div class="topbar"><div class="left">
<svg class="logo" viewBox="0 0 24 24"><path d="M12 2 L22 22 H17 L15 18 H9 L7 22 H2 Z M10 14 H14 L12 8 Z"/></svg>
<h1>Alfa MP Admin</h1></div>
<form method="POST" action="/admin/logout" style="margin:0"><button class="alt" type="submit">Выйти</button></form>
</div>
<div class="container">
<div class="alert" id="alert"></div>

<div class="section">
<h2>Добавить сервер</h2>
<div class="desc">Зарегистрируй новый сервер в каталоге Alfa MP. После добавления он сразу появится в лаунчере у всех игроков.</div>
<form id="addForm">
<div class="row">
<div class="field"><label>Название</label><input name="name" required placeholder="My Roleplay Server"></div>
<div class="field"><label>Endpoint (IP:port)</label><input name="endpoint" required placeholder="1.2.3.4:30120"></div>
<div class="field" style="max-width:100px"><label>Слотов</label><input name="slots" type="number" value="32" min="1" max="1024"></div>
<div class="field" style="max-width:80px"><label>Регион</label><input name="region" value="DE" maxlength="2"></div>
</div>
<div class="row" style="margin-top:14px">
<div class="field"><label>Теги (через запятую)</label><input name="tags" placeholder="rp, freeroam, drift"></div>
<div class="field"><label>Владелец</label><input name="owner" placeholder="john@example.com"></div>
<div class="field"><label>&nbsp;</label><button type="submit">Зарегистрировать</button></div>
</div>
</form>
</div>

<div class="section">
<h2>Все серверы в каталоге</h2>
<div class="desc">Серверы которые видны в Alfa MP лаунчере. Heartbeat обновляется хостером каждые 20 сек, dead-серверы автоматически удаляются через 2 мин.</div>
<table><thead><tr>
<th>Имя</th><th>Endpoint</th><th>Players</th><th>Region</th><th>Теги</th><th>Heartbeat</th><th>Status</th><th>Действия</th>
</tr></thead><tbody id="srvBody"><tr><td colspan="8" style="text-align:center;color:#8b8b9a">Загрузка...</td></tr></tbody></table>
</div>
</div>

<script>
const alertEl = document.getElementById('alert');
function showAlert(msg, isErr=false){ alertEl.textContent = msg; alertEl.className = 'alert' + (isErr?' err':''); alertEl.style.display='block'; setTimeout(()=>alertEl.style.display='none', 6000); }

async function loadServers(){
  const r = await fetch('/admin/api/servers'); const d = await r.json();
  const body = document.getElementById('srvBody');
  if (!d.servers?.length) { body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#8b8b9a">Серверов пока нет — добавь первый ↑</td></tr>'; return; }
  body.innerHTML = d.servers.map(s => {
    const ageS = Math.floor((Date.now() - new Date(s.last_heartbeat || s.registered_at).getTime())/1000);
    const alive = ageS < 120;
    const tags = (s.tags||[]).map(t => '<span class="pill">'+t+'</span>').join(' ');
    return \`<tr>
      <td><b>\${s.name}</b>\${s.is_demo ? ' <span class="pill">DEMO</span>':''}</td>
      <td class="ip">\${s.endpoint}</td>
      <td>\${s.players || 0} / \${s.slots}</td>
      <td>\${s.region || '-'}</td>
      <td>\${tags || '-'}</td>
      <td>\${ageS<60?ageS+'s ago':Math.floor(ageS/60)+'m ago'}</td>
      <td>\${s.ban_reason ? '<span class="pill red">BANNED</span>' : alive ? '<span class="pill green">LIVE</span>' : '<span class="pill">DEAD</span>'}</td>
      <td class="actions">
        <button class="alt" onclick="banSrv('\${s.id}')">Ban</button>
        <button class="danger" onclick="delSrv('\${s.id}')">Delete</button>
      </td>
    </tr>\`;
  }).join('');
}

async function delSrv(id){
  if (!confirm('Удалить этот сервер из каталога?')) return;
  const r = await fetch('/admin/api/servers/'+id, { method:'DELETE' });
  if (r.ok) { showAlert('Удалено'); loadServers(); } else showAlert('Ошибка', true);
}
async function banSrv(id){
  const reason = prompt('Причина бана:'); if (!reason) return;
  const r = await fetch('/admin/api/servers/'+id+'/ban', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({reason}) });
  if (r.ok) { showAlert('Забанено'); loadServers(); } else showAlert('Ошибка', true);
}

document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  payload.tags = payload.tags ? payload.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
  payload.slots = Number(payload.slots);
  const r = await fetch('/admin/api/servers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const d = await r.json();
  if (r.ok) {
    showAlert('Сервер добавлен. API-key для хостера (выдать ему — нужен для heartbeat): ' + d.apiKey);
    alert('API-key для этого сервера (хостер использует его для /v1/servers/heartbeat):\\n\\n' + d.apiKey + '\\n\\nСохрани сейчас, повторно не показывается.');
    e.target.reset();
    loadServers();
  } else showAlert(d.error || 'Ошибка регистрации', true);
});

loadServers();
setInterval(loadServers, 15000);
</script>
</body></html>`;
}
