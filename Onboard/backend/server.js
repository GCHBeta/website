import express from "express";
import cors from "cors";
import { db } from "./db.js";
import { runDailyMint } from "./mint.js";
import { issueNonce, verifySignature } from "./auth.js";
import { startDailyMintScheduler } from "./scheduler.js";


const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const PORT = process.env.PORT || 8787;

// ===== HEALTH =====
app.get("/health", (req, res) => res.json({ ok: true }));

// ===== AUTH: GET NONCE (client signs returned message) =====
// GET /auth/nonce?address=0x...
app.get("/auth/nonce", (req, res) => {
  try {
    const address = req.query.address;
    if (!address) return res.status(400).json({ error: "address required" });

    const payload = issueNonce(address);
    res.json(payload); // { address, nonce, message }
  } catch (e) {
    res.status(400).json({ error: "Bad address" });
  }
});

// ===== AUTH: VERIFY SIGNATURE (marks player active) =====
// POST /auth/verify { address, signature }
app.post("/auth/verify", (req, res) => {
  const { address, signature } = req.body || {};
  if (!address || !signature) return res.status(400).json({ error: "address + signature required" });

  const result = verifySignature({ addressRaw: address, signature });
  if (!result.ok) return res.status(result.status).json({ error: result.error });

  res.json({ ok: true, address: result.address });
});

// ===== ENERGY BALANCE =====
app.get("/energy/:address", (req, res) => {
  const row = db
    .prepare(`SELECT energy_balance FROM players WHERE address = ?`)
    .get(String(req.params.address).toLowerCase());

  res.json({ energy: row?.energy_balance || 0 });
});

// ===== ADMIN: MANUAL MINT (keep for cron/emergency) =====
app.post("/admin/mint", async (req, res) => {
  const result = await runDailyMint();
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`GCAb backend running on http://localhost:${PORT}`);
});

startDailyMintScheduler({ hourUTC: 0, minuteUTC: 2, runOnBoot: true });
import { indexHoldersOnce } from "./holders_indexer.js";

function startHolderIndexer() {
  const RUN_EVERY_MIN = Number(process.env.HOLDERS_REFRESH_MIN || 60);

  const run = async (label) => {
    try {
      const r = await indexHoldersOnce();
      console.log(`[HOLDERS:${label}]`, r);
    } catch (e) {
      console.error(`[HOLDERS:${label}] ERROR`, e?.message || e);
    }
  };

  // run once on boot
  run("boot");

  // periodic refresh
  setInterval(() => run("interval"), RUN_EVERY_MIN * 60 * 1000);
}

startHolderIndexer();
app.get("/holders", (req, res) => {
  const min = Number(req.query.min || 0);
  const limit = Math.min(Number(req.query.limit || 200), 500);

  const rows = db.prepare(`
    SELECT address, balance_num AS balance
    FROM holders_cache
    WHERE is_contract = 0
      AND balance_num >= ?
    ORDER BY balance_num DESC
    LIMIT ?
  `).all(min, limit);

  res.json(rows);
});
