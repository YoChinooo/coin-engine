// ─── Scanner Loops ────────────────────────────────────────────────────────────

import { config, assetType } from "./config.js";
import { fetchQuote, fetchCandles, computeIndicators, calcWinProb } from "./marketData.js";
import { fetchEarlyCandidates } from "./earlyCrypto.js";
import { sendTradeAlert, sendEarlyAlert } from "./notify.js";

const rateLimitMap  = new Map(); // symbol → last-fired timestamp
const earlyRateMap  = new Map(); // coinId  → last-fired timestamp

function isRateLimited(key, limitMs = config.rateLimitMs) {
  const last = rateLimitMap.get(key) ?? 0;
  return Date.now() - last < limitMs;
}

function markFired(key) {
  rateLimitMap.set(key, Date.now());
}

// ─── Watchlist scanner ────────────────────────────────────────────────────────

export async function runWatchScan() {
  const symbols = config.watchSymbols;
  if (symbols.length === 0) return;

  console.log(`[watch] Scanning ${symbols.length} symbols…`);

  for (const sym of symbols) {
    if (isRateLimited(sym)) continue;

    try {
      await delay(400); // stagger API calls
      const [quote, candles] = await Promise.all([fetchQuote(sym), fetchCandles(sym)]);
      if (candles.length < 30) continue;

      const ind = computeIndicators(candles);

      // Simulate non-real-time scores (consistent seeded random)
      const seed = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const rnd  = (o) => { const x = Math.sin(seed + o) * 10000; return x - Math.floor(x); };

      const instScore  = clamp(45 + rnd(10) * 40, 5, 95);
      const sentScore  = clamp(38 + rnd(11) * 45 + (quote.changePct > 0 ? 8 : -5), 5, 95);
      const macroScore = clamp(38 + rnd(12) * 44, 5, 95);
      const aiScore    = clamp(42 + rnd(13) * 48, 5, 95);
      const asScore    = clamp(40 + rnd(14) * 45, 5, 95);

      const composite = Math.round(
        ind.techScore * 0.25 + ind.volScore * 0.20 + instScore * 0.15 +
        sentScore * 0.10 + macroScore * 0.10 + aiScore * 0.10 + asScore * 0.10
      );

      const direction = composite >= 58 ? "LONG" : composite <= 42 ? "SHORT" : "NEUTRAL";
      if (direction === "NEUTRAL") continue;

      const isLong    = direction === "LONG";
      const winProb   = calcWinProb(composite, ind, isLong);
      const convNum   = Math.abs(composite - 50);
      const conviction = convNum >= 15 ? "HIGH" : convNum >= 8 ? "MEDIUM" : "LOW";

      if (conviction === "LOW" && winProb < 68) continue;
      if (winProb < config.minWinProb) continue;

      markFired(sym);
      console.log(`[watch] 🔔 ${sym} ${direction} | win:${winProb}% | ${conviction}`);

      await sendTradeAlert({
        symbol: sym, direction, price: quote.price, winProb, conviction,
        rsi: ind.rsi, macdBull: ind.macd.histogram > 0,
        aboveVwap: ind.aboveVwap, type: assetType(sym),
      });

    } catch (err) {
      console.warn(`[watch] ${sym} error:`, err.message);
    }
  }
}

// ─── Early crypto scanner ─────────────────────────────────────────────────────
// earlyRateMap persists in memory between 5-min scan cycles.
// Railway container restarts are infrequent (minutes between restarts at most),
// so in-memory is fine for the backend; the 4h cooldown prevents burst re-fires.
const EARLY_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function runEarlyScan() {
  if (!config.notifyEarlyCrypto) return;

  console.log("[early] Scanning meme / early-action coins…");
  try {
    const candidates = await fetchEarlyCandidates(true); // always force fresh
    let fired = 0;

    for (const coin of candidates) {
      if (coin.earlyScore < config.earlyScoreThreshold) break; // sorted desc

      // Freshness gate: must be actively pumping RIGHT NOW (positive 1h)
      if (coin.change1h <= 0.5) continue;
      // Skip if it's already crashed from its 24h high (negative 1h + big 24h = dead cat)
      if (coin.change1h < -3 && coin.change24h > 20) continue;

      const key = `early_${coin.id}`;
      const lastFired = earlyRateMap.get(key) ?? 0;
      if (Date.now() - lastFired < EARLY_COOLDOWN_MS) continue; // 4h cooldown

      earlyRateMap.set(key, Date.now());
      console.log(`[early] 🚀 ${coin.symbol} score:${coin.earlyScore}% 1h:${coin.change1h.toFixed(1)}% 24h:${coin.change24h.toFixed(1)}%`);

      await sendEarlyAlert({
        symbol: coin.symbol, name: coin.name, earlyScore: coin.earlyScore,
        price: coin.price, change24h: coin.change24h, change1h: coin.change1h,
        marketCap: coin.marketCap, trendingRank: coin.trendingRank,
      });

      fired++;
    }

    console.log(`[early] Done — ${fired} alert(s) fired (${candidates.length} coins scanned)`);
  } catch (err) {
    console.error("[early] Scan error:", err.message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
