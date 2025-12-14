import { db } from "./db.js";
import { ethers } from "ethers";
import {
  E_DAY,
  VAULT_CUT,
  HOLDER_POOL,
  B_MIN,
  SOFT_CAP,
  weightModelC,
  allocateExact
} from "./economy.js";

// ===== CONFIG =====
const BASE_RPC = "https://mainnet.base.org";
const GCAB_TOKEN = "0x6d0B8eB75E9d6735cc301c3a6E82adeE43590B07";

const provider = new ethers.JsonRpcProvider(BASE_RPC);
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];
const token = new ethers.Contract(GCAB_TOKEN, ERC20_ABI, provider);

function utcDayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function runDailyMint() {
  const day = utcDayKey();

  // 1. Ensure once per day
  const already = db
    .prepare(`SELECT 1 FROM mint_log WHERE day = ?`)
    .get(day);
  if (already) return { ok: false, reason: "Already minted" };

  // 2. Active players (last 7 days)
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const players = db
    .prepare(`SELECT address FROM players WHERE last_seen_utc >= ?`)
    .all(cutoff);

  if (!players.length) {
    db.prepare(`INSERT INTO mint_log(day, minted_at) VALUES(?, ?)`)
      .run(day, Date.now());
    return { ok: true, minted: 0, note: "No active players" };
  }

  // 3. Fetch balances + weights
  const decimals = await token.decimals();
  const weighted = [];

  for (const p of players) {
    const raw = await token.balanceOf(p.address);
    const bal = Number(ethers.formatUnits(raw, decimals));
    if (bal >= B_MIN) {
      weighted.push({
        address: p.address,
        weight: weightModelC(bal)
      });
    }
  }

  if (!weighted.length) {
    db.prepare(`INSERT INTO mint_log(day, minted_at) VALUES(?, ?)`)
      .run(day, Date.now());
    return { ok: true, minted: 0, note: "No eligible holders" };
  }

  // 4. Allocate
  let allocations = allocateExact(HOLDER_POOL, weighted);

  // 5. Soft-cap enforcement
  let overflow = 0;
  allocations = allocations.map(a => {
    if (a.amount > SOFT_CAP) {
      overflow += a.amount - SOFT_CAP;
      return { ...a, amount: SOFT_CAP };
    }
    return a;
  });

  // Redistribute overflow (simple second pass)
  if (overflow > 0) {
    const underCap = allocations.filter(a => a.amount < SOFT_CAP);
    if (underCap.length) {
      const extra = allocateExact(overflow, underCap.map(a => ({
        address: a.address,
        weight: 1
      })));
      allocations = allocations.map(a => {
        const e = extra.find(x => x.address === a.address);
        return e ? { ...a, amount: a.amount + e.amount } : a;
      });
    }
  }

  // 6. Commit (transaction)
  const insertLedger = db.prepare(`
    INSERT INTO energy_ledger(day, address, delta, reason, created_at)
    VALUES (?, ?, ?, 'DAILY_MINT', ?)
  `);
  const updatePlayer = db.prepare(`
    UPDATE players SET energy_balance = energy_balance + ? WHERE address = ?
  `);

  const tx = db.transaction(() => {
    for (const a of allocations) {
      if (a.amount > 0) {
        insertLedger.run(day, a.address, a.amount, Date.now());
        updatePlayer.run(a.amount, a.address);
      }
    }
    db.prepare(`INSERT INTO mint_log(day, minted_at) VALUES(?, ?)`)
      .run(day, Date.now());
  });

  tx();

  return { ok: true, minted: E_DAY, holders: allocations.length };
}
