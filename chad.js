document.addEventListener('DOMContentLoaded', () => {
  /* ========== NAV TOGGLE ========== */
  const navToggle = document.getElementById('navToggle');
  const navLinks  = document.getElementById('navLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => navLinks.classList.remove('open'))
    );
  }

  /* ========== MARKET TICKER (LIVE) ========== */

  const tickerTrack = document.getElementById('tickerTrack');

  function renderTicker(items) {
    if (!tickerTrack) return;
    tickerTrack.innerHTML = items.map(([label, value]) => `
      <div class="ticker-item">
        <span class="label">${label}</span><span>${value}</span>
      </div>
    `).join('');
  }

  async function fetchPrices() {
    try {
      // CoinGecko for BTC / ETH / XAU, Dexscreener for GCAβ
      const cgRes = await fetch(
        'https://api.coingecko.com/api/v3/simple/price' +
        '?ids=bitcoin,ethereum,tether-gold&vs_currencies=usd,btc'
      );
      const cg = await cgRes.json();

      const btcUsd = cg.bitcoin?.usd || 0;
      const ethUsd = cg.ethereum?.usd || 0;
      const ethBtc = cg.ethereum?.btc || 0;
      const xauUsd = cg['tether-gold']?.usd || 0;

      const dsRes = await fetch(
        'https://api.dexscreener.com/latest/dex/tokens/' +
        '0x6d0b8eb75e9d6735cc301c3a6e82adee43590b07'
      );
      const ds = await dsRes.json();
      const pair = ds.pairs?.[0];

      const gcaUsd = pair?.priceUsd ? Number(pair.priceUsd) : 0;
      const gcaChange = pair?.priceChange?.h24 ? Number(pair.priceChange.h24) : 0;

      const xauBtc = (xauUsd && btcUsd) ? (xauUsd / btcUsd) : 0;
      const gcaEth  = (gcaUsd && ethUsd) ? (gcaUsd / ethUsd) : 0;

      const fmt = (n, d = 2) =>
        n ? (Math.abs(n) < 0.0001 ? n.toExponential(2) : n.toFixed(d)) : '–';

      const items = [
        ['BTC/USD',  `$${fmt(btcUsd, 0)}`],
        ['ETH/USD',  `$${fmt(ethUsd, 0)}`],
        ['ETH/BTC',  fmt(ethBtc, 5)],
        ['XAU/BTC',  xauBtc ? fmt(xauBtc, 5) : '–'],
        ['GCAβ/USDC', gcaUsd ? `$${fmt(gcaUsd, 6)}` : '–'],
        ['GCAβ/ETH',  gcaEth ? fmt(gcaEth, 8) : '–'],
        ['GCAβ 24h',  gcaChange ? `${gcaChange.toFixed(2)}%` : '–'],
      ];

      renderTicker(items);
    } catch (e) {
      console.error('Price fetch failed', e);
      // fallback static
      renderTicker([
        ['BTC/USD',  'loading…'],
        ['ETH/USD',  'loading…'],
        ['GCAβ',     'still beta'],
      ]);
    }
  }

  // initial + refresh
  fetchPrices();
  setInterval(fetchPrices, 60_000);

  /* ========== SHARED β CLICKER STATE ========== */

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

  const body             = document.body;
  const logoClicker      = document.getElementById('logoClicker');
  const logoRingFill     = document.getElementById('logoRingFill');
  const logoStatus       = document.getElementById('logoStatus');
  const logoProgressVal  = document.getElementById('logoProgressVal');
  const widgetBtn        = document.getElementById('betaWidgetButton');
  const widgetPercent    = document.getElementById('betaWidgetPercent');

  function progressToClip(pct) {
    const clipTop = 100 - pct;
    return `inset(${clipTop}% 0 0 0)`;
  }

  function getStatusText(pct, crashes) {
    if (pct === 0 && crashes === 0) return 'CLICK LOGO TO CHARGE β';
    if (pct === 0 && crashes > 0)  return 'REBOOTING β CORE…';
    if (pct < 30)  return 'Charging ego-core…';
    if (pct < 60)  return 'Optimizing delusion parameters…';
    if (pct < 90)  return 'Preparing forbidden v2.0 update…';
    if (pct < 100) return 'Aggregating exit liquidity…';
    return 'v2.0 CRITICAL ERROR · STILL BETA';
  }

  function updateUI() {
    const pct = state.progress;
    if (logoRingFill) {
      logoRingFill.style.clipPath = progressToClip(pct);
    }
    if (logoProgressVal) {
      logoProgressVal.textContent = String(pct).padStart(3, '0');
    }
    if (logoStatus) {
      logoStatus.textContent = getStatusText(pct, state.crashes);
    }
    if (widgetPercent) {
      widgetPercent.textContent = pct + '%';
    }
  }

  function triggerCrashFX() {
    body.classList.add('beta-crash');
    if (typeof window.__gcaBurstBetas === 'function') {
      window.__gcaBurstBetas();
    }
    setTimeout(() => body.classList.remove('beta-crash'), 400);
  }

  function handleBetaClick() {
    // click at 100% => crash + reset
    if (state.progress >= 100) {
      state.crashes += 1;
      state.progress  = 0;
      state.lastCrashAt = Date.now();
      saveState();
      triggerCrashFX();
      updateUI();
      return;
    }
    // otherwise, charge
    state.progress = Math.min(100, state.progress + 5);
    saveState();
    updateUI();
  }

  if (logoClicker) {
    logoClicker.addEventListener('click', handleBetaClick);
  }
  if (widgetBtn) {
    widgetBtn.addEventListener('click', handleBetaClick);
  }

  updateUI();

  /* ========== β SWARM BACKGROUND ========== */

  const betaCanvas = document.createElement('canvas');
  betaCanvas.id = 'betaField';
  document.body.prepend(betaCanvas);
  const bctx = betaCanvas.getContext('2d');

  let bw = window.innerWidth;
  let bh = window.innerHeight;

  function resizeBetaCanvas() {
    bw = window.innerWidth;
    bh = window.innerHeight;
    betaCanvas.width  = bw;
    betaCanvas.height = bh;
  }
  resizeBetaCanvas();
  window.addEventListener('resize', resizeBetaCanvas);

  const betas = [];
  const lore  = [];

  const N_BETAS = 30;
  const N_LORE  = 4;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  for (let i = 0; i < N_BETAS; i++) {
    betas.push({
      x: rand(0, bw),
      y: rand(0, bh),
      vx: rand(-0.2, 0.2),
      vy: rand(-0.2, 0.2),
      size: rand(16, 24)
    });
  }

  const phrases = [
    'ALPHA.EXE / STILL_BETA',
    '96% DELUSION',
    'BASE ENERGY ONLINE',
    'VAULT OF β: ARMED'
  ];
  for (let i = 0; i < N_LORE; i++) {
    lore.push({
      text: phrases[i % phrases.length],
      x: rand(0, bw),
      y: rand(0, bh),
      vx: rand(-0.05, 0.05),
      vy: rand(-0.05, 0.05),
      alpha: rand(0.15, 0.4)
    });
  }

  const mouse = { x: null, y: null };

  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  window.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });

  // expose burst for crash FX
  window.__gcaBurstBetas = function () {
    betas.forEach(b => {
      b.vx += rand(-2.5, 2.5);
      b.vy += rand(-2.5, 2.5);
    });
  };

  function stepBetaField() {
    bctx.clearRect(0, 0, bw, bh);

    // background soft wash
    bctx.fillStyle = 'rgba(3,7,18,0.85)';
    bctx.fillRect(0, 0, bw, bh);

    // β glyphs
    betas.forEach(b => {
      // repulsion
      if (mouse.x !== null) {
        const dx = b.x - mouse.x;
        const dy = b.y - mouse.y;
        const d  = Math.sqrt(dx*dx + dy*dy) || 1;
        const radius = 140;
        if (d < radius) {
          const force = (radius - d) / radius * 0.6;
          b.vx += (dx / d) * force;
          b.vy += (dy / d) * force;
        }
      }

      b.x += b.vx;
      b.y += b.vy;
      b.vx *= 0.96;
      b.vy *= 0.96;

      if (b.x < -40) b.x = bw + 40;
      if (b.x > bw + 40) b.x = -40;
      if (b.y < -40) b.y = bh + 40;
      if (b.y > bh + 40) b.y = -40;

      bctx.globalAlpha = 0.25;
      bctx.font = `${b.size + 10}px system-ui`;
      bctx.fillStyle = '#0b1120';
      bctx.fillText('β', b.x + 3, b.y + 3);

      bctx.globalAlpha = 0.9;
      bctx.font = `${b.size}px system-ui`;
      bctx.fillStyle = 'rgba(56,189,248,0.5)';
      bctx.fillText('β', b.x, b.y);
    });

    // lore fragments
    lore.forEach(l => {
      l.x += l.vx;
      l.y += l.vy;

      if (l.x < -200) l.x = bw + 50;
      if (l.x > bw + 200) l.x = -50;
      if (l.y < -50) l.y = bh + 20;
      if (l.y > bh + 50) l.y = -20;

      bctx.globalAlpha = l.alpha;
      bctx.font = '11px monospace';
      bctx.fillStyle = 'rgba(148,163,184,0.9)';
      bctx.fillText(l.text, l.x, l.y);
    });

    requestAnimationFrame(stepBetaField);
  }

  stepBetaField();
});
