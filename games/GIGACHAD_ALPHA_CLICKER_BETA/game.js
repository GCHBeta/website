// DOM refs
const progressEl = document.getElementById("progressVal");
const crashEl = document.getElementById("crashCount");
const statusEl = document.getElementById("statusText");
const jaw = document.getElementById("jawButton");
const boot = document.getElementById("bootScreen");
const game = document.getElementById("gameContainer");
const failOverlay = document.getElementById("failOverlay");
const overclockBtn = document.getElementById("overclockBtn");
const delusionBtn = document.getElementById("delusionBtn");
const logEl = document.getElementById("log");

const clickSound = document.getElementById("clickSound");
const failSound = document.getElementById("failSound");

// STATE
let progress = 0;       // 0–100%
let crashes = 0;        // total crash count
let overclock = false;  // 1% or 2% per click

// Restore crashes from previous sessions
const savedCrashes = localStorage.getItem("gcab_crashes");
if (savedCrashes) {
  crashes = parseInt(savedCrashes, 10) || 0;
  crashEl.textContent = crashes;
}

// BOOT → GAME
setTimeout(() => {
  boot.style.display = "none";
  game.style.display = "block";
}, 2800);

// CANVAS SETUP
const bg = document.getElementById("bgCanvas");
const ctx = bg.getContext("2d");

function resizeCanvas() {
  bg.width = window.innerWidth;
  bg.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// PARTICLE + TEMPLE + SPIRITS
let spirits = [];
let starfield = [];

function spawnSpirit() {
  spirits.push({
    x: Math.random() * bg.width,
    y: Math.random() * bg.height,
    speed: Math.random() * 0.4 + 0.15,
    size: Math.random() * 0.6 + 0.7,
    alpha: Math.random() * 0.6 + 0.2,
  });
}

function spawnStar() {
  starfield.push({
    x: Math.random() * bg.width,
    y: Math.random() * bg.height,
    alpha: Math.random() * 0.4 + 0.1,
    twinkle: Math.random() * 0.02 + 0.01,
  });
}

// initial clouds
for (let i = 0; i < 42; i++) spawnSpirit();
for (let i = 0; i < 70; i++) spawnStar();

function drawCosmicTemple() {
  const w = bg.width;
  const h = bg.height;
  const cx = w / 2;
  const baseY = h * 0.72;

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "rgba(30, 70, 140, 0.35)";

  // central monolith
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.05, baseY);
  ctx.lineTo(cx, baseY - h * 0.22);
  ctx.lineTo(cx + w * 0.05, baseY);
  ctx.closePath();
  ctx.fill();

  // side pillars
  ctx.globalAlpha = 0.18;
  ctx.fillRect(cx - w * 0.16, baseY - h * 0.14, w * 0.02, h * 0.14);
  ctx.fillRect(cx + w * 0.14, baseY - h * 0.14, w * 0.02, h * 0.14);

  // floor glow
  const grad = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, w * 0.3);
  grad.addColorStop(0, "rgba(80,180,255,0.25)");
  grad.addColorStop(1, "rgba(80,180,255,0)");
  ctx.fillStyle = grad;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(cx, baseY, w * 0.32, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBackground() {
  ctx.clearRect(0, 0, bg.width, bg.height);

  const w = bg.width;
  const h = bg.height;

  // subtle vignette overlay
  const vg = ctx.createRadialGradient(
    w / 2,
    h * 0.3,
    0,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.7
  );
  vg.addColorStop(0, "rgba(3, 11, 30, 0.8)");
  vg.addColorStop(1, "rgba(0, 0, 0, 1)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // distant stars
  for (let s of starfield) {
    s.alpha += s.twinkle;
    if (s.alpha > 0.6 || s.alpha < 0.1) s.twinkle *= -1;

    ctx.fillStyle = `rgba(160,200,255,${s.alpha})`;
    ctx.fillRect(s.x, s.y, 1.2, 1.2);
  }

  // temple silhouette
  drawCosmicTemple();

  // floating β spirits
  for (let p of spirits) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = "#4ab6ff";
    ctx.font = `${14 + p.size * 8}px Arial`;
    ctx.fillText("β", p.x, p.y);
    ctx.restore();

    p.y -= p.speed;
    if (p.y < -20) {
      p.y = h + 10;
      p.x = Math.random() * w;
    }
  }
}

function loop() {
  drawBackground();
  requestAnimationFrame(loop);
}
loop();

// Update HUD
function updateProgressDisplay() {
  const padded = progress.toString().padStart(3, "0");
  progressEl.textContent = padded;

  if (progress >= 90 && progress < 100) {
    statusEl.textContent = "UPGRADE IMMINENT…";
  } else if (progress === 0) {
    statusEl.textContent = "STILL BETA";
  } else {
    statusEl.textContent = "CALCULATING EGO…";
  }
}

// LOG LINES
const delusionLines = [
  "96% delusion · 4% firmware.",
  "You are not early. You are just Beta.",
  "Market makers fear this jawline.",
  "Chad.exe: \"Almost Alpha.\" Reality: \"Still Beta.\"",
  "BASE detects unstable giga energy.",
  "Warning: Overclock may void your imaginary warranty.",
];

function pushLogLine() {
  const pick = delusionLines[Math.floor(Math.random() * delusionLines.length)];
  logEl.textContent = pick;
}

// INTERACTIONS
jaw.addEventListener("click", () => {
  let step = overclock ? 2 : 1;
  progress += step;
  if (progress > 100) progress = 100;

  updateProgressDisplay();

  // simple click SFX if you set a source
  if (clickSound && clickSound.src) {
    clickSound.currentTime = 0;
    clickSound.play().catch(() => {});
  }

  // jaw micro-anim
  jaw.style.transform = "scale(1.07)";
  setTimeout(() => {
    jaw.style.transform = "scale(1)";
  }, 90);

  pushLogLine();

  if (progress >= 100) {
    handleCrash();
  }
});

overclockBtn.addEventListener("click", () => {
  overclock = !overclock;
  overclockBtn.classList.toggle("active", overclock);
  logEl.textContent = overclock
    ? "OVERCLOCK ENABLED: Ego gains +100% speed."
    : "OVERCLOCK DISABLED: Back to safe delusion.";
});

delusionBtn.addEventListener("click", () => {
  pushLogLine();
});

// Crash handling: v2.0 attempt → fail
function handleCrash() {
  crashes++;
  crashEl.textContent = crashes;
  localStorage.setItem("gcab_crashes", crashes);

  // audio (if provided)
  if (failSound && failSound.src) {
    failSound.currentTime = 0;
    failSound.play().catch(() => {});
  }

  // mark jaw as fail briefly
  jaw.classList.add("fail");
  setTimeout(() => jaw.classList.remove("fail"), 500);

  statusEl.textContent = "ATTEMPTED v2.0 · CRASHED";

  doLightningStrike();
  showFailOverlay();

  // reset after short delay
  setTimeout(() => {
    progress = 0;
    updateProgressDisplay();
    statusEl.textContent = "STILL BETA";
  }, 900);
}

// LIGHTNING STRIKE VISUAL
function doLightningStrike() {
  const w = bg.width;
  const h = bg.height;

  // quick flashes
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      drawBackground();
      drawLightningBolt();
    }, i * 70);
  }
}

function drawLightningBolt() {
  const w = bg.width;
  const h = bg.height;

  // approximate jaw center
  const jawRect = jaw.getBoundingClientRect();
  const cx = jawRect.left + jawRect.width / 2;
  const cy = jawRect.top + jawRect.height / 4; // strike upper area

  ctx.save();
  ctx.strokeStyle = "#e5f5ff";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#a6d8ff";
  ctx.shadowBlur = 14;

  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  let segments = 6;
  let x = w / 2;
  let y = 0;

  for (let i = 0; i < segments; i++) {
    const t = (i + 1) / segments;
    const nx = x + (cx - x) * t + (Math.random() - 0.5) * 40;
    const ny = y + (cy - y) * t + (Math.random() - 0.5) * 25;
    ctx.lineTo(nx, ny);
    x = nx;
    y = ny;
  }
  ctx.stroke();
  ctx.restore();
}

// FAIL OVERLAY
function showFailOverlay() {
  failOverlay.classList.add("visible");
  setTimeout(() => {
    failOverlay.classList.remove("visible");
  }, 900);
}

// Initialize HUD at 0%
updateProgressDisplay();
