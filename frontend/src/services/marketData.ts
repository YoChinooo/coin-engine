import axios from "axios";

// ─── Symbol mapping: our names → Yahoo Finance tickers ────────────────────────

// ─── Futures symbols that map to Yahoo =F continuous contracts ────────────────
// Any symbol in this set gets "=F" appended if not already mapped explicitly.
export const FUTURES_SYMBOLS = new Set([
  // Equity index
  "ES","NQ","YM","RTY","EMD","NKD","MES","MNQ","MYM","M2K",
  // Energy
  "CL","NG","RB","HO","BZ","QM","MCL",
  // Metals
  "GC","SI","HG","PL","PA","MGC","SIL",
  // Agriculture
  "ZC","ZS","ZW","ZO","ZL","ZM","KC","CT","SB","CC","OJ","LE","HE","GF",
  // Rates / Bonds
  "ZB","ZN","ZF","ZT","GE","SR3",
  // FX
  "6E","6J","6B","6A","6C","6S","6M","6N","6Z",
  // Vol / Other
  "VX","UX",
]);

// ─── Crypto symbols that map to Yahoo -USD ────────────────────────────────────
export const CRYPTO_SYMBOLS = new Set([
  "BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","DOT","LINK",
  "MATIC","SHIB","PEPE","FLOKI","BONK","WIF","POPCAT","MEME","BRETT",
  "MOG","TURBO","NEIRO","GOAT","PNUT","ACT","VIRTUAL","AI16Z",
  "LTC","BCH","UNI","AAVE","CRV","MKR","SNX","COMP","SUSHI","YFI",
  "FIL","GRT","NEAR","FTM","OP","ARB","APT","SUI","INJ","TIA",
  "ATOM","ALGO","HBAR","ICP","VET","ETC","XLM","SAND","MANA","AXS",
  "GALA","IMX","APE","LRC","FLOW","ONE","ZIL","ENJ","CHZ","HOT",
  "JASMY","ANKR","CELR","SKL","NMR","OCEAN","FET","AGIX","RNDR",
  "WLD","CFX","KAVA","GMT","STEPN","AXL","PYTH","JUP","W","TNSR",
]);

export const SYMBOL_MAP: Record<string, string> = {
  // ── Futures (explicit overrides) ──────────────────────────────────────────
  "ES":"ES=F","NQ":"NQ=F","YM":"YM=F","RTY":"RTY=F",
  "MES":"MES=F","MNQ":"MNQ=F","MYM":"MYM=F","M2K":"M2K=F",
  "CL":"CL=F","NG":"NG=F","BZ":"BZ=F","QM":"QM=F","MCL":"MCL=F",
  "GC":"GC=F","SI":"SI=F","HG":"HG=F","PL":"PL=F","PA":"PA=F",
  "MGC":"MGC=F","SIL":"SIL=F",
  "ZB":"ZB=F","ZN":"ZN=F","ZF":"ZF=F","ZT":"ZT=F",
  "ZC":"ZC=F","ZS":"ZS=F","ZW":"ZW=F","ZO":"ZO=F","ZL":"ZL=F","ZM":"ZM=F",
  "KC":"KC=F","CT":"CT=F","SB":"SB=F","CC":"CC=F","OJ":"OJ=F",
  "LE":"LE=F","HE":"HE=F","GF":"GF=F",
  "RB":"RB=F","HO":"HO=F",
  "6E":"6E=F","6J":"6J=F","6B":"6B=F","6A":"6A=F","6C":"6C=F",
  "6S":"6S=F","6M":"6M=F","6N":"6N=F","6Z":"6Z=F",
  "VX":"VX=F",
  // ── Popular stocks (pass-through but explicit for clarity) ─────────────
  "AAPL":"AAPL","NVDA":"NVDA","TSLA":"TSLA","MSFT":"MSFT",
  "AMZN":"AMZN","GOOGL":"GOOGL","GOOG":"GOOG","META":"META",
  "SPY":"SPY","QQQ":"QQQ","IWM":"IWM","DIA":"DIA","VXX":"VXX",
  "AMD":"AMD","INTC":"INTC","QCOM":"QCOM","AVGO":"AVGO",
  "COIN":"COIN","MSTR":"MSTR","HOOD":"HOOD","RIOT":"RIOT","MARA":"MARA",
  "PLTR":"PLTR","SOFI":"SOFI","GME":"GME","AMC":"AMC","BBBY":"BBBY",
  "NFLX":"NFLX","DIS":"DIS","PYPL":"PYPL","SQ":"SQ","SHOP":"SHOP",
  "UBER":"UBER","LYFT":"LYFT","SNAP":"SNAP","PINS":"PINS","TWTR":"TWTR",
  "BA":"BA","LMT":"LMT","RTX":"RTX","GE":"GE","CAT":"CAT","DE":"DE",
  "JPM":"JPM","GS":"GS","MS":"MS","BAC":"BAC","C":"C","WFC":"WFC",
  "XOM":"XOM","CVX":"CVX","OXY":"OXY","SLB":"SLB",
  "GLD":"GLD","SLV":"SLV","USO":"USO","UNG":"UNG",
  "TQQQ":"TQQQ","SQQQ":"SQQQ","SPXL":"SPXL","SPXS":"SPXS",
  "SOXL":"SOXL","SOXS":"SOXS","UVXY":"UVXY","SVXY":"SVXY",
  // ── Crypto ─────────────────────────────────────────────────────────────
  "BTC":"BTC-USD","ETH":"ETH-USD","SOL":"SOL-USD","BNB":"BNB-USD",
  "XRP":"XRP-USD","DOGE":"DOGE-USD","ADA":"ADA-USD","AVAX":"AVAX-USD",
  "DOT":"DOT-USD","LINK":"LINK-USD","MATIC":"MATIC-USD","SHIB":"SHIB-USD",
  "PEPE":"PEPE-USD","FLOKI":"FLOKI-USD","BONK":"BONK-USD","WIF":"WIF-USD",
  "LTC":"LTC-USD","BCH":"BCH-USD","UNI":"UNI-USD","AAVE":"AAVE-USD",
  "FIL":"FIL-USD","NEAR":"NEAR-USD","FTM":"FTM-USD","OP":"OP-USD",
  "ARB":"ARB-USD","APT":"APT-USD","SUI":"SUI-USD","INJ":"INJ-USD",
  "ATOM":"ATOM-USD","ALGO":"ALGO-USD","HBAR":"HBAR-USD","ICP":"ICP-USD",
  "ETC":"ETC-USD","XLM":"XLM-USD","SAND":"SAND-USD","MANA":"MANA-USD",
  "AXS":"AXS-USD","GALA":"GALA-USD","IMX":"IMX-USD","APE":"APE-USD",
  "FET":"FET-USD","RNDR":"RNDR-USD","WLD":"WLD-USD","JUP":"JUP-USD",
};

/** Resolve any symbol to a Yahoo Finance ticker.
 *  assetType hint lets us auto-apply =F or -USD for unlisted symbols. */
export function toYahooTicker(sym: string, assetType?: "futures" | "stock" | "crypto"): string {
  const upper = sym.toUpperCase().trim();
  // 1. Explicit map always wins
  if (SYMBOL_MAP[upper]) return SYMBOL_MAP[upper];
  // 2. Already formatted
  if (upper.endsWith("=F") || upper.endsWith("-USD")) return upper;
  // 3. Asset-type hints
  if (assetType === "futures" || FUTURES_SYMBOLS.has(upper)) return `${upper}=F`;
  if (assetType === "crypto"  || CRYPTO_SYMBOLS.has(upper))  return `${upper}-USD`;
  // 4. Stocks pass through as-is (Yahoo uses raw ticker for US equities)
  return upper;
}

// ─── Timeframe → Yahoo interval/range ────────────────────────────────────────

type TF = "1m" | "5m" | "15m" | "1h" | "4h" | "1D";

const TF_YAHOO: Record<TF, { interval: string; range: string }> = {
  "1m":  { interval: "1m",  range: "1d" },
  "5m":  { interval: "5m",  range: "5d" },
  "15m": { interval: "15m", range: "5d" },
  "1h":  { interval: "60m", range: "1mo" },
  "4h":  { interval: "60m", range: "3mo" },  // aggregate 4×1h
  "1D":  { interval: "1d",  range: "6mo" },
};

// ─── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL: Record<TF, number> = {
  "1m": 10_000, "5m": 20_000, "15m": 30_000,
  "1h": 60_000, "4h": 120_000, "1D": 300_000,
};
const QUOTE_TTL = 8_000; // live price refreshes every 8s

interface CacheEntry<T> { data: T; ts: number }
const cache = new Map<string, CacheEntry<any>>();

function cGet<T>(key: string, ttl: number): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > ttl) { cache.delete(key); return null; }
  return e.data as T;
}
function cSet(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// ─── HTTP fetch via Vercel reverse-proxy rewrites (zero CORS issues) ─────────
//
// Vercel rewrites proxy the request server-side:
//   /yf/v8/finance/chart/NQ%3DF?interval=60m&range=2d
//   → https://query1.finance.yahoo.com/v8/finance/chart/NQ%3DF?...
//
// Because the browser calls the SAME domain (/yf/...), CORS never applies.
// No serverless function needed — pure edge rewrite.

async function yahooFetch(path: string): Promise<any> {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  // Primary: serverless function (/api/yahoo) — sets proper User-Agent/Referer headers
  if (!isLocal) {
    try {
      const { data } = await axios.get(`/api/yahoo`, {
        params: { path },
        timeout: 15_000,
      });
      if (data?.chart?.result?.[0]) return data;
    } catch { /* fall through to rewrite */ }

    // Secondary: Vercel edge rewrite → query1 (no custom headers but faster)
    try {
      const { data } = await axios.get(`/yf${path}`, { timeout: 15_000 });
      if (data?.chart?.result?.[0]) return data;
    } catch { /* fall through */ }

    // Tertiary: Vercel edge rewrite → query2
    try {
      const { data } = await axios.get(`/yf2${path}`, { timeout: 15_000 });
      if (data?.chart?.result?.[0]) return data;
    } catch { /* fall through */ }
  }

  // Local dev fallback (no proxy needed — CORS not blocked by browser for localhost)
  if (isLocal) {
    for (const host of ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]) {
      try {
        const { data } = await axios.get(`${host}${path}`, { timeout: 12_000 });
        if (data?.chart?.result?.[0]) return data;
      } catch { /* try next */ }
    }
  }

  throw new Error(`Yahoo Finance unavailable — try again in a few seconds`);
}

/** Build ticker candidates to try — handles unknown symbols gracefully */
function buildTickerCandidates(sym: string, assetType?: "futures" | "stock" | "crypto"): string[] {
  const upper = sym.toUpperCase().trim();
  const mapped = toYahooTicker(upper, assetType);
  const candidates = new Set<string>([mapped]);
  // If no explicit hint, also try alternate formats
  if (!assetType) {
    if (!upper.endsWith("=F") && !upper.endsWith("-USD")) {
      candidates.add(`${upper}=F`);    // try as futures
      candidates.add(`${upper}-USD`);  // try as crypto
    }
  }
  candidates.add(upper); // raw symbol last resort
  return [...candidates];
}

async function yahooFetchWithFallback(path: string, sym: string, assetType?: "futures" | "stock" | "crypto"): Promise<any> {
  const candidates = buildTickerCandidates(sym, assetType);
  for (const ticker of candidates) {
    const tickerPath = path.replace("__TICKER__", encodeURIComponent(ticker));
    try {
      const data = await yahooFetch(tickerPath);
      if (data?.chart?.result?.[0]) return data;
    } catch { /* try next ticker format */ }
  }
  throw new Error(`No data found for "${sym}" — check the symbol and try again`);
}

// ─── Candle type ──────────────────────────────────────────────────────────────

export interface Candle {
  t: string;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
  range: [number, number];
  bullVol: number;
  bearVol: number;
}

// ─── Parse Yahoo chart response into Candle[] ─────────────────────────────────

function parseCandles(result: any, tf: TF): Candle[] {
  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const opens   = q.open   ?? [];
  const highs   = q.high   ?? [];
  const lows    = q.low    ?? [];
  const closes  = q.close  ?? [];
  const volumes = q.volume ?? [];

  // Compute median close first so we can filter outlier candles
  const validCloses = (closes as number[]).filter(c => c != null && isFinite(c) && c > 0);
  const medianClose = validCloses.length > 0
    ? validCloses.slice().sort((a, b) => a - b)[Math.floor(validCloses.length / 2)]
    : 0;

  const raw: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i], h = highs[i], l = lows[i], c = closes[i], v = volumes[i];
    if (o == null || h == null || l == null || c == null) continue;
    // Drop corrupted candles: close must be within 15% of median (catches stale/zero data)
    if (medianClose > 0 && (c < medianClose * 0.85 || c > medianClose * 1.15)) continue;
    // Drop zero/negative OHLC
    if (o <= 0 || h <= 0 || l <= 0 || c <= 0) continue;
    const ts = timestamps[i] * 1000;
    const date = new Date(ts);
    let label: string;
    if (tf === "1D") {
      label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } else if (tf === "4h" || tf === "1h") {
      label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
              date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    } else {
      label = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    raw.push({
      t: label, ts,
      open: o, high: h, low: l, close: c, vol: v ?? 0,
      range: [l, h],
      bullVol: c >= o ? (v ?? 0) : 0,
      bearVol: c < o  ? (v ?? 0) : 0,
    });
  }

  // For 4h: aggregate every 4 × 1h candles
  if (tf === "4h") {
    const agg: Candle[] = [];
    for (let i = 0; i + 3 < raw.length; i += 4) {
      const slice = raw.slice(i, i + 4);
      const o = slice[0].open;
      const h = Math.max(...slice.map(c => c.high));
      const l = Math.min(...slice.map(c => c.low));
      const cl = slice[slice.length - 1].close;
      const vol = slice.reduce((s, c) => s + c.vol, 0);
      agg.push({ ...slice[slice.length - 1], open: o, high: h, low: l, close: cl, vol, range: [l, h], bullVol: cl >= o ? vol : 0, bearVol: cl < o ? vol : 0 });
    }
    return agg.slice(-30);
  }

  return raw;
}

// ─── Public: fetch candles ────────────────────────────────────────────────────

export async function fetchCandles(symbol: string, tf: TF, assetType?: "futures" | "stock" | "crypto"): Promise<Candle[]> {
  const ticker = toYahooTicker(symbol, assetType);
  const key = `candles_${ticker}_${tf}`;
  const cached = cGet<Candle[]>(key, CACHE_TTL[tf]);
  if (cached) return cached;

  const { interval, range } = TF_YAHOO[tf];
  const path = `/v8/finance/chart/__TICKER__?interval=${interval}&range=${range}&includePrePost=false`;

  const data = await yahooFetchWithFallback(path, symbol, assetType);
  const result = data.chart.result[0];
  const candles = parseCandles(result, tf);
  if (candles.length === 0) throw new Error("No candle data returned");
  cSet(key, candles);
  return candles;
}

// ─── Public: fetch live quote ─────────────────────────────────────────────────

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePct: number;
  volume: number;
  currency: string;
  exchange: string;
  marketState: string; // REGULAR, PRE, POST, CLOSED
}

export async function fetchQuote(symbol: string, assetType?: "futures" | "stock" | "crypto"): Promise<Quote> {
  const ticker = toYahooTicker(symbol, assetType);
  const key = `quote_${ticker}`;
  const cached = cGet<Quote>(key, QUOTE_TTL);
  if (cached) return cached;

  // ── Strategy: fetch 2-day hourly candles (60m × 2d) ────────────────────────
  // This is the most reliable way to get a real previous close for ALL asset types:
  //   • Futures trade 23/7 — daily bars often fill today's incomplete close = current price
  //   • With 60m candles we can find the LAST candle that finished BEFORE today's midnight
  //     and use that as prevClose, giving an accurate daily change %
  const data = await yahooFetchWithFallback(
    `/v8/finance/chart/__TICKER__?interval=60m&range=2d&includePrePost=false`,
    symbol, assetType,
  );
  const result = data.chart.result[0];
  const meta   = result.meta;

  const price = meta.regularMarketPrice ?? 0;

  // Find the last candle that closed BEFORE today (midnight local time)
  let prevClose = 0;
  try {
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const todayStartTs = new Date().setHours(0, 0, 0, 0) / 1000; // epoch seconds

    // Walk all candles and keep updating prevClose for every candle before today
    for (let i = 0; i < timestamps.length; i++) {
      if (timestamps[i] < todayStartTs) {
        const c = closes[i];
        if (c && isFinite(c) && c > 0) prevClose = c;
      }
    }
  } catch { /**/ }

  // Fallback 1: meta fields (chartPreviousClose is more reliable than previousClose for futures)
  if (!prevClose || prevClose <= 0) {
    prevClose = meta.chartPreviousClose ?? 0;
  }
  // Fallback 2: walk backwards through ALL closes and find one that differs from current price
  if (!prevClose || prevClose <= 0) {
    try {
      const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
      for (let i = closes.length - 1; i >= 0; i--) {
        const c = closes[i];
        if (c && isFinite(c) && c > 0 && Math.abs(c - price) > price * 0.0001) {
          prevClose = c;
          break;
        }
      }
    } catch { /**/ }
  }
  // Final fallback: Yahoo's previousClose (may be buggy for futures but better than 0)
  if (!prevClose || prevClose <= 0) {
    prevClose = meta.previousClose ?? price;
  }

  const chg       = price - prevClose;
  const changePct = prevClose > 0 && Math.abs(prevClose - price) > price * 0.00001
    ? (chg / prevClose) * 100 : 0;

  const q: Quote = {
    symbol:      meta.symbol ?? ticker,
    name:        meta.longName ?? meta.shortName ?? ticker,
    price,
    open:        meta.regularMarketOpen    ?? price,
    high:        meta.regularMarketDayHigh ?? price,
    low:         meta.regularMarketDayLow  ?? price,
    prevClose,
    change:      chg,
    changePct,
    volume:      meta.regularMarketVolume  ?? 0,
    currency:    meta.currency             ?? "USD",
    exchange:    meta.exchangeName         ?? "",
    marketState: meta.marketState          ?? "REGULAR",
  };
  cSet(key, q);
  return q;
}

// ─── Technical indicator calculations (from real closes) ─────────────────────

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(...new Array(period - 1).fill(NaN));
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

export function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

export interface MACDResult { macd: number; signal: number; histogram: number }
export function calcMACD(closes: number[]): MACDResult {
  if (closes.length < 35) return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => (isNaN(v) || isNaN(ema26[i])) ? NaN : v - ema26[i]);
  const validMacd = macdLine.filter(v => !isNaN(v));
  if (validMacd.length < 9) return { macd: 0, signal: 0, histogram: 0 };
  const signalLine = ema(validMacd, 9);
  const lastMacd = validMacd[validMacd.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  return { macd: lastMacd, signal: lastSignal, histogram: lastMacd - lastSignal };
}

export interface BBResult { upper: number; middle: number; lower: number; pct: number }
export function calcBB(closes: number[], period = 20, stdMult = 2): BBResult {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0, pct: 0.5 };
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = sma + stdMult * std;
  const lower = sma - stdMult * std;
  const last = closes[closes.length - 1];
  const pct = upper !== lower ? (last - lower) / (upper - lower) : 0.5;
  return { upper, middle: sma, lower, pct: parseFloat(pct.toFixed(4)) };
}

/**
 * CME Globex session date — futures trade ~23h/day starting 5PM CT, and that
 * session is labeled as the NEXT trade date. Using browser-local midnight to
 * decide "today" desyncs VWAP from the real session for every US timezone
 * (the actual session boundary always falls in the middle of the night).
 */
function getSessionDate(ts: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(new Date(ts));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0";
  const hour = parseInt(get("hour") === "24" ? "0" : get("hour"), 10);
  const d = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  if (hour >= 17) d.setUTCDate(d.getUTCDate() + 1); // post-5PM CT rolls into next trade date
  return d.toISOString().slice(0, 10);
}

export function calcVWAP(candles: Candle[]): number {
  const nowSession = getSessionDate(Date.now());
  const today = candles.filter(c => getSessionDate(c.ts) === nowSession);
  const data = today.length > 0 ? today : candles.slice(-20);
  const sumPV = data.reduce((s, c) => s + ((c.high + c.low + c.close) / 3) * c.vol, 0);
  const sumV  = data.reduce((s, c) => s + c.vol, 0);
  return sumV > 0 ? sumPV / sumV : candles[candles.length - 1]?.close ?? 0;
}

export function calcSMA(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  // Insufficient history (e.g. just after session open): average whatever's
  // available instead of returning a single price — a 1-bar "SMA" makes
  // sma20 > sma50 trend comparisons meaningless.
  const slice = closes.length < period ? closes : closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function calcATR(candles: Candle[], period = 14): number {
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const minATR = lastClose * 0.0005; // floor: 0.05% of price (e.g. $3.67 on $7,339 ES)
  if (candles.length < 2) return Math.max(minATR, lastClose * 0.01);
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    if (tr > 0) trs.push(tr); // skip zero-range candles (holidays, bad data)
  }
  if (trs.length === 0) return Math.max(minATR, lastClose * 0.005);
  // Wilder's smoothing
  let atr = trs.slice(0, Math.min(period, trs.length)).reduce((a, b) => a + b, 0) / Math.min(period, trs.length);
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  // Sanity floor: computed ATR must be at least 0.05% of price
  return Math.max(atr, minATR);
}

function findKeyLevels(candles: Candle[]): KeyLevels {
  const n = candles.length;
  const last = candles[n - 1]?.close ?? 0;
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  const recent = candles.slice(-Math.min(60, n));

  for (let i = 2; i < recent.length - 2; i++) {
    const c = recent[i];
    if (c.high > recent[i-1].high && c.high > recent[i-2].high &&
        c.high > recent[i+1].high && c.high > recent[i+2].high) {
      swingHighs.push(c.high);
    }
    if (c.low < recent[i-1].low && c.low < recent[i-2].low &&
        c.low < recent[i+1].low && c.low < recent[i+2].low) {
      swingLows.push(c.low);
    }
  }

  // Find distinct groups (cluster within 0.3% of each other, max 8% from price)
  const cluster = (levels: number[], above: boolean) => {
    const filtered = levels.filter(l =>
      (above ? l > last : l < last) &&
      Math.abs(l - last) / last < 0.08, // must be within 8% of current price
    );
    const sorted = filtered.sort((a, b) => above ? a - b : b - a);
    const out: number[] = [];
    for (const l of sorted) {
      if (!out.length || Math.abs(l - out[out.length - 1]) / out[out.length - 1] > 0.003) out.push(l);
      if (out.length >= 3) break;
    }
    return out;
  };

  // Previous day data from daily candles if available
  const prevCandles = candles.slice(-2);
  return {
    resistance: cluster(swingHighs, true),
    support:    cluster(swingLows,  false),
    prevDayHigh:  prevCandles[0]?.high   ?? 0,
    prevDayLow:   prevCandles[0]?.low    ?? 0,
    prevDayClose: prevCandles[0]?.close  ?? 0,
  };
}

// ─── Additional indicator calculations ───────────────────────────────────────

/** Stochastic Oscillator (14,3) */
export interface StochResult { k: number; d: number; signal: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL" }
export function calcStoch(candles: Candle[], kPeriod = 14, dPeriod = 3): StochResult {
  if (candles.length < kPeriod) return { k: 50, d: 50, signal: "NEUTRAL" };
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...slice.map(c => c.high));
    const lowest  = Math.min(...slice.map(c => c.low));
    const close   = slice[slice.length - 1].close;
    kValues.push(highest !== lowest ? ((close - lowest) / (highest - lowest)) * 100 : 50);
  }
  const dValues: number[] = [];
  for (let i = dPeriod - 1; i < kValues.length; i++) {
    dValues.push(kValues.slice(i - dPeriod + 1, i + 1).reduce((a, b) => a + b, 0) / dPeriod);
  }
  const k = kValues[kValues.length - 1];
  const d = dValues[dValues.length - 1] ?? k;
  const signal: StochResult["signal"] = k > 80 ? "OVERBOUGHT" : k < 20 ? "OVERSOLD" : "NEUTRAL";
  return { k: parseFloat(k.toFixed(1)), d: parseFloat(d.toFixed(1)), signal };
}

/** Average Directional Index (ADX 14) — trend strength, NOT direction */
export function calcADX(candles: Candle[], period = 14): number {
  if (candles.length < period * 2) return 20;
  const trs: number[] = [], dmPlus: number[] = [], dmMinus: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i], prev = candles[i - 1];
    const tr = Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
    const upMove   = curr.high - prev.high;
    const downMove = prev.low  - curr.low;
    trs.push(tr);
    dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
    dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  // Wilder smooth
  const smooth = (arr: number[]) => {
    let val = arr.slice(0, period).reduce((a, b) => a + b, 0);
    const out = [val];
    for (let i = period; i < arr.length; i++) { val = val - val / period + arr[i]; out.push(val); }
    return out;
  };
  const sTR = smooth(trs), sDMP = smooth(dmPlus), sDMM = smooth(dmMinus);
  const dxArr: number[] = [];
  for (let i = 0; i < sTR.length; i++) {
    const diP = sTR[i] > 0 ? (sDMP[i] / sTR[i]) * 100 : 0;
    const diM = sTR[i] > 0 ? (sDMM[i] / sTR[i]) * 100 : 0;
    const sum = diP + diM;
    dxArr.push(sum > 0 ? (Math.abs(diP - diM) / sum) * 100 : 0);
  }
  // Smooth DX → ADX
  let adx = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxArr.length; i++) adx = (adx * (period - 1) + dxArr[i]) / period;
  return parseFloat(Math.min(100, adx).toFixed(1));
}

/** Rate of Change (ROC) % momentum over N bars */
export function calcROC(closes: number[], period = 10): number {
  if (closes.length <= period) return 0;
  const past = closes[closes.length - 1 - period];
  const now  = closes[closes.length - 1];
  return past > 0 ? parseFloat(((now - past) / past * 100).toFixed(3)) : 0;
}

/** EMA value (last value only) */
export function calcEMALast(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let val = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) val = closes[i] * k + val * (1 - k);
  return val;
}

/** Buy pressure: % of recent N candles that closed higher than open (bull candles) weighted by volume */
export function calcBuyPressure(candles: Candle[], period = 20): number {
  const slice = candles.slice(-period);
  const totalVol = slice.reduce((s, c) => s + c.vol, 0);
  if (totalVol === 0) return 50;
  const buyVol = slice.reduce((s, c) => s + (c.close >= c.open ? c.vol : 0), 0);
  return parseFloat(((buyVol / totalVol) * 100).toFixed(1));
}

/** Detect RSI divergence (hidden bullish / bearish) from last N candles */
export function detectDivergence(candles: Candle[], closes: number[]): "BULLISH_DIV" | "BEARISH_DIV" | "NONE" {
  const n = candles.length;
  if (n < 20) return "NONE";
  const look = 15;
  const recentCandles = candles.slice(-look);
  const recentCloses  = closes.slice(-look);
  // Find recent local highs/lows in price
  const priceHigh1 = Math.max(...recentCandles.slice(look / 2).map(c => c.high));
  const priceHigh0 = Math.max(...recentCandles.slice(0, look / 2).map(c => c.high));
  const priceLow1  = Math.min(...recentCandles.slice(look / 2).map(c => c.low));
  const priceLow0  = Math.min(...recentCandles.slice(0, look / 2).map(c => c.low));
  // RSI at those same periods
  const rsiNow  = calcRSI(closes);
  const rsiPrev = calcRSI(closes.slice(0, -Math.floor(look / 2)));
  // Bearish divergence: price higher high but RSI lower high
  if (priceHigh1 > priceHigh0 * 1.002 && rsiNow < rsiPrev - 3 && rsiNow > 55) return "BEARISH_DIV";
  // Bullish divergence: price lower low but RSI higher low
  if (priceLow1 < priceLow0 * 0.998 && rsiNow > rsiPrev + 3 && rsiNow < 45) return "BULLISH_DIV";
  return "NONE";
}

// ─── Compute all indicators from real candle data ─────────────────────────────

export interface KeyLevels {
  resistance: number[];   // nearest 3 swing highs above price
  support: number[];      // nearest 3 swing lows below price
  prevDayHigh: number;
  prevDayLow: number;
  prevDayClose: number;
}

export interface Indicators {
  rsi: number;
  macd: MACDResult;
  bb: BBResult;
  vwap: number;
  sma20: number;
  sma50: number;
  ema9: number;           // Fast EMA — day trading signal line
  ema21: number;          // Slow EMA — day trading trend line
  atr: number;            // Average True Range (14)
  stoch: StochResult;     // Stochastic (14,3)
  adx: number;            // ADX — trend strength 0-100
  roc10: number;          // Rate of Change over 10 bars (%)
  buyPressure: number;    // 0-100 — % vol that was buying
  divergence: "BULLISH_DIV" | "BEARISH_DIV" | "NONE";
  aboveVwap: boolean;
  aboveEma9: boolean;
  aboveEma21: boolean;
  ema9CrossUp: boolean;   // EMA9 just crossed ABOVE EMA21
  ema9CrossDown: boolean; // EMA9 just crossed BELOW EMA21
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
  establishedTrend: "UP" | "DOWN" | "FLAT"; // SMA20/50 + price structure, independent of short-term oscillators
  counterTrendRisk: boolean; // true = a bullish oversold/bearish overbought reading is fighting a strong (ADX>25) opposing trend
  techScore: number;      // 0-100
  volScore: number;       // 0-100
  momentumScore: number;  // 0-100 — pure momentum from RSI+MACD+Stoch+ROC
  structureScore: number; // 0-100 — trend alignment from EMA+VWAP+SMA+ADX
  keyLevels: KeyLevels;
  avgVolume20: number;
  volumeRatio: number;    // current vol / 20-bar avg
}

export function computeIndicators(candles: Candle[]): Indicators {
  const closes = candles.map(c => c.close);
  const vols   = candles.map(c => c.vol);
  const last   = closes[closes.length - 1] ?? 0;

  // ── Core indicators ───────────────────────────────────────────────────────
  const rsi   = calcRSI(closes);
  const macd  = calcMACD(closes);
  const bb    = calcBB(closes);
  const vwap  = calcVWAP(candles);
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const atr   = calcATR(candles, 14);
  const keyLevels = findKeyLevels(candles);

  // ── New day-trading indicators ────────────────────────────────────────────
  const ema9  = calcEMALast(closes, 9);
  const ema21 = calcEMALast(closes, 21);
  const stoch = calcStoch(candles);
  const adx   = calcADX(candles);
  const roc10 = calcROC(closes, 10);
  const buyPressure = calcBuyPressure(candles, 20);
  const divergence  = detectDivergence(candles, closes);

  // EMA cross detection (compare current vs previous bar's EMAs)
  const prevCloses = closes.slice(0, -1);
  const prevEma9   = calcEMALast(prevCloses, 9);
  const prevEma21  = calcEMALast(prevCloses, 21);
  const ema9CrossUp   = prevEma9 <= prevEma21 && ema9 > ema21;
  const ema9CrossDown = prevEma9 >= prevEma21 && ema9 < ema21;

  const aboveVwap  = last > vwap;
  const aboveEma9  = last > ema9;
  const aboveEma21 = last > ema21;

  // ── Trend filter — is there an established, strong trend? ────────────────
  // RSI/BB/Stoch "oversold = bullish" logic assumes a range-bound market where
  // price mean-reverts. In a STRONG existing downtrend, price can stay oversold
  // for a long time while making new lows — the classic "falling knife" that
  // fires a confident LONG right before the move keeps crashing through stop
  // loss. Use SMA20/50 + price structure (independent of the oscillators being
  // scored) to detect this, and dampen the contrarian bullish/bearish push
  // unless real divergence confirms an actual reversal is underway.
  const establishedTrend: "UP" | "DOWN" | "FLAT" =
    sma20 > sma50 && last > sma50 ? "UP" :
    sma20 < sma50 && last < sma50 ? "DOWN" : "FLAT";
  const strongTrend = adx > 25;
  const fightingDowntrend = strongTrend && establishedTrend === "DOWN" && divergence !== "BULLISH_DIV";
  const fightingUptrend   = strongTrend && establishedTrend === "UP"   && divergence !== "BEARISH_DIV";
  const counterTrendRisk = fightingDowntrend || fightingUptrend;
  // Keep only 35% of a contrarian score's push away from neutral when it fights the trend
  const dampenVsTrend = (score: number): number => {
    if (score > 50 && fightingDowntrend) return 50 + (score - 50) * 0.35;
    if (score < 50 && fightingUptrend)   return 50 - (50 - score) * 0.35;
    return score;
  };

  // ── Technical score — weighted from ALL real signals ─────────────────────
  // RSI: oversold = bullish, overbought = bearish (dampened if fighting a strong trend)
  const rsiScore = dampenVsTrend(
    rsi < 25 ? 80 : rsi < 35 ? 70 : rsi < 45 ? 58 :
    rsi < 55 ? 50 : rsi < 65 ? 42 : rsi < 75 ? 30 : 20,
  );
  // MACD: histogram direction + magnitude vs price
  const macdNorm  = last > 0 ? (macd.histogram / last) * 1000 : 0;
  const macdScore = macd.histogram > 0
    ? Math.min(85, 60 + macdNorm * 15)
    : Math.max(15, 40 + macdNorm * 15);
  // BB: lower band = mean-reversion long, upper = overbought/breakout (dampened vs trend)
  const bbScore = dampenVsTrend(
    bb.pct < 0.1 ? 78 : bb.pct < 0.25 ? 68 : bb.pct < 0.4 ? 58 :
    bb.pct < 0.6 ? 50 : bb.pct < 0.75 ? 42 : bb.pct < 0.9 ? 32 : 22,
  );
  // VWAP: above = institutional buyers active
  const vwapScore = aboveVwap ? 65 : 35;
  // SMA alignment: EMA9 > EMA21 > SMA50 = ideal bull stack
  const smaScore = ema9 > ema21 && ema21 > sma50 ? 75 :
                   ema9 > ema21 ? 62 :
                   sma20 > sma50 ? 55 :
                   ema9 < ema21 && ema21 < sma50 ? 25 :
                   ema9 < ema21 ? 38 : 45;
  // Stochastic (dampened vs trend — same falling-knife risk as RSI)
  const stochScore = dampenVsTrend(
    stoch.k < 20 ? 72 : stoch.k < 35 ? 62 :
    stoch.k < 65 ? 50 : stoch.k < 80 ? 38 : 28,
  );

  const techScore = Math.round(
    rsiScore   * 0.22 +
    macdScore  * 0.22 +
    bbScore    * 0.15 +
    vwapScore  * 0.15 +
    smaScore   * 0.16 +
    stochScore * 0.10,
  );

  // ── Momentum score — pure directional push ────────────────────────────────
  let momentumPts = 50;
  // RSI (dampened vs trend — don't reward buying an oversold reading in a falling knife)
  const rsiMomentum = rsi < 35 ? +14 : rsi > 65 ? -14 : (50 - rsi) * 0.5;
  momentumPts += fightingDowntrend && rsiMomentum > 0 ? rsiMomentum * 0.35
               : fightingUptrend   && rsiMomentum < 0 ? rsiMomentum * 0.35
               : rsiMomentum;
  // MACD histogram direction + cross
  momentumPts += macd.histogram > 0 ? +12 : -12;
  momentumPts += macd.macd > macd.signal ? +5 : -5;
  // Stochastic crossover
  if (stoch.k > stoch.d && stoch.k < 80) momentumPts += 8;
  if (stoch.k < stoch.d && stoch.k > 20) momentumPts -= 8;
  // ROC
  momentumPts += roc10 > 3 ? +8 : roc10 > 1 ? +4 : roc10 < -3 ? -8 : roc10 < -1 ? -4 : 0;
  // Divergence
  if (divergence === "BULLISH_DIV") momentumPts += 10;
  if (divergence === "BEARISH_DIV") momentumPts -= 10;
  // EMA cross (strongest signal)
  if (ema9CrossUp)   momentumPts += 12;
  if (ema9CrossDown) momentumPts -= 12;
  const momentumScore = Math.max(5, Math.min(95, Math.round(momentumPts)));

  // ── Structure score — trend alignment & market context ───────────────────
  let structurePts = 50;
  structurePts += aboveVwap ? +12 : -12;
  structurePts += aboveEma9  ? +8  : -8;
  structurePts += aboveEma21 ? +8  : -8;
  structurePts += sma20 > sma50 ? +8 : -8;
  // ADX: higher = stronger trend, boosts whichever direction
  const adxBoost = adx > 40 ? 10 : adx > 25 ? 5 : 0;
  if (techScore > 55) structurePts += adxBoost;
  if (techScore < 45) structurePts -= adxBoost;
  // Buy pressure
  structurePts += (buyPressure - 50) * 0.5;
  const structureScore = Math.max(5, Math.min(95, Math.round(structurePts)));

  // ── Volume score ──────────────────────────────────────────────────────────
  const avgVolume20 = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVol     = vols[vols.length - 1] ?? 0;
  const volumeRatio = avgVolume20 > 0 ? lastVol / avgVolume20 : 1;
  // volumeRatio > 1.5 = elevated activity, direction confirmed by buyPressure
  const volScore = Math.round(Math.min(95, Math.max(5,
    40 + volumeRatio * 20 + (buyPressure - 50) * 0.3,
  )));

  // ── Overall trend ─────────────────────────────────────────────────────────
  const trendVote = (momentumScore + structureScore + techScore) / 3;
  const trend = trendVote >= 57 ? "BULLISH" : trendVote <= 43 ? "BEARISH" : "NEUTRAL";

  return {
    rsi, macd, bb, vwap, sma20, sma50, atr,
    ema9, ema21, stoch, adx, roc10, buyPressure, divergence,
    aboveVwap, aboveEma9, aboveEma21, ema9CrossUp, ema9CrossDown,
    trend, keyLevels, avgVolume20, volumeRatio,
    establishedTrend, counterTrendRisk,
    techScore:      Math.max(5, Math.min(95, techScore)),
    volScore:       Math.max(5, Math.min(95, volScore)),
    momentumScore:  Math.max(5, Math.min(95, momentumScore)),
    structureScore: Math.max(5, Math.min(95, structureScore)),
  };
}
