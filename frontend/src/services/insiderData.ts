// ─── Market Intelligence Service ──────────────────────────────────────────────
// Pulls REAL market intelligence from free public APIs:
//  • Binance USDS-M Futures  → funding rate, open interest, long/short ratio
//  • Alternative.me          → Crypto Fear & Greed Index
//  • Derived from OHLCV      → institutional flow estimates, smart money signals

import axios from "axios";
import type { Indicators, Quote } from "./marketData";

type AssetType = "futures" | "crypto" | "stock";

// ─── Binance symbol map ───────────────────────────────────────────────────────

const BINANCE_MAP: Record<string, string> = {
  "BTC-USD": "BTCUSDT", "ETH-USD": "ETHUSDT", "SOL-USD": "SOLUSDT",
  "BNB-USD": "BNBUSDT", "XRP-USD": "XRPUSDT", "DOGE-USD": "DOGEUSDT",
  "ADA-USD": "ADAUSDT", "AVAX-USD": "AVAXUSDT", "DOT-USD": "DOTUSDT",
  "MATIC-USD": "MATICUSDT", "LINK-USD": "LINKUSDT", "LTC-USD": "LTCUSDT",
  "NEAR-USD": "NEARUSDT", "ATOM-USD": "ATOMUSDT", "APT-USD": "APTUSDT",
  "ARB-USD": "ARBUSDT", "OP-USD": "OPUSDT", "INJ-USD": "INJUSDT",
  "SUI-USD": "SUIUSDT", "SEI-USD": "SEIUSDT", "TIA-USD": "TIAUSDT",
  "WLD-USD": "WLDUSDT", "PEPE-USD": "PEPEUSDT", "SHIB-USD": "SHIBUSDT",
  "FLOKI-USD": "FLOKIUSDT", "BONK-USD": "BONKUSDT",
  // Also accept plain tickers
  "BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT",
  "BNB": "BNBUSDT", "XRP": "XRPUSDT", "DOGE": "DOGEUSDT",
  "ADA": "ADAUSDT", "AVAX": "AVAXUSDT", "LINK": "LINKUSDT",
};

function toBinance(sym: string): string | null {
  return BINANCE_MAP[sym.toUpperCase()] ?? null;
}

const BF = "https://fapi.binance.com";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FundingData {
  rate: number;            // hourly rate as decimal e.g. 0.0001
  ratePct: string;         // formatted "0.0100%"
  annualized: string;      // "10.95%" annualized
  bias: "LONGS_PAYING" | "SHORTS_PAYING" | "NEUTRAL";
  interpretation: string;
}

export interface OIData {
  value: number;           // raw USDT value
  formatted: string;       // "$1.23B"
  signal: "BULLISH" | "BEARISH" | "NEUTRAL";
  note: string;
}

export interface LSRatioData {
  longPct: number;         // 0-100
  shortPct: number;        // 0-100
  ratio: number;           // long/short
  buySellRatio: number;    // taker buy vol / sell vol
  signal: "BULLISH" | "BEARISH" | "NEUTRAL";
  interpretation: string;
}

export interface FearGreedData {
  value: number;           // 0-100
  label: string;           // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
  color: string;           // tailwind color
  tradingImplication: string;
}

export interface MarketIntelligence {
  assetType: AssetType;
  isReal: boolean;         // true = live API data, false = derived/modeled
  // Crypto only (real Binance data)
  funding?: FundingData;
  openInterest?: OIData;
  lsRatio?: LSRatioData;
  fearGreed?: FearGreedData;
  // All asset types
  volumeProfile: string;
  smartMoneySignal: string;
  institutionalBias: string;
  whaleActivity: string;
  keyInsights: string[];   // 4-6 bullet points of actionable intelligence
  riskWarnings: string[];  // things to watch out for
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

const http = axios.create({ timeout: 8_000 });

async function bGet(path: string, params: Record<string, string | number> = {}) {
  const { data } = await http.get(`${BF}${path}`, { params });
  return data;
}

async function fetchFundingRate(bSym: string): Promise<FundingData | null> {
  try {
    const d = await bGet("/fapi/v1/premiumIndex", { symbol: bSym });
    const rate = parseFloat(d.lastFundingRate ?? "0");
    const ratePct = (rate * 100).toFixed(4) + "%";
    const annualized = (rate * 3 * 365 * 100).toFixed(2) + "%"; // 3 payments/day × 365
    const bias: FundingData["bias"] =
      Math.abs(rate) < 0.00005 ? "NEUTRAL" :
      rate > 0 ? "LONGS_PAYING" : "SHORTS_PAYING";
    const interpretation =
      bias === "LONGS_PAYING"
        ? rate > 0.001
          ? "⚠️ Very high funding — longs overcrowded, short squeeze risk at any correction"
          : "Longs paying shorts — bullish market but watch for leverage flush"
        : bias === "SHORTS_PAYING"
        ? "Shorts paying longs — bearish positioning dominant, potential short squeeze"
        : "Neutral funding — balanced longs/shorts, no directional bias from leverage";
    return { rate, ratePct, annualized, bias, interpretation };
  } catch { return null; }
}

async function fetchOpenInterest(bSym: string): Promise<OIData | null> {
  try {
    const d = await bGet("/fapi/v1/openInterest", { symbol: bSym });
    const value = parseFloat(d.openInterest ?? "0");
    const price = parseFloat(d.markPrice ?? "1");
    const usdValue = value * price;
    const formatted =
      usdValue >= 1e9 ? `$${(usdValue / 1e9).toFixed(2)}B` :
      usdValue >= 1e6 ? `$${(usdValue / 1e6).toFixed(1)}M` :
      `$${(usdValue / 1e3).toFixed(0)}K`;
    // High OI = more leverage = volatile, not inherently directional
    const signal: OIData["signal"] = usdValue > 5e9 ? "NEUTRAL" : "BULLISH";
    const note = usdValue > 10e9
      ? "Very high OI — market is heavily leveraged, expect volatile moves"
      : usdValue > 2e9
      ? "Elevated OI — active derivatives market, institutional participation"
      : "Moderate OI — room for position build-up";
    return { value: usdValue, formatted, signal, note };
  } catch { return null; }
}

async function fetchLSRatio(bSym: string): Promise<LSRatioData | null> {
  try {
    const [acct, taker] = await Promise.allSettled([
      bGet("/futures/data/globalLongShortAccountRatio", { symbol: bSym, period: "1h", limit: 1 }),
      bGet("/futures/data/takerlongshortRatio",         { symbol: bSym, period: "1h", limit: 1 }),
    ]);
    const a = acct.status === "fulfilled" ? acct.value?.[0] : null;
    const t = taker.status === "fulfilled" ? taker.value?.[0] : null;
    if (!a) return null;

    const longPct  = parseFloat(a.longAccount  ?? "0.5") * 100;
    const shortPct = parseFloat(a.shortAccount ?? "0.5") * 100;
    const ratio    = parseFloat(a.longShortRatio ?? "1");
    const buySellRatio = t ? parseFloat(t.buySellRatio ?? "1") : 1;

    const signal: LSRatioData["signal"] =
      ratio > 1.3 ? "BEARISH" : // too many longs = contrarian short signal
      ratio < 0.8 ? "BULLISH" : // too many shorts = contrarian long signal
      buySellRatio > 1.05 ? "BULLISH" : buySellRatio < 0.95 ? "BEARISH" : "NEUTRAL";

    const interpretation = ratio > 1.5
      ? `${longPct.toFixed(0)}% long — extreme crowding, contrarian bearish. Taker buy/sell: ${buySellRatio.toFixed(2)}`
      : ratio < 0.7
      ? `${shortPct.toFixed(0)}% short — extreme pessimism, contrarian bullish setup`
      : `${longPct.toFixed(0)}% long / ${shortPct.toFixed(0)}% short — ${ratio > 1 ? "slight bullish lean" : "slight bearish lean"}. Taker ratio: ${buySellRatio.toFixed(2)}`;

    return { longPct, shortPct, ratio, buySellRatio, signal, interpretation };
  } catch { return null; }
}

async function fetchFearGreed(): Promise<FearGreedData | null> {
  try {
    const { data } = await http.get("https://api.alternative.me/fng/?limit=1");
    const val = parseInt(data?.data?.[0]?.value ?? "50");
    const label: string =
      val <= 20 ? "Extreme Fear" : val <= 40 ? "Fear" :
      val <= 60 ? "Neutral"      : val <= 80 ? "Greed" : "Extreme Greed";
    const color =
      val <= 20 ? "text-red-500"     : val <= 40 ? "text-orange-400" :
      val <= 60 ? "text-yellow-400"  : val <= 80 ? "text-emerald-400" : "text-emerald-300";
    const tradingImplication =
      val <= 25 ? "Extreme fear = buy opportunity historically. DCA or scale in on weakness." :
      val <= 40 ? "Fear in market — good entries available, wait for stabilization signals." :
      val <= 60 ? "Neutral market — trade the technicals, no macro sentiment edge." :
      val <= 80 ? "Greed — use tighter stops, reduce size. Good for trend trading." :
      "Extreme greed — very high crash risk. Only trade with very tight stops or wait for reset.";
    return { value: val, label, color, tradingImplication };
  } catch { return null; }
}

// ─── Derive signals from OHLCV + indicators ───────────────────────────────────

function deriveSmartMoneySignals(
  ind: Indicators, quote: Quote, assetType: AssetType,
): { smartMoney: string; institutional: string; whale: string; volume: string } {
  const { rsi, macd, bb, vwap, aboveVwap, atr, volumeRatio, sma20, sma50 } = ind;
  const price = quote.price;

  // Smart money: divergence between price and volume
  const smartMoney =
    volumeRatio > 2.0 && quote.changePct < 0
      ? "🐋 Possible accumulation — heavy volume on down move (smart money absorbing)"
    : volumeRatio > 2.0 && quote.changePct > 0
      ? "📈 Strong conviction — high volume breakout, institutions participating"
    : volumeRatio < 0.5 && quote.changePct > 1
      ? "⚠️ Weak hands rally — thin volume, high rejection risk"
    : volumeRatio < 0.5 && quote.changePct < -1
      ? "Low conviction sell — limited participation, may bounce"
    : "Normal volume pattern — no unusual smart money signal";

  // Institutional bias from price vs key MAs + VWAP
  const institutional =
    price > sma20 && price > sma50 && aboveVwap
      ? "Institutions net buyers — price above all key levels (SMA20, SMA50, VWAP)"
    : price < sma20 && price < sma50 && !aboveVwap
      ? "Institutions net sellers — price below all key levels"
    : aboveVwap
      ? "Institutional buyers active above VWAP — bullish intraday structure"
    : "Sellers in control below VWAP — wait for reclaim before longing";

  // Whale activity from ATR + volume spike analysis
  const atrPct = price > 0 ? (atr / price) * 100 : 0;
  const whale =
    atrPct > 5 && volumeRatio > 1.8
      ? "🐋 High ATR + volume spike = whale-sized positions being moved. Expect continuation or sharp reversal"
    : atrPct > 3 && volumeRatio > 1.3
      ? "Large player activity detected — elevated volatility, trade with wider stops"
    : atrPct < 1
      ? "Low volatility accumulation phase — possible pre-breakout compression"
    : "Normal market activity — no unusual whale signals";

  // Volume profile
  const volume =
    volumeRatio > 2.5 ? `🔥 VOLUME SURGE: ${volumeRatio.toFixed(1)}× average — major move in progress`
    : volumeRatio > 1.5 ? `Above-average volume (${volumeRatio.toFixed(1)}×) — confirms current move`
    : volumeRatio > 0.8 ? `Normal volume (${volumeRatio.toFixed(1)}×) — no unusual activity`
    : `⚠️ Low volume (${volumeRatio.toFixed(1)}×) — weak move, wait for volume confirmation`;

  return { smartMoney, institutional, whale, volume };
}

function buildKeyInsights(
  ind: Indicators, quote: Quote, assetType: AssetType,
  funding?: FundingData | null, lsRatio?: LSRatioData | null, fearGreed?: FearGreedData | null,
): { insights: string[]; warnings: string[] } {
  const { rsi, macd, bb, vwap, aboveVwap, atr, volumeRatio, sma20, sma50, keyLevels } = ind;
  const price = quote.price;
  const insights: string[] = [];
  const warnings: string[] = [];

  // ATR-based context
  const dailyRange = (atr / price * 100).toFixed(2);
  insights.push(`ATR(14): $${atr.toFixed(4)} (${dailyRange}% of price) — expected intraday range`);

  // Key level proximity
  if (keyLevels.resistance.length > 0) {
    const nearRes = keyLevels.resistance[0];
    const dist = ((nearRes - price) / price * 100).toFixed(2);
    insights.push(`Nearest resistance: $${nearRes.toFixed(4)} (+${dist}%) — TP zone for longs`);
  }
  if (keyLevels.support.length > 0) {
    const nearSup = keyLevels.support[0];
    const dist = ((price - nearSup) / price * 100).toFixed(2);
    insights.push(`Nearest support: $${nearSup.toFixed(4)} (-${dist}%) — SL zone below here`);
  }

  // RSI divergence insight
  if (rsi < 35 && macd.histogram > 0)
    insights.push("🟢 Bullish divergence: RSI oversold but MACD histogram turning up — high-quality long setup");
  else if (rsi > 65 && macd.histogram < 0)
    insights.push("🔴 Bearish divergence: RSI overbought but MACD weakening — short setup forming");
  else if (rsi > 45 && rsi < 60 && macd.histogram > 0 && aboveVwap)
    insights.push("🟡 Trend continuation setup: all signals aligned for trend following");

  // BB squeeze
  const bbWidth = (bb.upper - bb.lower) / bb.middle;
  if (bbWidth < 0.03) insights.push("⚡ Bollinger Band SQUEEZE — low volatility compression, breakout imminent");
  else if (bb.pct < 0.05) insights.push("Lower BB touch — mean reversion long setup (target mid-band)");
  else if (bb.pct > 0.95) insights.push("Upper BB touch — mean reversion short or breakout continuation watch");

  // Crypto-specific real data insights
  if (funding) {
    insights.push(`Funding rate ${funding.ratePct} (${funding.annualized} annualized) — ${funding.interpretation}`);
    if (funding.rate > 0.0005) warnings.push("Very high funding rate — longs are expensive to hold, favor intraday only");
  }
  if (lsRatio) {
    insights.push(`Market positioning: ${lsRatio.longPct.toFixed(0)}% long vs ${lsRatio.shortPct.toFixed(0)}% short`);
    if (lsRatio.ratio > 1.4) warnings.push(`Crowded long at ${lsRatio.longPct.toFixed(0)}% — contrarian risk, use tight SL`);
    if (lsRatio.ratio < 0.75) warnings.push(`Crowded short at ${lsRatio.shortPct.toFixed(0)}% — squeeze risk if price breaks up`);
  }
  if (fearGreed) {
    if (fearGreed.value <= 25) insights.push(`😱 Fear & Greed: ${fearGreed.value} (${fearGreed.label}) — historically good buying opportunity`);
    else if (fearGreed.value >= 75) warnings.push(`😤 Fear & Greed: ${fearGreed.value} (${fearGreed.label}) — market euphoria, high crash risk`);
  }

  // Volume warnings
  if (volumeRatio < 0.5) warnings.push("Very low volume — avoid large positions, spreads may be wide");
  if (volumeRatio > 3.0) warnings.push(`Volume spike ${volumeRatio.toFixed(1)}×  — may signal news event, verify before entering`);

  // VWAP warning for day trading
  if (!aboveVwap) warnings.push("Below VWAP — institutions in distribution mode, longs risky until reclaim");

  return { insights: insights.slice(0, 6), warnings: warnings.slice(0, 4) };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchMarketIntelligence(
  symbol: string,
  assetType: AssetType,
  indicators: Indicators,
  quote: Quote,
): Promise<MarketIntelligence> {
  const bSym = toBinance(symbol);
  const isCrypto = assetType === "crypto";

  // Fetch real crypto data in parallel
  let funding: FundingData | null = null;
  let openInterest: OIData | null = null;
  let lsRatio: LSRatioData | null = null;
  let fearGreed: FearGreedData | null = null;

  if (isCrypto && bSym) {
    [funding, openInterest, lsRatio, fearGreed] = await Promise.all([
      fetchFundingRate(bSym),
      fetchOpenInterest(bSym),
      fetchLSRatio(bSym),
      fetchFearGreed(),
    ]);
  } else if (isCrypto) {
    // Crypto but no Binance symbol — still get Fear & Greed
    fearGreed = await fetchFearGreed().catch(() => null);
  }

  const { smartMoney, institutional, whale, volume } = deriveSmartMoneySignals(indicators, quote, assetType);
  const { insights, warnings } = buildKeyInsights(indicators, quote, assetType, funding, lsRatio, fearGreed);

  return {
    assetType,
    isReal: isCrypto && !!bSym,
    funding:       funding       ?? undefined,
    openInterest:  openInterest  ?? undefined,
    lsRatio:       lsRatio       ?? undefined,
    fearGreed:     fearGreed     ?? undefined,
    volumeProfile: volume,
    smartMoneySignal: smartMoney,
    institutionalBias: institutional,
    whaleActivity: whale,
    keyInsights: insights,
    riskWarnings: warnings,
  };
}
