// FXServer loading-screen → uses standard CFX hooks: loadProgress events.
// Reference: https://docs.fivem.net/docs/scripting-reference/runtimes/lua/functions/SendLoadingScreenMessage/

const bar       = document.getElementById('bar');
const counter   = document.getElementById('counter');
const phase     = document.getElementById('phase');
const resources = document.getElementById('resources');
const serverNm  = document.getElementById('serverName');
const tip       = document.getElementById('tip');

// Rotate friendly tips
const tips = [
  'Tip: Press F8 to open the developer console',
  'Tip: Type /spawn to respawn at the starting point',
  'Tip: Hold T to open chat',
  'Tip: Servers can be added at http://104.194.140.221:8080/admin',
  'Tip: Custom maps load progressively — fly first, drive later',
];
let tipIdx = 0;
setInterval(() => { tipIdx = (tipIdx + 1) % tips.length; tip.textContent = tips[tipIdx]; }, 4500);

// Server info available via window.GET_SERVER_NAME? CFX exposes some globals.
// Resource progress messages come via window.addEventListener('message')
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || !d.eventName) return;

  switch (d.eventName) {
    case 'loadProgress': {
      // 0..1 overall, plus message
      const pct = Math.max(0, Math.min(100, d.loadFraction * 100));
      bar.style.width = pct.toFixed(1) + '%';
      counter.textContent = pct.toFixed(0) + '%';
      break;
    }
    case 'startInitFunctionOrder':
      phase.textContent = 'Bootstrapping';
      break;
    case 'startDataFileEntries':
      phase.textContent = 'Mounting game data';
      counter.textContent = `0 / ${d.count}`;
      break;
    case 'performMapLoadFunction':
      phase.textContent = 'Loading map';
      break;
    case 'onLogLine':
      // Optional: append game-engine log lines to a debug list (we don't show by default).
      break;
    case 'startDataFileEntry':
      counter.textContent = `${d.index} / ${d.total}`;
      break;
    case 'initFunctionInvoking':
      phase.textContent = `Initializing: ${d.name || 'system'}`;
      break;
    case 'initFunctionInvoked':
      phase.textContent = `Initialized: ${d.name || 'system'}`;
      break;
  }
});

// Resource list — CFX fires events for resources as they start.
// We hook a custom message channel "alfa:loading" that our other resources can send to.
const seenResources = new Set();
function addResource(name, status = 'pending') {
  if (seenResources.has(name)) return;
  seenResources.add(name);
  const li = document.createElement('li');
  li.className = status;
  li.textContent = name;
  resources.appendChild(li);
  // Keep only the last 8 visible
  while (resources.children.length > 8) resources.removeChild(resources.firstChild);
}

window.addEventListener('message', (e) => {
  if (e.data?.eventName === 'startResource') addResource(e.data.resourceName, 'pending');
  if (e.data?.eventName === 'doneResource')  {
    const li = [...resources.children].find(x => x.textContent === e.data.resourceName);
    if (li) li.className = 'ok';
  }
});

// Fallback shimmer if the server is super fast or sends no progress events
let phaseI = 0;
const phases = ['Initializing', 'Negotiating session', 'Streaming assets', 'Spawning world'];
setInterval(() => {
  if (phase.textContent === 'Initializing' || phase.textContent === '') {
    phase.textContent = phases[phaseI = (phaseI + 1) % phases.length];
  }
}, 1500);
