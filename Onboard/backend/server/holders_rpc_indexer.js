import { db } from "./db.js";
import { ethers } from "ethers";

const BASE_RPC = "https://mainnet.base.org";
const provider = new ethers.JsonRpcProvider(BASE_RPC);

const TOKEN = "0x6d0B8eB75E9d6735cc301c3a6E82adeE43590B07".toLowerCase();

// ERC20 Transfer event topic
// Transfer(address,address,uint256)
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

// How far back to scan each run (in blocks). Tune if needed.
const CHUNK = Number(process.env.HOLDERS_RPC_CHUNK || 5000);

// Safety cap: max blocks scanned per boot run (prevents infinite backfill)
const MAX_TOTAL = Number(process.env.HOLDERS_RPC_MAX_TOTAL || 200000);

// Persist scan cursor here
function getCursor() {
  const row = db.prepare(`SELECT value FROM kv WHERE key='holders_last_block'`).get();
  return row ? Number(row.value) : null;
}
function setCursor(n) {
  db.prepare(`
    INSERT INTO kv(key,value) VALUES('holders_last_block',?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(String(n));
}

// Minimal KV table (create if missing)
db.exec(`
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

async function isContract(address) {
  const code = await provider.getCode(address);
  return code && code !== "0x";
}

function addrFromTopic(t) {
  // topic is 32 bytes: last 20 bytes are address
  return ethers.getAddress("0x" + t.slice(26));
}

// Write holder cache row
const up = db.prepare(`
  INSERT INTO holders_cache(address, balance_raw, balance_num, is_contract, updated_at)
  VALUES(?, ?, ?, ?, ?)
  ON CONFLICT(address) DO UPDATE SET
    balance_raw=excluded.balance_raw,
    balance_num=excluded.balance_num,
    is_contract=excluded.is_contract,
    updated_at=excluded.updated_at
`);

export async function indexHoldersOnce() {
  const started = Date.now();

  // Determine scan window
  const latest = await provider.getBlockNumber();
  let from = getCursor();

  // First run: start “recent” to get something working quickly

if (from == null) {
  from = 38866093; // bloco de deploy do GCAb
  setCursor(from);
}



  let to = Math.min(from + CHUNK - 1, latest);

  let totalScanned = 0;
  const balances = new Map(); // address -> BigInt delta accumulator

  // We only scan forward from cursor → latest, chunked.
  while (from <= latest && totalScanned < MAX_TOTAL) {
    to = Math.min(from + CHUNK - 1, latest);

    const logs = await provider.getLogs({
      address: TOKEN,
      fromBlock: from,
      toBlock: to,
      topics: [TRANSFER_TOPIC]
    });

    for (const log of logs) {
      const fromAddr = addrFromTopic(log.topics[1]).toLowerCase();
      const toAddr = addrFromTopic(log.topics[2]).toLowerCase();
      const value = BigInt(log.data);

      // subtract from sender (except mint)
      if (fromAddr !== "0x0000000000000000000000000000000000000000") {
        balances.set(fromAddr, (balances.get(fromAddr) || 0n) - value);
      }

      // add to receiver (except burn)
      if (toAddr !== "0x0000000000000000000000000000000000000000") {
        balances.set(toAddr, (balances.get(toAddr) || 0n) + value);
      }
    }

    totalScanned += (to - from + 1);
    from = to + 1;
    setCursor(from);

    if (to >= latest) break;
  }

  // Apply deltas to DB cache:
  // We’ll store a simple balance_num for now based on raw units.
  // (Later we can pull decimals once and format properly.)
  const now = Date.now();

  // Get decimals once
  const erc20 = new ethers.Contract(
    TOKEN,
    ["function decimals() view returns (uint8)"],
    provider
  );
  const decimals = Number(await erc20.decimals());

  // Read existing cached balances so we can add deltas
  const getExisting = db.prepare(`SELECT balance_raw FROM holders_cache WHERE address = ?`);
  const tx = db.transaction((items) => {
    for (const [addr, delta] of items) {
      if (delta === 0n) continue;

      const prevRow = getExisting.get(addr);
      const prevRaw = prevRow ? BigInt(prevRow.balance_raw) : 0n;
      const newRaw = prevRaw + delta;

      // If balance <= 0, set to 0 (and still store; you can clean later)
      const finalRaw = newRaw > 0n ? newRaw : 0n;

      // balance_num: float (ok for ranking; not for perfect accounting)
      const balanceNum = Number(ethers.formatUnits(finalRaw, decimals));

      // We don’t want to call getCode for every address every run.
      // For MVP: mark unknown contracts as 0 and filter later via a separate pass.
      // But you wanted excluding contracts: we’ll do a limited contract check here.
      // (Only for addresses with meaningful balance)
      up.run(addr, finalRaw.toString(), balanceNum, 0, now);
    }
  });

  tx(balances.entries());

  return {
    ok: true,
    latest,
    cursor: getCursor(),
    scanned_blocks: totalScanned,
    touched_addresses: balances.size,
    ms: Date.now() - started,
    note: "Balances updated from Transfer logs. Contract filtering pass not yet applied."
  };
}
export async function markContracts(limit = 200) {
  const rows = db.prepare(`
    SELECT address FROM holders_cache
    WHERE is_contract = 0 AND balance_num > 0
    ORDER BY updated_at ASC
    LIMIT ?
  `).all(limit);

  const now = Date.now();
  const upd = db.prepare(`UPDATE holders_cache SET is_contract=?, updated_at=? WHERE address=?`);

  let marked = 0;
  for (const r of rows) {
    const c = await isContract(r.address);
    if (c) {
      upd.run(1, now, r.address);
      marked++;
    } else {
      // keep as 0
      upd.run(0, now, r.address);
    }
  }
  return { ok: true, checked: rows.length, marked };
}
