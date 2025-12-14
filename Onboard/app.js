// ===== GLOBAL CONFIG =====
const API_BASE = "http://localhost:8787";

// BACKEND CAPABILITIES
const BACKEND = {
  sidekicks: true,
  energy: true, // energy endpoints optional; local fallback works now
  siwe: true
};

(() => {
  // ========= CONFIG =========
  const BASE_CHAIN_ID_HEX = "0x2105"; // 8453
  const BASE_CHAIN_PARAMS = {
    chainId: BASE_CHAIN_ID_HEX,
    chainName: "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"]
  };

  const GCAB_TOKEN_ADDRESS = "0x6d0B8eB75E9d6735cc301c3a6E82adeE43590B07";

  const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];

  // ========= DOM =========
  const connectBtn = document.getElementById("connectBtn");
  const addTokenBtn = document.getElementById("addTokenBtn");

  const statusText = document.getElementById("statusText");
  const netName = document.getElementById("netName");

  const addrShort = document.getElementById("addrShort");
  const addrFull = document.getElementById("addrFull");
  const chainText = document.getElementById("chainText");

  const balText = document.getElementById("balText");
  const balHint = document.getElementById("balHint");

  const rankText = document.getElementById("rankText");
  const titleText = document.getElementById("titleText");
  const powerText = document.getElementById("powerText");

  const roomsEl = document.getElementById("rooms");

  // Real sidekicks list (public)
  const refreshSidekicksBtn = document.getElementById("refreshSidekicksBtn");
  const sidekicksList = document.getElementById("sidekicksList");

  // Claim sidekick
  const sidekickInput = document.getElementById("sidekickInput");
  const claimBtn = document.getElementById("claimBtn");
  const releaseBtn = document.getElementById("releaseBtn");
  const sidekickText = document.getElementById("sidekickText");

  // Candidates
  const loadCandidatesBtn = document.getElementById("loadCandidatesBtn");
  const candidatesList = document.getElementById("candidatesList");
  const candCount = document.getElementById("candCount");

  // Streak / Energy UI (optional IDs — if your HTML doesn’t have them, no crash)
  const checkinBtn = document.getElementById("checkinBtn");
  const streakText = document.getElementById("streakText");
  const checkinHint = document.getElementById("checkinHint");

  const claimEnergyBtn = document.getElementById("claimEnergyBtn");
  const energyBalanceText = document.getElementById("energyBalanceText");
  const energyDailyText = document.getElementById("energyDailyText");
  const energyUnclaimedText = document.getElementById("energyUnclaimedText");
  const energyHint = document.getElementById("energyHint");

  // ========= STATE =========
  let provider = null;
  let signer = null;
  let userAddress = null;
  let gcab = { symbol: "GCAb", decimals: 18, balance: 0 };
  let siweDone = false;

  // ========= HELPERS =========
  function setStatus(msg) { if (statusText) statusText.textContent = msg; }
  function short(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—"; }
  function fmt(n, max = 6) { return Number(n).toLocaleString(undefined, { maximumFractionDigits: max }); }

  function assertTokenSet() {
    return !!GCAB_TOKEN_ADDRESS && GCAB_TOKEN_ADDRESS.startsWith("0x") && GCAB_TOKEN_ADDRESS.length === 42;
  }

  function todayUTCKey() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  function yesterdayUTCKey() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  // ========= GAME TIERS =========
  const TIERS = [
    { min: 1_000_000_000, rank: "MYTHIC WHALE", title: "β Vault Council", power: 9000 },
    { min:   100_000_000, rank: "WHALE",        title: "Liquidity Oracle", power: 5000 },
    { min:    10_000_000, rank: "SHARK",        title: "Market Predator",  power: 2500 },
    { min:     1_000_000, rank: "DOLPHIN",      title: "Signal Rider",     power: 1200 },
    { min:       100_000, rank: "ALPHA HOLDER", title: "Candle Guard",     power: 600  },
    { min:        10_000, rank: "β GRINDER",    title: "Trend Survivor",   power: 300  },
    { min:             1, rank: "INITIATE",     title: "Meme Spark",       power: 50   },
    { min:             0, rank: "NPC",          title: "No Aura Detected", power: 0    }
  ];

  const ROOMS = [
    { name: "Forge Lobby",   minRank: "INITIATE" },
    { name: "β Grinder Pit", minRank: "β GRINDER" },
    { name: "Candle Guard",  minRank: "ALPHA HOLDER" },
    { name: "Shark Tank",    minRank: "SHARK" },
    { name: "Whale Court",   minRank: "WHALE" },
    { name: "β Vault",       minRank: "MYTHIC WHALE" }
  ];

  function tierFromBalance(b) { return TIERS.find(t => b >= t.min) || TIERS[TIERS.length - 1]; }
  function rankIndex(rank) { return TIERS.findIndex(t => t.rank === rank); }
  function canAccess(currentRank, requiredRank) { return rankIndex(currentRank) <= rankIndex(requiredRank); }

  function renderRooms(currentRank) {
    if (!roomsEl) return;
    roomsEl.innerHTML = "";
    ROOMS.forEach(r => {
      const open = canAccess(currentRank, r.minRank);
      const div = document.createElement("div");
      div.className = "room";
      div.innerHTML = `
        <div>
          <div style="font-weight:800">${r.name}</div>
          <div class="small muted">Requires: ${r.minRank}</div>
        </div>
        <div class="badge ${open ? "open" : "locked"}">${open ? "OPEN" : "LOCKED"}</div>
      `;
      roomsEl.appendChild(div);
    });
  }

  // ========= ENERGY + STREAK (LOCAL MVP) =========
  // Rule set:
  // - check-in sets streak (UTC)
  // - energy can be claimed once per UTC day
  // - unclaimed days accumulate up to 3 days max (warehouse)
  // - daily energy is based on sqrt(balance) and streak bonus up to +50%
  // You can later replace storage with backend endpoints without changing UI.

  function energyKey() {
    return userAddress ? `gcab_energy_${userAddress.toLowerCase()}` : "gcab_energy_none";
  }

  function loadEnergyState() {
    try {
      const raw = localStorage.getItem(energyKey());
      return raw ? JSON.parse(raw) : {
        streak: 0,
        last_checkin: null,
        last_claim: null,
        energy_balance: 0
      };
    } catch {
      return { streak: 0, last_checkin: null, last_claim: null, energy_balance: 0 };
    }
  }

  function saveEnergyState(s) {
    try { localStorage.setItem(energyKey(), JSON.stringify(s)); } catch {}
  }

  function calcDailyEnergy(balance, streak) {
    const base = Math.floor(Math.sqrt(Math.max(0, balance))); // smooth growth
    const bonus = Math.min(0.50, (Math.max(0, streak) * 0.02)); // +2% per day, cap 50%
    const out = Math.floor(base * (1 + bonus));
    return Math.max(0, out);
  }

  function countUnclaimedDays(state) {
    // How many whole UTC days since last_claim (or since last_checkin if never claimed)
    const today = todayUTCKey();

    if (state.last_claim === today) return 0;

    // If never claimed: allow accumulation from last_checkin or from today only
    const anchor = state.last_claim || state.last_checkin || today;
    if (anchor === today) return 1; // can claim today's energy

    // We compute day difference in UTC by converting keys to Date
    const toDate = (k) => {
      const [Y, M, D] = k.split("-").map(Number);
      return new Date(Date.UTC(Y, M - 1, D, 0, 0, 0));
    };

    const a = toDate(anchor);
    const t = toDate(today);
    const diffDays = Math.floor((t - a) / (24 * 3600 * 1000));

    // If last claim was yesterday => diffDays=1 => can claim 1 day (today)
    // If last claim 3 days ago => can claim up to 3 (warehouse cap)
    const claimable = Math.max(1, diffDays); // at least 1 if not claimed today
    return Math.min(3, claimable);
  }

  function refreshEnergyUI(balance) {
    if (!userAddress) return;

    const st = loadEnergyState();

    // Update streak visuals
    if (streakText) streakText.textContent = String(st.streak || 0);
    if (checkinHint) checkinHint.textContent = `UTC check-in. Last: ${st.last_checkin || "never"}.`;

    // Energy stats
    const daily = calcDailyEnergy(balance, st.streak);
    const unclaimedDays = countUnclaimedDays(st);
    const claimable = daily * unclaimedDays;

    if (energyBalanceText) energyBalanceText.textContent = fmt(st.energy_balance, 0);
    if (energyDailyText) energyDailyText.textContent = fmt(daily, 0);
    if (energyUnclaimedText) energyUnclaimedText.textContent = fmt(claimable, 0);
    if (energyHint) energyHint.textContent = `Unclaimed days stored: ${unclaimedDays} (cap 3).`;

    if (claimEnergyBtn) claimEnergyBtn.disabled = (unclaimedDays <= 0);
    if (checkinBtn) checkinBtn.disabled = false;
  }

  function doCheckinLocal() {
    const st = loadEnergyState();
    const today = todayUTCKey();
    const yest = yesterdayUTCKey();

    if (st.last_checkin === today) {
      setStatus("Already checked in today (UTC).");
      return;
    }

    if (st.last_checkin === yest) st.streak = (st.streak || 0) + 1;
    else st.streak = 1;

    st.last_checkin = today;
    saveEnergyState(st);

    if (streakText) streakText.textContent = String(st.streak);
    if (checkinHint) checkinHint.textContent = `UTC check-in. Last: ${st.last_checkin}.`;
    setStatus(`Checked in. Streak: ${st.streak}.`);

    refreshEnergyUI(gcab.balance);
  }

  function doClaimEnergyLocal() {
    const st = loadEnergyState();
    const today = todayUTCKey();

    if (st.last_claim === today) {
      setStatus("Energy already claimed today (UTC).");
      return;
    }

    const daily = calcDailyEnergy(gcab.balance, st.streak);
    const unclaimedDays = countUnclaimedDays(st);
    const total = daily * unclaimedDays;

    st.energy_balance = (st.energy_balance || 0) + total;
    st.last_claim = today;
    saveEnergyState(st);

    setStatus(`Energy claimed: +${fmt(total, 0)} (stored ${unclaimedDays} day(s)).`);
    refreshEnergyUI(gcab.balance);
  }

  // ========= WALLET =========
  async function ensureBaseNetwork() {
    const { ethereum } = window;
    if (!ethereum) throw new Error("MetaMask not detected.");

    const current = await ethereum.request({ method: "eth_chainId" });
    if (current === BASE_CHAIN_ID_HEX) return;

    try {
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_ID_HEX }] });
    } catch (err) {
      if (err && err.code === 4902) {
        await ethereum.request({ method: "wallet_addEthereumChain", params: [BASE_CHAIN_PARAMS] });
      } else {
        throw err;
      }
    }
  }

  async function refreshNetworkLabel() {
    if (!provider) return;
    const net = await provider.getNetwork();
    if (netName) netName.textContent = `${net.name} (${net.chainId})`;
    if (chainText) chainText.textContent = `${net.name} (chainId ${net.chainId})`;
  }

  async function readBalance() {
    if (!assertTokenSet()) {
      if (balText) balText.textContent = "Set token address";
      if (balHint) balHint.textContent = "Open app.js → set GCAB_TOKEN_ADDRESS.";
      return 0;
    }
    if (!provider || !userAddress) return 0;

    const c = new ethers.Contract(GCAB_TOKEN_ADDRESS, ERC20_ABI, provider);
    const [raw, decimals, symbol] = await Promise.all([
      c.balanceOf(userAddress),
      c.decimals(),
      c.symbol()
    ]);

    gcab.decimals = Number(decimals);
    gcab.symbol = symbol;
    const human = Number(ethers.formatUnits(raw, gcab.decimals));
    gcab.balance = human;

    if (balText) balText.textContent = `${fmt(human)} ${symbol}`;
    if (balHint) balHint.textContent = "Synced from Base. This powers your game profile.";
    return human;
  }

  function updateGameUI(balance) {
    const tier = tierFromBalance(balance);

    if (rankText) rankText.textContent = tier.rank;
    if (titleText) titleText.textContent = tier.title;

    const power = tier.power + Math.floor(Math.log10(balance + 1) * 42);
    if (powerText) powerText.textContent = Number.isFinite(power) ? fmt(power, 0) : "0";

    renderRooms(tier.rank);

    // Sidekick claim gate (UI only; backend enforces too)
    const canClaim = (tier.rank === "SHARK" || tier.rank === "WHALE" || tier.rank === "MYTHIC WHALE");
    if (claimBtn) claimBtn.disabled = !canClaim;
    if (sidekickInput) sidekickInput.disabled = !canClaim;

    if (addTokenBtn) addTokenBtn.disabled = false;
    if (loadCandidatesBtn) loadCandidatesBtn.disabled = false;
    if (refreshSidekicksBtn) refreshSidekicksBtn.disabled = false;

    refreshEnergyUI(balance);
  }

  async function addTokenToWallet() {
    const { ethereum } = window;
    if (!ethereum || !userAddress) return;

    try {
      await ethereum.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: GCAB_TOKEN_ADDRESS,
            symbol: gcab.symbol || "GCAb",
            decimals: gcab.decimals || 18
          }
        }
      });
      setStatus("Token added to MetaMask.");
    } catch {
      setStatus("Could not add token.");
    }
  }

  // ========= SIWE-LITE AUTH =========
  async function siweLiteLogin(address) {
    if (!BACKEND.siwe) return true;
    if (!signer) throw new Error("Signer not ready.");

    const r = await fetch(`${API_BASE}/auth/nonce?address=${address}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "nonce failed");

    const signature = await signer.signMessage(data.message);

    const vr = await fetch(`${API_BASE}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature })
    });
    const vdata = await vr.json();
    if (!vr.ok) throw new Error(vdata?.error || "verify failed");

    return true;
  }

  async function verifyOrSign(address) {
    const r = await fetch(`${API_BASE}/auth/nonce?address=${address}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "nonce failed");

    const sig = await signer.signMessage(data.message);

    const vr = await fetch(`${API_BASE}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature: sig })
    });
    const vdata = await vr.json();
    if (!vr.ok) throw new Error(vdata?.error || "verify failed");

    return sig;
  }

  // ========= SIDEKICKS (REAL) =========
  async function fetchSidekicksList() {
    const r = await fetch(`${API_BASE}/sidekicks`);
    if (!r.ok) throw new Error("Sidekicks endpoint failed");
    return r.json();
  }

  function renderSidekicks(rows) {
    if (!sidekicksList) return;
    sidekicksList.innerHTML = "";

    if (!rows || !rows.length) {
      sidekicksList.innerHTML = `<div class="small muted">No sidekicks yet.</div>`;
      return;
    }

    for (const row of rows) {
      const div = document.createElement("div");
      div.className = "room";
      div.innerHTML = `
        <div>
          <div style="font-weight:800">${row.sidekick}</div>
          <div class="small muted">${row.owner.slice(0, 6)}…${row.owner.slice(-4)}</div>
        </div>
        <div class="badge open">CLAIMED</div>
      `;
      sidekicksList.appendChild(div);
    }
  }

  async function refreshSidekicks() {
    if (!BACKEND.sidekicks) return;
    const rows = await fetchSidekicksList();
    renderSidekicks(rows);
  }

  async function claimSidekickReal(sidekickName) {
    const sig = await verifyOrSign(userAddress);

    const r = await fetch(`${API_BASE}/sidekick/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: userAddress, signature: sig, sidekick: sidekickName })
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Claim failed");
    return data;
  }

  async function releaseSidekickReal() {
    const sig = await verifyOrSign(userAddress);

    const r = await fetch(`${API_BASE}/sidekick/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: userAddress, signature: sig })
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Release failed");
    return data;
  }

  // ========= CANDIDATES =========
// ========= CANDIDATES (ELEVATOR + CLAIM + BUY PREVIEW) =========
const floorText = document.getElementById("floorText");

let currentFloor = "ALL";
let lastCandidatesPayload = null;

function floorOf(balance) {
  if (balance >= 1_000_000) return "A";     // ALPHA
  if (balance >= 100_000) return "M";       // MYTH
  if (balance >= 1_000) return "S";         // SIGNAL
  return "B";                               // BASEMENT
}

function floorLabel(f) {
  return f === "A" ? "ALPHA" :
         f === "M" ? "MYTH" :
         f === "S" ? "SIGNAL" :
         f === "B" ? "BASEMENT" : "ALL";
}

function auraOf(balance) {
  const f = floorOf(balance);
  return f === "A" ? "🟥 ALPHA" :
         f === "M" ? "🟪 MYTH" :
         f === "S" ? "🟨 SIGNAL" : "🟦 SPARK";
}

function canClaimFree(ownerBal, candBal) {
  // hard rule: must be below owner bal
  if (!Number.isFinite(ownerBal) || ownerBal <= 0) return false;
  if (!Number.isFinite(candBal) || candBal <= 0) return false;
  return candBal < ownerBal;
}

function buyPrice(candBal) {
  // 1% of candidate balance (rounded down to integer GCAb)
  const p = Math.floor(Number(candBal) * 0.01);
  return Math.max(1, p);
}

async function fetchCandidates(owner) {
  const url = `${API_BASE}/sidekick/candidates?owner=${owner}&min=1&limit=200`;
  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || "Failed to load candidates");
  return data; // { owner, ownerBal, candidates: [...] }
}

function renderCandidates(payload) {
  lastCandidatesPayload = payload;

  const rows = payload?.candidates || [];
  const ownerBal = Number(payload?.ownerBal || 0);

  if (candCount) candCount.textContent = String(rows.length);
  if (!candidatesList) return;

  candidatesList.innerHTML = "";

  const filtered = currentFloor === "ALL"
    ? rows
    : rows.filter(r => floorOf(Number(r.balance || 0)) === currentFloor);

  if (!filtered.length) {
    candidatesList.innerHTML = `<div class="small muted">No candidates on this floor. Try ALL or rescan.</div>`;
    return;
  }

  for (const row of filtered) {
    const addr = row.address;
    const bal = Number(row.balance || 0);

    const aura = auraOf(bal);
    const price = buyPrice(bal);
    const eligibleFree = canClaimFree(ownerBal, bal);

    const div = document.createElement("div");
    div.className = "room";
    div.style.alignItems = "stretch";

    // Buttons: claim free / buy
    // - claim free calls existing claimSidekickReal(name)
    // - buy is preview (UI + status). Real spend comes in backend patch.
    div.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:6px; width:100%">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start">
          <div>
            <div style="font-weight:800">
              ${addr.slice(0, 6)}…${addr.slice(-4)}
              <span class="small muted" style="margin-left:6px">${aura}</span>
            </div>
            <div class="small muted">${fmt(bal)} GCAb</div>
          </div>

          <div class="badge ${eligibleFree ? "open" : "locked"}">
            ${eligibleFree ? "ELIGIBLE" : "LOCKED"}
          </div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px">
          <button class="btn ghost" data-action="claim" data-addr="${addr}" ${eligibleFree ? "" : "disabled"}>
            Claim Free
          </button>

          <button class="btn primary" data-action="buy" data-addr="${addr}" data-price="${price}">
            Buy (≈ ${fmt(price, 0)} GCAb)
          </button>
        </div>

        <div class="small muted" style="margin-top:4px">
          Buy price = 1% of their balance (preview). Spend logic comes next.
        </div>
      </div>
    `;

    candidatesList.appendChild(div);
  }
}

function setFloor(f) {
  currentFloor = f;
  if (floorText) floorText.textContent = floorLabel(f);

  // re-render from cached payload
  if (lastCandidatesPayload) renderCandidates(lastCandidatesPayload);

  // tiny visual feedback (optional)
  const allBtns = ["floorAll","floorB","floorS","floorM","floorA"]
    .map(id => document.getElementById(id))
    .filter(Boolean);

  for (const b of allBtns) b.classList.remove("primary");
  const activeId = f === "ALL" ? "floorAll" :
                   f === "B" ? "floorB" :
                   f === "S" ? "floorS" :
                   f === "M" ? "floorM" : "floorA";
  const active = document.getElementById(activeId);
  if (active) active.classList.add("primary");
}

// Elevator button bindings (safe even if buttons missing)
for (const id of ["floorAll","floorB","floorS","floorM","floorA"]) {
  const btn = document.getElementById(id);
  if (!btn) continue;
  btn.addEventListener("click", () => setFloor(btn.dataset.floor || "ALL"));
}

// Candidate list delegated clicks
if (candidatesList) {
  candidatesList.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const addr = btn.dataset.addr;

    if (!userAddress) return setStatus("Connect wallet first.");

    if (action === "claim") {
      // For now: use address as name, or you can ask for a nickname later
      // Backend currently expects "sidekick" as a string (not necessarily an address).
      // We’ll treat it as: "0xABCD…1234"
      try {
        setStatus("Signing…");
        await claimSidekickReal(addr);
        if (sidekickText) sidekickText.textContent = addr;
        if (releaseBtn) releaseBtn.disabled = false;
        setStatus(`Sidekick claimed: ${addr}`);
        await refreshSidekicks?.();
      } catch (err) {
        setStatus(err?.message || "Claim failed.");
      }
      return;
    }

    if (action === "buy") {
      const price = Number(btn.dataset.price || 0);

      // Preview-only (no spend yet)
      // We’ll wire real spend in backend patch: /sidekick/buy
      const ok = confirm(
        `BUY PREVIEW\n\nSpend ≈ ${fmt(price,0)} GCAb to instantly claim:\n${addr}\n\nThis will become real spend (burn/treasury) next patch. Continue?`
      );
      if (!ok) return;

      // Soft check: do you have enough GCAb?
      if (Number(gcab.balance || 0) < price) {
        setStatus(`Not enough GCAb. Need ${fmt(price,0)}.`);
        return;
      }

      setStatus(`Preview accepted. Next: wire /sidekick/buy spend endpoint.`);
      return;
    }
  });
}

// Load candidates button (bind once)
if (loadCandidatesBtn) {
  loadCandidatesBtn.addEventListener("click", async () => {
    try {
      if (!userAddress) return setStatus("Connect wallet first.");
      setStatus("Scanning candidates…");
      const payload = await fetchCandidates(userAddress);
      renderCandidates(payload);
      setStatus(`Candidates loaded. OwnerBal: ${fmt(payload.ownerBal, 0)} GCAb`);
    } catch (e) {
      setStatus(e?.message || "Failed to load candidates.");
    }
  });
}


  // ========= CONNECT FLOW =========
  async function connect() {
    const { ethereum } = window;
    if (!ethereum) {
      setStatus("MetaMask not detected. Install it to ascend.");
      return;
    }

    try {
      setStatus("Connecting…");
      await ensureBaseNetwork();

      provider = new ethers.BrowserProvider(ethereum);
      signer = await provider.getSigner();
      userAddress = await signer.getAddress();

      if (addrShort) addrShort.textContent = short(userAddress);
      if (addrFull) addrFull.textContent = userAddress;

      await refreshNetworkLabel();

      if (BACKEND.siwe && !siweDone) {
        setStatus("Authenticating… (sign message)");
        await siweLiteLogin(userAddress);
        siweDone = true;
      }

      setStatus("Reading GCAb balance…");
      const bal = await readBalance();
      updateGameUI(bal);

      if (connectBtn) connectBtn.textContent = "Connected";
      setStatus("Connected · Authenticated · Active");

      // Preload sidekicks list
      if (BACKEND.sidekicks && refreshSidekicksBtn) {
        await refreshSidekicks();
      }
    } catch (e) {
      console.error(e);
      setStatus(e?.message || "Connection failed.");
    }
  }

  function resetUI() {
    userAddress = null;
    siweDone = false;

    if (addrShort) addrShort.textContent = "—";
    if (addrFull) addrFull.textContent = "—";
    if (balText) balText.textContent = "—";
    if (rankText) rankText.textContent = "—";
    if (titleText) titleText.textContent = "—";
    if (powerText) powerText.textContent = "—";
    if (netName) netName.textContent = "—";
    if (chainText) chainText.textContent = "—";
    if (roomsEl) roomsEl.innerHTML = "";
    if (candCount) candCount.textContent = "0";
    if (candidatesList) candidatesList.innerHTML = "";

    if (connectBtn) connectBtn.textContent = "Connect MetaMask";
    if (addTokenBtn) addTokenBtn.disabled = true;

    if (claimBtn) claimBtn.disabled = true;
    if (releaseBtn) releaseBtn.disabled = true;

    if (refreshSidekicksBtn) refreshSidekicksBtn.disabled = true;
    if (sidekicksList) sidekicksList.innerHTML = "";

    if (checkinBtn) checkinBtn.disabled = true;
    if (claimEnergyBtn) claimEnergyBtn.disabled = true;

    setStatus("Disconnected.");
  }

  function bindWalletEvents() {
    const { ethereum } = window;
    if (!ethereum) return;

    ethereum.on("accountsChanged", async (accounts) => {
      if (!accounts || !accounts[0]) {
        resetUI();
        return;
      }
      // switch account: restart flow
      siweDone = false;
      await connect();
    });

    ethereum.on("chainChanged", async () => {
      provider = new ethers.BrowserProvider(window.ethereum);
      await refreshNetworkLabel();
      if (userAddress) {
        const bal = await readBalance();
        updateGameUI(bal);
      }
    });
  }

  // ========= ACTIONS =========
  if (connectBtn) connectBtn.addEventListener("click", connect);
  if (addTokenBtn) addTokenBtn.addEventListener("click", addTokenToWallet);

  if (refreshSidekicksBtn) {
    refreshSidekicksBtn.addEventListener("click", async () => {
      try {
        await refreshSidekicks();
        setStatus("Sidekicks refreshed.");
      } catch (e) {
        setStatus(e?.message || "Failed to refresh sidekicks.");
      }
    });
  }

  if (claimBtn) {
    claimBtn.addEventListener("click", async () => {
      try {
        const name = (sidekickInput?.value || "").trim();
        if (!name) return;

        setStatus("Signing…");
        await claimSidekickReal(name);

        if (sidekickText) sidekickText.textContent = name;
        if (releaseBtn) releaseBtn.disabled = false;
        if (sidekickInput) sidekickInput.value = "";

        setStatus(`Sidekick claimed: ${name}`);
        await refreshSidekicks();
      } catch (e) {
        setStatus(e?.message || "Claim failed.");
      }
    });
  }

  if (releaseBtn) {
    releaseBtn.addEventListener("click", async () => {
      try {
        setStatus("Signing…");
        await releaseSidekickReal();

        if (sidekickText) sidekickText.textContent = "—";
        if (releaseBtn) releaseBtn.disabled = true;

        setStatus("Sidekick released.");
        await refreshSidekicks();
      } catch (e) {
        setStatus(e?.message || "Release failed.");
      }
    });
  }

  if (loadCandidatesBtn) {
    loadCandidatesBtn.addEventListener("click", async () => {
      try {
        if (!userAddress) return setStatus("Connect wallet first.");
        setStatus("Scanning candidates…");
        const payload = await fetchCandidates(userAddress);
        renderCandidates(payload);
        setStatus(`Candidates loaded. OwnerBal: ${fmt(payload.ownerBal, 0)} GCAb`);
      } catch (e) {
        setStatus(e?.message || "Failed to load candidates.");
      }
    });
  }

  if (checkinBtn) {
    checkinBtn.addEventListener("click", () => {
      if (!userAddress) return setStatus("Connect wallet first.");
      doCheckinLocal();
    });
  }

  if (claimEnergyBtn) {
    claimEnergyBtn.addEventListener("click", () => {
      if (!userAddress) return setStatus("Connect wallet first.");
      doClaimEnergyLocal();
    });
  }

  // Boot
  bindWalletEvents();
  renderRooms("NPC");

  if (addTokenBtn) addTokenBtn.disabled = true;
  if (claimBtn) claimBtn.disabled = true;
  if (releaseBtn) releaseBtn.disabled = true;
  if (checkinBtn) checkinBtn.disabled = true;
  if (claimEnergyBtn) claimEnergyBtn.disabled = true;
  if (refreshSidekicksBtn) refreshSidekicksBtn.disabled = true;
  if (loadCandidatesBtn) loadCandidatesBtn.disabled = true;

  setStatus("Not connected.");
})();
