// ─── Phone Notification Senders ───────────────────────────────────────────────

import axios from "axios";
import { config } from "./config.js";

// ─── ntfy ─────────────────────────────────────────────────────────────────────

export async function sendNtfy(title, message, priority = 4, tags = ["chart_with_upwards_trend", "bell"]) {
  const server = (config.ntfyServer || "https://ntfy.sh").replace(/\/$/, "");
  const topic  = config.ntfyTopic.trim();
  if (!topic) { console.warn("[notify] ntfy: no topic configured"); return false; }

  try {
    const res = await axios.post(`${server}/`, {
      topic, title, message, priority, tags,
    }, {
      headers: { "Content-Type": "application/json" },
      timeout: 8000,
    });
    return res.status >= 200 && res.status < 300;
  } catch (err) {
    console.error("[notify] ntfy error:", err?.response?.status ?? err.message);
    return false;
  }
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

export async function sendTelegram(text) {
  const { telegramToken, telegramChatId } = config;
  if (!telegramToken || !telegramChatId) {
    console.warn("[notify] Telegram: missing token or chat ID");
    return false;
  }
  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${telegramToken}/sendMessage`,
      { chat_id: telegramChatId, text, parse_mode: "HTML" },
      { timeout: 8000 },
    );
    return res.data?.ok === true;
  } catch (err) {
    console.error("[notify] Telegram error:", err?.response?.data?.description ?? err.message);
    return false;
  }
}

// ─── High-level alert senders ─────────────────────────────────────────────────

/** Send a trade signal alert (LONG / SHORT on a watched symbol) */
export async function sendTradeAlert({ symbol, direction, price, winProb, conviction, rsi, macdBull, aboveVwap, type }) {
  if (config.provider === "none") return;
  if (direction === "LONG"  && !config.notifyLong)  return;
  if (direction === "SHORT" && !config.notifyShort) return;
  if (winProb < config.minWinProb) return;

  const emoji = direction === "LONG" ? "📈" : "📉";
  const fmtPrice = price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const title   = `${emoji} ${symbol} ${direction} — ${winProb}% win prob`;
  const message =
    `Entry at $${fmtPrice}\n` +
    `Conviction: ${conviction} · ${type}\n` +
    `RSI ${rsi.toFixed(0)} · MACD ${macdBull ? "bullish ↑" : "bearish ↓"} · ${aboveVwap ? "Above VWAP" : "Below VWAP"}`;

  if (config.provider === "ntfy") {
    const priority = winProb >= 75 ? 5 : winProb >= 65 ? 4 : 3;
    await sendNtfy(title, message, priority);
  } else if (config.provider === "telegram") {
    const msg =
      `<b>${emoji} ${symbol} ${direction}</b>\n` +
      `Win probability: <b>${winProb}%</b>\n` +
      `Entry: <code>$${fmtPrice}</code>\n` +
      `Conviction: ${conviction} · ${type}\n` +
      `RSI ${rsi.toFixed(0)} · MACD ${macdBull ? "▲" : "▼"} · VWAP ${aboveVwap ? "above ✓" : "below ✗"}`;
    await sendTelegram(msg);
  }
}

/** Send an early-action meme coin alert */
export async function sendEarlyAlert({ symbol, name, earlyScore, price, change24h, change1h, marketCap, trendingRank }) {
  if (config.provider === "none") return;
  if (!config.notifyEarlyCrypto) return;
  if (earlyScore < config.earlyScoreThreshold) return;

  const chSign = change24h >= 0 ? "+" : "";
  const fmtPrice = price < 0.01
    ? price.toFixed(8)
    : price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  const mcap = marketCap >= 1e9 ? `$${(marketCap/1e9).toFixed(2)}B`
             : marketCap >= 1e6 ? `$${(marketCap/1e6).toFixed(1)}M`
             : `$${(marketCap/1e3).toFixed(0)}K`;
  const trending = trendingRank > 0 ? ` · 🔥 Trending #${trendingRank}` : "";

  const title   = `🚀 EARLY ACTION: ${symbol} — Score ${earlyScore}%`;
  const message =
    `${name} · $${fmtPrice}\n` +
    `24h: ${chSign}${change24h.toFixed(1)}%  1h: ${change1h >= 0 ? "+" : ""}${change1h.toFixed(1)}%\n` +
    `Market cap: ${mcap}${trending}`;

  if (config.provider === "ntfy") {
    await sendNtfy(title, message, 5, ["rocket", "bell"]);
  } else if (config.provider === "telegram") {
    const msg =
      `<b>🚀 EARLY ACTION: ${symbol}</b>\n` +
      `Early Score: <b>${earlyScore}%</b>\n` +
      `Price: <code>$${fmtPrice}</code>\n` +
      `24h: ${chSign}${change24h.toFixed(1)}%  1h: ${change1h >= 0 ? "+" : ""}${change1h.toFixed(1)}%\n` +
      `Market cap: ${mcap}${trending ? "\n" + trending.trim() : ""}`;
    await sendTelegram(msg);
  }
}
