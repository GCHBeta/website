document.addEventListener('DOMContentLoaded', () => {
  /* === Shared β state (same key as main site) === */
  const STATE_KEY = 'gch_beta_clicker_v1';
  const defaultState = { progress: 0, crashes: 0, lastCrashAt: 0 };

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return { ...defaultState };
      const parsed = JSON.parse(raw);
      return { ...defaultState, ...parsed };
    } catch {
      return { ...defaultState };
    }
  }
  function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  let state = loadState();
  let lastCrashSeen = state.lastCrashAt || 0;

  /* === Leaderboard storage (local only) === */
  const LB_KEY = 'gch_beta_leaderboard_v1';

  function loadLeaderboard() {
    try {
      const raw = localStorage.getItem(LB_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function saveLeaderboard() {
    localStorage.setItem(LB_KEY, JSON.stringify(leaderboard));
  }

  let leaderboard = loadLeaderboard();
  let currentPlayerId = 'guest';

  /* === DOM handles === */

  const clickBtn     = document.getElementById('clickButton');
  const clickPercent = document.getElementById('clickPercent');
  const crashCountEl = document.getElementById('crashCount');
  const chargeFill   = document.getElementById('chargeFill');

  const delusionVal  = document.getElementById('delusionVal');
  const delusionFill = document.getElementById('delusionFill');
  const fomoVal      = document.getElementById('fomoVal');
  const fomoFill     = document.getElementById('fomoFill');
  const fearVal      = document.getElementById('fearVal');
  const fearFill     = document.getElementById('fearFill');
  const liqVal       = document.getElementById('liqVal');
  const liqFill      = document.getElementById('liqFill');

  const crashLog     = document.getElementById('crashLog');

  const leaderTable  = document.getElementById('leaderTable').querySelector('tbody');

  const walletBtn    = document.getElementById('walletConnect');
  const walletAddr   = document.getElementById('walletAddr');

  const hodlersList  = document.getElementById('hodlersList');

  /* === Wallet connect === */

  if (walletBtn) {
    walletBtn.addEventListener('click', async () => {
      if (!window.ethereum) {
        alert('Install MetaMask or a Base-compatible wallet to link your β stats.');
        return;
      }
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });
        if (accounts && accounts[0]) {
          const addr = accounts[0];
          const short = addr.slice(0, 6) + '…' + addr.slice(-4);
          walletAddr.textContent = `Wallet: ${short}`;
          walletBtn.textContent = 'Wallet Connected';
          currentPlayerId = addr.toLowerCase();
          // ensure player record exists
          if (!leaderboard[currentPlayerId]) {
            leaderboard[currentPlayerId] = { clicks: 0, crashes: 0 };
            saveLeaderboard();
            renderLeaderboard();
          }
        }
      } catch (e) {
        console.error('Wallet connection error', e);
      }
    });
  }

  /* === Helper: ensure player record === */

  function ensurePlayer(id) {
    if (!leaderboard[id]) {
      leaderboard[id] = { clicks: 0, crashes: 0 };
    }
  }

  function recordClick() {
    ensurePlayer(currentPlayerId);
    leaderboard[currentPlayerId].clicks += 1;
    saveLeaderboard();
    renderLeaderboard();
  }

  function recordCrash() {
    ensurePlayer(currentPlayerId);
    leaderboard[currentPlayerId].crashes += 1;
    saveLeaderboard();
    renderLeaderboard();
  }

  /* === Rendering === */

  function renderClicker() {
    const pct = state.progress;
    clickPercent.textContent = `${pct}%`;
    crashCountEl.textContent = state.crashes;
    chargeFill.style.width = `${pct}%`;
  }

  function addCrashLogEntry(text) {
    if (!crashLog) return;
    const div = document.createElement('div');
    div.className = 'crash-entry';
    const ts = new Date().toLocaleTimeString();
    div.textContent = `[${ts}] ${text}`;
    crashLog.prepend(div);
  }

  function renderLeaderboard() {
    leaderTable.innerHTML = '';
    const entries = Object.entries(leaderboard);

    entries.sort((a, b) => b[1].clicks - a[1].clicks);

    entries.forEach(([id, stats], idx) => {
      const tr = document.createElement('tr');
      const short =
        id === 'guest'
          ? 'Guest (this browser)'
          : id.slice(0, 6) + '…' + id.slice(-4);

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${short}</td>
        <td>${stats.clicks}</td>
        <td>${stats.crashes}</td>
      `;
      leaderTable.appendChild(tr);
    });

    if (!entries.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="4">No β data yet. Start clicking.</td>`;
      leaderTable.appendChild(tr);
    }
  }

  function renderMetrics(priceChange24h) {
    const delta = typeof priceChange24h === 'number' ? priceChange24h : 0;
    const abs   = Math.abs(delta);

    const baseDelusion = 96;
    const del = Math.min(100, baseDelusion + abs);
    const fomo = Math.min(100, 50 + delta * 2);
    const fear = Math.min(100, 50 - delta * 2);
    const liq  = 4 + Math.random() * 6;

    delusionVal.textContent = `${del.toFixed(1)}%`;
    delusionFill.style.width = `${del}%`;

    fomoVal.textContent = `${fomo.toFixed(1)}%`;
    fomoFill.style.width = `${fomo}%`;

    fearVal.textContent = `${fear.toFixed(1)}%`;
    fearFill.style.width = `${fear}%`;

    liqVal.textContent = `${liq.toFixed(1)}%`;
    liqFill.style.width = `${liq}%`;
  }

  /* === Market → metrics === */

  async function fetchMarketForMetrics() {
    try {
      const res = await fetch(
        'https://api.dexscreener.com/latest/dex/tokens/' +
        '0x6d0b8eb75e9d6735cc301c3a6e82adee43590b07'
      );
      const data = await res.json();
      const pair = data.pairs?.[0];
      const change = pair?.priceChange?.h24 ? Number(pair.priceChange.h24) : 0;
      renderMetrics(change);
    } catch (e) {
      console.error('Metrics price fetch failed', e);
      renderMetrics(0);
    }
  }

  fetchMarketForMetrics();
  setInterval(fetchMarketForMetrics, 60_000);

  /* === HODLERS (OPTIONAL API) === */

  async function fetchHodlers() {
    // If you later get a BaseScan API key, drop it here:
    const BASESCAN_API_KEY = ''; // e.g. 'YOUR_KEY_HERE'

    if (!BASESCAN_API_KEY) {
      // Keep placeholder text — nothing to do
      return;
    }

    try {
      const url =
        'https://api.basescan.org/api?' +
        'module=token&action=tokenholderlist' +
        '&contractaddress=0x6d0B8eB75E9d6735cc301c3a6E82adeE43590B07' +
        '&page=1&offset=20' +
        `&apikey=${BASESCAN_API_KEY}`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== '1' || !Array.isArray(data.result)) return;

      // crude filter: remove contracts / known LPs by simple heuristics
      const holders = data.result.filter(h => {
        const addr = h.TokenHolderAddress?.toLowerCase() || '';
        // filter out 0x0.., dead, and obvious contract markers
        if (addr === '0x0000000000000000000000000000000000000000') return false;
        if (addr.includes('000000000000000000000000000000000000dead')) return false;
        return true;
      }).slice(0, 8);

      hodlersList.innerHTML = '';
      holders.forEach(h => {
        const li = document.createElement('li');
        const addr = h.TokenHolderAddress;
        const pct  = Number(h.TokenHolderPercentage || 0).toFixed(2);
        const short = addr.slice(0, 6) + '…' + addr.slice(-4);
        li.textContent = `${short} — ${pct}%`;
        hodlersList.appendChild(li);
      });

      if (!holders.length) {
        hodlersList.innerHTML = '<li>No holder data available yet.</li>';
      }
    } catch (e) {
      console.error('Hodlers fetch failed', e);
    }
  }

  fetchHodlers();

  /* === Clicker logic === */

  function triggerCrashVisual() {
    document.body.classList.add('beta-crash');
    setTimeout(() => document.body.classList.remove('beta-crash'), 350);
  }

  function handleClick() {
    // charge
    if (state.progress < 100) {
      state.progress = Math.min(100, state.progress + 5);
      saveState();
      recordClick();
      renderClicker();
      // tiny delusion glow
      delusionFill.style.boxShadow = '0 0 12px rgba(56,189,248,0.8)';
      setTimeout(() => (delusionFill.style.boxShadow = 'none'), 220);
      return;
    }

    // crash
    state.crashes += 1;
    state.progress = 0;
    state.lastCrashAt = Date.now();
    saveState();
    recordCrash();
    addCrashLogEntry('β core overloaded. v2.0 reverted to safe beta mode.');
    triggerCrashVisual();
    renderClicker();
    // FEAR spike
    fearFill.style.boxShadow = '0 0 18px rgba(248,113,113,0.9)';
    setTimeout(() => (fearFill.style.boxShadow = 'none'), 400);
  }

  if (clickBtn) {
    clickBtn.addEventListener('click', handleClick);
  }

  // initial paint
  renderClicker();
  renderLeaderboard();

  /* === Watch for crashes from the main site (logo clicker) === */

  setInterval(() => {
    const fresh = loadState();
    if (fresh.lastCrashAt && fresh.lastCrashAt !== lastCrashSeen) {
      lastCrashSeen = fresh.lastCrashAt;
      state = fresh;
      addCrashLogEntry('External β crash detected (main site logo).');
      triggerCrashVisual();
      renderClicker();
    } else {
      state = fresh;
      renderClicker();
    }
  }, 1500);
});
