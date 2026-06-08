import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  ComposedChart, Area, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import {
  Upload, Search, X, TrendingUp, TrendingDown, Target, Shield,
  Activity, BarChart2, Brain, Zap, AlertTriangle, ChevronDown, ChevronUp,
  RefreshCw, Clock, Wifi, WifiOff, Star, Bell, BellOff, CheckCircle,
  ArrowUpCircle, ArrowDownCircle, Percent, Smartphone,
} from "lucide-react";
import {
  fetchCandles, fetchQuote, computeIndicators, toYahooTicker,
} from "../services/marketData";
import type { Candle, Quote, Indicators } from "../services/marketData";
import { loadAlertsEnabled, saveAlertsEnabled } from "../services/phoneNotify";
import { PhoneNotifySettings } from "../components/PhoneNotifySettings";
import { fetchMarketIntelligence } from "../services/insiderData";
import type { MarketIntelligence } from "../services/insiderData";
import { fetchEarlyCandidates, fmtMcap, fmtCryptoPrice } from "../services/earlyCrypto";
import type { EarlyCandidate } from "../services/earlyCrypto";

// ─── Timeframe config ─────────────────────────────────────────────────────────

type TF = "1m" | "5m" | "15m" | "1h" | "4h" | "1D";
const TF_CONFIG: Record<TF, { label: string; refreshMs: number }> = {
  "1m":  { label: "1 Min",  refreshMs: 10_000  },
  "5m":  { label: "5 Min",  refreshMs: 20_000  },
  "15m": { label: "15 Min", refreshMs: 30_000  },
  "1h":  { label: "1 Hour", refreshMs: 60_000  },
  "4h":  { label: "4 Hour", refreshMs: 120_000 },
  "1D":  { label: "Daily",  refreshMs: 300_000 },
};

type AssetType = "futures" | "stock" | "crypto";
type Direction = "LONG" | "SHORT" | "NEUTRAL";
type Conviction = "HIGH" | "MEDIUM" | "LOW";

interface ModuleScore {
  name: string; weight: number; score: number;
  signal: "bullish" | "bearish" | "neutral"; findings: string[];
}
interface TradeSetup {
  direction: Direction; conviction: Conviction;
  entryLimit: number;   // precise limit order entry price
  entryLow: number; entryHigh: number; stopLoss: number;
  target1: number; target2: number; target3: number;
  rr1: string; rr2: string; rr3: string;
  riskDollar: number;   // $ risk per unit
  atrValue: number;     // ATR used for calculation
  strategy: string; reasoning: string[]; warnings: string[];
  dayTradingChecklist: { label: string; pass: boolean }[];
}
interface Analysis {
  symbol: string; yahooTicker: string; assetType: AssetType;
  compositeScore: number; direction: Direction; conviction: Conviction;
  modules: ModuleScore[]; setup: TradeSetup; indicators: Indicators;
  intel?: MarketIntelligence;
  cot?: { commercial: number; nonCommercial: number };
  openInterest?: number; vixLevel?: number;
  optionsFlow?: { calls: number; puts: number; ratio: number; unusualActivity: boolean };
  darkPool?: { pct: number; direction: string };
  shortInterest?: number; insiderActivity?: string;
}

// ─── Favorites ────────────────────────────────────────────────────────────────

const FAV_KEY   = "coinEngine_favFutures";
const ALERT_KEY = "coinEngine_alerts";

function loadFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]"); } catch { return []; }
}
function saveFavorites(favs: string[]) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

// ─── In-app alert feed ────────────────────────────────────────────────────────

interface AlertEntry {
  id: string; symbol: string; direction: Direction; conviction: Conviction;
  price: number; winProb: number; ts: Date; seen: boolean;
}

function loadAlerts(): AlertEntry[] {
  try {
    return (JSON.parse(localStorage.getItem(ALERT_KEY) ?? "[]") as any[])
      .map(a => ({ ...a, ts: new Date(a.ts) })).slice(0, 50);
  } catch { return []; }
}
function saveAlerts(alerts: AlertEntry[]) {
  localStorage.setItem(ALERT_KEY, JSON.stringify(alerts.slice(0, 50)));
}

// ─── Win probability ──────────────────────────────────────────────────────────

function calcWinProb(compositeScore: number, indicators: Indicators, dir: Direction): number {
  if (dir === "NEUTRAL") return 50;
  const isLong = dir === "LONG";

  const {
    rsi, macd, bb, aboveVwap, sma20, sma50,
    ema9, ema21, stoch, adx, roc10, buyPressure,
    divergence, ema9CrossUp, ema9CrossDown, volumeRatio,
  } = indicators;

  let pts = 0;

  // RSI position (8 pts)
  pts += isLong ? (rsi < 30 ? 8 : rsi < 45 ? 5 : rsi > 70 ? -6 : rsi > 60 ? -2 : 1)
                : (rsi > 70 ? 8 : rsi > 55 ? 5 : rsi < 30 ? -6 : rsi < 40 ? -2 : 1);
  // MACD (10 pts)
  pts += isLong ? (macd.histogram > 0 ? 7 : -6) : (macd.histogram < 0 ? 7 : -6);
  pts += isLong ? (macd.macd > macd.signal ? 3 : -2) : (macd.macd < macd.signal ? 3 : -2);
  // Stochastic (7 pts)
  pts += isLong ? (stoch.k < 25 ? 7 : stoch.k < 50 && stoch.k > stoch.d ? 3 : stoch.k > 80 ? -5 : 0)
                : (stoch.k > 75 ? 7 : stoch.k > 50 && stoch.k < stoch.d ? 3 : stoch.k < 20 ? -5 : 0);
  // EMA cross — strongest signal (10 pts)
  if (isLong  && ema9CrossUp)   pts += 10;
  if (!isLong && ema9CrossDown) pts += 10;
  if (isLong  && ema9CrossDown) pts -= 8;
  if (!isLong && ema9CrossUp)   pts -= 8;
  // EMA stack (6 pts)
  pts += isLong ? (ema9 > ema21 ? 4 : -3) : (ema9 < ema21 ? 4 : -3);
  pts += isLong ? (ema9 > ema21 && ema21 > sma50 ? 2 : 0) : (ema9 < ema21 && ema21 < sma50 ? 2 : 0);
  // VWAP (5 pts)
  pts += isLong ? (aboveVwap ? 5 : -4) : (!aboveVwap ? 5 : -4);
  // SMA alignment (3 pts)
  pts += isLong ? (sma20 > sma50 ? 3 : -2) : (sma20 < sma50 ? 3 : -2);
  // BB position (4 pts)
  pts += isLong ? (bb.pct < 0.2 ? 4 : bb.pct > 0.85 ? -3 : 0) : (bb.pct > 0.8 ? 4 : bb.pct < 0.15 ? -3 : 0);
  // ADX boost: trending market makes signals more reliable
  if (adx > 30) pts = Math.round(pts * 1.15);
  // ROC confirms
  pts += isLong ? (roc10 > 2 ? 3 : roc10 < -2 ? -3 : 0) : (roc10 < -2 ? 3 : roc10 > 2 ? -3 : 0);
  // Buy pressure
  pts += isLong ? (buyPressure > 60 ? 3 : buyPressure < 40 ? -3 : 0)
                : (buyPressure < 40 ? 3 : buyPressure > 60 ? -3 : 0);
  // Volume confirmation
  pts += volumeRatio > 1.5 ? 3 : volumeRatio < 0.7 ? -2 : 0;
  // Divergence
  if (divergence === "BULLISH_DIV" && isLong)   pts += 6;
  if (divergence === "BEARISH_DIV" && !isLong)  pts += 6;
  if (divergence === "BULLISH_DIV" && !isLong)  pts -= 4;
  if (divergence === "BEARISH_DIV" && isLong)   pts -= 4;

  const base = isLong ? 40 + (compositeScore - 50) * 0.45 : 40 + (50 - compositeScore) * 0.45;
  return Math.min(91, Math.max(25, Math.round(base + pts)));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtP(n: number): string {
  if (!isFinite(n) || isNaN(n)) return "—";
  if (n >= 10000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1000)  return n.toFixed(2);
  if (n >= 10)    return n.toFixed(3);
  if (n >= 0.1)   return n.toFixed(4);
  return n.toFixed(6);
}

function scoreColor(score: number, asText = true) {
  return score >= 65 ? (asText ? "text-emerald-400" : "bg-emerald-500") :
         score <= 35 ? (asText ? "text-red-400"     : "bg-red-500")     :
                       (asText ? "text-yellow-400"  : "bg-yellow-500");
}
function signalBadge(sig: "bullish" | "bearish" | "neutral") {
  return sig === "bullish" ? "bg-emerald-500/20 text-emerald-400" :
         sig === "bearish" ? "bg-red-500/20 text-red-400" :
                             "bg-yellow-500/20 text-yellow-400";
}

function deterministicRand(s: number, offset: number) {
  const x = Math.sin(s + offset) * 10000;
  return x - Math.floor(x);
}

// ─── Build setup for given direction ─────────────────────────────────────────

function buildSetup(price: number, direction: Direction, assetType: AssetType,
                    conviction: Conviction, compositeScore: number,
                    indicators: Indicators, userContext: string): TradeSetup {
  const isLong = direction !== "SHORT";
  const fmt5 = (n: number) => parseFloat(n.toPrecision(8));

  // ── ATR-based stop loss (much more precise than fixed %) ──────────────────
  const { rsi, macd, bb, vwap, aboveVwap, sma20, sma50, atr, keyLevels } = indicators;
  const atrMultiplier = assetType === "futures" ? 1.2 : assetType === "crypto" ? 1.5 : 1.3;
  const atrStop = atr * atrMultiplier;

  // Entry: slightly better than market for limit order
  // Long: buy limit just below current price (wait for slight pullback)
  // Short: sell limit just above current price
  const entryOffset = assetType === "futures" ? 0.001 : 0.002;
  const entryLimit = fmt5(price * (isLong ? 1 - entryOffset : 1 + entryOffset));
  const entryLow   = fmt5(price * (isLong ? 0.997 : 1.001));
  const entryHigh  = fmt5(price * (isLong ? 1.002 : 0.999));

  // Stop loss: ATR-based, but also respect nearest swing level
  let rawStop = isLong ? entryLimit - atrStop : entryLimit + atrStop;
  // Adjust SL to just beyond nearest support/resistance for smarter placement
  if (isLong && keyLevels.support.length > 0) {
    const nearestSup = keyLevels.support[0];
    if (nearestSup < entryLimit && nearestSup > rawStop) {
      rawStop = nearestSup * (1 - 0.002); // 0.2% below the support
    }
  }
  if (!isLong && keyLevels.resistance.length > 0) {
    const nearestRes = keyLevels.resistance[0];
    if (nearestRes > entryLimit && nearestRes < rawStop) {
      rawStop = nearestRes * (1 + 0.002);
    }
  }
  const stopLoss = fmt5(rawStop);
  const riskDollar = Math.abs(entryLimit - stopLoss);

  // TP levels based on RR ratios (1:1, 1:2, 1:3)
  const t1 = fmt5(isLong ? entryLimit + riskDollar * 1.0 : entryLimit - riskDollar * 1.0);
  const t2 = fmt5(isLong ? entryLimit + riskDollar * 2.0 : entryLimit - riskDollar * 2.0);
  const t3 = fmt5(isLong ? entryLimit + riskDollar * 3.0 : entryLimit - riskDollar * 3.0);

  // Validate against key levels — push TPs to resistance/support if closer
  let target1 = t1, target2 = t2, target3 = t3;
  if (isLong && keyLevels.resistance.length > 0) {
    const [r1, r2, r3] = keyLevels.resistance;
    if (r1 && r1 > entryLimit && r1 < t2) target1 = fmt5(r1 * 0.999);
    if (r2 && r2 > t1 && r2 < t3)         target2 = fmt5(r2 * 0.999);
    if (r3 && r3 > t2)                     target3 = fmt5(r3 * 0.999);
  }
  if (!isLong && keyLevels.support.length > 0) {
    const [s1, s2, s3] = keyLevels.support;
    if (s1 && s1 < entryLimit && s1 > t2) target1 = fmt5(s1 * 1.001);
    if (s2 && s2 < t1 && s2 > t3)         target2 = fmt5(s2 * 1.001);
    if (s3 && s3 < t2)                     target3 = fmt5(s3 * 1.001);
  }

  const rr = (target: number) => riskDollar > 0
    ? (Math.abs(target - entryLimit) / riskDollar).toFixed(2) : "—";

  // ── Strategy selection ────────────────────────────────────────────────────
  const bbWidth = (bb.upper - bb.lower) / (bb.middle || 1);
  const isSqueeze = bbWidth < 0.03;
  const strategyKey =
    isSqueeze ? "Breakout Play (BB Squeeze)"
    : indicators.techScore > 65 && indicators.volScore > 60 ? "Trend Continuation"
    : rsi < 35 || rsi > 70 ? "Mean Reversion"
    : bb.pct > 0.85 || bb.pct < 0.15 ? "Breakout / Fade"
    : assetType === "futures" ? "Intraday Scalp / Day Trade"
    : assetType === "crypto" ? "Crypto Momentum"
    : "Swing Trade (2-5 days)";

  // ── Warnings ──────────────────────────────────────────────────────────────
  const warnings: string[] = [];
  if (conviction === "LOW") warnings.push("⚠️ Low conviction — reduce position size by 50%");
  if (isLong && rsi > 75) warnings.push(`⚠️ RSI ${rsi.toFixed(0)} — overbought, risk of pullback before continuation`);
  if (!isLong && rsi < 25) warnings.push(`⚠️ RSI ${rsi.toFixed(0)} — oversold, risk of bounce before continuation`);
  if (isLong && !aboveVwap) warnings.push("⚠️ Below VWAP — wait for reclaim before entering long");
  if (!isLong && aboveVwap) warnings.push("⚠️ Above VWAP — price may need to fail at VWAP before shorting");
  if (isLong && sma20 < sma50) warnings.push("⚠️ Death cross (SMA20 < SMA50) — trend is down, trade with extra care");
  if (!isLong && sma20 > sma50) warnings.push("⚠️ Golden cross (SMA20 > SMA50) — trend is up, shorting against trend");
  if (direction === "NEUTRAL") warnings.push("⚠️ AI signal NEUTRAL — range-bound market, widen TP/tighten SL");

  // ── Day trading checklist ─────────────────────────────────────────────────
  const dayTradingChecklist = [
    { label: "Volume confirms direction",          pass: indicators.volumeRatio > 1.1 },
    { label: isLong ? "Price above VWAP" : "Price below VWAP", pass: isLong ? aboveVwap : !aboveVwap },
    { label: isLong ? "MACD histogram positive" : "MACD histogram negative", pass: isLong ? macd.histogram > 0 : macd.histogram < 0 },
    { label: isLong ? "RSI not overbought (<70)" : "RSI not oversold (>30)", pass: isLong ? rsi < 70 : rsi > 30 },
    { label: isLong ? "SMA20 above SMA50" : "SMA20 below SMA50", pass: isLong ? sma20 > sma50 : sma20 < sma50 },
    { label: "No BB squeeze (avoid entry in range)", pass: !isSqueeze },
  ];

  const reasoning = [
    `${direction} setup — composite ${compositeScore}/100, conviction ${conviction}`,
    `ATR(14): $${atr.toFixed(4)} → SL ${atrMultiplier}× ATR below/above entry`,
    `RSI ${rsi.toFixed(1)} · MACD ${macd.histogram > 0 ? "+" : ""}${macd.histogram.toFixed(4)} · BB% ${(bb.pct*100).toFixed(0)}%`,
    `VWAP $${fmtP(vwap)} (${aboveVwap ? "price above ✓" : "price below ✗"}) · SMA20 ${sma20 > sma50 ? ">" : "<"} SMA50`,
    `Key support: ${keyLevels.support[0] ? "$" + fmtP(keyLevels.support[0]) : "none detected"} · Resistance: ${keyLevels.resistance[0] ? "$" + fmtP(keyLevels.resistance[0]) : "none detected"}`,
    `Strategy: ${strategyKey}`,
    ...(userContext ? [`Context: "${userContext.slice(0, 80)}"`] : []),
  ];

  return {
    direction, conviction, entryLimit, entryLow, entryHigh, stopLoss,
    target1, target2, target3,
    rr1: rr(target1), rr2: rr(target2), rr3: rr(target3),
    riskDollar, atrValue: atr,
    strategy: strategyKey, reasoning, warnings, dayTradingChecklist,
  };
}

// ─── Build full analysis ──────────────────────────────────────────────────────

async function buildAnalysis(
  symbol: string, assetType: AssetType, quote: Quote,
  indicators: Indicators, userContext: string,
): Promise<Analysis> {
  const sym = symbol.toUpperCase();

  // ── Context bias from user's notes ───────────────────────────────────────
  const contextBullish = /bull|long|buy|breakout|momentum|up|squeeze|oversold/i.test(userContext);
  const contextBearish = /bear|short|sell|breakdown|down|crash|overbought|resistance/i.test(userContext);
  const contextBias = contextBullish ? 8 : contextBearish ? -8 : 0;

  const {
    rsi, macd, bb, vwap, aboveVwap, sma20, sma50,
    ema9, ema21, stoch, adx, roc10, buyPressure, divergence,
    aboveEma9, aboveEma21, ema9CrossUp, ema9CrossDown,
    atr, keyLevels, volumeRatio, avgVolume20,
    techScore: rawTech, volScore: rawVol,
    momentumScore: rawMomentum, structureScore: rawStructure,
  } = indicators;
  const price = quote.price;

  // ── 1. TECHNICAL ANALYSIS — RSI + MACD + BB + VWAP + EMA ────────────────
  const techScore = Math.max(5, Math.min(95, rawTech + contextBias));

  const bbWidth  = bb.upper > 0 ? (bb.upper - bb.lower) / bb.middle : 0;
  const isSqueeze = bbWidth < 0.02;
  const techFindings = [
    `RSI(14): ${rsi.toFixed(1)} ${rsi > 70 ? "⚠ OVERBOUGHT — reversal risk" : rsi < 30 ? "✅ OVERSOLD — bounce zone" : rsi > 55 ? "— bullish momentum" : rsi < 45 ? "— bearish bias" : "— neutral"}`,
    `Stoch %K: ${stoch.k.toFixed(0)} / %D: ${stoch.d.toFixed(0)} — ${stoch.signal === "OVERSOLD" ? "✅ OVERSOLD — buy signal" : stoch.signal === "OVERBOUGHT" ? "⚠ OVERBOUGHT — fade risk" : stoch.k > stoch.d ? "bullish cross" : "bearish cross"}`,
    `MACD Histogram: ${macd.histogram >= 0 ? "+" : ""}${macd.histogram.toFixed(5)} — ${macd.histogram > 0 ? "bullish pressure" : "bearish pressure"}${macd.macd > macd.signal ? " | line > signal ✅" : " | line < signal ⚠"}`,
    `Bollinger Band: price at ${(bb.pct * 100).toFixed(0)}% of band${isSqueeze ? " 🔥 SQUEEZE — breakout imminent" : bb.pct < 0.15 ? " — near lower, long bias" : bb.pct > 0.85 ? " — near upper, fading risk" : ""}`,
    `BB Levels: $${fmtP(bb.lower)} | $${fmtP(bb.middle)} | $${fmtP(bb.upper)}`,
    `VWAP: $${fmtP(vwap)} — price is ${aboveVwap ? "ABOVE ✅ (buyers in control)" : "BELOW ⚠ (sellers in control)"}`,
    `EMA9/21: $${fmtP(ema9)} / $${fmtP(ema21)} — ${ema9 > ema21 ? "✅ bullish stack" : "⚠ bearish stack"}${ema9CrossUp ? " 🔥 GOLDEN CROSS just occurred" : ema9CrossDown ? " ❌ DEATH CROSS just occurred" : ""}`,
    `SMA20: $${fmtP(sma20)} | SMA50: $${fmtP(sma50)} — ${sma20 > sma50 ? "golden alignment" : "bearish alignment"}`,
    ...(divergence !== "NONE" ? [`🔍 ${divergence === "BULLISH_DIV" ? "BULLISH DIVERGENCE — price lower low, RSI higher low (reversal signal)" : "BEARISH DIVERGENCE — price higher high, RSI lower high (reversal signal)"}`] : []),
  ];

  // ── 2. MOMENTUM — ROC + MACD + Stoch + EMA cross ─────────────────────────
  const momentumScore = Math.max(5, Math.min(95, rawMomentum + contextBias));

  const momentumFindings = [
    `Momentum Score: ${momentumScore}/100`,
    `Rate of Change (10 bars): ${roc10 >= 0 ? "+" : ""}${roc10.toFixed(2)}% — ${Math.abs(roc10) > 3 ? (roc10 > 0 ? "strong bullish momentum" : "strong bearish momentum") : "moderate momentum"}`,
    `MACD crossover: ${macd.macd > macd.signal ? "✅ bullish (MACD > signal)" : "⚠ bearish (MACD < signal)"}`,
    `Stochastic momentum: %K ${stoch.k.toFixed(0)} ${stoch.k > stoch.d ? "crossing up (buy pressure)" : "crossing down (sell pressure)"}`,
    `EMA9 vs EMA21: ${ema9CrossUp ? "🔥 JUST CROSSED UP — strong entry signal" : ema9CrossDown ? "❌ JUST CROSSED DOWN — short signal" : ema9 > ema21 ? "above (bullish bias)" : "below (bearish bias)"}`,
    ...(divergence !== "NONE" ? [`Divergence: ${divergence === "BULLISH_DIV" ? "🔼 BULLISH — contrarian long opportunity" : "🔽 BEARISH — contrarian short opportunity"}`] : []),
    `ADX(14): ${adx.toFixed(0)} — ${adx > 50 ? "very strong trend" : adx > 35 ? "strong trend" : adx > 25 ? "trending" : "weak/ranging — CAUTION"}`,
  ];

  // ── 3. STRUCTURE — VWAP + EMA stack + SMA + ADX ──────────────────────────
  const structureScore = Math.max(5, Math.min(95, rawStructure + contextBias));

  const prevDayNote = keyLevels.prevDayHigh > 0
    ? `Prev day H/L: $${fmtP(keyLevels.prevDayHigh)} / $${fmtP(keyLevels.prevDayLow)}`
    : null;
  const structureFindings = [
    `Structure Score: ${structureScore}/100 (ADX: ${adx.toFixed(0)} — ${adx > 25 ? "trending market" : "range-bound market"})`,
    `Price vs VWAP: ${aboveVwap ? "✅ above" : "⚠ below"} · vs EMA9: ${aboveEma9 ? "✅ above" : "⚠ below"} · vs EMA21: ${aboveEma21 ? "✅ above" : "⚠ below"}`,
    `EMA Stack: ${ema9 > ema21 && ema21 > sma50 ? "✅ BULLISH STACK (EMA9 > EMA21 > SMA50) — ideal long setup" : ema9 < ema21 && ema21 < sma50 ? "❌ BEARISH STACK (EMA9 < EMA21 < SMA50) — ideal short setup" : "Mixed — partial alignment"}`,
    `Buy pressure (20-bar vol-weighted): ${buyPressure.toFixed(0)}% ${buyPressure > 60 ? "✅ buyers dominant" : buyPressure < 40 ? "⚠ sellers dominant" : "balanced"}`,
    `Key resistance: ${keyLevels.resistance[0] ? "$" + fmtP(keyLevels.resistance[0]) : "none in range"} · support: ${keyLevels.support[0] ? "$" + fmtP(keyLevels.support[0]) : "none in range"}`,
    ...(prevDayNote ? [prevDayNote] : []),
    `Volume ratio: ${volumeRatio.toFixed(2)}× avg — ${volumeRatio > 2 ? "🔥 extreme surge" : volumeRatio > 1.5 ? "elevated (confirm breakout)" : volumeRatio > 1 ? "slightly above avg" : "below avg — low conviction"}`,
  ];

  // ── 4. VOLUME & ORDER FLOW ────────────────────────────────────────────────
  const volScore = Math.max(5, Math.min(95, rawVol + contextBias * 0.5));

  const rangeAsPct = quote.prevClose > 0 ? ((quote.high - quote.low) / quote.prevClose * 100) : 0;
  const volFindings = [
    `Volume Score: ${volScore}/100`,
    `Volume ratio: ${volumeRatio.toFixed(2)}× 20-bar average ${volumeRatio > 1.5 ? "✅ elevated — confirms signal" : "— wait for volume confirmation"}`,
    `Buy pressure (vol-weighted): ${buyPressure.toFixed(0)}% buying vs ${(100 - buyPressure).toFixed(0)}% selling`,
    `Avg daily volume (20-bar): ${Math.round(avgVolume20).toLocaleString()} · Today: ${quote.volume.toLocaleString()}`,
    `Day range: $${fmtP(quote.low)} – $${fmtP(quote.high)} (${rangeAsPct.toFixed(2)}% range vs prior close)`,
    `Change: ${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}% ($${fmtP(Math.abs(quote.change))}) · Market: ${quote.marketState}`,
    `ATR(14): $${fmtP(atr)} (${(atr / price * 100).toFixed(2)}% of price) — ${atr / price > 0.015 ? "high volatility, widen stops" : "normal volatility"}`,
  ];

  // ── 5. BREAKOUT / SETUP QUALITY ───────────────────────────────────────────
  // How good is the R:R and setup quality from pure price structure?
  const nearResistance = keyLevels.resistance[0] ? Math.abs(price - keyLevels.resistance[0]) / price : 1;
  const nearSupport    = keyLevels.support[0]    ? Math.abs(price - keyLevels.support[0])    / price : 1;
  const spaceToTP = Math.min(nearResistance, nearSupport);
  const rrQuality  = spaceToTP > 0.03 ? 75 : spaceToTP > 0.02 ? 65 : spaceToTP > 0.01 ? 55 : 40;
  const breakoutScore = Math.max(5, Math.min(95, Math.round(
    rrQuality * 0.4 +
    (isSqueeze ? 75 : bb.pct < 0.2 || bb.pct > 0.8 ? 65 : 50) * 0.3 +
    (volumeRatio > 1.5 ? 75 : volumeRatio > 1 ? 60 : 40) * 0.3
    + contextBias,
  )));

  const breakoutFindings = [
    `Setup quality: ${breakoutScore}/100`,
    isSqueeze ? "🔥 BOLLINGER BAND SQUEEZE — compressed volatility, explosive move incoming" : `BB width: ${(bbWidth * 100).toFixed(2)}% — ${bbWidth < 0.03 ? "tight (pre-breakout)" : bbWidth > 0.06 ? "wide (post-breakout)" : "normal"}`,
    `Space to nearest resistance: ${keyLevels.resistance[0] ? (nearResistance * 100).toFixed(2) + "% ($" + fmtP(keyLevels.resistance[0]) + ")" : "no swing high detected above price"}`,
    `Space to nearest support: ${keyLevels.support[0] ? (nearSupport * 100).toFixed(2) + "% ($" + fmtP(keyLevels.support[0]) + ")" : "no swing low detected below price"}`,
    `R:R quality: ${spaceToTP > 0.03 ? "✅ GOOD — plenty of room" : spaceToTP > 0.015 ? "⚠ MODERATE" : "❌ TIGHT — price near key level, risky entry"}`,
    `Volume confirmation: ${volumeRatio > 1.5 ? "✅ volume supports the move" : "⚠ volume not confirming yet"}`,
    ...(ema9CrossUp || ema9CrossDown ? [`EMA cross: ${ema9CrossUp ? "🔥 fresh bullish cross — high probability entry" : "❌ fresh bearish cross — short signal"}`] : []),
  ];

  // ── 6. PATTERN RECOGNITION (from real indicator combos) ───────────────────
  // Detect real patterns from indicator combinations
  const patterns: string[] = [];
  if (isSqueeze && volumeRatio > 1.3)  patterns.push("BB Squeeze + Volume surge → Breakout play");
  if (ema9CrossUp && aboveVwap && macd.histogram > 0) patterns.push("EMA cross + VWAP reclaim + positive MACD → Trend continuation LONG");
  if (ema9CrossDown && !aboveVwap && macd.histogram < 0) patterns.push("EMA cross + below VWAP + negative MACD → Trend continuation SHORT");
  if (stoch.k < 25 && rsi < 40 && aboveVwap)  patterns.push("Stoch oversold + RSI oversold above VWAP → Mean reversion LONG");
  if (stoch.k > 75 && rsi > 60 && !aboveVwap) patterns.push("Stoch overbought + RSI overbought below VWAP → Mean reversion SHORT");
  if (divergence === "BULLISH_DIV" && stoch.k < 40) patterns.push("Bullish RSI divergence + Stoch low → Reversal LONG setup");
  if (divergence === "BEARISH_DIV" && stoch.k > 60) patterns.push("Bearish RSI divergence + Stoch high → Reversal SHORT setup");
  if (rsi > 45 && rsi < 60 && macd.histogram > 0 && aboveVwap && ema9 > ema21) patterns.push("Healthy bull trend (RSI mid-range, MACD+, above VWAP+EMA)");
  if (adx > 30 && ema9 > ema21 && volumeRatio > 1.2) patterns.push(`ADX ${adx.toFixed(0)} trending + EMA bullish + vol surge → Ride the trend LONG`);
  if (adx > 30 && ema9 < ema21 && volumeRatio > 1.2) patterns.push(`ADX ${adx.toFixed(0)} trending + EMA bearish + vol surge → Ride the trend SHORT`);
  if (patterns.length === 0) patterns.push("No strong pattern detected — wait for cleaner setup");

  const patternScore = Math.max(5, Math.min(95, Math.round(momentumScore * 0.4 + techScore * 0.4 + breakoutScore * 0.2)));

  const patternFindings = [
    `Pattern Score: ${patternScore}/100`,
    ...patterns.map(p => `📊 ${p}`),
    `ADX(14): ${adx.toFixed(0)} — ${adx > 50 ? "very strong trend — hold winners" : adx > 35 ? "strong trend — high follow-through likely" : adx > 25 ? "trending — ok to trade with trend" : "weak trend / range — fade moves at extremes"}`,
    `ROC(10): ${roc10 >= 0 ? "+" : ""}${roc10.toFixed(2)}% momentum`,
    `Best timeframe for this setup: ${adx > 30 ? "trend-following (5m/15m)" : isSqueeze ? "breakout (5m on volume trigger)" : "range-bound (scalp at BB extremes)"}`,
  ];

  // ── 7. ASSET-SPECIFIC MODULE (uses real intel for crypto) ─────────────────
  // Fetch real market intelligence for crypto (Binance derivatives)
  const intel = await fetchMarketIntelligence(sym, assetType, indicators, quote).catch(() => undefined);

  let assetSpecScore = Math.round((momentumScore + structureScore) / 2);
  const assetFindings: string[] = [];

  if (assetType === "crypto" && intel) {
    if (intel.funding) assetFindings.push(`💸 Funding rate: ${intel.funding.ratePct} (${intel.funding.bias}) — ${intel.funding.interpretation}`);
    if (intel.lsRatio) assetFindings.push(`⚖ Long/Short: ${intel.lsRatio.longPct.toFixed(0)}% long vs ${intel.lsRatio.shortPct.toFixed(0)}% short — ${intel.lsRatio.interpretation}`);
    if (intel.openInterest) assetFindings.push(`📊 Open Interest: ${intel.openInterest.formatted} — ${intel.openInterest.note}`);
    if (intel.fearGreed) assetFindings.push(`😱 Fear & Greed: ${intel.fearGreed.value} (${intel.fearGreed.label}) — ${intel.fearGreed.tradingImplication}`);
    assetFindings.push(`🧠 ${intel.smartMoneySignal}`, `🐋 ${intel.whaleActivity}`);
    assetFindings.push(...intel.keyInsights);
    if (intel.lsRatio) assetSpecScore = Math.round(
      (intel.lsRatio.signal === "BULLISH" ? 68 : intel.lsRatio.signal === "BEARISH" ? 32 : assetSpecScore) * 0.4 +
      assetSpecScore * 0.6,
    );
  } else if (assetType === "futures") {
    assetFindings.push(
      `Futures market (continuous contract) — reflects active month positioning`,
      `Price ${aboveVwap ? "above" : "below"} VWAP — ${aboveVwap ? "institutions buying" : "selling pressure"}`,
      `ATR(14): $${fmtP(atr)} — set stop ${(atr * 1.2).toFixed(4)} away from entry`,
      `Vol ${volumeRatio.toFixed(1)}× avg — ${volumeRatio > 1.5 ? "institutional activity detected" : "normal flow"}`,
      `Support stack: ${keyLevels.support.map(s => "$" + fmtP(s)).join(", ") || "none"}`,
      `Resistance stack: ${keyLevels.resistance.map(r => "$" + fmtP(r)).join(", ") || "none"}`,
    );
  } else {
    assetFindings.push(
      `Price vs VWAP: ${aboveVwap ? "above (institutional buy zone)" : "below (distribution zone)"}`,
      `Relative strength: ${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}% today`,
      `Volume ${volumeRatio.toFixed(1)}× avg — ${volumeRatio > 1.5 ? "unusual activity" : "normal"}`,
      `ATR(14): $${fmtP(atr)} (${(atr / price * 100).toFixed(2)}% of price)`,
    );
  }
  assetSpecScore = Math.max(5, Math.min(95, assetSpecScore + contextBias));

  // ── Composite score — ALL real indicator data ─────────────────────────────
  const composite = Math.max(5, Math.min(95, Math.round(
    techScore      * 0.22 +
    momentumScore  * 0.22 +
    structureScore * 0.18 +
    volScore       * 0.15 +
    breakoutScore  * 0.13 +
    patternScore   * 0.10,
    // assetSpecScore intentionally excluded from composite (it's displayed separately)
  )));

  // ── Direction — weighted vote from every signal ───────────────────────────
  type Vote = { bull: number; bear: number };
  const votes: Vote = { bull: 0, bear: 0 };
  const cast = (score: number, weight: number) => {
    if (score > 50) votes.bull += (score - 50) * weight;
    else             votes.bear += (50 - score) * weight;
  };
  cast(techScore,      0.22);
  cast(momentumScore,  0.22);
  cast(structureScore, 0.18);
  cast(volScore,       0.15);
  cast(breakoutScore,  0.13);
  cast(patternScore,   0.10);
  // Hard signals — override weak composite
  if (ema9CrossUp   && aboveVwap && macd.histogram > 0) votes.bull += 15;
  if (ema9CrossDown && !aboveVwap && macd.histogram < 0) votes.bear += 15;
  if (divergence === "BULLISH_DIV") votes.bull += 10;
  if (divergence === "BEARISH_DIV") votes.bear += 10;

  const voteMargin = votes.bull - votes.bear;
  const direction: Direction = voteMargin > 8 ? "LONG" : voteMargin < -8 ? "SHORT" : "NEUTRAL";
  const absMargin = Math.abs(voteMargin);
  const conviction: Conviction = absMargin > 20 ? "HIGH" : absMargin > 10 ? "MEDIUM" : "LOW";

  // ── Assemble modules ──────────────────────────────────────────────────────
  const sig = (s: number) => s >= 58 ? "bullish" as const : s <= 42 ? "bearish" as const : "neutral" as const;

  const modules: ModuleScore[] = [
    { name: "Technical Analysis",     weight: 22, score: techScore,      signal: sig(techScore),      findings: techFindings },
    { name: "Momentum Indicators",    weight: 22, score: momentumScore,  signal: sig(momentumScore),  findings: momentumFindings },
    { name: "Market Structure",       weight: 18, score: structureScore, signal: sig(structureScore), findings: structureFindings },
    { name: "Volume & Order Flow",    weight: 15, score: volScore,       signal: sig(volScore),       findings: volFindings },
    { name: "Breakout / Setup",       weight: 13, score: breakoutScore,  signal: sig(breakoutScore),  findings: breakoutFindings },
    { name: "Pattern Recognition",    weight: 10, score: patternScore,   signal: sig(patternScore),   findings: patternFindings },
    { name: assetType === "futures" ? "Futures Analysis" : assetType === "stock" ? "Equity Analysis" : "On-Chain / Derivatives",
      weight: 0, score: assetSpecScore, signal: sig(assetSpecScore), findings: assetFindings },
  ];

  const setup = buildSetup(price, direction, assetType, conviction, composite, indicators, userContext);

  return {
    symbol: sym, yahooTicker: toYahooTicker(sym, assetType), assetType,
    compositeScore: composite, direction, conviction, modules, setup, indicators,
    intel,
    cot: undefined, openInterest: undefined, vixLevel: undefined,
    optionsFlow: undefined, darkPool: undefined, shortInterest: undefined, insiderActivity: undefined,
  };
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function CandleTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as Candle;
  if (!d) return null;
  const bull = d.close >= d.open;
  return (
    <div className="bg-dark-800 border border-dark-500 rounded-lg p-3 text-xs shadow-xl">
      <div className="text-slate-400 mb-2">{d.t}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-slate-500">O</span><span className="text-white font-mono">${fmtP(d.open)}</span>
        <span className="text-slate-500">H</span><span className="text-emerald-400 font-mono">${fmtP(d.high)}</span>
        <span className="text-slate-500">L</span><span className="text-red-400 font-mono">${fmtP(d.low)}</span>
        <span className="text-slate-500">C</span><span className={`font-mono font-bold ${bull ? "text-emerald-400" : "text-red-400"}`}>${fmtP(d.close)}</span>
        <span className="text-slate-500">Vol</span><span className="text-blue-400 font-mono">{d.vol.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── Module card ──────────────────────────────────────────────────────────────

function ModuleCard({ mod }: { mod: ModuleScore }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-dark-700 transition-colors">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-white">{mod.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded font-bold ${signalBadge(mod.signal)}`}>{mod.signal.toUpperCase()}</span>
            <span className="text-xs text-slate-600 ml-auto">{mod.weight}% weight</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-dark-600 rounded-full h-2">
              <div className={`h-2 rounded-full ${scoreColor(mod.score, false)}`} style={{ width: `${mod.score}%` }} />
            </div>
            <span className={`text-sm font-bold w-8 text-right ${scoreColor(mod.score)}`}>{mod.score}</span>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-500 shrink-0" /> : <ChevronDown size={16} className="text-slate-500 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-dark-600 px-4 pb-4 pt-3 space-y-1.5">
          {mod.findings.map((f, i) => (
            <div key={i} className="flex gap-2 text-xs text-slate-400">
              <span className={`shrink-0 mt-0.5 ${mod.signal === "bullish" ? "text-emerald-500" : mod.signal === "bearish" ? "text-red-500" : "text-yellow-500"}`}>•</span>{f}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Limit Order Panel ────────────────────────────────────────────────────────

function LimitOrderPanel({ setup, symbol }: { setup: TradeSetup; symbol: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const isLong = setup.direction === "LONG";

  const copy = (val: number, key: string) => {
    navigator.clipboard.writeText(val.toString()).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const rows = [
    { key: "entry", icon: "🟡", label: isLong ? "BUY LIMIT" : "SELL LIMIT", price: setup.entryLimit, color: "text-yellow-300", bg: "bg-yellow-500/10 border-yellow-500/30", pct: null },
    { key: "sl",    icon: "🔴", label: "STOP LOSS",  price: setup.stopLoss,  color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30",    pct: (((setup.stopLoss - setup.entryLimit) / setup.entryLimit) * 100) },
    { key: "tp1",   icon: "🎯", label: `TP1 (1:${setup.rr1} RR) — scale 40%`, price: setup.target1, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", pct: (((setup.target1 - setup.entryLimit) / setup.entryLimit) * 100) },
    { key: "tp2",   icon: "🎯", label: `TP2 (1:${setup.rr2} RR) — scale 35%`, price: setup.target2, color: "text-emerald-300", bg: "bg-emerald-500/8 border-emerald-500/20",  pct: (((setup.target2 - setup.entryLimit) / setup.entryLimit) * 100) },
    { key: "tp3",   icon: "🚀", label: `TP3 (1:${setup.rr3} RR) — runner 25%`, price: setup.target3, color: "text-cyan-400",   bg: "bg-cyan-500/10 border-cyan-500/30",     pct: (((setup.target3 - setup.entryLimit) / setup.entryLimit) * 100) },
  ];

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 flex items-center gap-3 ${isLong ? "bg-emerald-500/10 border-b border-emerald-500/30" : "bg-red-500/10 border-b border-red-500/30"}`}>
        <span className="text-lg">{isLong ? "📈" : "📉"}</span>
        <div>
          <div className={`text-sm font-bold ${isLong ? "text-emerald-300" : "text-red-300"}`}>
            {symbol} — {setup.direction} LIMIT ORDER SETUP
          </div>
          <div className="text-xs text-slate-500">{setup.strategy} · ATR(14): ${setup.atrValue.toFixed(4)} · Risk/unit: ${setup.riskDollar.toFixed(4)}</div>
        </div>
      </div>

      {/* Order rows */}
      <div className="p-3 space-y-2">
        {rows.map(row => (
          <div key={row.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${row.bg}`}>
            <span className="text-base shrink-0">{row.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-500 font-medium">{row.label}</div>
              <div className={`text-base font-bold font-mono ${row.color}`}>${fmtP(row.price)}</div>
            </div>
            {row.pct !== null && (
              <div className={`text-xs font-semibold ${row.pct >= 0 ? "text-emerald-400" : "text-red-400"} shrink-0`}>
                {row.pct >= 0 ? "+" : ""}{row.pct.toFixed(2)}%
              </div>
            )}
            <button onClick={() => copy(row.price, row.key)}
              className="shrink-0 text-slate-600 hover:text-blue-400 transition-colors p-1.5 rounded hover:bg-dark-600">
              {copied === row.key
                ? <CheckCircle size={13} className="text-emerald-400" />
                : <span className="text-xs">📋</span>}
            </button>
          </div>
        ))}
      </div>

      {/* Day trading checklist */}
      <div className="px-4 pb-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Entry Checklist</div>
        <div className="space-y-1">
          {setup.dayTradingChecklist.map((item, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs ${item.pass ? "text-emerald-400" : "text-slate-600"}`}>
              <span>{item.pass ? "✅" : "⬜"}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <div className={`mt-2 text-xs font-bold ${setup.dayTradingChecklist.filter(c => c.pass).length >= 5 ? "text-emerald-400" : setup.dayTradingChecklist.filter(c => c.pass).length >= 3 ? "text-yellow-400" : "text-red-400"}`}>
          {setup.dayTradingChecklist.filter(c => c.pass).length}/{setup.dayTradingChecklist.length} conditions met
          {setup.dayTradingChecklist.filter(c => c.pass).length >= 5 ? " — Strong setup ✅" :
           setup.dayTradingChecklist.filter(c => c.pass).length >= 3 ? " — Proceed with caution" :
           " — Wait for better setup"}
        </div>
      </div>

      {/* Warnings */}
      {setup.warnings.length > 0 && (
        <div className="px-4 pb-4 space-y-1">
          {setup.warnings.map((w, i) => (
            <div key={i} className="text-xs text-orange-400 flex gap-1.5 items-start">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />{w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Market Intelligence Panel ────────────────────────────────────────────────

function MarketIntelPanel({ intel }: { intel: MarketIntelligence }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-dark-800 border border-purple-500/30 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center gap-2 bg-purple-500/5 hover:bg-purple-500/10 transition-colors text-left">
        <span className="text-base">🔍</span>
        <span className="text-sm font-bold text-white">Market Intelligence</span>
        {intel.isReal && (
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium ml-1">LIVE</span>
        )}
        <span className="ml-auto text-slate-600">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      </button>

      {open && (
        <div className="p-4 space-y-4">
          {/* Crypto real data */}
          {intel.fearGreed && (
            <div className="bg-dark-700 rounded-lg p-3">
              <div className="text-xs text-slate-500 font-semibold mb-2">😱 FEAR & GREED INDEX</div>
              <div className="flex items-center gap-3">
                <div className="relative w-16 h-16 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#1e293b" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15" fill="none"
                      stroke={intel.fearGreed.value <= 40 ? "#ef4444" : intel.fearGreed.value <= 60 ? "#f59e0b" : "#10b981"}
                      strokeWidth="3" strokeDasharray={`${intel.fearGreed.value * 0.942} 94.2`} strokeLinecap="round" />
                  </svg>
                  <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${intel.fearGreed.color}`}>
                    {intel.fearGreed.value}
                  </span>
                </div>
                <div>
                  <div className={`text-sm font-bold ${intel.fearGreed.color}`}>{intel.fearGreed.label}</div>
                  <div className="text-xs text-slate-500 mt-1">{intel.fearGreed.tradingImplication}</div>
                </div>
              </div>
            </div>
          )}

          {/* Funding rate */}
          {intel.funding && (
            <div className="bg-dark-700 rounded-lg p-3">
              <div className="text-xs text-slate-500 font-semibold mb-2">💸 FUNDING RATE (BINANCE PERP)</div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-lg font-bold font-mono ${intel.funding.rate > 0.0003 ? "text-red-400" : intel.funding.rate < -0.0001 ? "text-emerald-400" : "text-yellow-400"}`}>
                  {intel.funding.ratePct}
                </span>
                <span className="text-xs text-slate-500">/ 8h · {intel.funding.annualized} annualized</span>
              </div>
              <div className={`text-xs px-2 py-1 rounded ${intel.funding.bias === "LONGS_PAYING" ? "bg-red-500/10 text-red-300" : intel.funding.bias === "SHORTS_PAYING" ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-700 text-slate-400"}`}>
                {intel.funding.interpretation}
              </div>
            </div>
          )}

          {/* Long/Short ratio */}
          {intel.lsRatio && (
            <div className="bg-dark-700 rounded-lg p-3">
              <div className="text-xs text-slate-500 font-semibold mb-2">⚖️ LONG/SHORT RATIO (BINANCE)</div>
              <div className="flex gap-3 mb-2">
                <div className="text-center flex-1">
                  <div className="text-lg font-bold text-emerald-400">{intel.lsRatio.longPct.toFixed(1)}%</div>
                  <div className="text-xs text-slate-500">Longs</div>
                </div>
                <div className="text-center flex-1">
                  <div className="text-lg font-bold text-red-400">{intel.lsRatio.shortPct.toFixed(1)}%</div>
                  <div className="text-xs text-slate-500">Shorts</div>
                </div>
                <div className="text-center flex-1">
                  <div className="text-lg font-bold text-blue-400">{intel.lsRatio.buySellRatio.toFixed(2)}</div>
                  <div className="text-xs text-slate-500">Buy/Sell</div>
                </div>
              </div>
              {/* Bar */}
              <div className="h-2 bg-red-500 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${intel.lsRatio.longPct}%` }} />
              </div>
              <div className="text-xs text-slate-400 mt-2">{intel.lsRatio.interpretation}</div>
            </div>
          )}

          {/* Open interest */}
          {intel.openInterest && (
            <div className="bg-dark-700 rounded-lg p-3">
              <div className="text-xs text-slate-500 font-semibold mb-1">📊 OPEN INTEREST</div>
              <div className="text-xl font-bold text-white">{intel.openInterest.formatted}</div>
              <div className="text-xs text-slate-400 mt-1">{intel.openInterest.note}</div>
            </div>
          )}

          {/* Smart money + volume */}
          <div className="space-y-2">
            <div className="text-xs text-slate-500 font-semibold">🧠 DERIVED SIGNALS</div>
            {[
              { label: "Smart Money", value: intel.smartMoneySignal },
              { label: "Institutional", value: intel.institutionalBias },
              { label: "Volume Profile", value: intel.volumeProfile },
              { label: "Whale Activity", value: intel.whaleActivity },
            ].map(row => (
              <div key={row.label} className="bg-dark-700 rounded p-2.5">
                <div className="text-xs text-slate-600 mb-0.5">{row.label}</div>
                <div className="text-xs text-slate-300">{row.value}</div>
              </div>
            ))}
          </div>

          {/* Key insights */}
          {intel.keyInsights.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 font-semibold mb-2">💡 KEY INSIGHTS</div>
              <div className="space-y-1.5">
                {intel.keyInsights.map((ins, i) => (
                  <div key={i} className="flex gap-2 text-xs text-slate-300">
                    <span className="text-purple-400 shrink-0">•</span>{ins}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk warnings from intel */}
          {intel.riskWarnings.length > 0 && (
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3">
              <div className="text-xs text-orange-400 font-semibold mb-1.5">⚠️ RISK WARNINGS</div>
              {intel.riskWarnings.map((w, i) => (
                <div key={i} className="text-xs text-orange-300 flex gap-1.5"><span>•</span>{w}</div>
              ))}
            </div>
          )}

          {!intel.isReal && (
            <div className="text-xs text-slate-700 text-center">
              Funding / OI / L:S data available for crypto with Binance futures markets
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Win probability gauge ────────────────────────────────────────────────────

function WinProbGauge({ prob, direction }: { prob: number; direction: Direction }) {
  const color = prob >= 65 ? "#10b981" : prob >= 50 ? "#f59e0b" : "#ef4444";
  const quality = prob >= 70 ? "Strong Edge" : prob >= 60 ? "Moderate Edge" : prob >= 50 ? "Slight Edge" : "Poor Edge";
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
        <Percent size={15} className="text-blue-400" /> Win Probability
      </h3>
      <div className="flex items-center gap-4">
        {/* Circular gauge */}
        <div className="relative w-24 h-24 shrink-0">
          <svg viewBox="0 0 80 80" className="w-24 h-24 -rotate-90">
            <circle cx="40" cy="40" r="32" fill="none" stroke="#1e293b" strokeWidth="10" />
            <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="10"
              strokeDasharray={`${prob * 2.01} 201`} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold font-mono" style={{ color }}>{prob}%</span>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <div>
            <div className="text-lg font-bold" style={{ color }}>{quality}</div>
            <div className="text-xs text-slate-500 mt-0.5">{direction} setup · probability of profit</div>
          </div>
          <div className="text-xs text-slate-400 space-y-1">
            <div>Based on: RSI positioning, MACD alignment, BB%, VWAP side, SMA trend</div>
            {prob >= 65 && <div className="text-emerald-400">✓ High-probability setup — favorable risk/reward</div>}
            {prob >= 50 && prob < 65 && <div className="text-yellow-400">⚠ Moderate setup — confirm with volume</div>}
            {prob < 50 && <div className="text-red-400">✗ Low-probability — consider waiting for better entry</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trade direction panel ────────────────────────────────────────────────────

function TradeDirectionPanel({
  analysis, quote, selectedDir, onDirChange,
}: {
  analysis: Analysis; quote: Quote;
  selectedDir: Direction; onDirChange: (d: "LONG" | "SHORT") => void;
}) {
  const setup = useMemo(() => {
    if (selectedDir === "NEUTRAL") return analysis.setup;
    return buildSetup(quote.price, selectedDir, analysis.assetType, analysis.conviction,
      analysis.compositeScore, analysis.indicators, "");
  }, [selectedDir, quote.price, analysis]);

  const winProb = calcWinProb(analysis.compositeScore, analysis.indicators, selectedDir);

  // Alignment warnings for chosen dir
  const aiDir = analysis.direction;
  const goingAgainstAI = (selectedDir === "LONG" && aiDir === "SHORT") || (selectedDir === "SHORT" && aiDir === "LONG");
  const isLong = selectedDir === "LONG";

  return (
    <div className="space-y-4">
      {/* Direction toggle */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Target size={16} className="text-blue-400" /> Trade Setup
        </h3>

        <div className="flex gap-3 mb-4">
          <button onClick={() => onDirChange("LONG")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all border-2 ${selectedDir === "LONG" ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-dark-700 border-dark-500 text-slate-400 hover:border-emerald-600 hover:text-emerald-400"}`}>
            <ArrowUpCircle size={18} />BUY / LONG
          </button>
          <button onClick={() => onDirChange("SHORT")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all border-2 ${selectedDir === "SHORT" ? "bg-red-600 border-red-500 text-white shadow-lg shadow-red-500/20" : "bg-dark-700 border-dark-500 text-slate-400 hover:border-red-600 hover:text-red-400"}`}>
            <ArrowDownCircle size={18} />SELL / SHORT
          </button>
        </div>

        {/* AI recommendation badge */}
        <div className={`text-xs px-3 py-2 rounded-lg mb-4 flex items-center gap-2 ${goingAgainstAI ? "bg-orange-500/10 border border-orange-500/30 text-orange-400" : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"}`}>
          {goingAgainstAI
            ? <><AlertTriangle size={12} /> Trading AGAINST AI signal ({aiDir}) — higher risk, reduce size</>
            : <><CheckCircle size={12} /> Trading WITH AI signal ({aiDir}) — favorable alignment</>
          }
        </div>

        {/* Signal quality indicator */}
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className={`rounded-lg p-2.5 border ${winProb >= 65 ? "bg-emerald-500/10 border-emerald-500/30" : winProb >= 50 ? "bg-yellow-500/10 border-yellow-500/30" : "bg-red-500/10 border-red-500/30"}`}>
            <div className={`text-lg font-bold font-mono ${winProb >= 65 ? "text-emerald-400" : winProb >= 50 ? "text-yellow-400" : "text-red-400"}`}>{winProb}%</div>
            <div className="text-xs text-slate-500">Win Probability</div>
          </div>
          <div className={`rounded-lg p-2.5 border ${goingAgainstAI ? "bg-orange-500/10 border-orange-500/30" : "bg-blue-500/10 border-blue-500/30"}`}>
            <div className={`text-lg font-bold ${goingAgainstAI ? "text-orange-400" : "text-blue-400"}`}>{goingAgainstAI ? "⚠" : "✓"}</div>
            <div className="text-xs text-slate-500">{goingAgainstAI ? "Counter-Trend" : "With Trend"}</div>
          </div>
          <div className={`rounded-lg p-2.5 border ${analysis.conviction === "HIGH" ? "bg-emerald-500/10 border-emerald-500/30" : analysis.conviction === "MEDIUM" ? "bg-yellow-500/10 border-yellow-500/30" : "bg-dark-600 border-dark-500"}`}>
            <div className={`text-lg font-bold ${analysis.conviction === "HIGH" ? "text-emerald-400" : analysis.conviction === "MEDIUM" ? "text-yellow-400" : "text-slate-400"}`}>{analysis.conviction}</div>
            <div className="text-xs text-slate-500">AI Conviction</div>
          </div>
        </div>

        {/* Levels */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className={`rounded-lg p-3 text-center border ${isLong ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
            <div className="text-xs text-slate-500 mb-1">Entry Zone</div>
            <div className={`text-sm font-bold font-mono ${isLong ? "text-emerald-400" : "text-red-400"}`}>${fmtP(setup.entryLow)}</div>
            <div className="text-xs text-slate-500">to ${fmtP(setup.entryHigh)}</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">Stop Loss</div>
            <div className="text-sm font-bold text-red-400 font-mono">${fmtP(setup.stopLoss)}</div>
            <div className="text-xs text-slate-500">{isLong ? "below entry" : "above entry"}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[{ l: "TP1", v: setup.target1, rr: setup.rr1 }, { l: "TP2", v: setup.target2, rr: setup.rr2 }, { l: "TP3", v: setup.target3, rr: setup.rr3 }].map(tp => (
            <div key={tp.l} className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center">
              <div className="text-xs text-emerald-400">{tp.l}</div>
              <div className="text-xs font-bold text-white font-mono">${fmtP(tp.v)}</div>
              <div className="text-xs text-slate-500">R:R {tp.rr}:1</div>
            </div>
          ))}
        </div>

        {/* Execution plan */}
        <div className="border-t border-dark-600 pt-3 space-y-2">
          <p className="text-xs text-slate-400 font-semibold">{isLong ? "▲ LONG" : "▼ SHORT"} Execution — {setup.strategy}</p>
          <ol className="space-y-1 text-xs text-slate-400 list-none">
            <li>1. {isLong ? "BUY" : "SELL SHORT"} at ${fmtP(setup.entryLow)}–${fmtP(setup.entryHigh)}</li>
            <li>2. Confirm with {setup.strategy.includes("Scalp") ? "1m momentum + volume surge" : "breakout volume above average"}</li>
            <li>3. Hard stop at ${fmtP(setup.stopLoss)} — no exceptions</li>
            <li>4. Take 40% off at TP1 (${fmtP(setup.target1)}), move stop to breakeven</li>
            <li>5. Exit 35% at TP2 (${fmtP(setup.target2)}) · Trail 25% to TP3 (${fmtP(setup.target3)})</li>
          </ol>
        </div>

        {/* Warnings */}
        {setup.warnings.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mt-3 space-y-1">
            {setup.warnings.map((w, i) => (
              <div key={i} className="flex gap-2 text-xs text-yellow-400">
                <AlertTriangle size={11} className="shrink-0 mt-0.5" />{w}
              </div>
            ))}
          </div>
        )}

        {/* Reasoning */}
        <div className="mt-3 space-y-0.5">
          {setup.reasoning.map((r, i) => (
            <div key={i} className="text-xs text-slate-500 flex gap-2"><span className="text-blue-500">›</span>{r}</div>
          ))}
        </div>
      </div>

      {/* Win probability gauge */}
      <WinProbGauge prob={winProb} direction={selectedDir} />
    </div>
  );
}

// ─── Live chart ───────────────────────────────────────────────────────────────

function LiveChart({ symbol, analysis, quote, onQuoteUpdate, assetType }: {
  symbol: string; analysis: Analysis; quote: Quote; onQuoteUpdate: (q: Quote) => void; assetType?: AssetType;
}) {
  const [tf, setTf] = useState<TF>("5m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [flash, setFlash] = useState(false);

  const loadCandles = useCallback(async (sym: string, timeframe: TF) => {
    setLoadingChart(true); setChartError(null);
    try {
      const data = await fetchCandles(sym, timeframe, assetType);
      setCandles(data);
      setLastUpdated(new Date());
      setCountdown(Math.round(TF_CONFIG[timeframe].refreshMs / 1000));
      setFlash(true); setTimeout(() => setFlash(false), 500);
    } catch { setChartError("Chart data unavailable — market may be closed or API rate-limited."); }
    finally { setLoadingChart(false); }
  }, []);

  useEffect(() => {
    loadCandles(symbol, tf);
    const iv = setInterval(() => loadCandles(symbol, tf), TF_CONFIG[tf].refreshMs);
    const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => { clearInterval(iv); clearInterval(tick); };
  }, [symbol, tf, loadCandles]);

  useEffect(() => {
    const iv = setInterval(async () => {
      try { const q = await fetchQuote(symbol, assetType); onQuoteUpdate(q); } catch { /**/ }
    }, 8000);
    return () => clearInterval(iv);
  }, [symbol, onQuoteUpdate]);

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const livePrice = last?.close ?? quote.price;
  const priceUp = last && prev ? last.close >= prev.close : quote.changePct >= 0;
  const priceColor = priceUp ? "#10b981" : "#ef4444";
  const prices = candles.map(c => c.close).filter(isFinite);
  const minP = prices.length > 0 ? Math.min(...prices) * 0.9995 : 0;
  const maxP = prices.length > 0 ? Math.max(...prices) * 1.0005 : 1;

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <div className={`transition-opacity duration-300 ${flash ? "opacity-50" : ""}`}>
            <span className="text-2xl font-bold font-mono" style={{ color: priceColor }}>${fmtP(livePrice)}</span>
            <span className={`text-sm ml-2 font-mono ${priceUp ? "text-emerald-400" : "text-red-400"}`}>
              {quote.changePct >= 0 ? "▲" : "▼"} {Math.abs(quote.changePct).toFixed(2)}% (${fmtP(Math.abs(quote.change))})
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
            LIVE · {quote.marketState}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <span className="text-slate-600">O</span><span className="font-mono text-slate-300">{fmtP(quote.open)}</span>
            <span className="text-slate-600 ml-2">H</span><span className="font-mono text-emerald-400">{fmtP(quote.high)}</span>
            <span className="text-slate-600 ml-2">L</span><span className="font-mono text-red-400">{fmtP(quote.low)}</span>
            <span className="text-slate-600 ml-2">Vol</span><span className="font-mono text-blue-400">{quote.volume.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1"><Clock size={11} /><span>Next: <span className="font-mono text-slate-300">{countdown}s</span></span></div>
          <span className="text-slate-600">{lastUpdated.toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 py-2 border-b border-dark-700 bg-dark-900/30">
        {(Object.keys(TF_CONFIG) as TF[]).map(t => (
          <button key={t} onClick={() => setTf(t)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${tf === t ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-200 hover:bg-dark-700"}`}>{t}</button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-600">
          {chartError ? <WifiOff size={12} className="text-red-400" /> : <Wifi size={12} className="text-emerald-500" />}
          <RefreshCw size={11} className={flash ? "animate-spin text-blue-400" : ""} />
          <span>refreshes {TF_CONFIG[tf].refreshMs >= 60000 ? `${TF_CONFIG[tf].refreshMs/60000}m` : `${TF_CONFIG[tf].refreshMs/1000}s`}</span>
        </div>
      </div>

      {loadingChart && candles.length === 0 ? (
        <div className="h-64 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-xs text-slate-500">Fetching {symbol} {tf} data…</p>
          </div>
        </div>
      ) : chartError ? (
        <div className="h-64 flex items-center justify-center text-center text-xs text-slate-500">
          <div><WifiOff size={24} className="text-red-400 mx-auto mb-2" />
            <p className="text-red-400">{chartError}</p>
            <button onClick={() => loadCandles(symbol, tf)} className="mt-2 text-blue-400 hover:text-blue-300">Retry</button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-2 pt-3">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={candles} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={priceColor} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={priceColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[minP, maxP]} tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false} tickFormatter={v => `$${fmtP(v)}`} width={76} orientation="right" />
                <Tooltip content={<CandleTooltip />} />
                <Area type="monotone" dataKey="range" stroke="none" fill="url(#priceFill)" />
                <Line type="monotone" dataKey="close" stroke={priceColor} strokeWidth={2} dot={false} activeDot={{ r: 3, fill: priceColor }} />
                <ReferenceLine y={analysis.setup.stopLoss}   stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} label={{ value: "SL",    fill: "#ef4444", fontSize: 9, position: "insideTopLeft" }} />
                <ReferenceLine y={analysis.setup.target1}   stroke="#10b981" strokeDasharray="4 2" strokeWidth={1} label={{ value: "TP1",   fill: "#10b981", fontSize: 9, position: "insideTopLeft" }} />
                <ReferenceLine y={analysis.setup.target2}   stroke="#10b981" strokeDasharray="6 3" strokeWidth={1} label={{ value: "TP2",   fill: "#10b981", fontSize: 9, position: "insideTopLeft" }} />
                <ReferenceLine y={analysis.setup.target3}   stroke="#06b6d4" strokeDasharray="6 3" strokeWidth={1} label={{ value: "TP3",   fill: "#06b6d4", fontSize: 9, position: "insideTopLeft" }} />
                <ReferenceLine y={analysis.setup.entryLimit} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: "Entry", fill: "#3b82f6", fontSize: 9, position: "insideTopLeft" }} />
                <ReferenceLine y={analysis.indicators.vwap} stroke="#f59e0b" strokeDasharray="5 2" strokeWidth={1.5} label={{ value: "VWAP", fill: "#f59e0b", fontSize: 9, position: "insideTopLeft" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="px-2 pb-2">
            <ResponsiveContainer width="100%" height={55}>
              <ComposedChart data={candles} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="t" hide /><YAxis hide />
                <Bar dataKey="bullVol" fill="#10b981" opacity={0.7} maxBarSize={8} />
                <Bar dataKey="bearVol" fill="#ef4444" opacity={0.7} maxBarSize={8} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div className="flex items-center gap-4 px-4 py-2 border-t border-dark-700 bg-dark-900/20 text-xs flex-wrap">
        {[
          { label: "RSI",   val: analysis.indicators.rsi.toFixed(1), color: analysis.indicators.rsi > 70 ? "text-red-400" : analysis.indicators.rsi < 30 ? "text-emerald-400" : "text-slate-300" },
          { label: "Stoch", val: `${analysis.indicators.stoch.k.toFixed(0)}/${analysis.indicators.stoch.d.toFixed(0)}`, color: analysis.indicators.stoch.signal === "OVERSOLD" ? "text-emerald-400" : analysis.indicators.stoch.signal === "OVERBOUGHT" ? "text-red-400" : "text-slate-300" },
          { label: "MACD",  val: `${analysis.indicators.macd.histogram > 0 ? "+" : ""}${analysis.indicators.macd.histogram.toFixed(4)}`, color: analysis.indicators.macd.histogram > 0 ? "text-emerald-400" : "text-red-400" },
          { label: "ADX",   val: analysis.indicators.adx.toFixed(0), color: analysis.indicators.adx > 30 ? "text-yellow-400" : "text-slate-500" },
          { label: "VWAP",  val: analysis.indicators.aboveVwap ? "ABOVE" : "BELOW", color: analysis.indicators.aboveVwap ? "text-emerald-400" : "text-red-400" },
          { label: "EMA9>21", val: analysis.indicators.ema9 > analysis.indicators.ema21 ? "YES ✅" : "NO ⚠", color: analysis.indicators.ema9 > analysis.indicators.ema21 ? "text-emerald-400" : "text-red-400" },
          { label: "BB%",   val: `${(analysis.indicators.bb.pct * 100).toFixed(0)}%`, color: "text-slate-300" },
          { label: "ROC10", val: `${analysis.indicators.roc10 >= 0 ? "+" : ""}${analysis.indicators.roc10.toFixed(1)}%`, color: analysis.indicators.roc10 > 0 ? "text-emerald-400" : "text-red-400" },
          { label: "Trend", val: analysis.indicators.trend, color: analysis.indicators.trend === "BULLISH" ? "text-emerald-400" : analysis.indicators.trend === "BEARISH" ? "text-red-400" : "text-yellow-400" },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1">
            <span className="text-slate-600">{item.label}</span>
            <span className={`font-mono font-semibold ${item.color}`}>{item.val}</span>
          </div>
        ))}
        <div className="ml-auto text-slate-700 text-xs">{symbol} · {TF_CONFIG[tf].label} · Yahoo Finance</div>
      </div>
    </div>
  );
}

// ─── Alert toast ──────────────────────────────────────────────────────────────

function AlertToast({ alert, onDismiss }: { alert: AlertEntry; onDismiss: () => void }) {
  const isLong = alert.direction === "LONG";
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border animate-pulse-once shadow-xl ${isLong ? "bg-emerald-950 border-emerald-500/40" : "bg-red-950 border-red-500/40"}`}>
      <div className={`mt-0.5 shrink-0 ${isLong ? "text-emerald-400" : "text-red-400"}`}>
        {isLong ? <ArrowUpCircle size={18} /> : <ArrowDownCircle size={18} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-sm">{alert.symbol}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>{alert.direction}</span>
          <span className="text-xs text-slate-500 ml-auto">{alert.ts.toLocaleTimeString()}</span>
        </div>
        <div className="text-xs text-slate-300 mt-0.5">
          Entry at <span className="font-mono text-white">${fmtP(alert.price)}</span> · Win prob: <span className={`font-bold ${alert.winProb >= 65 ? "text-emerald-400" : "text-yellow-400"}`}>{alert.winProb}%</span> · {alert.conviction} conviction
        </div>
      </div>
      <button onClick={onDismiss} className="text-slate-600 hover:text-slate-300 shrink-0"><X size={14} /></button>
    </div>
  );
}

// ─── Favorites monitor ────────────────────────────────────────────────────────

function useFavoritesMonitor(
  favorites: string[],
  onAlert: (entry: AlertEntry) => void,
  enabled: boolean,
) {
  const lastChecked = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!enabled || favorites.length === 0) return;

    const check = async () => {
      for (const sym of favorites) {
        try {
          const [quote, candles] = await Promise.all([fetchQuote(sym), fetchCandles(sym, "5m")]);
          const indicators = computeIndicators(candles);
          const score = indicators.techScore * 0.5 + indicators.volScore * 0.3 + (indicators.aboveVwap ? 65 : 35) * 0.2;
          const direction: Direction = score >= 62 ? "LONG" : score <= 38 ? "SHORT" : "NEUTRAL";
          const conviction: Conviction = Math.abs(score - 50) >= 15 ? "HIGH" : Math.abs(score - 50) >= 8 ? "MEDIUM" : "LOW";
          const winProb = calcWinProb(Math.round(score), indicators, direction);

          // Only alert on HIGH conviction or winProb >= 68
          if (direction === "NEUTRAL" || (conviction !== "HIGH" && winProb < 68)) continue;

          // Rate-limit: only fire once per 10 minutes per symbol
          const now = Date.now();
          if (lastChecked.current[sym] && now - lastChecked.current[sym] < 10 * 60 * 1000) continue;
          lastChecked.current[sym] = now;

          const entry: AlertEntry = {
            id: `${sym}_${now}`, symbol: sym, direction, conviction,
            price: quote.price, winProb, ts: new Date(), seen: false,
          };
          onAlert(entry);

          // Browser notification
          if (Notification.permission === "granted") {
            new Notification(`⚡ ${sym} ${direction} Signal`, {
              body: `Entry at $${fmtP(quote.price)} · Win prob: ${winProb}% · ${conviction} conviction`,
              icon: "/favicon.ico",
            });
          }
        } catch { /* silent */ }
      }
    };

    check(); // immediate first check
    const iv = setInterval(check, 90_000); // every 90s
    return () => clearInterval(iv);
  }, [favorites, enabled, onAlert]);
}

// ─── Main page ────────────────────────────────────────────────────────────────

const QUICK_MAP: Record<AssetType, string[]> = {
  futures: ["ES", "NQ", "CL", "GC", "SI", "ZB", "6E", "NG", "YM", "RTY"],
  stock:   ["AAPL", "NVDA", "TSLA", "MSFT", "SPY", "QQQ", "AMD", "META", "AMZN", "PLTR"],
  crypto:  ["BTC", "ETH", "SOL", "BNB", "DOGE", "XRP"],
};

// ─── Top Opportunities Panel ──────────────────────────────────────────────────

// All symbols to scan for live opportunities
const SCAN_SYMBOLS: { sym: string; type: AssetType; label: string }[] = [
  // Futures
  { sym: "ES",   type: "futures", label: "S&P 500" },
  { sym: "NQ",   type: "futures", label: "NASDAQ"  },
  { sym: "CL",   type: "futures", label: "Crude Oil" },
  { sym: "GC",   type: "futures", label: "Gold"    },
  { sym: "SI",   type: "futures", label: "Silver"  },
  { sym: "NG",   type: "futures", label: "Nat Gas" },
  // Stocks
  { sym: "AAPL", type: "stock",   label: "Apple"   },
  { sym: "NVDA", type: "stock",   label: "NVIDIA"  },
  { sym: "TSLA", type: "stock",   label: "Tesla"   },
  { sym: "SPY",  type: "stock",   label: "S&P ETF" },
  { sym: "QQQ",  type: "stock",   label: "QQQ ETF" },
  { sym: "AMD",  type: "stock",   label: "AMD"     },
  // Crypto
  { sym: "BTC",  type: "crypto",  label: "Bitcoin" },
  { sym: "ETH",  type: "crypto",  label: "Ethereum"},
  { sym: "SOL",  type: "crypto",  label: "Solana"  },
];

const SCAN_INTERVAL_MS = 120_000; // refresh every 2 min

interface LiveOpp {
  sym: string;
  label: string;
  type: AssetType;
  price: number;
  changePct: number;
  direction: Direction;
  winProb: number;
  rsi: number;
  trend: string;
  aboveVwap: boolean;
  macdBull: boolean;
  fetchedAt: Date;
}

function useTopOpportunities() {
  const [opps, setOpps] = useState<LiveOpp[]>([]);
  const [scanning, setScanning] = useState(false);
  const [countdown, setCountdown] = useState(SCAN_INTERVAL_MS / 1000);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const abortRef = useRef<boolean>(false);

  const runScan = useCallback(async () => {
    abortRef.current = false;
    setScanning(true);
    const results: LiveOpp[] = [];

    for (const entry of SCAN_SYMBOLS) {
      if (abortRef.current) break;
      try {
        // Stagger requests to avoid hammering the API
        await new Promise(r => setTimeout(r, 350));
        const [quote, candles] = await Promise.all([
          fetchQuote(entry.sym, entry.type),
          fetchCandles(entry.sym, "5m", entry.type),
        ]);
        const ind = computeIndicators(candles);

        // Use same composite calculation as main analysis (simplified)
        const s = entry.sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
        const r = (o: number) => { const x = Math.sin(s + o) * 10000; return x - Math.floor(x); };
        const instScore  = Math.round(Math.max(5, Math.min(95, 45 + r(10) * 40)));
        const sentScore  = Math.round(Math.max(5, Math.min(95, 38 + r(11) * 45 + (quote.changePct > 0 ? 8 : -5))));
        const macroScore = Math.round(Math.max(5, Math.min(95, 38 + r(12) * 44)));
        const aiScore    = Math.round(Math.max(5, Math.min(95, 42 + r(13) * 48)));
        const asScore    = Math.round(Math.max(5, Math.min(95, 40 + r(14) * 45)));
        const composite  = Math.round(
          ind.techScore * 0.25 + ind.volScore * 0.20 + instScore * 0.15 +
          sentScore * 0.10 + macroScore * 0.10 + aiScore * 0.10 + asScore * 0.10,
        );

        const direction: Direction = composite >= 58 ? "LONG" : composite <= 42 ? "SHORT" : "NEUTRAL";
        const winProb = calcWinProb(composite, ind, direction);

        results.push({
          sym: entry.sym, label: entry.label, type: entry.type,
          price: quote.price, changePct: quote.changePct,
          direction, winProb,
          rsi: ind.rsi, trend: ind.trend,
          aboveVwap: ind.aboveVwap, macdBull: ind.macd.histogram > 0,
          fetchedAt: new Date(),
        });

        // Partial update so user sees results streaming in
        setOpps(prev => {
          const filtered = prev.filter(p => p.sym !== entry.sym);
          return [...filtered, results[results.length - 1]]
            .filter(o => o.direction !== "NEUTRAL")
            .sort((a, b) => b.winProb - a.winProb);
        });
      } catch { /* skip symbol if API fails */ }
    }

    setScanning(false);
    setLastScan(new Date());
    setCountdown(SCAN_INTERVAL_MS / 1000);
  }, []);

  // Initial scan + recurring refresh
  useEffect(() => {
    runScan();
    const iv = setInterval(runScan, SCAN_INTERVAL_MS);
    const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => { abortRef.current = true; clearInterval(iv); clearInterval(tick); };
  }, [runScan]);

  return { opps, scanning, countdown, lastScan, runScan };
}

// Type badge colors
const TYPE_COLORS: Record<AssetType, string> = {
  futures: "bg-blue-500/20 text-blue-400",
  stock:   "bg-purple-500/20 text-purple-400",
  crypto:  "bg-orange-500/20 text-orange-400",
};

// ─── Early Coins Panel ────────────────────────────────────────────────────────

function useEarlyCoins() {
  const [coins, setCoins] = useState<EarlyCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastScan, setLastScan] = useState<Date | null>(null);

  const run = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const res = await fetchEarlyCandidates(force);
      setCoins(res.filter(c => c.earlyScore >= 50).slice(0, 20));
      setLastScan(new Date());
    } catch { /**/ } finally { setLoading(false); }
  }, []);

  useEffect(() => { run(); }, [run]);

  return { coins, loading, lastScan, run };
}

function EarlyCoinsPanel() {
  const { coins, loading, lastScan, run } = useEarlyCoins();
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? coins : coins.slice(0, 8);
  const hot   = coins.filter(c => c.earlyScore >= 80);
  const watch = coins.filter(c => c.earlyScore >= 60 && c.earlyScore < 80);

  return (
    <div className="flex flex-col bg-dark-800 border border-dark-600 rounded-xl overflow-hidden mb-3">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-600 bg-dark-900/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🚀</span>
            <span className="text-sm font-bold text-white">Early Action</span>
            {loading && (
              <span className="flex items-center gap-1 text-xs text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full">
                <RefreshCw size={9} className="animate-spin" />scanning
              </span>
            )}
            {hot.length > 0 && (
              <span className="text-xs bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded-full font-bold">
                {hot.length} 🔥
              </span>
            )}
          </div>
          <button onClick={() => run(true)} disabled={loading}
            className="text-slate-600 hover:text-orange-400 transition-colors disabled:opacity-40">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-1">Meme coins &amp; crypto with early breakout signals</p>
      </div>

      {/* Coin list */}
      <div className="divide-y divide-dark-700/50">
        {coins.length === 0 && loading && (
          <div className="space-y-2 p-3">
            {[0,1,2,3].map(i => <div key={i} className="h-12 bg-dark-700/50 rounded-lg animate-pulse" />)}
          </div>
        )}
        {coins.length === 0 && !loading && (
          <div className="p-4 text-center text-xs text-slate-600">No candidates above 50% score yet.</div>
        )}

        {/* FIRE tier ≥80 */}
        {hot.length > 0 && (
          <div className="px-3 py-1.5 bg-orange-500/5 flex items-center gap-1.5">
            <span className="text-xs font-bold text-orange-400">🔥 EARLY ACTION</span>
            <span className="text-xs text-slate-600">Score ≥80%</span>
          </div>
        )}
        {hot.map(c => <EarlyCoinRow key={c.id} coin={c} />)}

        {/* WATCH tier 60-79 */}
        {watch.length > 0 && (
          <div className="px-3 py-1.5 bg-slate-500/5 flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-400">👁 WATCH</span>
            <span className="text-xs text-slate-600">Score 60–79%</span>
          </div>
        )}
        {(showAll ? watch : watch.slice(0, 4)).map(c => <EarlyCoinRow key={c.id} coin={c} />)}

        {!showAll && coins.length > 8 && (
          <button onClick={() => setShowAll(true)}
            className="w-full py-2 text-xs text-slate-500 hover:text-blue-400 transition-colors">
            Show {coins.length - 8} more…
          </button>
        )}
      </div>

      {/* Footer */}
      {lastScan && (
        <div className="px-3 py-2 border-t border-dark-700 bg-dark-900/20 text-xs text-slate-700 flex items-center justify-between">
          <span>{coins.length} meme/crypto scanned</span>
          <span>{lastScan.toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}

function EarlyCoinRow({ coin }: { coin: EarlyCandidate }) {
  const scoreColor =
    coin.earlyScore >= 80 ? "text-orange-400" :
    coin.earlyScore >= 70 ? "text-yellow-400" :
    coin.earlyScore >= 60 ? "text-emerald-400" : "text-slate-400";
  const barColor =
    coin.earlyScore >= 80 ? "bg-orange-500" :
    coin.earlyScore >= 70 ? "bg-yellow-500" :
    coin.earlyScore >= 60 ? "bg-emerald-500" : "bg-slate-500";
  const ch24color = coin.change24h >= 0 ? "text-emerald-400" : "text-red-400";
  const ch24sign  = coin.change24h >= 0 ? "+" : "";

  return (
    <div className="px-3 py-2 hover:bg-dark-700/40 transition-colors">
      <div className="flex items-center gap-2">
        {/* Coin icon */}
        {coin.image ? (
          <img src={coin.image} alt={coin.symbol} className="w-6 h-6 rounded-full shrink-0" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-dark-600 flex items-center justify-center text-xs shrink-0">
            {coin.symbol.slice(0, 1)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-sm font-bold text-white">{coin.symbol}</span>
            {coin.isGainer && <span className="text-xs px-1 rounded bg-emerald-500/20 text-emerald-300 font-medium">📈 Gainer</span>}
            {coin.isMeme && !coin.isGainer && <span className="text-xs px-1 rounded bg-pink-500/20 text-pink-300 font-medium">MEME</span>}
            {coin.trendingRank > 0 && <span className="text-xs px-1 rounded bg-orange-500/20 text-orange-300 font-medium">🔥#{coin.trendingRank}</span>}
            <span className="text-xs text-slate-600">{coin.category}</span>
            <span className={`text-xs ml-auto ${ch24color} font-semibold`}>{ch24sign}{coin.change24h.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-slate-600">{fmtMcap(coin.marketCap)}</span>
            <span className="text-xs text-slate-700 mx-0.5">·</span>
            <span className="text-xs text-slate-500">${fmtCryptoPrice(coin.price)}</span>
            {coin.change1h !== 0 && (
              <>
                <span className="text-xs text-slate-700 mx-0.5">·</span>
                <span className={`text-xs ${coin.change1h >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  1h: {coin.change1h >= 0 ? "+" : ""}{coin.change1h.toFixed(1)}%
                </span>
              </>
            )}
          </div>
        </div>

        {/* Score */}
        <div className="text-right shrink-0">
          <span className={`text-sm font-bold ${scoreColor}`}>{coin.earlyScore}</span>
          <span className="text-xs text-slate-600">%</span>
        </div>
      </div>

      {/* Score bar */}
      <div className="mt-1.5 h-1 bg-dark-600 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${coin.earlyScore}%` }} />
      </div>
    </div>
  );
}

function TopOpportunitiesPanel({ onSelect }: { onSelect: (sym: string, type: AssetType) => void }) {
  const { opps, scanning, countdown, lastScan, runScan } = useTopOpportunities();
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [minProb, setMinProb] = useState(55);

  const visible = opps
    .filter(o => filter === "ALL" || o.direction === filter)
    .filter(o => o.winProb >= minProb);

  // Split into tiers
  const hot  = visible.filter(o => o.winProb >= 70);
  const good = visible.filter(o => o.winProb >= 58 && o.winProb < 70);
  const watch = visible.filter(o => o.winProb >= minProb && o.winProb < 58);

  return (
    <div className="flex flex-col bg-dark-800 border border-dark-600 rounded-xl overflow-hidden h-fit sticky top-6">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-600 bg-dark-900/40">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-yellow-400" />
            <span className="text-sm font-bold text-white">Top Opportunities</span>
            {scanning && (
              <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">
                <RefreshCw size={9} className="animate-spin" />scanning
              </span>
            )}
          </div>
          <button onClick={runScan} disabled={scanning}
            className="text-slate-600 hover:text-blue-400 transition-colors disabled:opacity-40">
            <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-600">
          <Clock size={9} />
          <span>Refresh in <span className="text-slate-400 font-mono">{countdown}s</span></span>
          {lastScan && <span className="ml-auto">{lastScan.toLocaleTimeString()}</span>}
        </div>
      </div>

      {/* Filters */}
      <div className="px-3 py-2 border-b border-dark-700 flex items-center gap-1.5 flex-wrap">
        {(["ALL", "LONG", "SHORT"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${filter === f
              ? f === "LONG" ? "bg-emerald-600 text-white" : f === "SHORT" ? "bg-red-600 text-white" : "bg-blue-600 text-white"
              : "text-slate-500 hover:text-slate-200"}`}>{f}</button>
        ))}
        <div className="ml-auto flex items-center gap-1 text-xs">
          <span className="text-slate-600">Min:</span>
          <select value={minProb} onChange={e => setMinProb(Number(e.target.value))}
            className="bg-dark-700 border border-dark-600 text-slate-300 text-xs rounded px-1 py-0.5 focus:outline-none">
            {[50, 55, 60, 65, 70].map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="overflow-y-auto max-h-[calc(100vh-220px)] divide-y divide-dark-700/50">
        {opps.length === 0 && !scanning && (
          <div className="p-6 text-center text-xs text-slate-600">
            <Activity size={20} className="mx-auto mb-2 text-slate-700" />
            No data yet — scanning markets…
          </div>
        )}
        {opps.length === 0 && scanning && (
          <div className="space-y-2 p-3">
            {SCAN_SYMBOLS.slice(0, 6).map(s => (
              <div key={s.sym} className="h-14 bg-dark-700/50 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {/* HOT tier */}
        {hot.length > 0 && (
          <>
            <div className="px-3 py-1.5 bg-yellow-500/5 flex items-center gap-1.5">
              <span className="text-xs font-bold text-yellow-400">🔥 HOT</span>
              <span className="text-xs text-slate-600">≥70% win prob</span>
            </div>
            {hot.map(opp => <OppRow key={opp.sym} opp={opp} onSelect={onSelect} />)}
          </>
        )}

        {/* GOOD tier */}
        {good.length > 0 && (
          <>
            <div className="px-3 py-1.5 bg-emerald-500/5 flex items-center gap-1.5">
              <span className="text-xs font-bold text-emerald-400">✓ GOOD</span>
              <span className="text-xs text-slate-600">58–69% win prob</span>
            </div>
            {good.map(opp => <OppRow key={opp.sym} opp={opp} onSelect={onSelect} />)}
          </>
        )}

        {/* WATCH tier */}
        {watch.length > 0 && (
          <>
            <div className="px-3 py-1.5 bg-slate-500/5 flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-400">👁 WATCH</span>
              <span className="text-xs text-slate-600">{minProb}–57%</span>
            </div>
            {watch.map(opp => <OppRow key={opp.sym} opp={opp} onSelect={onSelect} />)}
          </>
        )}

        {visible.length === 0 && opps.length > 0 && (
          <div className="p-4 text-center text-xs text-slate-600">
            No {filter !== "ALL" ? filter : ""} setups above {minProb}% right now
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-dark-700 bg-dark-900/20 text-xs text-slate-700 flex items-center justify-between">
        <span>{opps.filter(o => o.direction !== "NEUTRAL").length} symbols scanned</span>
        <span className="flex items-center gap-1"><Wifi size={9} className="text-emerald-500" /> Yahoo Finance</span>
      </div>
    </div>
  );
}

function OppRow({ opp, onSelect }: { opp: LiveOpp; onSelect: (sym: string, type: AssetType) => void }) {
  const isLong = opp.direction === "LONG";
  const probColor = opp.winProb >= 70 ? "text-yellow-400" : opp.winProb >= 60 ? "text-emerald-400" : "text-slate-300";
  const barColor  = opp.winProb >= 70 ? "bg-yellow-500" : opp.winProb >= 60 ? "bg-emerald-500" : "bg-blue-500";

  return (
    <button onClick={() => onSelect(opp.sym, opp.type)}
      className="w-full px-3 py-2.5 hover:bg-dark-700/60 transition-colors text-left group">
      <div className="flex items-start gap-2">
        {/* Direction icon */}
        <div className={`mt-0.5 shrink-0 ${isLong ? "text-emerald-400" : "text-red-400"}`}>
          {isLong ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">{opp.sym}</span>
            <span className={`text-xs px-1 py-0 rounded font-medium ${TYPE_COLORS[opp.type]}`}>{opp.type.slice(0,3).toUpperCase()}</span>
            <span className={`text-xs ${opp.changePct >= 0 ? "text-emerald-400" : "text-red-400"} ml-auto`}>
              {opp.changePct >= 0 ? "+" : ""}{opp.changePct.toFixed(2)}%
            </span>
          </div>

          {/* Price + label */}
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-xs text-slate-500">{opp.label}</span>
            <span className="text-xs font-mono text-slate-300 ml-auto">${fmtP(opp.price)}</span>
          </div>

          {/* Win prob bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-dark-600 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${opp.winProb}%` }} />
            </div>
            <span className={`text-xs font-bold font-mono w-8 text-right ${probColor}`}>{opp.winProb}%</span>
          </div>

          {/* Indicator tags */}
          <div className="flex gap-1 mt-1.5 flex-wrap">
            <span className={`text-xs px-1 rounded ${opp.rsi < 35 ? "bg-emerald-500/15 text-emerald-400" : opp.rsi > 65 ? "bg-red-500/15 text-red-400" : "bg-dark-600 text-slate-500"}`}>
              RSI {opp.rsi.toFixed(0)}
            </span>
            <span className={`text-xs px-1 rounded ${opp.macdBull ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
              MACD {opp.macdBull ? "↑" : "↓"}
            </span>
            <span className={`text-xs px-1 rounded ${opp.aboveVwap ? "bg-blue-500/15 text-blue-400" : "bg-dark-600 text-slate-500"}`}>
              {opp.aboveVwap ? "▲VWAP" : "▼VWAP"}
            </span>
            <span className={`text-xs px-1 rounded ${opp.trend === "BULLISH" ? "bg-emerald-500/15 text-emerald-400" : opp.trend === "BEARISH" ? "bg-red-500/15 text-red-400" : "bg-dark-600 text-slate-500"}`}>
              {opp.trend}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

export function FuturesScannerPage() {
  const [symbol, setSymbol] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("futures");
  const [userContext, setUserContext] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDir, setSelectedDir] = useState<Direction>("LONG");
  const [analysisUpdatedAt, setAnalysisUpdatedAt] = useState<Date | null>(null);
  const [analysisCountdown, setAnalysisCountdown] = useState(0);
  const [silentRefreshing, setSilentRefreshing] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTickRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentSymRef = useRef<string>("");

  // Favorites
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  // Persist alertsEnabled in localStorage so it survives page navigation + reload
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() => loadAlertsEnabled());
  const [showPhoneSettings, setShowPhoneSettings] = useState(false);

  // In-app alerts — also re-read from localStorage when GlobalAlertMonitor appends
  const [alerts, setAlerts] = useState<AlertEntry[]>(loadAlerts);
  const [showAlerts, setShowAlerts] = useState(false);
  const [toasts, setToasts] = useState<AlertEntry[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);

  // Persist favorites
  useEffect(() => { saveFavorites(favorites); }, [favorites]);

  // Persist alerts
  useEffect(() => { saveAlerts(alerts); }, [alerts]);

  // Persist alertsEnabled
  useEffect(() => { saveAlertsEnabled(alertsEnabled); }, [alertsEnabled]);

  // Request desktop notification permission when alerts enabled
  useEffect(() => {
    if (alertsEnabled && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [alertsEnabled]);

  // Sync in-app alert list when GlobalAlertMonitor fires (storage event)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === ALERT_KEY) setAlerts(loadAlerts());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const toggleFavorite = useCallback((sym: string) => {
    setFavorites(prev => prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]);
  }, []);

  const handleAlertFired = useCallback((entry: AlertEntry) => {
    setAlerts(prev => [entry, ...prev].slice(0, 50));
    setToasts(prev => [entry, ...prev].slice(0, 5));
    // Auto-dismiss toast after 12s
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== entry.id));
    }, 12_000);
  }, []);

  useFavoritesMonitor(favorites, handleAlertFired, alertsEnabled);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please upload an image file."); return; }
    const reader = new FileReader();
    reader.onload = ev => setScreenshot(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const ANALYSIS_REFRESH_MS = 60_000; // re-run full analysis every 60s

  // Silent background re-analysis — updates numbers without clearing the UI
  const silentRefresh = useCallback(async (sym: string, type: AssetType, ctx: string) => {
    if (!sym || silentRefreshing) return;
    setSilentRefreshing(true);
    try {
      const [realQuote, candles] = await Promise.all([
        fetchQuote(sym, type),
        fetchCandles(sym, "5m", type),
      ]);
      const indicators = computeIndicators(candles);
      const result = await buildAnalysis(sym, type, realQuote, indicators, ctx);
      setQuote(realQuote);
      setAnalysis(result);
      setAnalysisUpdatedAt(new Date());
      setAnalysisCountdown(ANALYSIS_REFRESH_MS / 1000);
    } catch { /* keep existing data on failure */ }
    finally { setSilentRefreshing(false); }
  }, [silentRefreshing]);

  // Start auto-refresh loop whenever a symbol is actively loaded
  const startAutoRefresh = useCallback((sym: string, type: AssetType, ctx: string) => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    if (autoTickRef.current)   clearInterval(autoTickRef.current);
    currentSymRef.current = sym;
    setAnalysisCountdown(ANALYSIS_REFRESH_MS / 1000);
    autoRefreshRef.current = setInterval(() => {
      if (currentSymRef.current === sym) silentRefresh(sym, type, ctx);
    }, ANALYSIS_REFRESH_MS);
    autoTickRef.current = setInterval(() => setAnalysisCountdown(c => Math.max(0, c - 1)), 1000);
  }, [silentRefresh]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    if (autoTickRef.current)   clearInterval(autoTickRef.current);
  }, []);

  const handleAnalyze = useCallback(async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) { setError("Enter a symbol first (e.g. ES, NQ, AAPL, BTC)"); return; }
    setError(null); setLoading(true); setAnalysis(null); setQuote(null);
    try {
      const [realQuote, candles] = await Promise.all([fetchQuote(sym, assetType), fetchCandles(sym, "5m", assetType)]);
      const indicators = computeIndicators(candles);
      const result = await buildAnalysis(sym, assetType, realQuote, indicators, userContext);
      setQuote(realQuote);
      setAnalysis(result);
      setSelectedDir(result.direction === "NEUTRAL" ? "LONG" : result.direction);
      setAnalysisUpdatedAt(new Date());
      startAutoRefresh(sym, assetType, userContext);
    } catch {
      setError(`Could not fetch data for "${symbol}". Check the symbol or try again — market may be closed.`);
    } finally { setLoading(false); }
  }, [symbol, assetType, userContext, startAutoRefresh]);

  const handleQuoteUpdate = useCallback((q: Quote) => setQuote(q), []);
  const unseenCount = alerts.filter(a => !a.seen).length;

  const dir = analysis?.direction;
  const dirColor = dir === "LONG" ? "text-emerald-400" : dir === "SHORT" ? "text-red-400" : "text-yellow-400";
  const dirBg = dir === "LONG" ? "bg-emerald-500/10 border-emerald-500/30" : dir === "SHORT" ? "bg-red-500/10 border-red-500/30" : "bg-yellow-500/10 border-yellow-500/30";
  const radarData = useMemo(() => analysis?.modules.map(m => ({ subject: m.name.split(" ")[0], score: m.score })) ?? [], [analysis]);
  const quickPicks = QUICK_MAP[assetType];

  // When user clicks a symbol in the opportunities panel — pre-fill and auto-analyze
  const handleOppSelect = useCallback((sym: string, type: AssetType) => {
    setSymbol(sym);
    setAssetType(type);
    // Trigger analyze immediately after state update
    setTimeout(async () => {
      setError(null); setLoading(true); setAnalysis(null); setQuote(null);
      try {
        const [realQuote, candles] = await Promise.all([fetchQuote(sym, type), fetchCandles(sym, "5m", type)]);
        const indicators = computeIndicators(candles);
        const result = await buildAnalysis(sym, type, realQuote, indicators, "");
        setQuote(realQuote);
        setAnalysis(result);
        setSelectedDir(result.direction === "NEUTRAL" ? "LONG" : result.direction);
        setAnalysisUpdatedAt(new Date());
        startAutoRefresh(sym, type, "");
      } catch {
        setError(`Could not fetch data for "${sym}".`);
      } finally { setLoading(false); }
    }, 50);
  }, [startAutoRefresh]);

  return (
    <div className="flex gap-0 min-h-screen">
      {/* Phone notification settings modal */}
      {showPhoneSettings && (
        <PhoneNotifySettings
          onClose={() => setShowPhoneSettings(false)}
          alertsEnabled={alertsEnabled}
          onAlertsEnabledChange={v => { setAlertsEnabled(v); saveAlertsEnabled(v); }}
        />
      )}
      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 p-6 space-y-6 overflow-y-auto">
      {/* Fixed toast stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 w-80 space-y-2">
          {toasts.map(toast => (
            <AlertToast key={toast.id} alert={toast} onDismiss={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} />
          ))}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Futures & Stock Scanner</h2>
          <p className="text-xs text-slate-500 mt-0.5">Real-time prices · Live RSI, MACD, BB, VWAP · Star symbols to watch for alerts</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Alert toggle */}
          <button onClick={() => setAlertsEnabled(a => !a)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${alertsEnabled ? "bg-blue-600/20 border-blue-500/40 text-blue-400" : "bg-dark-700 border-dark-600 text-slate-500 hover:text-slate-300"}`}>
            {alertsEnabled ? <Bell size={13} /> : <BellOff size={13} />}
            {alertsEnabled ? "Alerts ON" : "Alerts OFF"}
          </button>
          {/* Phone notification settings */}
          <button onClick={() => setShowPhoneSettings(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-dark-700 border border-dark-600 text-slate-400 hover:text-white hover:border-blue-500/40 transition-colors">
            <Smartphone size={13} />Phone Alerts
          </button>
          {/* Alert feed button */}
          <button onClick={() => { setShowAlerts(a => !a); setAlerts(prev => prev.map(a => ({ ...a, seen: true }))); }}
            className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-dark-700 border border-dark-600 text-slate-400 hover:text-white transition-colors">
            <Bell size={13} />Alert Log
            {unseenCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-orange-500 rounded-full text-white text-xs flex items-center justify-center font-bold">{unseenCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Alert log panel */}
      {showAlerts && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Bell size={14} className="text-orange-400" />Alert Log ({alerts.length})</h3>
            <button onClick={() => { setAlerts([]); saveAlerts([]); }} className="text-xs text-slate-600 hover:text-red-400 transition-colors">Clear all</button>
          </div>
          {alerts.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-4">No alerts yet — star symbols and enable alerts to get notified</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {alerts.map(a => (
                <div key={a.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${a.direction === "LONG" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                  <span className={`font-bold ${a.direction === "LONG" ? "text-emerald-400" : "text-red-400"}`}>{a.direction}</span>
                  <span className="text-white font-bold">{a.symbol}</span>
                  <span className="text-slate-500">@ ${fmtP(a.price)}</span>
                  <span className={`font-bold ${a.winProb >= 65 ? "text-emerald-400" : "text-yellow-400"}`}>{a.winProb}%</span>
                  <span className="text-slate-600 ml-auto">{a.ts.toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
          {favorites.length > 0 && (
            <div className="mt-3 pt-3 border-t border-dark-700 text-xs text-slate-500">
              Watching: {favorites.map(f => <span key={f} className="text-blue-400 mr-1.5">★ {f}</span>)}
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {(["futures", "stock", "crypto"] as AssetType[]).map(t => (
            <button key={t} onClick={() => setAssetType(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${assetType === t ? "bg-blue-600 text-white" : "bg-dark-700 text-slate-400 hover:text-slate-200"}`}>
              {t === "futures" ? "📊 Futures" : t === "stock" ? "📈 Stocks" : "🪙 Crypto"}
            </button>
          ))}
          <div className="ml-2 text-xs text-slate-600 flex items-center gap-1"><Wifi size={11} className="text-emerald-500" /> Live: Yahoo Finance</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              Symbol {assetType === "futures" ? "(ES, NQ, CL, GC…)" : assetType === "stock" ? "(AAPL, NVDA, SPY…)" : "(BTC, ETH, SOL…)"}
            </label>
            <div className="flex gap-2">
              <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleAnalyze()}
                placeholder={assetType === "futures" ? "ES" : assetType === "stock" ? "AAPL" : "BTC"}
                className="flex-1 bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500" />
              <button onClick={handleAnalyze} disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2">
                <Search size={14} />{loading ? "Loading…" : "Analyze"}
              </button>
            </div>
            {/* Quick picks with star buttons */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {quickPicks.map(s => {
                const isFav = favorites.includes(s);
                return (
                  <div key={s} className="flex items-center rounded overflow-hidden border border-dark-600 bg-dark-700">
                    <button onClick={() => setSymbol(s)}
                      className="text-xs text-slate-400 hover:text-white px-2 py-1 transition-colors">{s}</button>
                    <button onClick={() => toggleFavorite(s)}
                      className={`px-1.5 py-1 text-xs transition-colors border-l border-dark-600 ${isFav ? "text-yellow-400 hover:text-yellow-300" : "text-slate-600 hover:text-yellow-400"}`}
                      title={isFav ? "Remove from favorites" : "Add to favorites"}>
                      <Star size={10} fill={isFav ? "currentColor" : "none"} />
                    </button>
                  </div>
                );
              })}
            </div>
            {favorites.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                <span className="text-xs text-slate-600">Watching:</span>
                {favorites.map(f => (
                  <button key={f} onClick={() => setSymbol(f)}
                    className="text-xs bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors">
                    <Star size={9} fill="currentColor" />{f}
                    <span onClick={e => { e.stopPropagation(); toggleFavorite(f); }} className="text-yellow-600 hover:text-red-400 ml-0.5"><X size={9} /></span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Chart observations / thesis</label>
            <textarea value={userContext} onChange={e => setUserContext(e.target.value)}
              placeholder="e.g. 'Breakout above daily resistance, volume surge, VWAP reclaim on 5m'"
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none h-[72px]" />
          </div>
        </div>

        <div className="flex items-start gap-4">
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 bg-dark-700 border border-dark-500 hover:border-blue-500 rounded-lg text-slate-400 hover:text-white text-xs transition-colors">
            <Upload size={12} />Upload Chart Screenshot
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          {screenshot && (
            <div className="relative flex-shrink-0">
              <img src={screenshot} alt="Chart" className="h-14 rounded border border-dark-500 object-cover" />
              <button onClick={() => setScreenshot(null)} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 text-white"><X size={10} /></button>
            </div>
          )}
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
      </div>

      {loading && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-slate-300 text-sm">Fetching live market data for <span className="text-blue-400 font-bold">{symbol}</span>…</p>
          <p className="text-slate-600 text-xs mt-1">RSI · MACD · Bollinger Bands · VWAP · Price history</p>
        </div>
      )}

      {analysis && quote && !loading && (
        <div className="space-y-6">
          {/* Live update status bar */}
          <div className="flex items-center gap-3 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-xs">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${silentRefreshing ? "bg-blue-400 animate-pulse" : "bg-emerald-400 animate-pulse"}`} />
              <span className="text-slate-400">{silentRefreshing ? "Updating analysis…" : "Live — auto-refreshes every 60s"}</span>
            </div>
            {analysisUpdatedAt && (
              <span className="text-slate-600">Last updated: {analysisUpdatedAt.toLocaleTimeString()}</span>
            )}
            <div className="ml-auto flex items-center gap-2 text-slate-500">
              <RefreshCw size={11} className={silentRefreshing ? "animate-spin text-blue-400" : ""} />
              <span>Next in <span className="font-mono text-slate-300">{analysisCountdown}s</span></span>
              <button
                onClick={() => silentRefresh(symbol.trim().toUpperCase(), assetType, userContext)}
                disabled={silentRefreshing}
                className="ml-1 px-2 py-0.5 bg-dark-700 hover:bg-dark-600 rounded text-slate-400 hover:text-white transition-colors disabled:opacity-40"
              >
                Refresh now
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className={`border rounded-xl p-5 ${dirBg}`}>
            <div className="flex flex-wrap items-start gap-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl font-bold text-white">{analysis.symbol}</span>
                  <button onClick={() => toggleFavorite(analysis.symbol)}
                    className={`transition-colors ${favorites.includes(analysis.symbol) ? "text-yellow-400 hover:text-yellow-300" : "text-slate-600 hover:text-yellow-400"}`}
                    title={favorites.includes(analysis.symbol) ? "Remove from favorites" : "Add to favorites"}>
                    <Star size={18} fill={favorites.includes(analysis.symbol) ? "currentColor" : "none"} />
                  </button>
                </div>
                <div className="text-xs text-slate-400">{quote.name}</div>
                <div className="text-xs text-slate-600">{quote.exchange} · {quote.currency}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Live Price</div>
                <div className="text-2xl font-bold text-white font-mono">${fmtP(quote.price)}</div>
                <div className={`text-sm ${quote.changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {quote.changePct >= 0 ? "▲" : "▼"} {Math.abs(quote.changePct).toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">AI Signal</div>
                <div className={`text-2xl font-bold ${dirColor} flex items-center gap-2`}>
                  {dir === "LONG" ? <TrendingUp size={22} /> : dir === "SHORT" ? <TrendingDown size={22} /> : <Activity size={22} />}
                  {dir}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Score</div>
                <div className={`text-2xl font-bold ${scoreColor(analysis.compositeScore)}`}>{analysis.compositeScore}/100</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Win Prob (AI dir)</div>
                <div className={`text-2xl font-bold ${calcWinProb(analysis.compositeScore, analysis.indicators, analysis.direction) >= 65 ? "text-emerald-400" : calcWinProb(analysis.compositeScore, analysis.indicators, analysis.direction) >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                  {calcWinProb(analysis.compositeScore, analysis.indicators, analysis.direction)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Live Indicators</div>
                <div className="text-xs space-y-0.5">
                  <div className="flex gap-2"><span className="text-slate-500">RSI</span><span className={`font-mono font-bold ${analysis.indicators.rsi > 70 ? "text-red-400" : analysis.indicators.rsi < 30 ? "text-emerald-400" : "text-slate-200"}`}>{analysis.indicators.rsi.toFixed(1)}</span></div>
                  <div className="flex gap-2"><span className="text-slate-500">MACD</span><span className={`font-mono font-bold ${analysis.indicators.macd.histogram > 0 ? "text-emerald-400" : "text-red-400"}`}>{analysis.indicators.macd.histogram > 0 ? "+" : ""}{analysis.indicators.macd.histogram.toFixed(4)}</span></div>
                  <div className="flex gap-2"><span className="text-slate-500">BB%</span><span className="font-mono text-slate-200">{(analysis.indicators.bb.pct * 100).toFixed(0)}%</span></div>
                  <div className="flex gap-2"><span className="text-slate-500">VWAP</span><span className={`font-mono font-bold ${analysis.indicators.aboveVwap ? "text-emerald-400" : "text-red-400"}`}>${fmtP(analysis.indicators.vwap)}</span></div>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Favorited</div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleFavorite(analysis.symbol)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${favorites.includes(analysis.symbol) ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-400" : "bg-dark-700 border-dark-600 text-slate-500 hover:text-yellow-400 hover:border-yellow-500/40"}`}>
                    <Star size={12} fill={favorites.includes(analysis.symbol) ? "currentColor" : "none"} />
                    {favorites.includes(analysis.symbol) ? "Watching" : "Watch"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* LIVE CHART */}
          <LiveChart symbol={analysis.symbol} analysis={analysis} quote={quote} onQuoteUpdate={handleQuoteUpdate} assetType={analysis.assetType} />

          {/* Trade Setup + Radar side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TradeDirectionPanel
              analysis={analysis} quote={quote}
              selectedDir={selectedDir}
              onDirChange={(d) => setSelectedDir(d)}
            />

            {/* ── Limit Order Panel ── */}
            {(() => {
              const setup = selectedDir === "NEUTRAL" ? analysis.setup
                : buildSetup(quote.price, selectedDir, analysis.assetType, analysis.conviction,
                    analysis.compositeScore, analysis.indicators, "");
              return <LimitOrderPanel setup={setup} symbol={analysis.symbol} />;
            })()}

            {/* ── Market Intelligence Panel ── */}
            {analysis.intel && <MarketIntelPanel intel={analysis.intel} />}

            <div className="space-y-4">
              {/* Radar */}
              <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                  <Brain size={16} className="text-purple-400" />Multi-Agent Score
                </h3>
                <p className="text-xs text-slate-600 mb-2">Technical & Volume from real {analysis.symbol} data.</p>
                <ResponsiveContainer width="100%" height={180}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1e2d45" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
                  </RadarChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1.5">
                  {analysis.modules.map(m => (
                    <div key={m.name} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-36 truncate">{m.name}</span>
                      <div className="flex-1 bg-dark-600 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${scoreColor(m.score, false)}`} style={{ width: `${m.score}%` }} />
                      </div>
                      <span className={`text-xs font-bold w-6 text-right ${scoreColor(m.score)}`}>{m.score}</span>
                      <span className="text-xs text-slate-600 w-8 text-right">{m.weight}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Futures intel */}
          {analysis.assetType === "futures" && analysis.cot && (
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><Zap size={16} className="text-yellow-400" />Futures Intelligence</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "COT Commercials", val: `${analysis.cot.commercial > 0 ? "+" : ""}${analysis.cot.commercial.toLocaleString()}`, sub: "Smart money", color: analysis.cot.commercial < 0 ? "text-emerald-400" : "text-red-400" },
                  { label: "Large Specs", val: `${analysis.cot.nonCommercial > 0 ? "+" : ""}${analysis.cot.nonCommercial.toLocaleString()}`, sub: "Fund positioning", color: analysis.cot.nonCommercial > 0 ? "text-emerald-400" : "text-red-400" },
                  { label: "Open Interest", val: analysis.openInterest?.toLocaleString() ?? "—", sub: "contracts", color: "text-white" },
                  { label: "VIX (approx)", val: `${analysis.vixLevel}`, sub: (analysis.vixLevel ?? 0) > 25 ? "High — size down" : "Normal", color: (analysis.vixLevel ?? 0) > 25 ? "text-red-400" : "text-emerald-400" },
                ].map(item => (
                  <div key={item.label} className="bg-dark-700 rounded-lg p-3 text-center">
                    <div className="text-xs text-slate-500 mb-1">{item.label}</div>
                    <div className={`font-bold text-lg ${item.color}`}>{item.val}</div>
                    <div className="text-xs text-slate-600">{item.sub}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-700 mt-3">COT/OI modeled — real data requires CFTC feed.</p>
            </div>
          )}

          {/* Equity intel */}
          {analysis.assetType === "stock" && analysis.optionsFlow && (
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><BarChart2 size={16} className="text-blue-400" />Equity Intelligence</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "P/C Ratio", val: `${analysis.optionsFlow.ratio}`, color: analysis.optionsFlow.ratio < 0.8 ? "text-emerald-400" : "text-red-400" },
                  { label: "Dark Pool", val: `${analysis.darkPool?.pct}%`, color: "text-purple-400" },
                  { label: "Short Interest", val: `${analysis.shortInterest}%`, color: (analysis.shortInterest ?? 0) > 15 ? "text-orange-400" : "text-emerald-400" },
                  { label: "Unusual Options", val: analysis.optionsFlow.unusualActivity ? "⚡ YES" : "None", color: analysis.optionsFlow.unusualActivity ? "text-orange-400" : "text-slate-400" },
                ].map(item => (
                  <div key={item.label} className="bg-dark-700 rounded-lg p-3 text-center">
                    <div className="text-xs text-slate-500 mb-1">{item.label}</div>
                    <div className={`font-bold text-lg ${item.color}`}>{item.val}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-700 mt-2">Options/dark pool modeled — real data: Unusual Whales.</p>
            </div>
          )}

          {/* Module deep-dive */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2"><Shield size={16} className="text-slate-400" />Module Deep-Dive</h3>
            <div className="space-y-2">{analysis.modules.map(mod => <ModuleCard key={mod.name} mod={mod} />)}</div>
          </div>

          <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 text-xs text-slate-600 space-y-1">
            <div>✅ <span className="text-slate-400">Real data</span>: Price, OHLCV, RSI, MACD, Bollinger Bands, VWAP — live from Yahoo Finance ({analysis.yahooTicker})</div>
            <div>⚠ <span className="text-slate-400">Modeled</span>: COT reports, options flow, dark pool, short interest — require paid APIs (CFTC, Unusual Whales, S3)</div>
            <div>📌 Not financial advice. Verify all levels with your broker before trading.</div>
          </div>
        </div>
      )}
      </div>

      {/* ── Live Opportunities Sidebar ── */}
      <div className="w-72 shrink-0 border-l border-dark-700 bg-dark-900/20 p-3 overflow-y-auto max-h-screen">
        <EarlyCoinsPanel />
        <TopOpportunitiesPanel onSelect={handleOppSelect} />
      </div>
    </div>
  );
}
