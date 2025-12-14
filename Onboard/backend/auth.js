import crypto from "crypto";
import { ethers } from "ethers";
import { db } from "./db.js";

function now() {
  return Date.now();
}

function normalizeAddress(addr) {
  // checksum + validates
  return ethers.getAddress(addr);
}

function makeNonce() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * SIWE-lite message (simple + stable).
 * You can upgrade to full EIP-4361 later.
 */
export function buildLoginMessage({ address, nonce }) {
  return [
    "GCAb Social Login",
    "",
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    "Chain: Base (8453)",
    "Statement: Sign to prove you control this wallet. No gas."
  ].join("\n");
}

const upsertSession = db.prepare(`
  INSERT INTO sessions(address, nonce, updated_at)
  VALUES(?, ?, ?)
  ON CONFLICT(address) DO UPDATE SET nonce=excluded.nonce, updated_at=excluded.updated_at
`);

const getSession = db.prepare(`
  SELECT address, nonce FROM sessions WHERE address = ?
`);

const upsertPlayerActive = db.prepare(`
  INSERT INTO players(address, last_seen_utc, energy_balance)
  VALUES(?, ?, 0)
  ON CONFLICT(address) DO UPDATE SET last_seen_utc=excluded.last_seen_utc
`);

export function issueNonce(addressRaw) {
  const address = normalizeAddress(addressRaw).toLowerCase();
  const nonce = makeNonce();
  upsertSession.run(address, nonce, now());
  return { address, nonce, message: buildLoginMessage({ address, nonce }) };
}

/**
 * Verify signature for the current nonce, mark player active, rotate nonce.
 */
export function verifySignature({ addressRaw, signature }) {
  const address = normalizeAddress(addressRaw).toLowerCase();

  const row = getSession.get(address);
  if (!row) {
    return { ok: false, status: 400, error: "No nonce for address. Call /auth/nonce first." };
  }

  const message = buildLoginMessage({ address, nonce: row.nonce });

  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch (e) {
    return { ok: false, status: 400, error: "Bad signature format." };
  }

  const recoveredNorm = normalizeAddress(recovered).toLowerCase();
  if (recoveredNorm !== address) {
    return { ok: false, status: 401, error: "Signature invalid (address mismatch)." };
  }

  // Mark player active
  upsertPlayerActive.run(address, now());

  // Rotate nonce (prevents replay)
  const newNonce = makeNonce();
  upsertSession.run(address, newNonce, now());

  return { ok: true, address };
}
