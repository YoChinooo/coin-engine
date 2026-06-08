// ─── Configuration ────────────────────────────────────────────────────────────
// All settings come from environment variables so nothing sensitive is
// committed to git. Copy .env.example → .env and fill it in locally.
// On Railway / Render, set these as service environment variables.

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name, fallback) {
  return process.env[name] ?? fallback;
}

// Symbols to watch for trade signals (Yahoo Finance tickers).
// Separate multiple symbols with commas.
// Futures: ES=F NQ=F CL=F GC=F SI=F NG=F ZB=F
// Crypto:  BTC-USD ETH-USD SOL-USD
// Stocks:  AAPL TSLA SPY QQQ
const RAW_SYMBOLS = optional("WATCH_SYMBOLS", "ES=F,NQ=F,CL=F,GC=F,BTC-USD,ETH-USD,SOL-USD");

export const config = {
  // ── Notify provider ──────────────────────────────────────────────────────
  provider: optional("NOTIFY_PROVIDER", "none"),   // "ntfy" | "telegram" | "none"

  // ntfy
  ntfyTopic:  optional("NTFY_TOPIC", ""),
  ntfyServer: optional("NTFY_SERVER", "https://ntfy.sh"),

  // Telegram
  telegramToken:  optional("TELEGRAM_TOKEN", ""),
  telegramChatId: optional("TELEGRAM_CHAT_ID", ""),

  // ── Thresholds ───────────────────────────────────────────────────────────
  minWinProb:          Number(optional("MIN_WIN_PROB",           "65")),
  earlyScoreThreshold: Number(optional("EARLY_SCORE_THRESHOLD",  "80")),
  notifyLong:          optional("NOTIFY_LONG",          "true")  !== "false",
  notifyShort:         optional("NOTIFY_SHORT",         "true")  !== "false",
  notifyEarlyCrypto:   optional("NOTIFY_EARLY_CRYPTO",  "true")  !== "false",

  // ── Scan intervals ───────────────────────────────────────────────────────
  watchIntervalMs: Number(optional("WATCH_INTERVAL_MS",  "90000")),  // 90s default
  earlyIntervalMs: Number(optional("EARLY_INTERVAL_MS", "300000")),  // 5min default
  rateLimitMs:     Number(optional("RATE_LIMIT_MS",      "600000")), // 10min per symbol

  // ── Watch list ───────────────────────────────────────────────────────────
  watchSymbols: RAW_SYMBOLS
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(Boolean),
};

// Derive asset type from symbol
export function assetType(sym) {
  if (sym.endsWith("=F") || ["ES","NQ","CL","GC","SI","NG","ZB","YM","RTY"].includes(sym)) return "futures";
  if (sym.endsWith("-USD") || sym.endsWith("-USDT")) return "crypto";
  return "stock";
}
