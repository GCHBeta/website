// vault.js
// Simple local-only tower-defense style simulation for the Vault of β

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM HOOKS ---
  const canvas = document.getElementById("vaultCanvas");
  const ctx = canvas.getContext("2d");

  const startWaveBtn = document.getElementById("startWaveButton");
  const statusPill = document.getElementById("vaultStatusPill");

  const waveNumberEl = document.getElementById("waveNumber");
  const difficultyLabelEl = document.getElementById("difficultyLabel");

  const treasuryValueEl = document.getElementById("treasuryValue");
  const treasuryBarEl = document.getElementById("treasuryBar");
  const livesValueEl = document.getElementById("livesValue");
  const livesBarEl = document.getElementById("livesBar");

  const betaCoinsEl = document.getElementById("betaCoins");
  const nextWavePowerEl = document.getElementById("nextWavePower");

  const vaultLogEl = document.getElementById("vaultLog");
  const summaryWavesEl = document.getElementById("summaryWaves");
  const summaryLossEl = document.getElementById("summaryLoss");
  const summaryStreakEl = document.getElementById("summaryStreak");

  const towerListEl = document.getElementById("towerList");

  if (!canvas || !ctx) {
    console.warn("[Vault] No canvas found, skipping game loop");
    return;
  }

  // --- STATE ---

  const state = {
    wave: 1,
    treasuryPercent: 20.0,  // 20% supply vault
    treasuryMax: 20.0,
    lives: 3,
    maxLives: 3,
    betaCoins: 0,
    // summary
    totalWaves: 0,
    totalTreasuryLost: 0,
    bestStreak: 0,
    currentStreak: 0,
    running: false,
    enemies: [],
    lastTimestamp: 0,
  };

  // Basic config for waves
  const CONFIG = {
    baseEnemies: 8,
    enemiesGrowth: 1.25,   // more enemies per wave
    baseSpeed: 40,         // px/s
    speedGrowth: 1.05,
    baseDamage: 0.2,       // % treasury per enemy that leaks
    damageGrowth: 1.02,
    rewardPerEnemy: 1,     // β coins
    maxEnemiesOnScreen: 80
  };

  // --- CANVAS RESIZE ---

  function resizeCanvas() {
    const wrapper = document.getElementById("vaultCanvasWrapper");
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // --- HELPERS ---

  function setStatus(label, colorClass) {
    statusPill.textContent = label;
    statusPill.className = "status-pill " + colorClass;
  }

  function logEvent(text) {
    const entry = document.createElement("div");
    entry.className = "crash-entry"; // reuse style
    const now = new Date();
    const time = now.toLocaleTimeString();
    entry.textContent = `[${time}] ${text}`;
    vaultLogEl.prepend(entry);

    // keep log manageable
    while (vaultLogEl.children.length > 80) {
      vaultLogEl.removeChild(vaultLogEl.lastChild);
    }
  }

  function updateStatsUI() {
    // Wave & difficulty
    waveNumberEl.textContent = state.wave.toString();
    const diff =
      state.wave <= 3 ? "β" :
      state.wave <= 6 ? "β+" :
      state.wave <= 10 ? "γ" :
      "Ω";
    difficultyLabelEl.textContent = diff;

    treasuryValueEl.textContent = state.treasuryPercent.toFixed(1) + "%";
    const tRatio = Math.max(0, state.treasuryPercent) / state.treasuryMax;
    treasuryBarEl.style.width = (tRatio * 100).toFixed(1) + "%";

    livesValueEl.textContent = state.lives.toString();
    const lRatio = Math.max(0, state.lives) / state.maxLives;
    livesBarEl.style.width = (lRatio * 100).toFixed(1) + "%";

    betaCoinsEl.textContent = state.betaCoins.toString();

    const wavePower =
      Math.pow(CONFIG.enemiesGrowth, state.wave - 1) *
      Math.pow(CONFIG.damageGrowth, state.wave - 1);
    nextWavePowerEl.textContent = "x" + wavePower.toFixed(2);

    summaryWavesEl.textContent = state.totalWaves.toString();
    summaryLossEl.textContent = state.totalTreasuryLost.toFixed(1) + "%";
    summaryStreakEl.textContent = state.bestStreak.toString();
  }

  function resetRun() {
    state.wave = 1;
    state.treasuryPercent = state.treasuryMax;
    state.lives = state.maxLives;
    state.betaCoins = 0;
    state.enemies = [];
    state.running = false;
    state.currentStreak = 0;
    setStatus("IDLE", "status-green");
    updateStatsUI();
    clearCanvas();
    logEvent("Vault reset. Treasury restored to 20% supply.");
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // --- ENEMY/WAVE LOGIC ---

  function spawnWave() {
    if (state.running) return;
    state.running = true;
    setStatus("WAVE RUNNING", "status-red-pill");
    startWaveBtn.disabled = true;

    const enemies = [];
    const enemyCount = Math.min(
      CONFIG.baseEnemies * Math.pow(CONFIG.enemiesGrowth, state.wave - 1),
      CONFIG.maxEnemiesOnScreen
    );
    const speed = CONFIG.baseSpeed * Math.pow(CONFIG.speedGrowth, state.wave - 1);
    const damage = CONFIG.baseDamage * Math.pow(CONFIG.damageGrowth, state.wave - 1);

    const laneCount = 4;
    const laneHeight = canvas.height / (laneCount + 1);

    for (let i = 0; i < enemyCount; i++) {
      const lane = i % laneCount;
      const y = laneHeight * (lane + 1);
      const delay = i * 0.3; // seconds delay between spawns

      enemies.push({
        x: -40,
        y,
        radius: 10,
        speed,
        damage,
        spawnDelay: delay,
        alive: true,
        leaked: false,
        timeAlive: 0
      });
    }

    state.enemies = enemies;
    state.lastTimestamp = performance.now();

    logEvent(
      `Wave ${state.wave} started — ${enemyCount.toFixed(0)} degen attackers detected.`
    );

    requestAnimationFrame(gameLoop);
  }

  function endWave(victory) {
    state.running = false;
    state.enemies = [];
    startWaveBtn.disabled = false;

    if (victory) {
      state.totalWaves += 1;
      state.currentStreak += 1;
      if (state.currentStreak > state.bestStreak) {
        state.bestStreak = state.currentStreak;
      }
      setStatus("READY", "status-green");
      logEvent(`Wave ${state.wave} cleared. Vault still stands.`);
      state.wave += 1;
    } else {
      setStatus("BREACHED", "status-red-pill");
      state.currentStreak = 0;
      logEvent(`Vault breached. Treasury or lives exhausted. Run over.`);
    }

    updateStatsUI();
  }

  // --- DRAWING ---

  function drawBackgroundGrid() {
    ctx.save();
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // soft grid
    ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 1;
    const step = 32;
    for (let x = 0; x < canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // vault core
    const coreX = canvas.width - 80;
    const coreY = canvas.height / 2;
    const coreR = 26;

    const tRatio = Math.max(0, state.treasuryPercent) / state.treasuryMax;
    const coreColor =
      tRatio > 0.66
        ? "#22c55e"
        : tRatio > 0.33
        ? "#eab308"
        : "#f97316";

    const gradient = ctx.createRadialGradient(
      coreX,
      coreY,
      4,
      coreX,
      coreY,
      coreR + 18
    );
    gradient.addColorStop(0, coreColor);
    gradient.addColorStop(1, "rgba(15, 23, 42, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(coreX, coreY, coreR + 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#020617";
    ctx.beginPath();
    ctx.arc(coreX, coreY, coreR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = coreColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(coreX, coreY, coreR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = coreColor;
    ctx.font = "bold 18px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("β", coreX, coreY);
    ctx.restore();
  }

  function drawEnemies(dt) {
    const width = canvas.width;

    ctx.save();
    for (const enemy of state.enemies) {
      // spawn delay
      enemy.timeAlive += dt;
      if (enemy.timeAlive < enemy.spawnDelay) continue;

      if (!enemy.alive) continue;

      // move
      enemy.x += (enemy.speed * dt);

      // draw
      const baseColor = "#f97316";
      const edgeColor = "#fecaca";

      // glow
      const grd = ctx.createRadialGradient(
        enemy.x,
        enemy.y,
        2,
        enemy.x,
        enemy.y,
        enemy.radius + 10
      );
      grd.addColorStop(0, "rgba(248, 113, 113, 0.9)");
      grd.addColorStop(1, "rgba(15, 23, 42, 0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius + 10, 0, Math.PI * 2);
      ctx.fill();

      // core
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#111827";
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("REKT", enemy.x, enemy.y);
    }
    ctx.restore();

    // leak check
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      if (enemy.timeAlive < enemy.spawnDelay) continue;
      if (!enemy.leaked && enemy.x > width - 80) {
        // enemy leaks into vault
        enemy.leaked = true;
        enemy.alive = false;

        state.treasuryPercent -= enemy.damage;
        state.totalTreasuryLost += enemy.damage;
        // chance to also lose a life on bigger waves
        if (Math.random() < 0.15 + 0.02 * state.wave) {
          state.lives -= 1;
          logEvent("Vault breached by a degen dragon. Life lost.");
        } else {
          logEvent("Vault treasury drained slightly by a fleeing goblin.");
        }

        if (state.treasuryPercent <= 0 || state.lives <= 0) {
          state.treasuryPercent = Math.max(0, state.treasuryPercent);
          state.lives = Math.max(0, state.lives);
          updateStatsUI();
          endWave(false);
          return;
        }

        updateStatsUI();
      }
    }

    // reward for killed enemies (i.e., those that never crossed?)
    let earned = 0;
    for (const enemy of state.enemies) {
      if (!enemy.alive && !enemy.leaked && enemy.timeAlive > enemy.spawnDelay) {
        earned += CONFIG.rewardPerEnemy;
      }
    }
    if (earned > 0) {
      state.betaCoins += earned;
      updateStatsUI();
    }

    // win condition: all enemies processed
    const anyActive = state.enemies.some(
      (e) => e.alive && e.timeAlive >= e.spawnDelay && !e.leaked
    );
    const anyWaiting = state.enemies.some(
      (e) => e.timeAlive < e.spawnDelay
    );

    if (!anyActive && !anyWaiting && state.running) {
      endWave(true);
    }
  }

  // --- MAIN LOOP ---

  function gameLoop(timestamp) {
    if (!state.running) return;

    const dt = (timestamp - state.lastTimestamp) / 1000; // seconds
    state.lastTimestamp = timestamp;

    clearCanvas();
    drawBackgroundGrid();
    drawEnemies(dt);

    if (state.running) {
      requestAnimationFrame(gameLoop);
    }
  }

  // --- TOWER LIST PLACEHOLDER ---

  if (towerListEl) {
    towerListEl.innerHTML = `
      <span>• Slot 1 — <strong>Sentinel Node</strong> (visual only)</span>
      <span>• Slot 2 — <strong>Liquidity Cannon</strong> (WIP)</span>
      <span>• Slot 3 — <strong>Copium Shield</strong> (WIP)</span>
    `;
  }

  // --- EVENTS ---

  if (startWaveBtn) {
    startWaveBtn.addEventListener("click", () => {
      if (!state.running) {
        if (state.treasuryPercent <= 0 || state.lives <= 0) {
          resetRun();
        }
        spawnWave();
      }
    });
  }

  // Initial paint
  updateStatsUI();
  clearCanvas();
  drawBackgroundGrid();
  logEvent("Vault of β ready. Hit 'Start Wave' to begin the defense.");
});
