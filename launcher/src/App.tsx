import { useEffect, useMemo, useRef, useState } from 'react';

type Server = {
  id: string;
  name: string;
  country: string;
  featured?: boolean;
  tags: string[];
  gamemode: string;
  players: number;
  maxPlayers: number;
  ping: number;
  endpoint?: string;
};

type Tab = 'gta5' | 'rdr2' | 'favorites' | 'history';
type Toast = { id: number; kind: 'info' | 'error' | 'success'; msg: string };
type ClientState = {
  installed: boolean;
  client_path: string | null;
  install_dir: string;
  version: string | null;
  gta_path: string | null;
};
type Progress = {
  stage: 'downloading' | 'extracting' | 'done' | 'error';
  received: number;
  total: number;
  message: string | null;
};

const MASTER_URL = (import.meta as any).env?.VITE_MASTER_URL || 'http://104.194.140.221';
const CLIENT_BUNDLE_URL = `${MASTER_URL}/static/AlfaMP-client-bundle.zip`;
const RELEASES_URL = 'https://github.com/Mr-Banana-Web3/alfamp/releases';

const LS_FAVORITES = 'alfamp.favorites.v1';
const LS_HISTORY = 'alfamp.history.v1';

// ---------- helpers ---------------------------------------------------------

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch { return new Set(); }
}
function saveSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s])); } catch {}
}

function formatBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

async function tauriInvoke<T = any>(cmd: string, args?: any): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

// ---------- tiny UI bits ----------------------------------------------------

function FlagEmoji({ country }: { country: string }) {
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

const LockIcon = () => <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>;
const CloseIcon = () => <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>;
const MinIcon = () => <svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>;
const MaxIcon = () => <svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14"/></svg>;
const DownloadIcon = () => <svg viewBox="0 0 24 24"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/></svg>;
const SettingsIcon = () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a2 2 0 0 0 .4 2.2l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-2.2-.4 2 2 0 0 0-1.2 1.8V21a2 2 0 1 1-4 0v-.1a2 2 0 0 0-1.2-1.8 2 2 0 0 0-2.2.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a2 2 0 0 0 .4-2.2 2 2 0 0 0-1.8-1.2H3a2 2 0 1 1 0-4h.1a2 2 0 0 0 1.8-1.2 2 2 0 0 0-.4-2.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a2 2 0 0 0 2.2.4h.1A2 2 0 0 0 10.7 3v-.1a2 2 0 1 1 4 0V3a2 2 0 0 0 1.2 1.8 2 2 0 0 0 2.2-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a2 2 0 0 0-.4 2.2v.1A2 2 0 0 0 21 10.7h.1a2 2 0 1 1 0 4h-.1a2 2 0 0 0-1.8 1.2z"/></svg>;
const SearchIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>;
const StarIcon = ({filled}: {filled?:boolean}) => <svg viewBox="0 0 24 24" className={filled ? 'star-on' : 'star-off'}><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>;
const PlayIcon = () => <svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>;
const RefreshIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>;

function AlfaLogo() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 2 L22 22 H17 L15 18 H9 L7 22 H2 Z M10 14 H14 L12 8 Z"/>
    </svg>
  );
}

// ---------- App -------------------------------------------------------------

export function App() {
  const [tab, setTab] = useState<Tab>('gta5');
  const [search, setSearch] = useState('');
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clientState, setClientState] = useState<ClientState | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [installing, setInstalling] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);

  const [favorites, setFavorites] = useState<Set<string>>(() => loadSet(LS_FAVORITES));
  const [history, setHistory]   = useState<Set<string>>(() => loadSet(LS_HISTORY));

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  function toast(kind: Toast['kind'], msg: string) {
    const id = ++toastId.current;
    setToasts(t => [...t, { id, kind, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  }

  // -- bootstrap: client state + listen progress events ----------------------
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    (async () => {
      try {
        const st = await tauriInvoke<ClientState>('client_state');
        setClientState(st);
      } catch (e: any) {
        // browser dev fallback
        setClientState({ installed: true, client_path: null, install_dir: '(dev)', version: '0.0.0', gta_path: null });
      }
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlistenProgress = await listen<Progress>('client:progress', ev => {
          setProgress(ev.payload);
          if (ev.payload.stage === 'done') {
            setInstalling(false);
            toast('success', 'Игровой клиент установлен.');
            tauriInvoke<ClientState>('client_state').then(setClientState).catch(() => {});
          } else if (ev.payload.stage === 'error') {
            setInstalling(false);
            toast('error', `Ошибка установки: ${ev.payload.message || 'unknown'}`);
          }
        });
        const unlistenStarted = await listen<number>('game:started', () => {
          // Launcher already hides itself from Rust side — JS just shows a final toast.
          toast('info', 'Игра запущена. Лаунчер свёрнут в трей.');
        });
        const unlistenExited = await listen<number>('game:exited', () => {
          toast('info', 'Игра закрыта. Лаунчер восстановлен.');
        });
        const _unused = [unlistenStarted, unlistenExited];
      } catch {}
    })();
    return () => { unlistenProgress?.(); };
  }, []);

  // -- poll master every 30s -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const r = await fetch(`${MASTER_URL}/v1/servers`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const list: any[] = Array.isArray(data) ? data : (data.servers || data.data || []);
        if (cancelled) return;
        setServers(list.map((s: any, i: number) => ({
          id: String(s.id ?? s.endpoint ?? i),
          name: s.name || s.hostname || 'Unnamed',
          country: (s.country || s.region || 'us').toLowerCase().slice(0, 2),
          featured: !!s.featured,
          tags: (s.tags || []).map((t: any) => String(t).toUpperCase()) as string[],
          gamemode: (s.gamemode || s.gametype || (s.tags || [])[0] || '').toString().toLowerCase(),
          players: Number(s.players ?? s.clients ?? 0),
          maxPlayers: Number(s.maxPlayers ?? s.max_clients ?? s.slots ?? s.svMaxclients ?? 32),
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

  // -- derived list ----------------------------------------------------------
  const filtered = useMemo(() => {
    let list = servers;
    if (tab === 'favorites') list = list.filter(s => favorites.has(s.id) || (s.endpoint && favorites.has(s.endpoint)));
    if (tab === 'history')   list = list.filter(s => history.has(s.id)   || (s.endpoint && history.has(s.endpoint)));
    if (tab === 'rdr2')      list = []; // not yet
    if (search) list = list.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [servers, search, tab, favorites, history]);

  const totalPlayers = useMemo(() => servers.reduce((s, x) => s + x.players, 0), [servers]);
  const formatNum = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  // -- window controls -------------------------------------------------------
  const tauriCmd = async (action: 'minimize' | 'toggleMaximize' | 'close') => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      if (action === 'minimize') win.minimize();
      else if (action === 'toggleMaximize') win.toggleMaximize();
      else win.close();
    } catch { /* browser */ }
  };

  // -- actions ---------------------------------------------------------------
  const toggleFavorite = (s: Server) => {
    const key = s.endpoint || s.id;
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveSet(LS_FAVORITES, next);
      return next;
    });
  };

  const recordHistory = (s: Server) => {
    const key = s.endpoint || s.id;
    setHistory(prev => {
      const next = new Set(prev);
      next.add(key);
      saveSet(LS_HISTORY, next);
      return next;
    });
  };

  const connect = async (s: Server) => {
    if (!s.endpoint) { toast('error', 'У этого сервера нет публичного endpoint.'); return; }
    if (!clientState?.installed) {
      toast('error', 'Сначала установите игровой клиент Alfa MP.');
      return;
    }
    try {
      toast('info', `Запускаем Alfa MP → ${s.endpoint}. Лаунчер свернётся в трей пока ты играешь.`);
      await tauriInvoke('launch_client', { endpoint: s.endpoint });
      recordHistory(s);
    } catch (e: any) {
      toast('error', `Не удалось запустить клиент: ${e?.toString() || e}`);
    }
  };

  const launchOffline = async () => {
    if (!clientState?.installed) { toast('error', 'Клиент не установлен.'); return; }
    try {
      toast('info', 'Запускаем Alfa MP… лаунчер свернётся в трей.');
      await tauriInvoke('launch_client', { endpoint: null });
    } catch (e: any) {
      toast('error', `Не удалось запустить: ${e}`);
    }
  };

  // Manual override — lets user dismiss the install overlay even if client_state
  // hasn't auto-refreshed for some reason.
  const [overlayDismissed, setOverlayDismissed] = useState(false);

  const installClient = async () => {
    if (installing) return;
    setInstalling(true);
    setProgress({ stage: 'downloading', received: 0, total: 0, message: 'старт…' });
    try {
      await tauriInvoke('download_client', { url: CLIENT_BUNDLE_URL });
      // Install completed — explicitly refresh state, don't rely on the
      // 'done' event alone (it might be missed/dropped on slow machines).
      setInstalling(false);
      setProgress({ stage: 'done', received: 0, total: 0, message: null });
      try {
        const st = await tauriInvoke<ClientState>('client_state');
        setClientState(st);
        if (st.installed) {
          toast('success', `Игровой клиент установлен (${st.version || ''})`);
          setOverlayDismissed(true); // auto-close
        }
      } catch {}
    } catch (e: any) {
      setInstalling(false);
      toast('error', `Установка не удалась: ${e}`);
    }
  };

  const wipeAndReinstall = async () => {
    if (installing) return;
    if (!confirm('Удалить локальную папку клиента и скачать заново?')) return;
    try {
      await tauriInvoke('wipe_client');
      const st = await tauriInvoke<ClientState>('client_state');
      setClientState(st);
      toast('info', 'Локальная папка очищена. Скачиваю заново…');
      await installClient();
    } catch (e: any) {
      toast('error', `Не удалось очистить: ${e}`);
    }
  };

  const reDetectGta = async () => {
    try {
      const path = await tauriInvoke<string | null>('gta_detect');
      setClientState(s => s ? { ...s, gta_path: path } : s);
      if (path) toast('success', `GTA V найдена: ${path}`);
      else      toast('error', 'GTA V не найдена. Установите GTA V в Steam, Rockstar Launcher или Epic.');
    } catch (e: any) {
      toast('error', `Ошибка поиска GTA V: ${e}`);
    }
  };

  const openUrl = async (u: string) => {
    try { await tauriInvoke('open_url', { url: u }); }
    catch { try { window.open(u, '_blank'); } catch {} }
  };

  // -- first-run install screen ----------------------------------------------
  const showInstallScreen = clientState && !clientState.installed && !overlayDismissed;

  // -- render ---------------------------------------------------------------
  return (
    <div className="app">
      {/* Title bar with tabs */}
      <div className="titlebar">
        <div className="tabs">
          <button className={`tab ${tab === 'gta5' ? 'active' : ''}`} onClick={() => setTab('gta5')}>GTA 5</button>
          <button className={`tab ${tab === 'rdr2' ? 'active' : ''} disabled`} onClick={() => toast('info', 'Поддержка RDR2 — скоро.')}>RDR2</button>
          <button className={`tab ${tab === 'favorites' ? 'active' : ''}`} onClick={() => setTab('favorites')}>Избранное</button>
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>История</button>
        </div>
        <div className="titlebar-spacer" />
        <button className="play-btn" onClick={launchOffline} title="Запустить Alfa MP без подключения к серверу">
          <PlayIcon /> Запустить
        </button>
        <div className="logo"><AlfaLogo /></div>
        <div className="titlebar-spacer" />
        <button className="icon-btn" onClick={() => setShowDownloads(true)} title="Загрузки"><DownloadIcon /></button>
        <button className="icon-btn" onClick={() => setShowSettings(true)} title="Настройки"><SettingsIcon /></button>
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
        <div style={{ flex: 1 }} />
        <div className="hero-side">
          {clientState && (
            <div className="hero-status">
              <div className={`status-dot ${clientState.installed ? 'good' : 'bad'}`} />
              <div className="status-text">
                {clientState.installed ? `Клиент ${clientState.version || ''} установлен` : 'Клиент не установлен'}
                <div className="status-sub">{clientState.gta_path ? 'GTA V обнаружена' : 'GTA V не найдена'}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
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
        <div className="col-sortable" style={{ textAlign: 'center' }}>
          <button className="refresh-btn" title="Обновить список" onClick={() => location.reload()}>
            <RefreshIcon />
          </button>
        </div>
      </div>

      {/* Server list */}
      <div className="server-list">
        {loading && servers.length === 0 && (
          <div className="empty">Загружаем список серверов…</div>
        )}
        {error && servers.length === 0 && (
          <div className="empty">Не удалось связаться с master-сервером: {error}</div>
        )}
        {!loading && servers.length === 0 && !error && (
          <div className="empty">Пока нет зарегистрированных серверов.</div>
        )}
        {!loading && filtered.length === 0 && servers.length > 0 && (
          <div className="empty">
            {tab === 'favorites' && 'У вас пока нет избранных серверов. Кликните ★ возле сервера.'}
            {tab === 'history' && 'Здесь появятся серверы, к которым вы подключались.'}
            {tab === 'rdr2' && 'Поддержка RDR2 пока в разработке.'}
            {(tab === 'gta5' && search) && 'Ничего не найдено по запросу.'}
          </div>
        )}
        {filtered.map(s => {
          const key = s.endpoint || s.id;
          const isFav = favorites.has(key);
          return (
            <div key={s.id} className="server-row" onDoubleClick={() => connect(s)} title={s.endpoint ? `Двойной клик — подключиться к ${s.endpoint}` : 'У сервера нет публичного endpoint'}>
              <div className="server-name">
                <FlagEmoji country={s.country} />
                <button className={`fav-btn ${isFav ? 'on' : ''}`} onClick={e => { e.stopPropagation(); toggleFavorite(s); }} title={isFav ? 'Убрать из избранного' : 'В избранное'}>
                  <StarIcon filled={isFav}/>
                </button>
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
              <div className="ping-col"><PingBars ms={s.ping} /></div>
              <div className="row-action">
                <button className="connect-btn" onClick={e => { e.stopPropagation(); connect(s); }} disabled={!s.endpoint}>
                  <PlayIcon /> Подключиться
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ───────── Install overlay (first run) ───────── */}
      {showInstallScreen && (
        <div className="overlay">
          <div className="overlay-card">
            <div className="row-between">
              <h2>Установите игровой клиент Alfa MP</h2>
              <button className="icon-btn" onClick={() => setOverlayDismissed(true)} title="Закрыть"><CloseIcon /></button>
            </div>
            <p>Для подключения к серверам нужен сам клиент Alfa MP (~500 МБ). Он будет установлен в <code>{clientState?.install_dir}</code>.</p>
            <p className="muted">
              {clientState?.gta_path
                ? <>✔ GTA V обнаружена: <code>{clientState.gta_path}</code></>
                : <>⚠ GTA V не найдена. Клиент всё равно можно скачать, но для игры понадобится установить GTA V.</>}
            </p>
            {installing && progress && (
              <div className="progress-wrap">
                <div className="progress-meta">
                  {progress.stage === 'downloading' && (
                    <>Скачивание… {formatBytes(progress.received)}{progress.total ? ` / ${formatBytes(progress.total)}` : ''}</>
                  )}
                  {progress.stage === 'extracting' && (
                    <>Распаковка… {progress.received}/{progress.total} файлов</>
                  )}
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: progress.total ? `${Math.min(100, 100 * progress.received / progress.total)}%` : '8%' }} />
                </div>
              </div>
            )}
            <div className="overlay-actions">
              {progress?.stage === 'done' ? (
                <button className="big-btn primary" onClick={async () => {
                  try {
                    const st = await tauriInvoke<ClientState>('client_state');
                    setClientState(st);
                  } catch {}
                  setOverlayDismissed(true);
                }}>Готово, закрыть</button>
              ) : (
                <button className="big-btn primary" disabled={installing} onClick={installClient}>
                  {installing ? 'Установка…' : 'Скачать и установить'}
                </button>
              )}
              <button className="big-btn ghost" onClick={() => openUrl(RELEASES_URL)}>Скачать вручную</button>
              <button className="big-btn ghost" onClick={reDetectGta}>Найти GTA V заново</button>
            </div>
          </div>
        </div>
      )}

      {/* ───────── Settings modal ───────── */}
      {showSettings && (
        <div className="overlay" onClick={() => setShowSettings(false)}>
          <div className="overlay-card" onClick={e => e.stopPropagation()}>
            <div className="row-between"><h2>Настройки</h2><button className="icon-btn" onClick={() => setShowSettings(false)}><CloseIcon /></button></div>
            <h3>Игровой клиент</h3>
            <div className="kv"><span>Установлен</span><b>{clientState?.installed ? 'Да' : 'Нет'}</b></div>
            <div className="kv"><span>Путь</span><code>{clientState?.client_path || clientState?.install_dir}</code></div>
            <div className="kv"><span>Версия</span><b>{clientState?.version || '—'}</b></div>
            <div className="overlay-actions">
              <button className="big-btn primary" disabled={installing} onClick={installClient}>
                {clientState?.installed ? 'Переустановить клиент' : 'Установить клиент'}
              </button>
              <button className="big-btn ghost" disabled={installing} onClick={wipeAndReinstall}>
                Удалить и скачать заново
              </button>
            </div>
            <h3>GTA V</h3>
            <div className="kv"><span>Путь</span><code>{clientState?.gta_path || 'не найдена'}</code></div>
            <div className="overlay-actions">
              <button className="big-btn ghost" onClick={reDetectGta}>Найти заново</button>
              <button className="big-btn ghost" onClick={() => openUrl('https://store.steampowered.com/app/271590/')}>Купить в Steam</button>
            </div>
            <h3>Master-сервер</h3>
            <div className="kv"><span>URL</span><code>{MASTER_URL}</code></div>
            <div className="kv"><span>Статус</span><b>{error ? `ошибка: ${error}` : 'онлайн'}</b></div>
            <h3>О программе</h3>
            <div className="kv"><span>Лаунчер</span><b>Alfa MP Launcher v0.1.10</b></div>
            <div className="overlay-actions">
              <button className="big-btn ghost" onClick={() => openUrl(RELEASES_URL)}>Все релизы на GitHub</button>
            </div>
          </div>
        </div>
      )}

      {/* ───────── Downloads modal ───────── */}
      {showDownloads && (
        <div className="overlay" onClick={() => setShowDownloads(false)}>
          <div className="overlay-card" onClick={e => e.stopPropagation()}>
            <div className="row-between"><h2>Загрузки</h2><button className="icon-btn" onClick={() => setShowDownloads(false)}><CloseIcon /></button></div>
            {installing && progress ? (
              <>
                <p>{progress.stage === 'downloading' ? 'Скачивание клиента' : 'Распаковка клиента'}</p>
                <div className="progress-wrap">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: progress.total ? `${Math.min(100, 100 * progress.received / progress.total)}%` : '8%' }} />
                  </div>
                  <div className="progress-meta">
                    {progress.stage === 'downloading'
                      ? `${formatBytes(progress.received)}${progress.total ? ` / ${formatBytes(progress.total)}` : ''}`
                      : `${progress.received}/${progress.total} файлов`}
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">Активных загрузок нет.</p>
            )}
            <h3>Полезные ссылки</h3>
            <div className="overlay-actions">
              <button className="big-btn ghost" onClick={() => openUrl(RELEASES_URL)}>Все билды</button>
              <button className="big-btn ghost" onClick={() => openUrl(`${MASTER_URL}/download/nsis`)}>Прямая ссылка на установщик</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="toasts">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
