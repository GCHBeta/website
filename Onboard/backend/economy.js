// ===== FINAL ECONOMY CONSTANTS =====
export const E_DAY = 1_000_000;
export const VAULT_CUT = 0.20;
export const HOLDER_POOL = Math.floor(E_DAY * (1 - VAULT_CUT));

export const B_MIN = 10_000;
export const MODEL_C_K = 0.15;
export const SOFT_CAP = Math.floor(HOLDER_POOL * 0.05); // 40,000

// ===== Model C weight =====
export function weightModelC(balance) {
  return Math.sqrt(balance) * (1 + MODEL_C_K * Math.log(1 + balance));
}

// ===== Largest remainder allocation =====
export function allocateExact(total, items) {
  const W = items.reduce((s, i) => s + i.weight, 0);
  if (W <= 0) return [];

  const rows = items.map(i => {
    const exact = (total * i.weight) / W;
    return {
      address: i.address,
      base: Math.floor(exact),
      frac: exact - Math.floor(exact)
    };
  });

  let used = rows.reduce((s, r) => s + r.base, 0);
  let remaining = total - used;

  rows.sort((a, b) =>
    b.frac !== a.frac ? b.frac - a.frac : a.address.localeCompare(b.address)
  );

  for (let i = 0; i < remaining; i++) {
    rows[i % rows.length].base += 1;
  }

  return rows.map(r => ({ address: r.address, amount: r.base }));
}
