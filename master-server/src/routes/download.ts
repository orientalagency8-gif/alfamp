import type { FastifyInstance } from 'fastify';

// Cache the latest Release lookup for 5 min so we don't hammer GitHub API.
const REPO = 'orientalagency8-gif/alfamp';
let cache: { fetchedAt: number; data: GhRelease | null } | null = null;
const TTL_MS = 5 * 60 * 1000;

type GhAsset = {
  name: string;
  browser_download_url: string;
  size: number;
};
type GhRelease = {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  assets: GhAsset[];
};

async function fetchLatest(): Promise<GhRelease | null> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.data;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'alfa-mp-master', 'Accept': 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      cache = { fetchedAt: Date.now(), data: null };
      return null;
    }
    const d = (await r.json()) as GhRelease;
    cache = { fetchedAt: Date.now(), data: d };
    return d;
  } catch {
    cache = { fetchedAt: Date.now(), data: null };
    return null;
  }
}

function pickAsset(rel: GhRelease | null, ext: 'msi' | 'exe'): GhAsset | null {
  if (!rel) return null;
  return rel.assets.find(a => a.name.toLowerCase().endsWith('.' + ext)) || null;
}

function html(rel: GhRelease | null): string {
  const msi = pickAsset(rel, 'msi');
  const exe = pickAsset(rel, 'exe');
  const ver = rel?.tag_name || 'dev';
  const status = rel ? `Версия ${ver} — опубликовано ${new Date(rel.published_at).toLocaleString('ru-RU')}` :
                       'Лаунчер пока собирается — первый билд появится в течение часа';
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Alfa MP — скачать лаунчер</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%;background:#0e0e12;color:#f3f3f7;
      font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
    body{display:flex;align-items:center;justify-content:center;
      background:radial-gradient(ellipse 80% 50% at 50% 0%,rgba(214,58,81,.10),transparent 60%),
                 linear-gradient(180deg,#15151b 0%,#0e0e12 100%)}
    .card{max-width:520px;width:100%;padding:48px 40px;text-align:center}
    .logo{width:64px;height:64px;margin:0 auto 24px;fill:#d63a51}
    h1{font-size:32px;font-weight:700;letter-spacing:-.02em;margin-bottom:8px}
    .tagline{color:#b6b6c2;font-size:14px;margin-bottom:32px}
    .btn{display:block;padding:14px 24px;margin:12px 0;border-radius:8px;
      background:#d63a51;color:#fff;text-decoration:none;font-weight:600;font-size:15px;
      transition:background .15s;border:0;cursor:pointer;width:100%}
    .btn:hover{background:#ff5c75}
    .btn.alt{background:transparent;border:1px solid #2a2a36;color:#b6b6c2}
    .btn.alt:hover{background:#1c1c25;color:#fff}
    .btn.disabled{background:#2a2a36;color:#6c6c7c;cursor:not-allowed}
    .meta{margin-top:24px;font-size:12px;color:#6c6c7c}
    .ver{margin-top:4px;font-family:monospace;font-size:11px;color:#6c6c7c}
    .req{margin-top:32px;font-size:11px;color:#6c6c7c;line-height:1.6}
    .req strong{color:#b6b6c2}
  </style>
</head>
<body>
  <div class="card">
    <svg class="logo" viewBox="0 0 24 24"><path d="M12 2 L22 22 H17 L15 18 H9 L7 22 H2 Z M10 14 H14 L12 8 Z"/></svg>
    <h1>Alfa MP</h1>
    <div class="tagline">Multiplayer launcher для GTA V — лучший vehicle sync, открытое SDK, free для хостеров</div>
    ${msi ? `<a class="btn" href="${msi.browser_download_url}">Скачать (MSI installer · ${(msi.size/1024/1024).toFixed(1)} MB)</a>` :
            `<button class="btn disabled" disabled>MSI installer (ещё не собран)</button>`}
    ${exe ? `<a class="btn alt" href="${exe.browser_download_url}">Альтернатива: NSIS (.exe · ${(exe.size/1024/1024).toFixed(1)} MB)</a>` : ''}
    <div class="meta">${status}</div>
    ${rel ? `<div class="ver">Source: <a style="color:#6c6c7c" href="${rel.html_url}">${rel.tag_name}</a></div>` : ''}
    <div class="req">
      <strong>Что нужно:</strong> Windows 10 / 11 (x64), GTA V уже установлена, FiveM клиент (на время Stage-1)<br>
      <strong>Не работает на:</strong> Mac, Linux, версии GTA V для PS4/PS5/Xbox
    </div>
  </div>
</body>
</html>`;
}

export async function downloadRoutes(app: FastifyInstance) {
  // Pretty HTML landing
  app.get('/download', async (_req, reply) => {
    const rel = await fetchLatest();
    return reply.type('text/html; charset=utf-8').send(html(rel));
  });

  // Direct download endpoints — 302 to current Release asset
  app.get('/download/msi', async (_req, reply) => {
    const rel = await fetchLatest();
    const a = pickAsset(rel, 'msi');
    if (!a) return reply.code(404).send({ error: 'no_release_yet', hint: 'Launcher build is still in progress — check /download' });
    return reply.redirect(a.browser_download_url, 302);
  });

  app.get('/download/nsis', async (_req, reply) => {
    const rel = await fetchLatest();
    const a = pickAsset(rel, 'exe');
    if (!a) return reply.code(404).send({ error: 'no_release_yet' });
    return reply.redirect(a.browser_download_url, 302);
  });

  // JSON for the launcher's own self-update flow
  app.get('/download/latest.json', async () => {
    const rel = await fetchLatest();
    if (!rel) return { version: null, status: 'no_release_yet' };
    return {
      version: rel.tag_name,
      publishedAt: rel.published_at,
      msi: pickAsset(rel, 'msi')?.browser_download_url || null,
      nsis: pickAsset(rel, 'exe')?.browser_download_url || null,
      htmlUrl: rel.html_url,
    };
  });
}
