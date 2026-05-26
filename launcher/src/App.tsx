import { useEffect, useMemo, useState } from 'react';

type Server = {
  id: string;
  name: string;
  country: string;       // ISO-2 (ru, ro, …)
  featured?: boolean;    // ★
  tags: string[];        // ['ROLEPLAY', 'VOICE', '11', 'LOCKED']
  gamemode: string;
  players: number;
  maxPlayers: number;
  ping: number;          // ms
  endpoint?: string;     // e.g. "104.194.140.221:30120" — used by Connect
};

type Tab = 'gta5' | 'rdr2' | 'favorites' | 'history';

// Master-server. Compiled into the bundle; override at build time with VITE_MASTER_URL.
const MASTER_URL = (import.meta as any).env?.VITE_MASTER_URL || 'http://104.194.140.221:8080';

// Fallback shown if master is unreachable on first paint.
const EMPTY_FALLBACK: Server[] = [];

function FlagEmoji({ country }: { country: string }) {
  // Unicode regional indicator letters (e.g. "ru" → 🇷🇺) — works on Windows 10/11
  const codePoints = country.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
  return <span className="flag" style={{ fontSize: 14, lineHeight: '14px', width: 20, textAlign: 'center' }}>{String.fromCodePoint(...codePoints)}</span>;
}

function PingBars({ ms }: { ms: number }) {
  const cls = ms < 60 ? 'good' : ms < 120 ? 'mid' : 'bad';
  const bars = ms < 60 ? 4 : ms < 120 ? 3 : 2;
  return (
    <div className={`ping ${cls}`}>
      {[1,2,3,4].map(i => <span key={i} className={i <= bars ? 'on' : ''}/>)}
    </div>
  );
}

function Tag({ children, voice = false }: { children: React.ReactNode; voice?: boolean }) {
  return <span className={voice ? 'tag voice' : 'tag'}>{children}</span>;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
  );
}

function CloseIcon() { return <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>; }
function MinIcon()   { return <svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>; }
function MaxIcon()   { return <svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14"/></svg>; }
function DownloadIcon() { return <svg viewBox="0 0 24 24"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/></svg>; }
function SettingsIcon() { return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>; }
function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>; }

function AlfaLogo() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 2 L22 22 H17 L15 18 H9 L7 22 H2 Z M10 14 H14 L12 8 Z"/>
    </svg>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>('gta5');
  const [search, setSearch] = useState('');
  const [servers, setServers] = useState<Server[]>(EMPTY_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Poll master-server every 30s
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const r = await fetch(`${MASTER_URL}/v1/servers`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        // Tolerate either { servers: [...] } or [...] response shape
        const list: any[] = Array.isArray(data) ? data : (data.servers || data.data || []);
        if (cancelled) return;
        setServers(list.map((s: any, i: number) => ({
          id: String(s.id ?? s.endpoint ?? i),
          name: s.name || s.hostname || 'Unnamed',
          country: (s.country || 'us').toLowerCase().slice(0, 2),
          featured: !!s.featured,
          tags: (s.tags || []) as string[],
          gamemode: (s.gamemode || s.gametype || '').toString().toLowerCase(),
          players: Number(s.players ?? s.clients ?? 0),
          maxPlayers: Number(s.maxPlayers ?? s.max_clients ?? s.svMaxclients ?? 32),
          ping: Number(s.ping ?? 0),
          endpoint: s.endpoint || s.connectEndPoint || (s.host && s.port ? `${s.host}:${s.port}` : undefined),
        })));
        setError(null);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'master unreachable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOnce();
    const t = setInterval(fetchOnce, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const filtered = useMemo(() =>
    servers.filter(s => s.name.toLowerCase().includes(search.toLowerCase())),
    [servers, search]
  );

  const totalPlayers = useMemo(() => servers.reduce((s, x) => s + x.players, 0), [servers]);
  const formatNum = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  // Tauri window controls (no-op when running in browser dev)
  const tauriCmd = async (action: 'minimize' | 'toggleMaximize' | 'close') => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      if (action === 'minimize') win.minimize();
      else if (action === 'toggleMaximize') win.toggleMaximize();
      else win.close();
    } catch { /* not running under Tauri */ }
  };

  // Connect: open fivem:// URI so the OS hands off to FiveM (or our launcher protocol later)
  const connect = async (s: Server) => {
    if (!s.endpoint) return;
    const uri = `fivem://connect/${s.endpoint}`;
    try {
      const { openUrl } = await import('@tauri-apps/plugin-shell');
      await openUrl(uri);
    } catch {
      // Browser-dev fallback
      window.location.href = uri;
    }
  };

  return (
    <div className="app">
      {/* Title bar with tabs */}
      <div className="titlebar">
        <div className="tabs">
          <button className={`tab ${tab === 'gta5' ? 'active' : ''}`} onClick={() => setTab('gta5')}>GTA 5</button>
          <button className={`tab ${tab === 'rdr2' ? 'active' : ''} disabled`} onClick={() => setTab('rdr2')}>RDR2</button>
          <button className={`tab ${tab === 'favorites' ? 'active' : ''}`} onClick={() => setTab('favorites')}>Избранное</button>
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>История</button>
        </div>
        <div className="titlebar-spacer" />
        <div className="logo"><AlfaLogo /></div>
        <div className="titlebar-spacer" />
        <button className="icon-btn" title="Загрузки"><DownloadIcon /></button>
        <button className="icon-btn" title="Настройки"><SettingsIcon /></button>
        <button className="icon-btn" onClick={() => tauriCmd('minimize')} title="Свернуть"><MinIcon /></button>
        <button className="icon-btn" onClick={() => tauriCmd('toggleMaximize')} title="Развернуть"><MaxIcon /></button>
        <button className="icon-btn close" onClick={() => tauriCmd('close')} title="Закрыть"><CloseIcon /></button>
      </div>

      {/* Hero strip */}
      <div className="hero">
        <div className="stat">
          <div className="stat-num">{servers.length}</div>
          <div className="stat-label">Серверов</div>
        </div>
        <div className="stat">
          <div className="stat-num">{formatNum(totalPlayers)}</div>
          <div className="stat-label">Игроки онлайн</div>
        </div>
      </div>

      {/* Toolbar (search + column headers) */}
      <div className="toolbar">
        <div className="search">
          <SearchIcon />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск"
          />
        </div>
        <div className="col-sortable">Игровой режим</div>
        <div className="col-sortable" style={{ textAlign: 'right', paddingRight: 24 }}>Игроки ▾</div>
        <div className="col-sortable">Пинг</div>
      </div>

      {/* Server list */}
      <div className="server-list">
        {loading && servers.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-2)' }}>
            Загружаем список серверов…
          </div>
        )}
        {error && servers.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-2)' }}>
            Не удалось связаться с master-сервером: {error}
          </div>
        )}
        {!loading && servers.length === 0 && !error && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-2)' }}>
            Пока нет зарегистрированных серверов.
          </div>
        )}
        {filtered.map(s => (
          <div key={s.id} className="server-row" onDoubleClick={() => connect(s)} title={s.endpoint ? `Двойной клик — подключиться к ${s.endpoint}` : 'У сервера нет публичного endpoint'}>
            <div className="server-name">
              <FlagEmoji country={s.country} />
              {s.featured && <svg className="star" viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>}
              <span className="name-text">{s.name}</span>
              <div className="tags">
                {s.tags.includes('ROLEPLAY') && <Tag>ROLEPLAY</Tag>}
                {s.tags.includes('VOICE')    && <Tag voice>VOICE</Tag>}
                {s.tags.includes('11')       && <Tag>1.1</Tag>}
                {s.tags.includes('LOCKED')   && <Tag><LockIcon /></Tag>}
              </div>
            </div>
            <div className="gamemode">{s.gamemode}</div>
            <div className="players">{formatNum(s.players)}{s.maxPlayers ? ` / ${formatNum(s.maxPlayers)}` : ''}</div>
            <div className="ping"><PingBars ms={s.ping} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
