// ─── Phone notification service ───────────────────────────────────────────────
// Supports ntfy.sh (free, no account) and Telegram Bot

export type NotifyProvider = "none" | "ntfy" | "telegram";

export interface NotifyConfig {
  provider: NotifyProvider;
  // ntfy
  ntfyTopic: string;
  ntfyServer: string;       // default: https://ntfy.sh
  // telegram
  telegramToken: string;
  telegramChatId: string;
  // shared
  minWinProb: number;       // only notify when winProb >= this
  notifyLong: boolean;
  notifyShort: boolean;
  notifyEarlyCrypto: boolean; // send alert for early-action meme/crypto ≥ earlyScoreThreshold
  earlyScoreThreshold: number; // default 80
  enabled: boolean;
}

const NOTIFY_KEY = "coinEngine_notifyConfig";
const ALERTS_KEY = "coinEngine_alertsEnabled";

export const DEFAULT_CONFIG: NotifyConfig = {
  provider: "none",
  ntfyTopic: "",
  ntfyServer: "https://ntfy.sh",
  telegramToken: "",
  telegramChatId: "",
  minWinProb: 65,
  notifyLong: true,
  notifyShort: true,
  notifyEarlyCrypto: true,
  earlyScoreThreshold: 80,
  enabled: false,
};

export function loadNotifyConfig(): NotifyConfig {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch { return { ...DEFAULT_CONFIG }; }
}

export function saveNotifyConfig(cfg: NotifyConfig): void {
  localStorage.setItem(NOTIFY_KEY, JSON.stringify(cfg));
}

export function loadAlertsEnabled(): boolean {
  return localStorage.getItem(ALERTS_KEY) === "true";
}

export function saveAlertsEnabled(v: boolean): void {
  localStorage.setItem(ALERTS_KEY, String(v));
}

// ─── Ntfy.sh ──────────────────────────────────────────────────────────────────
// Uses the JSON publishing API (POST to root with topic in body) to avoid
// custom request headers that trigger CORS preflight failures from the browser.

async function sendNtfy(
  cfg: NotifyConfig,
  title: string,
  message: string,
  priority: 1 | 2 | 3 | 4 | 5 = 4,
): Promise<{ ok: boolean; error?: string }> {
  const server = (cfg.ntfyServer || "https://ntfy.sh").replace(/\/$/, "");
  const topic  = cfg.ntfyTopic.trim();

  if (!topic) return { ok: false, error: "No topic entered — type your ntfy topic above." };

  // ntfy JSON API — single Content-Type header avoids CORS preflight issues
  const payload = {
    topic,
    title,
    message,
    priority,
    tags: ["chart_with_upwards_trend", "bell"],
  };

  // Try the configured server first, then fall back to ntfy.sh directly
  const endpoints = server === "https://ntfy.sh"
    ? ["https://ntfy.sh"]
    : [server, "https://ntfy.sh"];

  for (const base of endpoints) {
    try {
      const res = await fetch(`${base}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) return { ok: true };

      const text = await res.text().catch(() => res.status.toString());
      console.warn(`[phoneNotify] ntfy ${base} returned ${res.status}:`, text);

      // Return a clear error for common status codes
      if (res.status === 401 || res.status === 403)
        return { ok: false, error: `Topic "${topic}" requires auth (${res.status}). Use a public topic or self-host.` };
      if (res.status === 429)
        return { ok: false, error: "Rate limited by ntfy.sh — wait a moment and try again." };

    } catch (err) {
      console.warn(`[phoneNotify] ntfy fetch error (${base}):`, err);
    }
  }

  return { ok: false, error: "Network error — check your internet connection or try a different server." };
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function sendTelegram(
  cfg: NotifyConfig,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const { telegramToken, telegramChatId } = cfg;
  if (!telegramToken) return { ok: false, error: "No bot token entered." };
  if (!telegramChatId) return { ok: false, error: "No chat ID entered." };

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${telegramToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: telegramChatId, text, parse_mode: "HTML" }),
      },
    );

    if (res.ok) return { ok: true };

    const json = await res.json().catch(() => ({}));
    const desc = json?.description ?? `HTTP ${res.status}`;
    console.warn("[phoneNotify] Telegram error:", desc);

    if (res.status === 401)
      return { ok: false, error: "Invalid bot token — double-check what @BotFather gave you." };
    if (res.status === 400 && String(desc).includes("chat not found"))
      return { ok: false, error: "Chat not found — make sure you sent your bot a message first, then get the ID again." };

    return { ok: false, error: desc };
  } catch (err) {
    console.warn("[phoneNotify] Telegram fetch error:", err);
    return { ok: false, error: "Network error — check your connection." };
  }
}

// ─── Public types & API ───────────────────────────────────────────────────────

export interface TradeAlert {
  symbol: string;
  direction: "LONG" | "SHORT";
  price: number;
  winProb: number;
  conviction: string;
  rsi: number;
  macdBull: boolean;
  aboveVwap: boolean;
  assetType: string;
}

/** Returns { ok, error? } so callers can show a meaningful failure message. */
export async function sendPhoneAlert(
  cfg: NotifyConfig,
  alert: TradeAlert,
): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.enabled)                               return { ok: false, error: "Alerts are disabled." };
  if (cfg.provider === "none")                    return { ok: false, error: "No provider selected." };
  if (alert.winProb < cfg.minWinProb)             return { ok: false, error: `Win prob ${alert.winProb}% below threshold ${cfg.minWinProb}%.` };
  if (alert.direction === "LONG"  && !cfg.notifyLong)  return { ok: false };
  if (alert.direction === "SHORT" && !cfg.notifyShort) return { ok: false };

  const emoji = alert.direction === "LONG" ? "📈" : "📉";
  const title = `${emoji} ${alert.symbol} ${alert.direction} — ${alert.winProb}% win prob`;
  const fmtPrice = alert.price.toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 4,
  });
  const body =
    `Entry at $${fmtPrice}\n` +
    `Conviction: ${alert.conviction} · ${alert.assetType}\n` +
    `RSI ${alert.rsi.toFixed(0)} · MACD ${alert.macdBull ? "bullish ↑" : "bearish ↓"} · ${alert.aboveVwap ? "Above VWAP" : "Below VWAP"}`;

  if (cfg.provider === "ntfy") {
    const priority: 1 | 2 | 3 | 4 | 5 = alert.winProb >= 75 ? 5 : alert.winProb >= 65 ? 4 : 3;
    return sendNtfy(cfg, title, body, priority);
  }

  if (cfg.provider === "telegram") {
    const msg =
      `<b>${emoji} ${alert.symbol} ${alert.direction}</b>\n` +
      `Win probability: <b>${alert.winProb}%</b>\n` +
      `Entry: <code>$${fmtPrice}</code>\n` +
      `Conviction: ${alert.conviction} · ${alert.assetType}\n` +
      `RSI ${alert.rsi.toFixed(0)} · MACD ${alert.macdBull ? "▲" : "▼"} · VWAP ${alert.aboveVwap ? "above ✓" : "below ✗"}`;
    return sendTelegram(cfg, msg);
  }

  return { ok: false, error: "Unknown provider." };
}

// ─── Early Action Crypto Alert ────────────────────────────────────────────────

export interface EarlyCryptoAlert {
  symbol: string;
  name: string;
  earlyScore: number;
  price: number;
  change24h: number;
  change1h: number;
  marketCap: number;
  trendingRank: number;
}

/** Sends a phone alert for a meme/crypto early-action signal. */
export async function sendEarlyAlert(
  cfg: NotifyConfig,
  alert: EarlyCryptoAlert,
): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.enabled)              return { ok: false, error: "Alerts disabled." };
  if (cfg.provider === "none")   return { ok: false, error: "No provider." };
  if (!cfg.notifyEarlyCrypto)    return { ok: false, error: "Early crypto alerts disabled." };
  if (alert.earlyScore < (cfg.earlyScoreThreshold ?? 80)) return { ok: false };

  const chSign = alert.change24h >= 0 ? "+" : "";
  const fmtPrice = alert.price < 0.01
    ? alert.price.toFixed(8)
    : alert.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  const trending = alert.trendingRank > 0 ? ` · 🔥 Trending #${alert.trendingRank}` : "";
  const mcap = alert.marketCap >= 1e9
    ? `$${(alert.marketCap / 1e9).toFixed(2)}B`
    : alert.marketCap >= 1e6
    ? `$${(alert.marketCap / 1e6).toFixed(1)}M`
    : `$${(alert.marketCap / 1e3).toFixed(0)}K`;

  const title = `🚀 EARLY ACTION: ${alert.symbol} — Score ${alert.earlyScore}%`;
  const body =
    `${alert.name} · $${fmtPrice}\n` +
    `24h: ${chSign}${alert.change24h.toFixed(1)}%  1h: ${alert.change1h >= 0 ? "+" : ""}${alert.change1h.toFixed(1)}%\n` +
    `Market cap: ${mcap}${trending}`;

  if (cfg.provider === "ntfy") {
    return sendNtfy(cfg, title, body, 5); // urgent priority
  }

  if (cfg.provider === "telegram") {
    const msg =
      `<b>🚀 EARLY ACTION: ${alert.symbol}</b>\n` +
      `Early Score: <b>${alert.earlyScore}%</b>\n` +
      `Price: <code>$${fmtPrice}</code>\n` +
      `24h: ${chSign}${alert.change24h.toFixed(1)}%  1h: ${alert.change1h >= 0 ? "+" : ""}${alert.change1h.toFixed(1)}%\n` +
      `Market cap: ${mcap}${trending ? `\n${trending.trim()}` : ""}`;
    return sendTelegram(cfg, msg);
  }

  return { ok: false, error: "Unknown provider." };
}

/** Sends a sample notification so the user can verify their setup. */
export async function sendTestNotification(
  cfg: NotifyConfig,
): Promise<{ ok: boolean; error?: string }> {
  return sendPhoneAlert({ ...cfg, enabled: true, minWinProb: 0, notifyLong: true, notifyShort: true }, {
    symbol: "ES", direction: "LONG", price: 5234.5, winProb: 72,
    conviction: "HIGH", rsi: 42, macdBull: true, aboveVwap: true,
    assetType: "futures",
  });
}
