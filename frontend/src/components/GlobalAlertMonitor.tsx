/**
 * GlobalAlertMonitor
 *
 * Renders nothing — just runs a persistent background loop that:
 *  1. Reads favorites + notify config from localStorage every 90s
 *  2. Fetches live quote + 5m candles + indicators for each favorite
 *  3. When a HIGH-conviction or high win-prob signal is detected:
 *     - Fires a browser desktop notification
 *     - POSTs to ntfy.sh / Telegram (if configured)
 *     - Appends to the in-app alert log (localStorage)
 *
 * Mounted in App.tsx so it keeps running regardless of which page is open.
 */

import { useEffect, useRef, useCallback } from "react";
import { fetchCandles, fetchQuote, computeIndicators } from "../services/marketData";
import {
  loadNotifyConfig, sendPhoneAlert, sendEarlyAlert, loadAlertsEnabled,
} from "../services/phoneNotify";
import type { TradeAlert } from "../services/phoneNotify";
import { fetchEarlyCandidates, pennyToEarlyCandidate } from "../services/earlyCrypto";
import { fetchPennyCoins } from "../services/coingecko";

const FAV_KEY   = "coinEngine_favFutures";
const ALERT_KEY = "coinEngine_alerts";

function loadFavs(): string[] {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]"); } catch { return []; }
}

function calcWinProb(composite: number, ind: ReturnType<typeof computeIndicators>, isLong: boolean): number {
  const { rsi, macd, bb, aboveVwap, sma20, sma50 } = ind;
  let pts = 0;
  pts += isLong ? (rsi < 35 ? 8 : rsi < 50 ? 4 : rsi > 65 ? -4 : 0) : (rsi > 65 ? 8 : rsi > 50 ? 4 : rsi < 35 ? -4 : 0);
  pts += isLong ? (macd.histogram > 0 ? 7 : -5) : (macd.histogram < 0 ? 7 : -5);
  pts += isLong ? (macd.macd > macd.signal ? 4 : -2) : (macd.macd < macd.signal ? 4 : -2);
  pts += isLong ? (bb.pct < 0.25 ? 6 : bb.pct > 0.8 ? -4 : 0) : (bb.pct > 0.75 ? 6 : bb.pct < 0.2 ? -4 : 0);
  pts += isLong ? (aboveVwap ? 5 : -3) : (!aboveVwap ? 5 : -3);
  pts += isLong ? (sma20 > sma50 ? 4 : -2) : (sma20 < sma50 ? 4 : -2);
  const base = isLong ? 40 + (composite - 50) * 0.5 : 40 + (50 - composite) * 0.5;
  return Math.min(88, Math.max(28, Math.round(base + pts)));
}

function appendAlert(entry: object) {
  try {
    const existing = JSON.parse(localStorage.getItem(ALERT_KEY) ?? "[]");
    localStorage.setItem(ALERT_KEY, JSON.stringify([entry, ...existing].slice(0, 100)));
    // Dispatch storage event so FuturesScannerPage can react
    window.dispatchEvent(new StorageEvent("storage", { key: ALERT_KEY }));
  } catch { /**/ }
}

const INTERVAL_MS       = 90_000;          // favorites check every 90s
const RATE_LIMIT_MS     = 10 * 60 * 1000;  // favorites: once per 10 min per symbol
const EARLY_INTERVAL_MS = 5 * 60 * 1000;   // early scan every 5 min

// ── Early alert cooldown — persisted across page reloads ──────────────────────
// Without this, every refresh re-fires the same coins.
const EARLY_FIRED_KEY   = "coinEngine_earlyFiredAt";
const EARLY_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours per coin

function getEarlyFiredMap(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(EARLY_FIRED_KEY) ?? "{}"); } catch { return {}; }
}
function setEarlyFiredMap(map: Record<string, number>) {
  try { localStorage.setItem(EARLY_FIRED_KEY, JSON.stringify(map)); } catch {}
}
function wasRecentlyFired(coinId: string): boolean {
  const map = getEarlyFiredMap();
  return !!map[coinId] && (Date.now() - map[coinId] < EARLY_COOLDOWN_MS);
}
function markFired(coinId: string) {
  const map = getEarlyFiredMap();
  map[coinId] = Date.now();
  // Prune entries older than 48h to keep storage clean
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  for (const k of Object.keys(map)) {
    if (map[k] < cutoff) delete map[k];
  }
  setEarlyFiredMap(map);
}

const EARLY_ALERT_KEY = "coinEngine_earlyAlerts";

function appendEarlyAlert(entry: object) {
  try {
    const existing = JSON.parse(localStorage.getItem(EARLY_ALERT_KEY) ?? "[]");
    localStorage.setItem(EARLY_ALERT_KEY, JSON.stringify([entry, ...existing].slice(0, 50)));
    window.dispatchEvent(new StorageEvent("storage", { key: EARLY_ALERT_KEY }));
  } catch { /**/ }
}

export function GlobalAlertMonitor() {
  const lastFired  = useRef<Record<string, number>>({});
  const abortRef   = useRef(false);

  const runCheck = useCallback(async () => {
    const enabled = loadAlertsEnabled();
    if (!enabled) return;

    const favs = loadFavs();
    if (favs.length === 0) return;

    const cfg = loadNotifyConfig();

    for (const sym of favs) {
      if (abortRef.current) break;

      // rate-limit per symbol
      const now = Date.now();
      if (lastFired.current[sym] && now - lastFired.current[sym] < RATE_LIMIT_MS) continue;

      try {
        await new Promise(r => setTimeout(r, 400)); // stagger
        const [quote, candles] = await Promise.all([fetchQuote(sym), fetchCandles(sym, "5m")]);
        const ind = computeIndicators(candles);

        // Quick composite (same weights as main analysis, with neutral sim scores)
        const s = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
        const rnd = (o: number) => { const x = Math.sin(s + o) * 10_000; return x - Math.floor(x); };
        const instScore  = Math.round(Math.max(5, Math.min(95, 45 + rnd(10) * 40)));
        const sentScore  = Math.round(Math.max(5, Math.min(95, 38 + rnd(11) * 45 + (quote.changePct > 0 ? 8 : -5))));
        const macroScore = Math.round(Math.max(5, Math.min(95, 38 + rnd(12) * 44)));
        const aiScore    = Math.round(Math.max(5, Math.min(95, 42 + rnd(13) * 48)));
        const asScore    = Math.round(Math.max(5, Math.min(95, 40 + rnd(14) * 45)));
        const composite  = Math.round(
          ind.techScore * 0.25 + ind.volScore * 0.20 + instScore * 0.15 +
          sentScore * 0.10 + macroScore * 0.10 + aiScore * 0.10 + asScore * 0.10,
        );

        const direction = composite >= 58 ? "LONG" : composite <= 42 ? "SHORT" : "NEUTRAL";
        if (direction === "NEUTRAL") continue;

        const isLong  = direction === "LONG";
        const winProb = calcWinProb(composite, ind, isLong);
        const convictionNum = Math.abs(composite - 50);
        const conviction = convictionNum >= 15 ? "HIGH" : convictionNum >= 8 ? "MEDIUM" : "LOW";

        // Only fire on strong signals
        if (conviction === "LOW" && winProb < 68) continue;
        if (winProb < (cfg.minWinProb || 65)) continue;

        lastFired.current[sym] = now;

        const alertEntry = {
          id: `${sym}_${now}`, symbol: sym, direction, conviction,
          price: quote.price, winProb, ts: new Date().toISOString(), seen: false,
        };

        // 1. In-app alert log
        appendAlert(alertEntry);

        // 2. Browser desktop notification
        if (Notification.permission === "granted") {
          const emoji = isLong ? "📈" : "📉";
          new Notification(`${emoji} ${sym} ${direction} Signal`, {
            body: `Entry $${quote.price.toFixed(2)} · Win prob: ${winProb}% · ${conviction} conviction`,
            icon: "/favicon.ico",
            tag: `coinengine-${sym}`,
            requireInteraction: winProb >= 70,
          });
        }

        // 3. Phone notification (ntfy / Telegram)
        const tradeAlert: TradeAlert = {
          symbol: sym, direction: direction as "LONG" | "SHORT",
          price: quote.price, winProb, conviction,
          rsi: ind.rsi, macdBull: ind.macd.histogram > 0,
          aboveVwap: ind.aboveVwap,
          assetType: sym.endsWith("=F") || ["ES","NQ","CL","GC","SI","ZB","NG"].includes(sym)
            ? "futures" : ["BTC","ETH","SOL","BNB","XRP","DOGE"].includes(sym) ? "crypto" : "stock",
        };
        const result = await sendPhoneAlert(cfg, tradeAlert);
        if (!result.ok && result.error) {
          console.warn("[GlobalAlertMonitor] phone notify failed:", result.error);
        }

      } catch { /* skip on API error */ }
    }
  }, []);

  // ── Early Crypto Scanner ─────────────────────────────────────────────────────
  const runEarlyCheck = useCallback(async () => {
    const enabled = loadAlertsEnabled();
    if (!enabled) return;

    const cfg = loadNotifyConfig();
    if (!cfg.notifyEarlyCrypto) return;

    const threshold = cfg.earlyScoreThreshold ?? 80;

    try {
      // forceRefresh=true: always fetch fresh data, never use 3-min cache for alerts
      const [earlyCandidates, pennyCoins] = await Promise.allSettled([
        fetchEarlyCandidates(true),
        fetchPennyCoins(),
      ]);

      // Merge penny scanner high-scorers into early candidates
      const base = earlyCandidates.status === "fulfilled" ? earlyCandidates.value : [];
      const pennyExtra = pennyCoins.status === "fulfilled"
        ? pennyCoins.value
            .filter(c => c.earlyScore >= (cfg.earlyScoreThreshold ?? 80))
            .map(pennyToEarlyCandidate)
        : [];

      // Dedupe: penny coin wins if same id already exists with lower score
      const merged = new Map(base.map(c => [c.id, c]));
      for (const c of pennyExtra) {
        const ex = merged.get(c.id);
        if (!ex || c.earlyScore > ex.earlyScore) merged.set(c.id, c);
      }
      const candidates = [...merged.values()].sort((a, b) => b.earlyScore - a.earlyScore);

      for (const coin of candidates) {
        if (abortRef.current) break;
        if (coin.earlyScore < threshold) break; // sorted desc

        // ── Freshness gate: coin must be ACTIVELY moving right now ──────────
        // If 1h change <= 0 the move is cooling off — skip until it's fresh again
        if (coin.change1h <= 0.5) continue;
        // If 24h > 500% it's already exploded and likely retracing — skip
        if (coin.change24h > 500) continue;

        // ── Persistent cooldown (survives page refresh) ──────────────────────
        if (wasRecentlyFired(coin.id)) continue;
        markFired(coin.id);

        const now = Date.now();
        const entry = {
          id: `early_${coin.id}_${now}`,
          type: "EARLY",
          symbol: coin.symbol,
          name: coin.name,
          image: coin.image,
          earlyScore: coin.earlyScore,
          price: coin.price,
          change24h: coin.change24h,
          change1h: coin.change1h,
          marketCap: coin.marketCap,
          trendingRank: coin.trendingRank,
          isMeme: coin.isMeme,
          ts: new Date().toISOString(),
          seen: false,
        };

        // 1. In-app alert
        appendEarlyAlert(entry);

        // 2. Browser desktop notification
        if (Notification.permission === "granted") {
          const trending = coin.trendingRank > 0 ? ` · 🔥 Trending #${coin.trendingRank}` : "";
          new Notification(`🚀 EARLY ACTION: ${coin.symbol} — Score ${coin.earlyScore}%`, {
            body: `${coin.name}  24h: ${coin.change24h >= 0 ? "+" : ""}${coin.change24h.toFixed(1)}%${trending}`,
            icon: coin.image || "/favicon.ico",
            tag: `coinengine-early-${coin.id}`,
            requireInteraction: true,
          });
        }

        // 3. Phone notification
        const result = await sendEarlyAlert(cfg, {
          symbol: coin.symbol,
          name: coin.name,
          earlyScore: coin.earlyScore,
          price: coin.price,
          change24h: coin.change24h,
          change1h: coin.change1h,
          marketCap: coin.marketCap,
          trendingRank: coin.trendingRank,
        });

        if (!result.ok && result.error && !result.error.startsWith("Early crypto") && !result.error.startsWith("Alerts")) {
          console.warn("[GlobalAlertMonitor] early phone notify failed:", result.error);
        }
      }
    } catch (err) {
      console.warn("[GlobalAlertMonitor] early crypto scan error:", err);
    }
  }, []);

  useEffect(() => {
    abortRef.current = false;
    // First check after 5s (give page time to load)
    const initial = setTimeout(runCheck, 5_000);
    const iv = setInterval(runCheck, INTERVAL_MS);
    return () => { abortRef.current = true; clearTimeout(initial); clearInterval(iv); };
  }, [runCheck]);

  // Early crypto scanner — runs every 5 min
  useEffect(() => {
    const initial = setTimeout(runEarlyCheck, 8_000); // first run after 8s
    const iv = setInterval(runEarlyCheck, EARLY_INTERVAL_MS);
    return () => { clearTimeout(initial); clearInterval(iv); };
  }, [runEarlyCheck]);

  // Re-run immediately when localStorage changes (e.g., favorites updated, alerts toggled)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "coinEngine_favFutures" || e.key === "coinEngine_alertsEnabled") {
        runCheck();
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [runCheck]);

  return null; // renders nothing
}
