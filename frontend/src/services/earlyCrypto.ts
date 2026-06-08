// ─── Early Action Meme / Crypto Scanner ───────────────────────────────────────
// Finds coins actually moving RIGHT NOW — top gainers + trending + multi-category.
// Scores 0-100 across 5 dimensions. Always fresh, never the same stale list.

import axios from "axios";

const CG_BASE = "https://api.coingecko.com/api/v3";
const cg = axios.create({ baseURL: CG_BASE, timeout: 15_000 });

async function cgGet(path: string, params: Record<string, unknown> = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await cg.get(path, { params });
      return data;
    } catch (err: any) {
      if (err?.response?.status === 429 && attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 8_000));
        continue;
      }
      throw err;
    }
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EarlyCandidate {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  change1h: number;
  change24h: number;
  change7d: number;
  volume24h: number;
  marketCap: number;
  athChangePct: number;
  trendingRank: number;
  earlyScore: number;
  scoreBreakdown: ScoreBreakdown;
  isMeme: boolean;
  isGainer: boolean;
  category: string;
  fetchedAt: Date;
}

interface ScoreBreakdown {
  volumeSurge: number;
  priceMomentum: number;
  trendingBonus: number;
  marketCapTier: number;
  athDistance: number;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_KEY = "earlyCoins_v3";
const CACHE_TTL = 3 * 60 * 1000; // 3 min — keep it fresh

function cacheGet(): EarlyCandidate[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function cacheSet(data: EarlyCandidate[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

// ─── Score formula ────────────────────────────────────────────────────────────

function calcEarlyScore(coin: {
  total_volume: number;
  market_cap: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_1h_in_currency?: number;
  ath_change_percentage: number;
  trendingRank: number;
}): { score: number; breakdown: ScoreBreakdown } {
  const ch24 = coin.price_change_percentage_24h ?? 0;
  const ch1h  = coin.price_change_percentage_1h_in_currency  ?? 0;
  const ch7d  = coin.price_change_percentage_7d_in_currency  ?? 0;
  const volRatio = coin.market_cap > 0 ? coin.total_volume / coin.market_cap : 0;

  // 1 — Volume Surge (0-25): volume vs market cap = unusual buying activity
  const volumeSurge =
    volRatio > 3.0 ? 25 : volRatio > 2.0 ? 22 : volRatio > 1.0 ? 19 :
    volRatio > 0.5 ? 15 : volRatio > 0.2 ? 10 : volRatio > 0.1 ? 6  : 2;

  // 2 — Recent (1h) Momentum (0-30): THIS is the "early action" signal.
  //     A coin pumping RIGHT NOW scores much higher than one that pumped yesterday.
  //     Negative 1h = decelerating / dead cat, heavily penalised.
  const recentMomentum =
    ch1h > 30 ? 30 : ch1h > 20 ? 27 : ch1h > 15 ? 24 : ch1h > 10 ? 20 :
    ch1h > 7  ? 17 : ch1h > 5  ? 14 : ch1h > 3  ? 10 : ch1h > 1  ? 6  :
    ch1h > 0  ? 3  : ch1h > -2 ? 0  : ch1h > -5 ? -5 : -10; // penalise fading momentum

  // 3 — 24h Trend (0-20): gives context, but loses to 1h if they disagree.
  //     Cap lower than before so yesterday's pump doesn't dominate forever.
  const trend24h =
    ch24 > 200 ? 20 : ch24 > 100 ? 18 : ch24 > 50 ? 15 : ch24 > 25 ? 12 :
    ch24 > 15  ? 10 : ch24 > 10  ? 7  : ch24 > 5  ? 4  : ch24 > 0  ? 2  :
    ch24 > -5  ? 0  : -3;

  // 4 — Trending Bonus (0-15): CoinGecko trending = huge social signal
  const trendingBonus =
    coin.trendingRank === 1 ? 15 : coin.trendingRank <= 3 ? 13 :
    coin.trendingRank <= 7 ? 10 : coin.trendingRank <= 15 ? 6  : 0;

  // 5 — Market Cap Tier (0-12): smaller = more explosive potential
  const mc = coin.market_cap;
  const marketCapTier =
    mc < 500_000      ? 12 : mc < 5_000_000    ? 10 : mc < 25_000_000   ? 8 :
    mc < 100_000_000  ? 6  : mc < 500_000_000  ? 3  : mc < 2_000_000_000 ? 1 : 0;

  // 6 — ATH Distance (0-8): still far from peak = room to run
  const athDrop = Math.abs(coin.ath_change_percentage ?? 0);
  const athDistance =
    athDrop > 90 ? 8 : athDrop > 70 ? 6 : athDrop > 50 ? 4 :
    athDrop > 30 ? 3 : athDrop > 10 ? 1 : 0;

  // 7 — 7d Acceleration bonus (0-5): 7d trending up = sustained momentum
  const weekBonus = ch7d > 100 ? 5 : ch7d > 50 ? 3 : ch7d > 20 ? 1 : 0;

  // Staleness penalty: if 1h is negative while 24h is positive, the move is OVER
  const stalenessPenalty = (ch1h < -3 && ch24 > 20) ? -10 : 0;

  const raw = volumeSurge + recentMomentum + trend24h + trendingBonus +
              marketCapTier + athDistance + weekBonus + stalenessPenalty;
  const score = Math.min(100, Math.max(0, raw));
  return { score, breakdown: { volumeSurge, priceMomentum: recentMomentum + trend24h, trendingBonus, marketCapTier, athDistance } };
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchTrendingMap(): Promise<Record<string, number>> {
  try {
    const data = await cgGet("/search/trending");
    const map: Record<string, number> = {};
    (data?.coins ?? []).forEach((item: any, idx: number) => {
      const id = item?.item?.id;
      if (id) map[id] = idx + 1;
    });
    return map;
  } catch { return {}; }
}

function mapCoins(
  raw: any[],
  trendingMap: Record<string, number>,
  opts: { isMeme: boolean; isGainer: boolean; category: string },
): EarlyCandidate[] {
  const SKIP = new Set(["tether", "usd-coin", "dai", "binance-usd", "trueusd", "frax", "usdt", "usdc"]);
  return raw
    .filter(c => !SKIP.has(c.id) && c.current_price > 0 && c.market_cap > 0)
    .map(c => {
      const trendingRank = trendingMap[c.id] ?? 0;
      const { score, breakdown } = calcEarlyScore({ ...c, trendingRank });
      return {
        id: c.id,
        symbol: (c.symbol as string).toUpperCase(),
        name: c.name,
        image: c.image,
        price: c.current_price,
        change1h:  c.price_change_percentage_1h_in_currency  ?? 0,
        change24h: c.price_change_percentage_24h ?? 0,
        change7d:  c.price_change_percentage_7d_in_currency  ?? 0,
        volume24h: c.total_volume,
        marketCap: c.market_cap,
        athChangePct: c.ath_change_percentage ?? 0,
        trendingRank,
        earlyScore: score,
        scoreBreakdown: breakdown,
        fetchedAt: new Date(),
        ...opts,
      } satisfies EarlyCandidate;
    });
}

// Categories that have fresh meme/early-action coins
const MEME_CATEGORIES = [
  "meme-token",
  "solana-meme-coins",
  "base-meme-coins",
  "ai-meme-coins",
];

const COMMON_PARAMS = {
  vs_currency: "usd",
  sparkline: false,
  price_change_percentage: "1h,24h,7d",
  per_page: 30,
  page: 1,
};

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchEarlyCandidates(forceRefresh = false): Promise<EarlyCandidate[]> {
  if (!forceRefresh) {
    const cached = cacheGet();
    if (cached) return cached;
  }

  const trendingMap = await fetchTrendingMap();

  // Run all fetches in parallel for speed
  const [
    gainersRaw,
    memeByChangeRaw,
    solanaMemeRaw,
    baseMemeRaw,
    aiMemeRaw,
    trendingDetailsRaw,
  ] = await Promise.allSettled([

    // 1. Top gainers across ALL coins today ($5M+ mcap, $200K+ volume)
    cgGet("/coins/markets", {
      ...COMMON_PARAMS,
      order: "price_change_percentage_24h_desc",
      per_page: 40,
    }),

    // 2. Meme-token category sorted by 24h change (not volume)
    cgGet("/coins/markets", {
      ...COMMON_PARAMS,
      category: "meme-token",
      order: "price_change_percentage_24h_desc",
    }),

    // 3. Solana meme coins — very active ecosystem
    cgGet("/coins/markets", {
      ...COMMON_PARAMS,
      category: "solana-meme-coins",
      order: "price_change_percentage_24h_desc",
    }),

    // 4. Base chain meme coins
    cgGet("/coins/markets", {
      ...COMMON_PARAMS,
      category: "base-meme-coins",
      order: "price_change_percentage_24h_desc",
    }),

    // 5. AI meme coins (hot narrative)
    cgGet("/coins/markets", {
      ...COMMON_PARAMS,
      category: "ai-meme-coins",
      order: "price_change_percentage_24h_desc",
    }),

    // 6. Trending coins detail
    Object.keys(trendingMap).length > 0
      ? cgGet("/coins/markets", {
          ...COMMON_PARAMS,
          ids: Object.keys(trendingMap).slice(0, 15).join(","),
          order: "market_cap_asc",
        })
      : Promise.resolve([]),
  ]);

  const getValue = (r: PromiseSettledResult<any>) =>
    r.status === "fulfilled" ? (r.value ?? []) : [];

  const BIG_SKIP = new Set([
    "bitcoin", "ethereum", "binancecoin", "solana", "xrp", "cardano",
    "avalanche-2", "polkadot", "chainlink", "uniswap", "tether", "usd-coin",
  ]);

  const gainers = getValue(gainersRaw)
    .filter((c: any) =>
      !BIG_SKIP.has(c.id) &&
      c.market_cap > 5_000_000 &&
      c.market_cap < 2_000_000_000 &&  // not large-cap
      c.total_volume > 200_000 &&
      (c.price_change_percentage_24h ?? 0) > 5
    );

  const all: EarlyCandidate[] = [
    ...mapCoins(gainers,                  trendingMap, { isMeme: false, isGainer: true,  category: "Gainer"    }),
    ...mapCoins(getValue(memeByChangeRaw), trendingMap, { isMeme: true,  isGainer: false, category: "Meme"      }),
    ...mapCoins(getValue(solanaMemeRaw),   trendingMap, { isMeme: true,  isGainer: false, category: "SOL Meme"  }),
    ...mapCoins(getValue(baseMemeRaw),     trendingMap, { isMeme: true,  isGainer: false, category: "Base Meme" }),
    ...mapCoins(getValue(aiMemeRaw),       trendingMap, { isMeme: true,  isGainer: false, category: "AI Meme"   }),
    ...mapCoins(getValue(trendingDetailsRaw).filter((c: any) => !BIG_SKIP.has(c.id)),
                trendingMap, { isMeme: false, isGainer: false, category: "Trending" }),
  ];

  // Dedupe — keep highest score per coin
  const merged = new Map<string, EarlyCandidate>();
  for (const c of all) {
    const ex = merged.get(c.id);
    if (!ex || c.earlyScore > ex.earlyScore) {
      // Preserve gainer/meme flags across sources
      merged.set(c.id, {
        ...c,
        isGainer: ex?.isGainer || c.isGainer,
        isMeme:   ex?.isMeme   || c.isMeme,
      });
    }
  }

  const result = [...merged.values()].sort((a, b) => b.earlyScore - a.earlyScore);
  cacheSet(result);
  return result;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function fmtMcap(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtCryptoPrice(n: number): string {
  if (n >= 1000)   return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1)      return n.toFixed(4);
  if (n >= 0.01)   return n.toFixed(6);
  if (n >= 0.0001) return n.toFixed(8);
  return n.toFixed(12).replace(/0+$/, "");
}
