document.addEventListener('DOMContentLoaded', () => {
  /*** DOM HOOKS ***/
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const startOverlay = document.getElementById('startOverlay');

  const vaultHpLabel = document.getElementById('vaultHpLabel');
  const coinsLabel = document.getElementById('coinsLabel');
  const waveLabel = document.getElementById('waveLabel');
  const breachLabel = document.getElementById('breachLabel');

  const waveStateLabel = document.getElementById('waveStateLabel');
  const enemiesLabel = document.getElementById('enemiesLabel');
  const difficultyLabel = document.getElementById('difficultyLabel');

  const tapVaultBtn = document.getElementById('tapVaultBtn');
  const startWaveBtn = document.getElementById('startWaveBtn');
  const speedBtn = document.getElementById('speedBtn');
  const clearGameBtn = document.getElementById('clearGameBtn');
  const gigaBtn = document.getElementById('gigaBtn');

  const towerButtons = Array.from(
    document.querySelectorAll('.tower-btn[data-tower]')
  );

  const walletBtn = document.getElementById('walletConnect');
  const walletStatus = document.getElementById('walletStatus');

  /*** WALLET CONNECT (BÁSICO) ***/
  if (walletBtn) {
    walletBtn.addEventListener('click', async () => {
      if (!window.ethereum) {
        alert('Install MetaMask or a Base-compatible wallet to flex your β stats.');
        return;
      }
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });
        if (accounts && accounts[0]) {
          const addr = accounts[0];
          const short = addr.slice(0, 6) + '…' + addr.slice(-4);
          walletStatus.textContent = `Wallet: ${short}`;
          walletBtn.textContent = 'Wallet Connected';
        }
      } catch (e) {
        console.error('Wallet error', e);
      }
    });
  }

  /*** GAME CONSTANTS ***/
  const VAULT_MAX_HP = 100;
  const GIGA_MAX = 100;
  const TAPS_PER_INTERMISSION = 3;

  const towerCosts = {
    sentinel: 40,
    cannon: 60,
    totem: 50,
  };

  const towerDefs = {
    sentinel: {
      name: 'Sentinel Node',
      range: 150,
      fireDelay: 0.7,
      damage: 8,
      color: '#38bdf8',
    },
    cannon: {
      name: 'Liquidity Cannon',
      range: 220,
      fireDelay: 1.4,
      damage: 20,
      color: '#f97316',
    },
    totem: {
      name: 'Copium Totem',
      range: 130,
      fireDelay: 0.4,
      damage: 4,
      color: '#a855f7',
    },
  };

  // Path waypoints (in canvas coords)
  const path = [
    { x: -60, y: 260 },
    { x: 220, y: 260 },
    { x: 220, y: 140 },
    { x: 560, y: 140 },
    { x: 560, y: 360 },
    { x: 860, y: 360 },
  ];

  const vaultCore = { x: 910, y: 280, radius: 42 };

  // Tower slots (circles onde podes construir)
  const towerSlots = [
    { x: 280, y: 200, tower: null },
    { x: 280, y: 340, tower: null },
    { x: 430, y: 200, tower: null },
    { x: 430, y: 340, tower: null },
    { x: 720, y: 200, tower: null },
    { x: 720, y: 340, tower: null },
  ];

  const wavesBase = [
    { count: 8, hp: 22, speed: 70 },
    { count: 10, hp: 32, speed: 80 },
    { count: 12, hp: 45, speed: 90 },
    { count: 14, hp: 60, speed: 100 },
    { count: 16, hp: 80, speed: 110 },
  ];

  function getWaveConfig(index) {
    const baseIdx = Math.min(index, wavesBase.length - 1);
    const base = wavesBase[baseIdx];
    const extraLevel = Math.max(0, index - (wavesBase.length - 1));
    const scale = 1 + extraLevel * 0.3;

    return {
      count: Math.round(base.count * (1 + extraLevel * 0.1)),
      hp: Math.round(base.hp * scale),
      speed: base.speed + extraLevel * 15,
    };
  }

  function getDifficultyLabel(index) {
    if (index <= 1) return 'Normal';
    if (index <= 3) return 'Spicy';
    if (index <= 5) return 'Insane';
    return 'Mythic';
  }

  /*** GAME STATE ***/
  const state = {
    vaultHp: VAULT_MAX_HP,
    coins: 60,
    breaches: 0,

    currentWaveIndex: 0,
    waveInProgress: false,
    betweenWaves: false,
    enemies: [],
    projectiles: [],
    enemiesSpawned: 0,
    spawnTimer: 0,
    activeWave: null,

    speed: 1,
    gigaCharge: 0,
    gigaReady: false,

    selectedSlotIndex: null,
    pendingTowerType: null,

    tapsLeft: TAPS_PER_INTERMISSION,
    running: false,
  };

  let lastTimestamp = null;
  let rafId = null;

  /*** RESET ***/
  function resetGame() {
    state.vaultHp = VAULT_MAX_HP;
    state.coins = 60;
    state.breaches = 0;
    state.currentWaveIndex = 0;
    state.waveInProgress = false;
    state.betweenWaves = true;
    state.enemies = [];
    state.projectiles = [];
    state.enemiesSpawned = 0;
    state.spawnTimer = 0;
    state.activeWave = null;
    state.speed = 1;
    state.gigaCharge = 0;
    state.gigaReady = false;
    state.selectedSlotIndex = null;
    state.pendingTowerType = null;
    state.tapsLeft = TAPS_PER_INTERMISSION;
    towerSlots.forEach((s) => (s.tower = null));
    updateHud();
  }

  /*** HUD ***/
  function updateHud() {
    vaultHpLabel.textContent = state.vaultHp.toString();
    coinsLabel.textContent = state.coins.toString();
    waveLabel.textContent = (state.currentWaveIndex + 1).toString();
    breachLabel.textContent = state.breaches.toString();

    const enemiesRemaining =
      (state.activeWave ? state.activeWave.count - state.enemiesSpawned : 0) +
      state.enemies.length;
    enemiesLabel.textContent = enemiesRemaining.toString();

    waveStateLabel.textContent = !state.running
      ? 'Sleeping'
      : state.waveInProgress
      ? 'Wave in progress'
      : 'Intermission';

    difficultyLabel.textContent = getDifficultyLabel(state.currentWaveIndex);

    tapVaultBtn.disabled =
      !state.betweenWaves || state.tapsLeft <= 0 || !state.running;

    startWaveBtn.disabled =
      !state.betweenWaves || state.vaultHp <= 0 || !state.running;

    speedBtn.textContent = `Speed: ${state.speed.toFixed(1)}x`;

    const gigaPct = Math.round((state.gigaCharge / GIGA_MAX) * 100);
    if (state.gigaReady) {
      gigaBtn.textContent = 'GIGA PURGE READY';
      gigaBtn.disabled = false;
      gigaBtn.classList.add('ready');
    } else {
      gigaBtn.textContent = `GIGA Charge ${gigaPct}%`;
      gigaBtn.disabled = true;
      gigaBtn.classList.remove('ready');
    }
  }

  /*** ENEMY / TOWER HELPERS ***/
  function spawnEnemy() {
    if (!state.activeWave) return;
    if (state.enemiesSpawned >= state.activeWave.count) return;

    const start = path[0];
    state.enemies.push({
      x: start.x,
      y: start.y,
      hp: state.activeWave.hp,
      maxHp: state.activeWave.hp,
      speed: state.activeWave.speed,
      waypointIndex: 1,
    });
    state.enemiesSpawned += 1;
  }

  function moveEnemies(dt) {
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      const targetWp = path[e.waypointIndex];
      if (!targetWp) {
        // reached end → breach
        state.enemies.splice(i, 1);
        handleBreach();
        continue;
      }

      const dx = targetWp.x - e.x;
      const dy = targetWp.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const step = e.speed * dt;

      if (step >= dist) {
        e.x = targetWp.x;
        e.y = targetWp.y;
        e.waypointIndex += 1;

        // if passou para além do último, conta breach
        if (e.waypointIndex >= path.length) {
          state.enemies.splice(i, 1);
          handleBreach();
        }
      } else {
        e.x += (dx / dist) * step;
        e.y += (dy / dist) * step;
      }
    }
  }

  function handleBreach() {
    state.breaches += 1;
    state.vaultHp = Math.max(0, state.vaultHp - 10);
    state.gigaCharge = Math.min(GIGA_MAX, state.gigaCharge + 20);

    if (state.vaultHp <= 0) {
      state.waveInProgress = false;
      state.betweenWaves = false;
    }
  }

  function spawnProjectile(tower, target) {
    const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    const speed = 320;
    state.projectiles.push({
      x: tower.x,
      y: tower.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: tower.damage,
      color: tower.color,
      life: 2,
    });
  }

  function updateProjectiles(dt) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      if (
        p.x < -50 ||
        p.x > canvas.width + 50 ||
        p.y < -50 ||
        p.y > canvas.height + 50 ||
        p.life <= 0
      ) {
        state.projectiles.splice(i, 1);
        continue;
      }

      // collision
      let hit = false;
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        const e = state.enemies[j];
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (dist < 14) {
          e.hp -= p.damage;
          if (e.hp <= 0) {
            state.enemies.splice(j, 1);
            state.coins += 3;
          }
          hit = true;
          break;
        }
      }
      if (hit) state.projectiles.splice(i, 1);
    }
  }

  function findTargetForTower(tower) {
    let best = null;
    let bestProgress = -Infinity;
    for (const e of state.enemies) {
      const dist = Math.hypot(e.x - tower.x, e.y - tower.y);
      if (dist <= tower.range) {
        // progress by waypointIndex + x
        const progress = e.waypointIndex * 1000 + e.x;
        if (progress > bestProgress) {
          bestProgress = progress;
          best = e;
        }
      }
    }
    return best;
  }

  function updateTowers(dt) {
    for (const slot of towerSlots) {
      if (!slot.tower) continue;
      const t = slot.tower;
      t.cooldown -= dt;
      if (t.cooldown <= 0) {
        const target = findTargetForTower(t);
        if (target) {
          if (t.type === 'totem') {
            // pseudo-AoE: vários hitzinhos
            target.hp -= t.damage * 0.7;
            if (target.hp <= 0) {
              const idx = state.enemies.indexOf(target);
              if (idx !== -1) state.enemies.splice(idx, 1);
              state.coins += 3;
            }
          } else {
            spawnProjectile(t, target);
          }
          t.cooldown = t.fireDelay;
        }
      }
    }
  }

  /*** WAVE FLOW ***/
  function startNextWave() {
    if (!state.betweenWaves || !state.running) return;
    state.waveInProgress = true;
    state.betweenWaves = false;
    state.enemies = [];
    state.projectiles = [];
    state.enemiesSpawned = 0;
    state.spawnTimer = 0;
    state.activeWave = getWaveConfig(state.currentWaveIndex);
    state.tapsLeft = 0; // bloqueia tap durante wave
  }

  function checkWaveEnd() {
    if (!state.waveInProgress || !state.activeWave) return;
    const allSpawned =
      state.enemiesSpawned >= state.activeWave.count &&
      state.enemies.length === 0;

    if (allSpawned) {
      state.waveInProgress = false;
      if (state.vaultHp > 0) {
        state.betweenWaves = true;
        state.currentWaveIndex += 1;
        state.coins += 10; // reward base
        state.tapsLeft = TAPS_PER_INTERMISSION;
      }
    }
  }

  /*** GIGA PURGE ***/
  function triggerGiga() {
    if (!state.gigaReady) return;
    state.enemies = [];
    state.projectiles = [];
    state.gigaCharge = 0;
    state.gigaReady = false;
  }

  /*** MAIN UPDATE & DRAW ***/
  function update(dt) {
    if (!state.running) return;

    if (state.waveInProgress && state.activeWave) {
      // spawn
      state.spawnTimer += dt;
      const spawnInterval = 0.9;
      while (
        state.spawnTimer >= spawnInterval &&
        state.enemiesSpawned < state.activeWave.count
      ) {
        spawnEnemy();
        state.spawnTimer -= spawnInterval;
      }

      moveEnemies(dt);
      updateTowers(dt);
      updateProjectiles(dt);
      checkWaveEnd();
    } else {
      // ainda assim, mantém projéteis a morrer / torres idle etc
      updateTowers(dt);
      updateProjectiles(dt);
    }

    // giga ready?
    if (!state.gigaReady && state.gigaCharge >= GIGA_MAX) {
      state.gigaReady = true;
    }

    updateHud();
  }

  function drawBackground() {
    // fundo
    ctx.fillStyle = '#030314';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grid suave
    ctx.strokeStyle = 'rgba(148,163,184,0.08)';
    ctx.lineWidth = 1;
    for (let x = 40; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 40; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // path
    ctx.beginPath();
    ctx.lineWidth = 16;
    const grad = ctx.createLinearGradient(
      path[0].x,
      path[0].y,
      path[path.length - 1].x,
      path[path.length - 1].y
    );
    grad.addColorStop(0, 'rgba(56,189,248,0.08)');
    grad.addColorStop(1, 'rgba(251,191,36,0.26)');
    ctx.strokeStyle = grad;
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();

    // linha brilhante
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(251,191,36,0.8)';
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();

    // vault core
    const r = vaultCore.radius;
    const grd2 = ctx.createRadialGradient(
      vaultCore.x,
      vaultCore.y,
      4,
      vaultCore.x,
      vaultCore.y,
      r
    );
    grd2.addColorStop(0, 'rgba(250,250,210,1)');
    grd2.addColorStop(0.4, 'rgba(245,158,11,0.9)');
    grd2.addColorStop(1, 'rgba(15,23,42,0.1)');
    ctx.fillStyle = grd2;
    ctx.beginPath();
    ctx.arc(vaultCore.x, vaultCore.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(251,191,36,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(vaultCore.x, vaultCore.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();

    // small β sign
    ctx.fillStyle = '#020617';
    ctx.font = 'bold 24px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('β', vaultCore.x, vaultCore.y);
  }

  function drawTowerSlots() {
    for (let i = 0; i < towerSlots.length; i++) {
      const slot = towerSlots[i];
      const isSelected = state.selectedSlotIndex === i;
      ctx.save();
      if (!slot.tower) {
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, 22, 0, Math.PI * 2);
        ctx.strokeStyle = isSelected
          ? 'rgba(96,165,250,0.9)'
          : 'rgba(148,163,184,0.6)';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(slot.x, slot.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        ctx.fill();
      } else {
        const t = slot.tower;
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15,23,42,0.95)';
        ctx.fill();

        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = t.color || '#e5e7eb';
        ctx.stroke();

        ctx.fillStyle = t.color || '#e5e7eb';
        ctx.font = 'bold 12px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let glyph = 'S';
        if (t.type === 'cannon') glyph = 'L';
        else if (t.type === 'totem') glyph = 'C';
        ctx.fillText(glyph, slot.x, slot.y);
      }
      ctx.restore();
    }
  }

  function drawEnemies() {
    for (const e of state.enemies) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(e.x, e.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(248,113,113,0.9)';
      ctx.fill();

      // hp bar
      const barW = 26;
      const barH = 4;
      const hpRatio = Math.max(0, e.hp / e.maxHp);
      const x = e.x - barW / 2;
      const y = e.y - 18;

      ctx.fillStyle = 'rgba(15,23,42,0.9)';
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#eab308' : '#ef4444';
      ctx.fillRect(x, y, barW * hpRatio, barH);

      ctx.restore();
    }
  }

  function drawProjectiles() {
    for (const p of state.projectiles) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = p.color || '#e5e7eb';
      ctx.shadowColor = p.color || '#e5e7eb';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawOverlayInfo() {
    if (!state.running) {
      ctx.fillStyle = 'rgba(15,23,42,0.8)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '18px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Click "Wake the Vault β" to begin.', canvas.width / 2, canvas.height / 2);
      return;
    }

    if (state.vaultHp <= 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fecaca';
      ctx.font = '24px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Vault Breached — Run Over.', canvas.width / 2, canvas.height / 2 - 10);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '16px system-ui';
      ctx.fillText('Press "Reset Run" on the right.', canvas.width / 2, canvas.height / 2 + 20);
    }
  }

  function draw() {
    drawBackground();
    drawTowerSlots();
    drawEnemies();
    drawProjectiles();
    drawOverlayInfo();
  }

  /*** MAIN LOOP ***/
  function loop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const rawDt = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    const dt = Math.min(0.05, rawDt) * state.speed;

    update(dt);
    draw();

    rafId = requestAnimationFrame(loop);
  }

  /*** INPUT: CANVAS CLICK (SELEÇÃO DE SLOT) ***/
  canvas.addEventListener('click', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (ev.clientX - rect.left) * scaleX;
    const y = (ev.clientY - rect.top) * scaleY;

    let clickedIndex = null;
    for (let i = 0; i < towerSlots.length; i++) {
      const s = towerSlots[i];
      const dist = Math.hypot(x - s.x, y - s.y);
      if (dist <= 24) {
        clickedIndex = i;
        break;
      }
    }

    state.selectedSlotIndex = clickedIndex;
  });

  /*** INPUT: BUILD TOWERS ***/
  towerButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-tower');
      if (!type || !towerDefs[type]) return;

      if (state.selectedSlotIndex == null) {
        alert('Clica primeiro num slot brilhante na arena.');
        return;
      }

      const cost = towerCosts[type] || 0;
      if (state.coins < cost) {
        alert('β coins insuficientes.');
        return;
      }

      const slot = towerSlots[state.selectedSlotIndex];
      if (slot.tower) {
        alert('Esse slot já tem uma torre.');
        return;
      }

      const def = towerDefs[type];
      slot.tower = {
        type,
        x: slot.x,
        y: slot.y,
        range: def.range,
        fireDelay: def.fireDelay,
        cooldown: def.fireDelay * Math.random(),
        damage: def.damage,
        color: def.color,
      };

      state.coins -= cost;
      updateHud();
    });
  });

  /*** INPUT: TAP VAULT ***/
  tapVaultBtn.addEventListener('click', () => {
    if (!state.running || !state.betweenWaves) return;
    if (state.tapsLeft <= 0) return;
    state.coins += 5;
    state.tapsLeft -= 1;
    updateHud();
  });

  /*** INPUT: WAVES / SPEED / RESET / GIGA ***/
  startWaveBtn.addEventListener('click', () => {
    startNextWave();
    updateHud();
  });

  speedBtn.addEventListener('click', () => {
    state.speed = state.speed === 1 ? 2 : 1;
    updateHud();
  });

  clearGameBtn.addEventListener('click', () => {
    resetGame();
  });

  gigaBtn.addEventListener('click', () => {
    triggerGiga();
    updateHud();
  });

  /*** OVERLAY START ***/
  startOverlay.addEventListener('click', () => {
    startOverlay.style.opacity = '0';
    startOverlay.style.pointerEvents = 'none';
    state.running = true;
    state.betweenWaves = true;
    updateHud();
  });

  /*** BOOT ***/
  resetGame();
  rafId = requestAnimationFrame(loop);
});
