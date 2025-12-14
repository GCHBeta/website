import { runDailyMint } from "./mint.js";

function msUntilNextUtcTime(hours, minutes) {
  const now = new Date();

  // next run at UTC hh:mm
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hours,
    minutes,
    0,
    0
  ));

  // if already passed today, schedule tomorrow
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next.getTime() - now.getTime();
}

async function safeMint(label = "scheduled") {
  try {
    const res = await runDailyMint();
    console.log(`[MINT:${label}]`, res);
  } catch (e) {
    console.error(`[MINT:${label}] ERROR`, e);
  }
}

/**
 * Schedules mint to run daily at 00:02 UTC
 * - runs once shortly after boot (optional) to catch missed days if you want
 * - then schedules the next run precisely
 */
export function startDailyMintScheduler({ hourUTC = 0, minuteUTC = 2, runOnBoot = true } = {}) {
  if (runOnBoot) {
    // Safe because runDailyMint is idempotent (mint_log check).
    safeMint("boot");
  }

  const scheduleNext = () => {
    const wait = msUntilNextUtcTime(hourUTC, minuteUTC);
    const nextAt = new Date(Date.now() + wait).toISOString();
    console.log(`[MINT:scheduler] Next run in ${Math.round(wait / 1000)}s at ${nextAt}`);

    setTimeout(async () => {
      await safeMint("daily");
      scheduleNext(); // schedule again
    }, wait);
  };

  scheduleNext();
}
