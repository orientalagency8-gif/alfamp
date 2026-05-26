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
  const headers: Record<string, string> = {
    'User-Agent': 'alfa-mp-master',
    'Accept': 'application/vnd.github+json',
  };
  // Private repo: include token if provided (env var GITHUB_TOKEN). We use a
  // read-only fine-grained PAT in production with `contents:read` on this repo only.
  const tok = process.env.GITHUB_TOKEN;
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      console.warn(`[download] GitHub API returned ${r.status}: ${await r.text().catch(() => '')}`);
      cache = { fetchedAt: Date.now(), data: null };
      return null;
    }
    const d = (await r.json()) as GhRelease;
    cache = { fetchedAt: Date.now(), data: d };
    return d;
  } catch (e) {
    console.warn(`[download] fetchLatest threw: ${String(e)}`);
    cache = { fetchedAt: Date.now(), data: null };
    return null;
  }
}

// Allow manual cache bust via POST /download/refresh (no auth — harmless, just re-fetches)
function _bust() { cache = null; }

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
    ${msi ? `<a class="btn" href="/download/msi">Скачать (MSI installer · ${(msi.size/1024/1024).toFixed(1)} MB)</a>` :
            `<button class="btn disabled" disabled>MSI installer (ещё не собран)</button>`}
    ${exe ? `<a class="btn alt" href="/download/nsis">Альтернатива: NSIS (.exe · ${(exe.size/1024/1024).toFixed(1)} MB)</a>` : ''}
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

  // Direct download endpoints — proxy from GitHub through us so private-repo assets
  // are reachable without the user having a token. We fetch the asset's API URL with
  // our PAT + Accept: application/octet-stream → GitHub responds with a presigned
  // S3 redirect → we follow that without auth → stream the bytes to the client.
  async function proxyAsset(asset: GhAsset, reply: any) {
    const tok = process.env.GITHUB_TOKEN;
    if (!tok) return reply.code(500).send({ error: 'master not configured with GITHUB_TOKEN' });
    // The "url" field on a release asset points at the API; with Accept octet-stream it 302s to S3.
    const apiUrl = (asset as any).url || `https://api.github.com/repos/${REPO}/releases/assets/${(asset as any).id}`;
    try {
      // Step 1: ask GitHub for the redirect URL (don't follow yet, so we can drop auth).
      const r1 = await fetch(apiUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'alfa-mp-master',
          'Accept': 'application/octet-stream',
          'Authorization': `Bearer ${tok}`,
        },
        signal: AbortSignal.timeout(8000),
      });
      const presigned = r1.headers.get('location');
      if (!presigned) {
        console.warn(`[download] no redirect from ${apiUrl}, status ${r1.status}`);
        return reply.code(502).send({ error: 'upstream did not redirect', status: r1.status });
      }
      // Step 2: fetch the presigned URL with NO auth header (S3 rejects it).
      const r2 = await fetch(presigned, { signal: AbortSignal.timeout(60_000) });
      if (!r2.ok || !r2.body) return reply.code(502).send({ error: 'upstream fetch failed', status: r2.status });
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${asset.name}"`);
      reply.header('Content-Length', asset.size);
      reply.header('Cache-Control', 'public, max-age=300');
      return reply.send(r2.body);
    } catch (e: any) {
      console.error('[download/proxy]', e?.message);
      return reply.code(502).send({ error: 'proxy_failed', detail: e?.message });
    }
  }

  app.get('/download/msi', async (_req, reply) => {
    const rel = await fetchLatest();
    const a = pickAsset(rel, 'msi');
    if (!a) return reply.code(404).send({ error: 'no_release_yet', hint: 'Launcher build is still in progress — check /download' });
    return proxyAsset(a, reply);
  });

  app.get('/download/nsis', async (_req, reply) => {
    const rel = await fetchLatest();
    const a = pickAsset(rel, 'exe');
    if (!a) return reply.code(404).send({ error: 'no_release_yet' });
    return proxyAsset(a, reply);
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

  // Bust the 5-min cache and re-fetch on demand. Useful right after publishing a Release.
  app.post('/download/refresh', async (_req, reply) => {
    _bust();
    const rel = await fetchLatest();
    return reply.send({ refreshed: true, hasRelease: !!rel, version: rel?.tag_name ?? null });
  });
}
