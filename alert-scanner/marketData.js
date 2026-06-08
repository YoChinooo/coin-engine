// ─── Market Data (Yahoo Finance) ──────────────────────────────────────────────
// Fetches OHLCV candles and real-time quote. No CORS proxy needed server-side.

import axios from "axios";

const YF_BASE = "https://query1.finance.yahoo.com";

const http = axios.create({
  timeout: 12_000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; CoinEngineScanner/1.0)",
  },
});

/** Map common short names to Yahoo tickers */
export function toYahooTicker(sym) {
  const MAP = {
    ES: "ES=F", NQ: "NQ=F", CL: "CL=F", GC: "GC=F",
    SI: "SI=F", NG: "NG=F", ZB: "ZB=F", YM: "YM=F", RTY: "RTY=F",
    BTC: "BTC-USD", ETH: "ETH-USD", SOL: "SOL-USD", DOGE: "DOGE-USD",
  };
  return MAP[sym] ?? sym;
}

/** Fetch the latest quote for a symbol */
export async function fetchQuote(sym) {
  const ticker = toYahooTicker(sym);
  const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m`;
  const { data } = await http.get(url);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${ticker}`);
  const meta = result.meta;
  const price    = meta.regularMarketPrice ?? meta.previousClose;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
  return {
    price,
    changePct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
    volume: meta.regularMarketVolume ?? 0,
  };
}

/** Fetch OHLCV candles */
export async function fetchCandles(sym, interval = "5m", range = "5d") {
  const ticker = toYahooTicker(sym);
  const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
  const { data } = await http.get(url);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No candles for ${ticker}`);

  const ts     = result.timestamps ?? [];
  const ohlcv  = result.indicators?.quote?.[0] ?? {};
  const candles = [];

  for (let i = 0; i < ts.length; i++) {
    const o = ohlcv.open?.[i], h = ohlcv.high?.[i], l = ohlcv.low?.[i],
          c = ohlcv.close?.[i], v = ohlcv.volume?.[i];
    if (o != null && h != null && l != null && c != null) {
      candles.push({ time: ts[i] * 1000, open: o, high: h, low: l, close: c, volume: v ?? 0 });
    }
  }
  return candles;
}

// ─── Indicator calculations ───────────────────────────────────────────────────

function ema(values, period) {
  const k = 2 / (period + 1);
  const out = [];
  let prev = null;
  for (const v of values) {
    if (prev === null) { prev = v; out.push(v); continue; }
    prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function sma(values, period) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    const slice = values.slice(i - period + 1, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return out;
}

/** Compute all indicators from candle array */
export function computeIndicators(candles) {
  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const n = closes.length;

  // ── RSI (Wilder's) ──────────────────────────────────────────────────────
  let gains = 0, losses = 0;
  const period = 14;
  for (let i = 1; i <= period && i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period;
  }
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // ── MACD ────────────────────────────────────────────────────────────────
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const histogram = macdLine[n - 1] - signalLine[n - 1];
  const macd = { macd: macdLine[n - 1], signal: signalLine[n - 1], histogram };

  // ── Bollinger Bands ──────────────────────────────────────────────────────
  const sma20arr = sma(closes, 20);
  const mid = sma20arr[n - 1];
  const slice = closes.slice(n - 20);
  const variance = slice.reduce((a, v) => a + (v - mid) ** 2, 0) / 20;
  const std = Math.sqrt(variance);
  const upper = mid + 2 * std, lower = mid - 2 * std;
  const bbPct = std > 0 ? (closes[n - 1] - lower) / (upper - lower) : 0.5;
  const bb = { upper, lower, mid, pct: bbPct };

  // ── VWAP ─────────────────────────────────────────────────────────────────
  let cumPV = 0, cumVol = 0;
  for (let i = 0; i < n; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumPV += tp * volumes[i];
    cumVol += volumes[i];
  }
  const vwap = cumVol > 0 ? cumPV / cumVol : closes[n - 1];
  const aboveVwap = closes[n - 1] > vwap;

  // ── SMA 20 / 50 ──────────────────────────────────────────────────────────
  const sma50arr = sma(closes, 50);
  const sma20 = mid;
  const sma50 = sma50arr[n - 1];

  // ── Composite scores ──────────────────────────────────────────────────────
  let techPts = 0;
  techPts += rsi < 35 ? 20 : rsi < 50 ? 10 : rsi > 65 ? -10 : 5;
  techPts += macd.histogram > 0 ? 15 : -10;
  techPts += macd.macd > macd.signal ? 10 : -5;
  techPts += bbPct < 0.25 ? 12 : bbPct > 0.8 ? -8 : 0;
  const techScore = Math.min(95, Math.max(5, 50 + techPts));

  let volPts = 0;
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  volPts += volumes[n - 1] > avgVol * 1.5 ? 20 : volumes[n - 1] > avgVol ? 10 : 0;
  volPts += aboveVwap ? 8 : -5;
  const volScore = Math.min(95, Math.max(5, 50 + volPts));

  return { rsi, macd, bb, aboveVwap, vwap, sma20, sma50, techScore, volScore };
}

/** Calculate win probability (28–88%) */
export function calcWinProb(composite, ind, isLong) {
  const { rsi, macd, bb, aboveVwap, sma20, sma50 } = ind;
  let pts = 0;
  pts += isLong ? (rsi < 35 ? 8 : rsi < 50 ? 4 : rsi > 65 ? -4 : 0)
                : (rsi > 65 ? 8 : rsi > 50 ? 4 : rsi < 35 ? -4 : 0);
  pts += isLong ? (macd.histogram > 0 ? 7 : -5) : (macd.histogram < 0 ? 7 : -5);
  pts += isLong ? (macd.macd > macd.signal ? 4 : -2) : (macd.macd < macd.signal ? 4 : -2);
  pts += isLong ? (bb.pct < 0.25 ? 6 : bb.pct > 0.8 ? -4 : 0)
                : (bb.pct > 0.75 ? 6 : bb.pct < 0.2 ? -4 : 0);
  pts += isLong ? (aboveVwap ? 5 : -3) : (!aboveVwap ? 5 : -3);
  pts += isLong ? (sma20 > sma50 ? 4 : -2) : (sma20 < sma50 ? 4 : -2);
  const base = isLong ? 40 + (composite - 50) * 0.5 : 40 + (50 - composite) * 0.5;
  return Math.min(88, Math.max(28, Math.round(base + pts)));
}
