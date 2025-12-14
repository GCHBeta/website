console.log("SERVER FILE:", import.meta.url);

import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import crypto from "crypto";

import { db } from "./db.js";
import { indexHoldersOnce } from "./holders_rpc_indexer.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8787;

app.get("/admin/holders/reset", (req, res) => {
  const to = Number(req.query.to || 38866093);

  db.prepare(`
    INSERT INTO kv(key,value) VALUES('holders_last_block',?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(String(to));

  res.json({ ok: true, holders_last_block: to });
});
// Manual trigger (admin) — GET version so you can click in browser
app.get("/admin/index-holders", async (req, res) => {
  try {
    const r = await indexHoldersOnce();
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e?.message || "index failed" });
  }
});


// Base mainnet
const BASE_RPC = "https://mainnet.base.org";
const provider = new ethers.JsonRpcProvider(BASE_RPC);

// Your GCAb token
const GCAB_TOKEN = "0x6d0B8eB75E9d6735cc301c3a6E82adeE43590B07";
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];
const token = new ethers.Contract(GCAB_TOKEN, ERC20_ABI, provider);

// ===== Prepared statements =====
const upsertSession = db.prepare(`
INSERT INTO sessions(address, nonce, updated_at)
VALUES(?, ?, ?)
ON CONFLICT(address) DO UPDATE SET nonce=excluded.nonce, updated_at=excluded.updated_at
`);

const getSession = db.prepare(`SELECT address, nonce FROM sessions WHERE address = ?`);

const upsertSidekick = db.prepare(`
INSERT INTO sidekicks(owner, sidekick, updated_at)
VALUES(?, ?, ?)
ON CONFLICT(owner) DO UPDATE SET sidekick=excluded.sidekick, updated_at=excluded.updated_at
`);

const deleteSidekick = db.prepare(`DELETE FROM sidekicks WHERE owner = ?`);

const listSidekicks = db.prepare(`
SELECT owner, sidekick, updated_at
FROM sidekicks
ORDER BY updated_at DESC
LIMIT 200
`);

// ===== Helpers =====
function now() { return Date.now(); }
function normAddr(a) { return ethers.getAddress(a); }
function makeNonce() { return crypto.randomBytes(16).toString("hex"); }

function buildLoginMessage(address, nonce) {
  return [
    "GCAb Social Login",
    "",
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    "Chain: Base (8453)",
    "Statement: Sign to prove you control this wallet. No gas."
  ].join("\n");
}

async function getGcabBalanceFloat(address) {
  const [raw, decimals] = await Promise.all([
    token.balanceOf(address),
    token.decimals()
  ]);
  return Number(ethers.formatUnits(raw, decimals));
}

// Tier gate for claiming (tweak)
function canClaimSidekick(balance) {
  return balance >= 10_000;
}

// ===== Routes =====
app.get("/health", (req, res) => res.json({ ok: true }));

// Auth nonce
app.get("/auth/nonce", (req, res) => {
  try {
    const address = normAddr(req.query.address);
    const nonce = makeNonce();
    upsertSession.run(address, nonce, now());
    res.json({ address, nonce, message: buildLoginMessage(address, nonce) });
  } catch {
    res.status(400).json({ error: "Bad address" });
  }
});

// Auth verify (rotates nonce)
app.post("/auth/verify", (req, res) => {
  try {
    const address = normAddr(req.body.address);
    const signature = req.body.signature;

    const row = getSession.get(address);
    if (!row) return res.status(400).json({ error: "No nonce. Call /auth/nonce first." });

    const message = buildLoginMessage(address, row.nonce);
    const recovered = ethers.verifyMessage(message, signature);

    if (normAddr(recovered) !== address) {
      return res.status(401).json({ error: "Signature invalid" });
    }

    upsertSession.run(address, makeNonce(), now());
    res.json({ ok: true, address });
  } catch {
    res.status(400).json({ error: "Verify failed" });
  }
});

// Claim sidekick (signature required each time with CURRENT nonce)
app.post("/sidekick/claim", async (req, res) => {
  try {
    const address = normAddr(req.body.address);
    const signature = req.body.signature;
    const sidekick = String(req.body.sidekick || "").trim();

    if (!sidekick || sidekick.length > 32) {
      return res.status(400).json({ error: "Sidekick name required (max 32 chars)" });
    }

    const row = getSession.get(address);
    if (!row) return res.status(400).json({ error: "No nonce. Call /auth/nonce first." });

    const message = buildLoginMessage(address, row.nonce);
    const recovered = ethers.verifyMessage(message, signature);
    if (normAddr(recovered) !== address) return res.status(401).json({ error: "Not authorized" });

    const bal = await getGcabBalanceFloat(address);
    if (!canClaimSidekick(bal)) {
      return res.status(403).json({ error: `Need >= 10,000 GCAb to claim. You have ~${bal.toFixed(4)}.` });
    }

    upsertSidekick.run(address, sidekick, now());
    upsertSession.run(address, makeNonce(), now());

    res.json({ ok: true, owner: address, sidekick });
  } catch {
    res.status(400).json({ error: "Claim failed" });
  }
});

// Release sidekick
app.post("/sidekick/release", (req, res) => {
  try {
    const address = normAddr(req.body.address);
    const signature = req.body.signature;

    const row = getSession.get(address);
    if (!row) return res.status(400).json({ error: "No nonce. Call /auth/nonce first." });

    const message = buildLoginMessage(address, row.nonce);
    const recovered = ethers.verifyMessage(message, signature);
    if (normAddr(recovered) !== address) return res.status(401).json({ error: "Not authorized" });

    deleteSidekick.run(address);
    upsertSession.run(address, makeNonce(), now());

    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Release failed" });
  }
});

// Global sidekick list (public)
app.get("/sidekicks", (req, res) => {
  res.json(listSidekicks.all());
});

// ===== HOLDERS (cached, EOA only) =====
app.get("/holders", (req, res) => {
  const min = Number(req.query.min || 0);
  const limit = Math.min(Number(req.query.limit || 200), 500);

const rows = db.prepare(`
  SELECT address, balance_num AS balance
  FROM holders_cache
  WHERE is_contract = 0
    AND balance_num > 0
    AND address != '0x000000000000000000000000000000000000dead'
    AND address != '0x0000000000000000000000000000000000000000'
    AND balance_num >= ?
  ORDER BY balance_num DESC
  LIMIT ?
`).all(min, limit);


  res.json(rows);
});

// Sidekick candidates: real holders below owner's balance (EOA only)
app.get("/sidekick/candidates", (req, res) => {
  try {
    const owner = normAddr(req.query.owner).toLowerCase();
    const min = Number(req.query.min || 0);
    const limit = Math.min(Number(req.query.limit || 50), 200);

    // Owner must exist in cache; if not, treat as 0 balance
    const ownerRow = db.prepare(`
      SELECT balance_num AS balance
      FROM holders_cache
      WHERE address = ?
      LIMIT 1
    `).get(owner);

    const ownerBal = ownerRow ? Number(ownerRow.balance) : 0;

    // If owner has 0, no candidates (by your rule "smaller than owner")
    if (!Number.isFinite(ownerBal) || ownerBal <= 0) {
      return res.json({ owner, ownerBal: ownerBal || 0, candidates: [] });
    }

    const rows = db.prepare(`
      SELECT address, balance_num AS balance
      FROM holders_cache
      WHERE is_contract = 0
        AND balance_num >= ?
        AND balance_num < ?
        AND address != ?
      ORDER BY balance_num ASC
      LIMIT ?
    `).all(min, ownerBal, owner, limit);

    res.json({
      owner,
      ownerBal,
      candidates: rows
    });
  } catch (e) {
    res.status(400).json({ error: "Bad owner address" });
  }
});

// Manual trigger (admin)
app.post("/admin/index-holders", async (req, res) => {
  try {
    const r = await indexHoldersOnce();
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e?.message || "index failed" });
  }
});

// ===== Scheduler =====
function startHolderIndexer() {
  const MIN = Number(process.env.HOLDERS_REFRESH_MIN || 60);

  const run = async (label) => {
    try {
      const r = await indexHoldersOnce();
      console.log(`[HOLDERS:${label}]`, r);
    } catch (e) {
      console.error(`[HOLDERS:${label}] ERROR`, e?.message || e);
    }
  };

  run("boot");
  setInterval(() => run("interval"), MIN * 60 * 1000);
}

app.listen(PORT, () => {
  console.log(`GCAb backend running on http://localhost:${PORT}`);
  startHolderIndexer();
});
