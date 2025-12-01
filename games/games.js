document.addEventListener('DOMContentLoaded', () => {
  /* Panels */

  const sideLinks = document.querySelectorAll('.side-link');
  const panels    = document.querySelectorAll('.panel');

  sideLinks.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.panel;
      sideLinks.forEach(b => b.classList.toggle('active', b === btn));
      panels.forEach(p => p.classList.toggle('visible', p.id === target));
    });
  });

  /* Shared β state (same as chad.js) */

  const STORAGE_KEY = 'gch_beta_clicker_v1';
  const defaultState = { progress: 0, crashes: 0, lastCrashAt: 0 };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultState };
      const parsed = JSON.parse(raw);
      return { ...defaultState, ...parsed };
    } catch {
      return { ...defaultState };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();
  let lastCrashSeen = state.lastCrashAt || 0;

  /* Clicker DOM */

  const clickBtn      = document.getElementById('clickButton');
  const clickPercent  = document.getElementById('clickPercent');
  const crashCountEl  = document.getElementById('crashCount');
  const chargeFill    = document.getElementById('chargeFill');
  const crashMessage  = document.getElementById('crashMessage');

  /* Stats DOM */

  const delusionVal = document.getElementById('delusionVal');
  const delusionFill = document.getElementById('delusionFill');
  const fomoVal = document.getElementById('fomoVal');
  const fomoFill = document.getElementById('fomoFill');
  const fearVal = document.getElementById('fearVal');
  const fearFill = document.getElementById('fearFill');
  const liqVal = document.getElementById('liqVal');
  const liqFill = document.getElementById('liqFill');

  const crashLog = document.getElementById('crashLog');

  /* Wallet connect */

  const walletBtn  = document.getElementById('walletConnect');
  const walletAddr = document.getElementById('walletAddr');

  if (walletBtn) {
    walletBtn.addEventListener('click', async () => {
      if (!window.ethereum) {
        alert('Install MetaMask or a Base-compatible wallet.');
        return;
      }
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });
        if (accounts.length) {
          const a = accounts[0];
          walletAddr.textContent = `Wallet: ${a.slice(0, 6)}…${a.slice(-4)}`;
          walletBtn.textContent = 'Wallet Connected';
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  /* Rendering */

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

  function flashCrashMessage() {
    const messages = [
      'UPDATE FAILED: Alpha rejected the patch.',
      'Stack overflow in ego-core.',
      'Segfault in /copium/lib/hope.so',
      'v2.0 rolled back to v0.1 (still beta).'
    ];
    const msg = messages[Math.floor(Math.random() * messages.length)];
    crashMessage.textContent = msg;
  }

  function renderMetrics(priceChange24h) {
    // priceChange24h from Dexscreener, can be null
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

  /* Price → metrics */

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

  /* CLICKER LOGIC */

  function triggerCrashVisual() {
    document.body.classList.add('beta-crash');
    setTimeout(() => document.body.classList.remove('beta-crash'), 350);
  }

  function handleClick() {
    if (state.progress >= 100) {
      // crash + reset
      state.crashes += 1;
      state.progress = 0;
      state.lastCrashAt = Date.now();
      saveState();
      flashCrashMessage();
      addCrashLogEntry('β core overloaded. System reverted to safe delusion.');
      triggerCrashVisual();
      renderClicker();
      // FEAR spike
      fearFill.style.boxShadow = '0 0 18px rgba(248,113,113,0.9)';
      setTimeout(() => fearFill.style.boxShadow = 'none', 400);
      return;
    }

    state.progress = Math.min(100, state.progress + 5);
    saveState();
    renderClicker();

    // subtle delusion wiggle
    delusionFill.style.boxShadow = '0 0 12px rgba(56,189,248,0.8)';
    setTimeout(() => delusionFill.style.boxShadow = 'none', 220);
  }

  if (clickBtn) {
    clickBtn.addEventListener('click', handleClick);
  }

  // initial paint
  renderClicker();

  /* Poll for crashes that happened on main site (logo clicker) */

  setInterval(() => {
    const fresh = loadState();
    if (fresh.lastCrashAt && fresh.lastCrashAt !== lastCrashSeen) {
      lastCrashSeen = fresh.lastCrashAt;
      state = fresh;
      flashCrashMessage();
      addCrashLogEntry('External β crash detected (main site).');
      triggerCrashVisual();
      renderClicker();
    } else {
      state = fresh;
      renderClicker();
    }
  }, 1500);
});
