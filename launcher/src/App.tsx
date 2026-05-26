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
};

type Tab = 'gta5' | 'rdr2' | 'favorites' | 'history';

// ── Mocked data (until master-server /v1/servers returns real shape) ──
const MOCK: Server[] = [
  { id: '1',  name: 'GTA5RP.COM | Redwood | gta5rp.com/discord',  country: 'ru', featured: true, tags: ['ROLEPLAY','VOICE','11','LOCKED'], gamemode: 'roleplay', players: 1869, maxPlayers: 2000, ping: 28 },
  { id: '2',  name: 'GTA5RP.COM | Murrieta | gta5rp.com/discord', country: 'ru', featured: true, tags: ['ROLEPLAY','VOICE','11','LOCKED'], gamemode: 'roleplay', players: 1731, maxPlayers: 2000, ping: 31 },
  { id: '3',  name: 'GTA5RP.COM | Eclipse | gta5rp.com/discord',  country: 'ru', featured: true, tags: ['ROLEPLAY','VOICE','11','LOCKED'], gamemode: 'roleplay', players: 1298, maxPlayers: 1500, ping: 35 },
  { id: '4',  name: 'GTA5RP.COM | La Puerta | gta5rp.com/discord', country: 'ru', featured: true, tags: ['ROLEPLAY','VOICE','11','LOCKED'], gamemode: 'roleplay', players: 1262, maxPlayers: 1500, ping: 29 },
  { id: '5',  name: 'GTA5RP.COM | Rockford | gta5rp.com/discord', country: 'ru', featured: true, tags: ['ROLEPLAY','VOICE','11','LOCKED'], gamemode: 'roleplay', players: 1038, maxPlayers: 1500, ping: 42 },
  { id: '6',  name: 'RMRP - Криминальная Москва | Арбат',          country: 'ru', featured: true, tags: ['VOICE','11','LOCKED'],          gamemode: 'roleplay', players: 910, maxPlayers: 1000, ping: 55 },
  { id: '7',  name: 'GTA5RP.COM | Burton | gta5rp.com/discord',   country: 'ru', featured: true, tags: ['ROLEPLAY','VOICE','11','LOCKED'], gamemode: 'roleplay', players: 876, maxPlayers: 1500, ping: 38 },
  { id: '8',  name: 'GTA5RP.COM | Senora | gta5rp.com/discord',   country: 'ru', featured: true, tags: ['ROLEPLAY','VOICE','11','LOCKED'], gamemode: 'roleplay', players: 863, maxPlayers: 1500, ping: 33 },
  { id: '9',  name: 'GTA5RP.COM | Grapeseed | gta5rp.com/discord', country: 'ru', featured: true, tags: ['ROLEPLAY','VOICE','11','LOCKED'], gamemode: 'roleplay', players: 752, maxPlayers: 1500, ping: 36 },
  { id: '10', name: 'OGland Romania - Roleplay Server',            country: 'ro', tags: ['ROLEPLAY','VOICE','11','LOCKED'],          gamemode: 'roleplay', players: 746, maxPlayers: 1000, ping: 88 },
];

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
  const [servers] = useState<Server[]>(MOCK);

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
        {filtered.map(s => (
          <div key={s.id} className="server-row">
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
            <div className="players">{formatNum(s.players)}</div>
            <div className="ping"><PingBars ms={s.ping} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
