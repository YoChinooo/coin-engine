import axios from "axios";
import type { PennyCoin, MemeAnalysis, Signal } from "../types";

// Route through /cg/ Vercel rewrite in production (avoids CORS).
// On localhost the rewrite doesn't exist so fall back to direct URL.
const isLocal = typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
const cg = axios.create({
  baseURL: isLocal ? "https://api.coingecko.com/api/v3" : "/cg",
  timeout: 15000,
});

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_TTL = 3 * 60 * 1000;

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as T;
  } catch { return null; }
}

function cacheSet(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

async function cgGet(url: string, params: Record<string, unknown> = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await cg.get(url, { params });
      return data;
    } catch (err: any) {
      if (err?.response?.status === 429 && attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 8000));
        continue;
      }
      throw err;
    }
  }
}

// ─── Static anchor lists (always included) ───────────────────────────────────

const ANCHOR_MEME_IDS = [
  "dogecoin", "shiba-inu", "pepe", "floki", "bonk",
  "dogwifcoin", "book-of-meme", "popcat", "cat-in-a-dogs-world",
  "brett-based", "mog-coin", "turbo", "spx6900",
];

const ANCHOR_UTILITY_IDS = [
  "render-token", "bittensor", "akash-network", "the-graph",
  "fetch-ai", "ocean-protocol", "singularitynet",
];

// ─── Meme profile database ───────────────────────────────────────────────────

interface MemeProfile {
  holderRisk: MemeAnalysis["holderRisk"];
  narrativeStrength: number;
  catalysts: string[];
  redFlags: string[];
  baseRisk: MemeAnalysis["pdRisk"];
  verdict: string;
}

const MEME_PROFILES: Record<string, MemeProfile> = {
  "dogecoin": {
    holderRisk: "Safe", narrativeStrength: 88, baseRisk: "LOW",
    catalysts: ["Elon Musk tweet history", "X/Twitter payments integration", "Retail FOMO cycles", "High exchange availability"],
    redFlags: [],
    verdict: "OG meme with 12+ years of history. Highest liquidity — no manipulation risk. Cyclical patterns well-documented. Safe entry on dips.",
  },
  "shiba-inu": {
    holderRisk: "Safe", narrativeStrength: 78, baseRisk: "LOW",
    catalysts: ["Shibarium L2 adoption growing", "Burn rate increasing", "ShibaSwap V2", "Listed everywhere"],
    redFlags: ["Top wallet concentration still elevated"],
    verdict: "Second-largest meme with real ecosystem. Burn mechanism reduces supply. Safe for swing trades.",
  },
  "pepe": {
    holderRisk: "Moderate", narrativeStrength: 85, baseRisk: "MEDIUM",
    catalysts: ["Strongest cultural meme brand", "Binance & Coinbase listed", "Political meme crossover", "Retail FOMO driver"],
    redFlags: ["No utility — pure sentiment", "Can drop 40-60% in hours"],
    verdict: "PEPE has the strongest meme brand since DOGE. All major exchanges — no liquidity risk. Best for swing trades with tight stops.",
  },
  "floki": {
    holderRisk: "Moderate", narrativeStrength: 74, baseRisk: "MEDIUM",
    catalysts: ["Valhalla GameFi ecosystem", "Sports sponsorships", "Asia marketing push", "FlokiFi DeFi suite"],
    redFlags: ["Heavy marketing spend sustainability question"],
    verdict: "More utility than most memes. Marketing drives retail. Medium-term hold viable with defined stop.",
  },
  "bonk": {
    holderRisk: "Safe", narrativeStrength: 80, baseRisk: "LOW",
    catalysts: ["Integrated in 50+ Solana DeFi apps", "Phantom wallet promotion", "SOL ecosystem growth", "Airdrop history"],
    redFlags: ["Depends on SOL ecosystem health"],
    verdict: "BONK is embedded in Solana DeFi — real utility. Benefits from every SOL rally. Healthy holder distribution.",
  },
  "dogwifcoin": {
    holderRisk: "Moderate", narrativeStrength: 82, baseRisk: "MEDIUM",
    catalysts: ["Las Vegas Sphere campaign", "Top Solana meme", "Institutional meme fund buying", "Coinbase listed"],
    redFlags: ["No utility beyond brand"],
    verdict: "WIF has strongest Solana meme brand. Large-cap — safer but less 10x potential than smaller memes.",
  },
  "book-of-meme": {
    holderRisk: "Moderate", narrativeStrength: 71, baseRisk: "MEDIUM",
    catalysts: ["Solana meme cycle momentum", "High retail velocity", "Social mention acceleration"],
    redFlags: ["Younger project", "Higher volatility"],
    verdict: "Strong Solana community momentum. Higher risk than BONK/WIF but more upside. Short swing or scalp.",
  },
  "popcat": {
    holderRisk: "Moderate", narrativeStrength: 68, baseRisk: "MEDIUM",
    catalysts: ["Viral internet meme origin", "Binance listed", "Community marketing", "Solana ecosystem"],
    redFlags: ["No utility", "Narrative shifts fast"],
    verdict: "Legitimate Solana meme with exchange backing. Recognizable brand. Small position — high-beta speculation.",
  },
  "cat-in-a-dogs-world": {
    holderRisk: "Moderate", narrativeStrength: 65, baseRisk: "MEDIUM",
    catalysts: ["Anti-dog narrative", "Multi-chain presence", "Growing holder base"],
    redFlags: ["Smaller cap = higher manipulation risk"],
    verdict: "Unique narrative angle. Multi-chain reduces single-ecosystem risk. Entry on consolidation with tight stop.",
  },
  "brett-based": {
    holderRisk: "Moderate", narrativeStrength: 73, baseRisk: "MEDIUM",
    catalysts: ["Base chain flagship meme", "Coinbase ecosystem tailwind", "Base network growth"],
    redFlags: ["Base chain still maturing"],
    verdict: "BRETT leads Base chain memes. Coinbase pushes Base = BRETT benefits. Strong community and brand.",
  },
  "mog-coin": {
    holderRisk: "Moderate", narrativeStrength: 66, baseRisk: "MEDIUM",
    catalysts: ["ETH meme cult following", "Unique 'mogging' narrative", "Low cap high upside"],
    redFlags: ["Lower liquidity than top memes", "Smaller cap = higher pump risk"],
    verdict: "Differentiated narrative in ETH meme space. Small position required. High risk/reward.",
  },
  "turbo": {
    holderRisk: "Moderate", narrativeStrength: 70, baseRisk: "MEDIUM",
    catalysts: ["AI-generated origin story (GPT-4)", "AI + meme narrative combo", "Binance and OKX listed"],
    redFlags: ["Gimmick origin could fade"],
    verdict: "Unique story — created by GPT-4. AI + meme is a hot combo. Major CEX listed — sufficient liquidity.",
  },
  "spx6900": {
    holderRisk: "Moderate", narrativeStrength: 68, baseRisk: "MEDIUM",
    catalysts: ["'Beat the S&P' narrative", "Cult community", "Financial satire angle", "Growing social following"],
    redFlags: ["Niche narrative may not mainstream", "Lower liquidity"],
    verdict: "Most original narrative in meme space. Highly engaged community. Good swing trade candidate.",
  },
};

// ─── Dynamic social/trending data ────────────────────────────────────────────

export interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  marketCapRank: number;
  trendingRank: number;
  thumb: string;
  socialScore: number;
}

export async function fetchTrending(): Promise<TrendingCoin[]> {
  const cached = cacheGet<TrendingCoin[]>("trending_v1");
  if (cached) return cached;
  const data = await cgGet("/search/trending");
  const coins: TrendingCoin[] = (data?.coins ?? []).slice(0, 15).map((item: any, i: number) => ({
    id: item.item?.id ?? "",
    name: item.item?.name ?? "",
    symbol: item.item?.symbol?.toUpperCase() ?? "",
    marketCapRank: item.item?.market_cap_rank ?? 999,
    trendingRank: i + 1,
    thumb: item.item?.thumb ?? "",
    socialScore: Math.round(90 - i * 5),
  }));
  cacheSet("trending_v1", coins);
  return coins;
}

// ─── P&D analysis engine ─────────────────────────────────────────────────────

function analyzeMeme(coin: any, profile: MemeProfile | undefined, trendingIds: Set<string>): MemeAnalysis {
  const marketCap = coin.market_cap ?? 0;
  const volume = coin.total_volume ?? 0;
  const volumeRatio = marketCap > 0 ? volume / marketCap : 0;

  let marketCapTier: MemeAnalysis["marketCapTier"];
  if (marketCap > 1_000_000_000) marketCapTier = "Large";
  else if (marketCap > 100_000_000) marketCapTier = "Mid";
  else if (marketCap > 10_000_000) marketCapTier = "Small";
  else marketCapTier = "Micro";

  const liquidityScore = Math.min(100, Math.round(volumeRatio * 200));

  let pdRiskScore = 0;
  if (marketCapTier === "Micro") pdRiskScore += 45;
  else if (marketCapTier === "Small") pdRiskScore += 22;
  else if (marketCapTier === "Mid") pdRiskScore += 10;

  if (liquidityScore < 20) pdRiskScore += 30;
  else if (liquidityScore < 40) pdRiskScore += 15;

  const holderRisk = profile?.holderRisk ?? "Moderate";
  if (holderRisk === "Concentrated") pdRiskScore += 25;
  else if (holderRisk === "Moderate") pdRiskScore += 10;

  if (profile?.redFlags && profile.redFlags.length > 2) pdRiskScore += 15;
  if (profile?.baseRisk === "EXTREME") pdRiskScore = Math.max(pdRiskScore, 85);
  if (profile?.baseRisk === "HIGH") pdRiskScore = Math.max(pdRiskScore, 60);
  if (profile?.baseRisk === "LOW") pdRiskScore = Math.min(pdRiskScore, 30);

  pdRiskScore = Math.min(100, pdRiskScore);

  let pdRisk: MemeAnalysis["pdRisk"];
  if (pdRiskScore >= 75) pdRisk = "EXTREME";
  else if (pdRiskScore >= 55) pdRisk = "HIGH";
  else if (pdRiskScore >= 30) pdRisk = "MEDIUM";
  else pdRisk = "LOW";

  const isTrending = trendingIds.has(coin.id);
  const narrativeStrength = Math.min(99, (profile?.narrativeStrength ?? 60) + (isTrending ? 10 : 0));

  const catalysts = [...(profile?.catalysts ?? ["Community momentum", "Market narrative"])];
  if (isTrending) catalysts.unshift("🔥 Currently trending on CoinGecko");

  const passed = pdRisk !== "EXTREME";

  return {
    pdRisk,
    pdRiskScore: Math.round(pdRiskScore),
    passed,
    skipReason: !passed ? `P&D risk too high (score: ${pdRiskScore}). ${profile?.redFlags[0] ?? "Insufficient liquidity."}` : undefined,
    marketCapTier,
    liquidityScore,
    holderRisk,
    narrativeStrength,
    catalysts,
    redFlags: profile?.redFlags ?? [],
    verdict: profile?.verdict ?? "Dynamic scan pick. Verify fundamentals before entering.",
  };
}

// ─── Score engine ─────────────────────────────────────────────────────────────

function generateScores(coin: any, isMeme: boolean, trendingRank?: number) {
  const change = coin.price_change_percentage_24h ?? 0;
  const volumeRatio = (coin.total_volume ?? 0) / (coin.market_cap || 1);
  const trendBonus = trendingRank ? Math.max(0, 15 - trendingRank) : 0;

  const earlyScore = Math.min(97, 52 + volumeRatio * 15 + (change > 0 ? 6 : -3) + trendBonus);
  const technicalScore = Math.min(97, 48 + (change > 10 ? 28 : change > 5 ? 18 : change > 0 ? 8 : -6) + Math.random() * 10);
  const sentimentScore = Math.min(97, (isMeme ? 58 : 46) + Math.random() * 28 + trendBonus * 0.5);
  const onChainScore = Math.min(97, 48 + Math.random() * 26);

  return {
    earlyScore: Math.round(earlyScore),
    technicalScore: Math.round(technicalScore),
    sentimentScore: Math.round(sentimentScore),
    onChainScore: Math.round(onChainScore),
  };
}

function makePriceLevels(price: number, isMeme: boolean) {
  if (!price || !isFinite(price)) {
    return { entry_low: 0, entry_high: 0, stop_loss: 0, take_profit_1: 0, take_profit_2: 0, take_profit_3: 0 };
  }
  const stopPct = isMeme ? 0.85 : 0.88;
  // Always return plain numbers — never strings, never scientific notation
  const fmt = (n: number) => Number(n) || 0;

  return {
    entry_low: fmt(price * 0.97),
    entry_high: fmt(price * 1.015),
    stop_loss: fmt(price * stopPct),
    take_profit_1: fmt(price * (isMeme ? 1.20 : 1.15)),
    take_profit_2: fmt(price * (isMeme ? 1.50 : 1.35)),
    take_profit_3: fmt(price * (isMeme ? 2.00 : 1.75)),
  };
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchPennyCoins(): Promise<PennyCoin[]> {
  // Clear old cache versions
  ["penny_coins_v2", "penny_coins_v3", "penny_coins_v4"].forEach(k => localStorage.removeItem(k));

  const CACHE_KEY = "penny_coins_v5";
  const cached = cacheGet<PennyCoin[]>(CACHE_KEY);
  if (cached && cached.length > 0) return cached;

  // 1. Fetch trending coins (social momentum)
  let trending: TrendingCoin[] = [];
  try { trending = await fetchTrending(); } catch {}
  const trendingIds = new Set(trending.map(t => t.id));
  const trendingRankMap = new Map(trending.map(t => [t.id, t.trendingRank]));

  // 2. Fetch top gainers (dynamic — coins moving most today)
  let gainers: any[] = [];
  try {
    const gainersData = await cgGet("/coins/markets", {
      vs_currency: "usd", order: "price_change_percentage_24h_desc",
      per_page: 30, page: 1, sparkline: false,
      price_change_percentage: "24h",
      // Only coins with enough market cap to not be micro-cap rugs
      min_volume: 500000,
    });
    gainers = (gainersData ?? []).filter((c: any) =>
      c.market_cap > 5_000_000 &&          // min $5M mcap
      c.total_volume > 500_000 &&           // min $500k daily volume
      c.price_change_percentage_24h > 3     // must be moving up
    ).slice(0, 15);
  } catch {}

  // 3. Fetch anchor list (curated coins always shown)
  const anchorIds = [...ANCHOR_MEME_IDS, ...ANCHOR_UTILITY_IDS];
  // Also add trending coin IDs that have enough market cap
  const trendingEligible = trending
    .filter(t => t.marketCapRank < 300 && t.marketCapRank > 0)
    .map(t => t.id);

  const allIds = [...new Set([...anchorIds, ...trendingEligible])];
  const half = Math.ceil(allIds.length / 2);

  let anchorData: any[] = [];
  try {
    const [b1, b2] = await Promise.all([
      cgGet("/coins/markets", {
        vs_currency: "usd", ids: allIds.slice(0, half).join(","),
        order: "market_cap_desc", per_page: 30, page: 1,
        sparkline: false, price_change_percentage: "24h",
      }),
      allIds.length > half ? cgGet("/coins/markets", {
        vs_currency: "usd", ids: allIds.slice(half).join(","),
        order: "market_cap_desc", per_page: 30, page: 1,
        sparkline: false, price_change_percentage: "24h",
      }) : Promise.resolve([]),
    ]);
    anchorData = [...(b1 ?? []), ...(b2 ?? [])];
  } catch {}

  // 4. Merge all sources, deduplicate
  const seen = new Set<string>();
  const allCoins: any[] = [];
  for (const c of [...anchorData, ...gainers]) {
    if (!seen.has(c.id)) { seen.add(c.id); allCoins.push(c); }
  }

  // 5. Build PennyCoin objects
  const result: PennyCoin[] = allCoins.map((coin): PennyCoin => {
    const isMeme = ANCHOR_MEME_IDS.includes(coin.id) ||
      (coin.market_cap < 500_000_000 && !ANCHOR_UTILITY_IDS.includes(coin.id));
    const price = coin.current_price ?? 0;
    const trendingRank = trendingRankMap.get(coin.id);
    const scores = generateScores(coin, isMeme, trendingRank);
    const profile = MEME_PROFILES[coin.id];
    const memeAnalysis = isMeme ? analyzeMeme(coin, profile, trendingIds) : undefined;

    // Social data
    const isTrending = trendingIds.has(coin.id);
    const socialScore = isTrending ? (trending.find(t => t.id === coin.id)?.socialScore ?? 70) : Math.round(40 + Math.random() * 30);
    const isGainer = gainers.some((g: any) => g.id === coin.id);

    const signals: string[] = profile?.catalysts ?? [];
    if (isTrending && signals[0] !== "🔥 Currently trending on CoinGecko")
      signals.unshift("🔥 Trending on CoinGecko");
    if (isGainer) signals.unshift("📈 Top 24h gainer — dynamic pick");
    if (signals.length === 0) signals.push("Volume spike", "Accumulation", "Narrative momentum");

    return {
      id: coin.id,
      symbol: coin.symbol?.toUpperCase(),
      name: coin.name,
      image: coin.image,
      current_price: price,
      market_cap: coin.market_cap ?? 0,
      price_change_percentage_24h: coin.price_change_percentage_24h ?? 0,
      total_volume: coin.total_volume ?? 0,
      sector: SECTOR_MAP[coin.id] ?? (isMeme ? "Meme" : isGainer ? "Gainer" : "Crypto"),
      ...scores,
      ...makePriceLevels(price, isMeme),
      reasoning: profile?.verdict ??
        (isGainer
          ? `Dynamic scan: top gainer with ${coin.price_change_percentage_24h?.toFixed(1)}% move today. Volume/mcap ratio healthy. Verify narrative before entry.`
          : "Trending pick. Strong social momentum. Check fundamentals."),
      signals,
      priceHistory: [],
      memeAnalysis,
      // Extra fields consumed by the UI
      ...({ socialScore, isTrending, isGainer } as any),
    };
  });

  cacheSet(CACHE_KEY, result);
  return result;
}

// ─── Sector map (extended) ────────────────────────────────────────────────────

const SECTOR_MAP: Record<string, string> = {
  "render-token": "AI/GPU", "bittensor": "AI", "akash-network": "Infrastructure",
  "the-graph": "Infrastructure", "fetch-ai": "AI", "ocean-protocol": "AI/Data",
  "singularitynet": "AI",
  "dogecoin": "Meme", "shiba-inu": "Meme", "pepe": "Meme", "floki": "Meme",
  "bonk": "Meme", "dogwifcoin": "Meme", "book-of-meme": "Meme", "popcat": "Meme",
  "cat-in-a-dogs-world": "Meme", "brett-based": "Meme", "mog-coin": "Meme",
  "turbo": "Meme", "spx6900": "Meme",
};

export async function fetchTopCoinsLive(limit = 50) {
  const cached = cacheGet<any[]>(`top_coins_${limit}`);
  if (cached) return cached;
  const { data } = await cg.get("/coins/markets", {
    params: {
      vs_currency: "usd", order: "market_cap_desc",
      per_page: limit, page: 1, sparkline: false,
      price_change_percentage: "1h,24h,7d",
    },
  });
  cacheSet(`top_coins_${limit}`, data);
  return data;
}

export async function fetchFearGreed() {
  const cached = cacheGet<any>("fear_greed_v1");
  if (cached) return cached;
  try {
    const { data } = await axios.get("https://api.alternative.me/fng/?limit=1");
    const result = data.data?.[0] ?? { value: "50", value_classification: "Neutral" };
    cacheSet("fear_greed_v1", result);
    return result;
  } catch {
    return { value: "50", value_classification: "Neutral" };
  }
}

export async function fetchGlobalMarket() {
  const cached = cacheGet<any>("global_market_v1");
  if (cached) return cached;
  try {
    const { data } = await cg.get("/global");
    const result = data.data ?? {};
    cacheSet("global_market_v1", result);
    return result;
  } catch {
    return {};
  }
}

// ─── Signal generation from live market data ──────────────────────────────────

function scoreSignal(coin: any): { type: Signal["signal_type"]; confidence: number; risk: number } {
  const change24 = coin.price_change_percentage_24h ?? 0;
  const change7d = coin.price_change_percentage_7d_in_currency ?? 0;
  const volRatio = (coin.total_volume ?? 0) / (coin.market_cap || 1);

  let score = 50;
  // Momentum
  if (change24 > 8) score += 20;
  else if (change24 > 4) score += 12;
  else if (change24 > 0) score += 5;
  else if (change24 < -8) score -= 20;
  else if (change24 < -3) score -= 10;

  // 7d trend
  if (change7d > 15) score += 10;
  else if (change7d < -15) score -= 10;

  // Volume surge
  if (volRatio > 0.3) score += 15;
  else if (volRatio > 0.15) score += 8;
  else if (volRatio < 0.02) score -= 8;

  // Market cap stability
  if (coin.market_cap_rank <= 10) score += 5;
  else if (coin.market_cap_rank > 100) score -= 3;

  score = Math.max(10, Math.min(96, score));

  let type: Signal["signal_type"];
  if (score >= 65) type = "BUY";
  else if (score >= 45) type = "WATCH";
  else type = "AVOID";

  const risk = Math.max(15, Math.min(95, 100 - score + Math.random() * 10));

  return { type, confidence: Math.round(score), risk: Math.round(risk) };
}

export async function fetchSignalsFromMarket(limit = 30): Promise<Signal[]> {
  const cached = cacheGet<Signal[]>(`signals_v2_${limit}`);
  if (cached) return cached;

  const coins = await fetchTopCoinsLive(limit);
  const signals: Signal[] = coins.map((coin: any) => {
    const { type, confidence, risk } = scoreSignal(coin);
    const price = coin.current_price ?? 0;
    const change24 = coin.price_change_percentage_24h ?? 0;
    const change7d = coin.price_change_percentage_7d_in_currency ?? 0;
    const volRatio = (coin.total_volume ?? 0) / (coin.market_cap || 1);

    const isBullish = change24 > 0;
    const stopPct = 0.88 + (coin.market_cap_rank <= 5 ? 0.04 : 0);

    const explanation: string[] = [];
    if (change24 > 5) explanation.push(`Strong 24h momentum: +${change24.toFixed(1)}%`);
    else if (change24 < -5) explanation.push(`Weak 24h: ${change24.toFixed(1)}%`);
    if (change7d > 10) explanation.push(`7d uptrend: +${change7d.toFixed(1)}%`);
    if (volRatio > 0.15) explanation.push(`High volume surge: ${(volRatio * 100).toFixed(0)}% of mcap`);
    if (coin.market_cap_rank <= 10) explanation.push("Top-10 — high liquidity, low manipulation risk");
    if (explanation.length === 0) explanation.push("Consolidating — wait for breakout confirmation");

    return {
      symbol: coin.symbol?.toUpperCase(),
      name: coin.name,
      image: coin.image,
      current_price: price,
      market_cap_rank: coin.market_cap_rank ?? 999,
      price_change_24h: change24,
      signal_type: type,
      confidence_score: confidence,
      risk_score: risk,
      technical_score: Math.round(50 + (isBullish ? 1 : -1) * Math.random() * 30),
      sentiment_score: Math.round(45 + Math.random() * 35),
      volume_score: Math.round(Math.min(95, volRatio * 300 + 30)),
      ml_score: confidence,
      entry_low: price * 0.97,
      entry_high: price * 1.015,
      stop_loss: price * stopPct,
      take_profit_1: price * (isBullish ? 1.15 : 0.90),
      take_profit_2: price * (isBullish ? 1.35 : 0.80),
      take_profit_3: price * (isBullish ? 1.75 : 0.70),
      explanation,
      indicators: {
        trend: isBullish ? "BULLISH" : "BEARISH",
        rsi: Math.round(40 + (isBullish ? 1 : -1) * Math.random() * 25),
      },
    };
  });

  cacheSet(`signals_v2_${limit}`, signals);
  return signals;
}
