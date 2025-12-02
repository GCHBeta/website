document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('vaultCanvas');
  const ctx = canvas.getContext('2d');

  const startWaveBtn = document.getElementById('startWaveBtn');
  const vaultHpFill = document.getElementById('vaultHpFill');
  const vaultHpText = document.getElementById('vaultHpText');
  const copiumText = document.getElementById('copiumText');
  const waveText = document.getElementById('waveText');

  const overlay = document.getElementById('overlayMessage');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const overlayBtn = document.getElementById('overlayBtn');

  const towerButtons = document.querySelectorAll('.tower-btn');

  const W = canvas.width;
  const H = canvas.height;

  // Lane & vault positions
  const laneY = H * 0.65;
  const vaultX = W - 110;
  const vaultRadius = 50;

  // Build slots (above / below lane)
  const slots = [];
  const slotRowsY = [laneY - 80, laneY - 40, laneY + 40];
  for (let i = 0; i < 5; i++) {
    const x = 140 + i * 120;
    slotRowsY.forEach((y, rowIndex) => {
      slots.push({
        x,
        y,
        tower: null,
        idx: slots.length,
      });
    });
  }
  const slotRadius = 18;

  let selectedTowerType = 'giga';

  // Game state
  let vaultHp = 100;
  let copium = 50;
  let currentWave = 0;
  const totalWaves = 5;

  let enemies = [];
  let towers = [];
  let beams = [];

  let gameState = 'idle'; // 'idle', 'wave', 'victory', 'defeat'
  let lastTime = null;

  // Wave configuration
  const waves = [
    { paper: 10, tax: 0 },
    { paper: 14, tax: 2 },
    { paper: 16, tax: 4 },
    { paper: 20, tax: 6 },
    { paper: 24, tax: 8 },
  ];

  let spawnQueue = [];
  let spawnIndex = 0;
  let spawnTimer = 0;
  const spawnInterval = 1.0; // seconds

  function setupWave(waveIndex) {
    const w = waves[waveIndex];
    spawnQueue = [];
    // queue paper
    for (let i = 0; i < w.paper; i++) spawnQueue.push('paper');
    // queue tax
    for (let i = 0; i < w.tax; i++) spawnQueue.push('tax');

    spawnIndex = 0;
    spawnTimer = 0;
  }

  function spawnEnemy(type) {
    if (type === 'paper') {
      enemies.push({
        type: 'paper',
        x: -30,
        y: laneY,
        hp: 10,
        maxHp: 10,
        speed: 45, // px/s
        damage: 4,
      });
    } else if (type === 'tax') {
      enemies.push({
        type: 'tax',
        x: -30,
        y: laneY,
        hp: 40,
        maxHp: 40,
        speed: 25,
        damage: 10,
      });
    }
  }

  function resetGame() {
    vaultHp = 100;
    copium = 50;
    currentWave = 0;
    enemies = [];
    towers = [];
    beams = [];
    gameState = 'idle';
    document.body.classList.remove('vault-damaged');
    overlay.classList.add('hidden');
    updateUi();
  }

  function updateUi() {
    vaultHpFill.style.width = `${vaultHp}%`;
    vaultHpText.textContent = `${Math.max(0, vaultHp.toFixed(0))}%`;
    copiumText.textContent = copium.toFixed(0);
    waveText.textContent = `${Math.min(currentWave + 1, totalWaves)} / ${totalWaves}`;

    startWaveBtn.disabled = !(gameState === 'idle' && currentWave < totalWaves);
  }

  function startWave() {
    if (gameState !== 'idle') return;
    if (currentWave >= totalWaves) return;
    gameState = 'wave';
    setupWave(currentWave);
    updateUi();
  }

  function gameOver(victory) {
    gameState = victory ? 'victory' : 'defeat';
    startWaveBtn.disabled = true;
    overlay.classList.remove('hidden');
    if (victory) {
      overlayTitle.textContent = 'Vault Holds.';
      overlayText.textContent = 'The cult of β is pleased. For now.';
    } else {
      overlayTitle.textContent = 'Vault Liquidated.';
      overlayText.textContent = 'Paper Hands breached the β defenses. Skill issue.';
    }
  }

  overlayBtn.addEventListener('click', () => {
    resetGame();
  });

  startWaveBtn.addEventListener('click', startWave);

  // Tower selection
  towerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      towerButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedTowerType = btn.dataset.tower;
    });
  });

  // Canvas placement
  canvas.addEventListener('click', e => {
    if (gameState === 'victory' || gameState === 'defeat') return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;

    let closest = null;
    let bestDist = Infinity;
    for (const slot of slots) {
      const dx = slot.x - mx;
      const dy = slot.y - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist && d < slotRadius * 1.4) {
        bestDist = d;
        closest = slot;
      }
    }

    if (!closest) return;
    if (closest.tower) return;

    const cost = selectedTowerType === 'copium' ? 40 : 25;
    if (copium < cost) return;

    copium -= cost;
    closest.tower = {
      type: selectedTowerType,
      x: closest.x,
      y: closest.y,
      cooldown: 0,
    };
    towers.push(closest.tower);
    updateUi();
  });

  // Helpers
  function findTarget(tower, range) {
    let best = null;
    let bestX = -Infinity;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - tower.x;
      const dy = e.y - tower.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= range && e.x > bestX) {
        bestX = e.x;
        best = e;
      }
    }
    return best;
  }

  function addBeam(x1, y1, x2, y2, color) {
    beams.push({
      x1, y1, x2, y2,
      life: 0.12,
      color,
    });
  }

  function update(dt) {
    if (gameState === 'wave') {
      // spawn enemies
      if (spawnIndex < spawnQueue.length) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnEnemy(spawnQueue[spawnIndex]);
          spawnIndex++;
          spawnTimer = spawnInterval;
        }
      }

      // move enemies
      const toRemove = [];
      enemies.forEach((e, idx) => {
        if (e.hp <= 0) {
          // gain Copium
          copium += e.type === 'tax' ? 10 : 5;
          toRemove.push(idx);
          return;
        }
        e.x += e.speed * dt;
        if (e.x >= vaultX) {
          // hit the vault
          vaultHp -= e.damage;
          toRemove.push(idx);
          document.body.classList.add('vault-damaged');
          setTimeout(() => document.body.classList.remove('vault-damaged'), 140);
          if (vaultHp <= 0) {
            vaultHp = 0;
            updateUi();
            gameOver(false);
          }
        }
      });
      // remove enemies
      for (let i = toRemove.length - 1; i >= 0; i--) {
        enemies.splice(toRemove[i], 1);
      }

      // towers fire
      towers.forEach(t => {
        t.cooldown -= dt;
        if (t.cooldown > 0) return;
        const configs = {
          giga: { range: 150, dmg: 6, cd: 0.7, color: 'rgba(56,189,248,0.9)' },
          copium: { range: 220, dmg: 16, cd: 1.6, color: 'rgba(236,72,153,0.9)' },
        };
        const cfg = configs[t.type] || configs.giga;
        const target = findTarget(t, cfg.range);
        if (target) {
          target.hp -= cfg.dmg;
          addBeam(t.x, t.y, target.x, target.y - 10, cfg.color);
          t.cooldown = cfg.cd;
        }
      });

      // check wave end
      if (
        spawnIndex >= spawnQueue.length &&
        enemies.length === 0 &&
        vaultHp > 0
      ) {
        currentWave++;
        if (currentWave >= totalWaves) {
          gameOver(true);
        } else {
          gameState = 'idle';
        }
      }

      updateUi();
    }

    // update beams
    beams.forEach(b => {
      b.life -= dt;
    });
    beams = beams.filter(b => b.life > 0);
  }

  function draw() {
    // background
    ctx.clearRect(0, 0, W, H);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#020617');
    grad.addColorStop(0.5, '#030712');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // lane
    ctx.strokeStyle = 'rgba(15,23,42,0.8)';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(40, laneY);
    ctx.lineTo(W - 140, laneY);
    ctx.stroke();

    // subtle grid
    ctx.strokeStyle = 'rgba(30,64,175,0.16)';
    ctx.lineWidth = 1;
    for (let x = 40; x < W - 120; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, laneY - 90);
      ctx.lineTo(x, laneY + 90);
      ctx.stroke();
    }

    // vault
    ctx.save();
    ctx.translate(vaultX, laneY - 10);
    const vaultGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, vaultRadius);
    vaultGrad.addColorStop(0, 'rgba(56,189,248,0.9)');
    vaultGrad.addColorStop(1, 'rgba(15,23,42,1)');
    ctx.fillStyle = vaultGrad;
    ctx.beginPath();
    ctx.arc(0, 0, vaultRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Vault of β', 0, 5);
    ctx.restore();

    // slots
    slots.forEach(s => {
      ctx.save();
      ctx.translate(s.x, s.y);
      if (!s.tower) {
        ctx.strokeStyle = 'rgba(148,163,184,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, slotRadius, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const type = s.tower.type;
        if (type === 'giga') {
          ctx.fillStyle = '#38bdf8';
        } else {
          ctx.fillStyle = '#f97316';
        }
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, slotRadius - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    });

    // beams
    beams.forEach(b => {
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = Math.max(0, b.life / 0.12);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // enemies
    enemies.forEach(e => {
      ctx.save();
      ctx.translate(e.x, e.y);
      if (e.type === 'paper') {
        ctx.fillStyle = '#facc15';
      } else {
        ctx.fillStyle = '#f97316';
      }
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // hp bar
      const hpPct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(15,23,42,0.9)';
      ctx.fillRect(-15, -24, 30, 4);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(-15, -24, 30 * hpPct, 4);

      ctx.restore();
    });

    // Wave label
    ctx.fillStyle = 'rgba(148,163,184,0.8)';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(
      `Wave ${Math.min(currentWave + 1, totalWaves)} / ${totalWaves}`,
      20,
      24
    );
  }

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (gameState === 'wave') {
      update(dt);
    } else {
      // still update beams for leftover flashes
      beams.forEach(b => (b.life -= dt));
      beams = beams.filter(b => b.life > 0);
    }

    draw();
    requestAnimationFrame(loop);
  }

  resetGame();
  requestAnimationFrame(loop);
});
