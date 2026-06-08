// ─── Coin Engine Alert Scanner ────────────────────────────────────────────────
// Always-on background service. Deploy to Railway / Render / Fly.io for 24/7
// phone alerts even when your PC is off.
//
// Usage:
//   node index.js
//
// Required env vars (see .env.example):
//   NOTIFY_PROVIDER, NTFY_TOPIC  (or TELEGRAM_TOKEN + TELEGRAM_CHAT_ID)

import { config } from "./config.js";
import { runWatchScan, runEarlyScan } from "./scanner.js";
import { sendNtfy, sendTelegram } from "./notify.js";

// ─── Startup banner ───────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════");
console.log("  🚀 Coin Engine Alert Scanner — starting");
console.log("═══════════════════════════════════════════════");
console.log(`  Provider:      ${config.provider}`);
if (config.provider === "ntfy")     console.log(`  ntfy topic:    ${config.ntfyTopic || "(not set)"}`);
if (config.provider === "telegram") console.log(`  Telegram:      chat ${config.telegramChatId || "(not set)"}`);
console.log(`  Watch symbols: ${config.watchSymbols.join(", ") || "(none)"}`);
console.log(`  Watch interval: ${config.watchIntervalMs / 1000}s`);
console.log(`  Min win prob:  ${config.minWinProb}%`);
console.log(`  Early crypto:  ${config.notifyEarlyCrypto ? `✓ (threshold ${config.earlyScoreThreshold}%)` : "off"}`);
console.log(`  Early interval: ${config.earlyIntervalMs / 1000}s`);
console.log("═══════════════════════════════════════════════");

// ─── Config validation ────────────────────────────────────────────────────────

if (config.provider === "ntfy" && !config.ntfyTopic) {
  console.error("❌ NOTIFY_PROVIDER=ntfy but NTFY_TOPIC is not set. Exiting.");
  process.exit(1);
}
if (config.provider === "telegram" && (!config.telegramToken || !config.telegramChatId)) {
  console.error("❌ NOTIFY_PROVIDER=telegram but TELEGRAM_TOKEN or TELEGRAM_CHAT_ID is missing. Exiting.");
  process.exit(1);
}

// ─── Startup ping ─────────────────────────────────────────────────────────────

async function sendStartupPing() {
  const msg = `✅ Coin Engine Scanner is live!\n` +
    `Watching: ${config.watchSymbols.join(", ") || "none"}\n` +
    `Early crypto alerts: ${config.notifyEarlyCrypto ? `on (≥${config.earlyScoreThreshold}%)` : "off"}`;

  if (config.provider === "ntfy") {
    await sendNtfy("Coin Engine Scanner Started", msg, 3, ["white_check_mark"]);
  } else if (config.provider === "telegram") {
    await sendTelegram(`<b>✅ Coin Engine Scanner Started</b>\n${msg}`);
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function main() {
  // Send startup confirmation
  await sendStartupPing().catch(err => console.warn("Startup ping failed:", err.message));

  // First pass immediately
  await runWatchScan().catch(console.error);
  await runEarlyScan().catch(console.error);

  // Recurring intervals
  setInterval(() => runWatchScan().catch(console.error), config.watchIntervalMs);
  setInterval(() => runEarlyScan().catch(console.error), config.earlyIntervalMs);

  console.log("✓ Scanner is running. Press Ctrl+C to stop.");
}

main();

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on("SIGTERM", () => { console.log("SIGTERM received — shutting down."); process.exit(0); });
process.on("SIGINT",  () => { console.log("\nSIGINT received — shutting down.");  process.exit(0); });
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  // Keep running — don't crash on a single API hiccup
});
process.on("unhandledRejection", (reason) => {
  console.warn("[unhandledRejection]", reason);
});
