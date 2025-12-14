import { db } from "./db.js";
import { ethers } from "ethers";

const CHAINID = 8453; // Base
const TOKEN = "0x6d0B8eB75E9d6735cc301c3a6E82adeE43590B07".toLowerCase();

const BASE_RPC = "https://mainnet.base.org";
const provider = new ethers.JsonRpcProvider(BASE_RPC);

// Etherscan v2 style endpoint
const API_URL = "https://api.basescan.org/api";
const API_KEY = process.env.BASESCAN_API_KEY;
console.log("[HOLDERS_INDEXER] using API_URL:", API_URL);
console.log("[HOLDERS_INDEXER] has BASESCAN_API_KEY:", !!process.env.BASESCAN_API_KEY);
const PAGE_SIZE = Number(process.env.HOLDERS_PAGE_SIZE || 200);
const MAX_PAGES = Number(process.env.HOLDERS_MAX_PAGES || 5); // MVP safety cap
const CONCURRENCY = Number(process.env.CONTRACT_CHECK_CONCURRENCY || 8);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchHolderPage(page) {
if (!API_KEY) throw new Error("Missing BASESCAN_API_KEY env var");

const url =
  `${API_URL}?module=token&action=tokenholderlist` +
  `&contractaddress=${TOKEN}` +
  `&page=${page}&offset=${PAGE_SIZE}` +
  `&apikey=${encodeURIComponent(API_KEY)}`;

  const r = await fetch(url);
  const data = await r.json();

  if (data.status !== "1") {
    throw new Error(`Explorer error: ${data.message || "unknown"} :: ${JSON.stringify(data.result).slice(0, 200)}`);
  }

  return data.result || [];
}

async function isContract(address) {
  const code = await provider.getCode(address);
  return code && code !== "0x";
}

export async function indexHoldersOnce() {
  const started = Date.now();
  let fetched = 0;
  const rows = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageRows = await fetchHolderPage(page);
    fetched += pageRows.length;

    if (!pageRows.length) break;

    for (const r of pageRows) {
      const address = (r.TokenHolderAddress || "").toLowerCase();
      const qtyRaw = String(r.TokenHolderQuantity ?? "0");

      if (!ethers.isAddress(address)) continue;
      rows.push({ address, qtyRaw });
    }

    if (pageRows.length < PAGE_SIZE) break;
    await sleep(250);
  }

  // unique by address
  const unique = Array.from(new Map(rows.map((x) => [x.address, x])).values());

  // contract filtering
  const checked = await mapLimit(unique, CONCURRENCY, async (x) => {
    let contract = false;
    try {
      contract = await isContract(x.address);
    } catch {
      contract = false; // retry next run
    }
    const num = Number(x.qtyRaw);
    return {
      address: x.address,
      balance_raw: x.qtyRaw,
      balance_num: Number.isFinite(num) ? num : 0,
      is_contract: contract ? 1 : 0
    };
  });

  const now = Date.now();
  const up = db.prepare(`
    INSERT INTO holders_cache(address, balance_raw, balance_num, is_contract, updated_at)
    VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      balance_raw=excluded.balance_raw,
      balance_num=excluded.balance_num,
      is_contract=excluded.is_contract,
      updated_at=excluded.updated_at
  `);

  const tx = db.transaction((items) => {
    for (const it of items) {
      up.run(it.address, it.balance_raw, it.balance_num, it.is_contract, now);
    }
  });

  tx(checked);

  return {
    ok: true,
    fetched,
    unique: unique.length,
    stored: checked.length,
    eoas: checked.filter((x) => x.is_contract === 0).length,
    ms: Date.now() - started
  };
}
