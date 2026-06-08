// ─── Early Action Meme / Crypto Scanner (backend) ────────────────────────────
// Pulls top gainers + trending + multiple categories for a fresh list every run.

import axios from "axios";

const cg = axios.create({ baseURL: "https://api.coingecko.com/api/v3", timeout: 15_000 });

async function cgGet(path, params = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await cg.get(path, { params });
      return data;
    } catch (err) {
      if (err?.response?.status === 429 && attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 8_000));
        continue;
      }
      throw err;
    }
  }
}

// ─── Score formula ────────────────────────────────────────────────────────────

function calcEarlyScore(coin) {
  const ch24 = coin.price_change_percentage_24h ?? 0;
  const ch1h  = coin.price_change_percentage_1h_in_currency  ?? 0;
  const ch7d  = coin.price_change_percentage_7d_in_currency  ?? 0;
  const volRatio = coin.market_cap > 0 ? coin.total_volume / coin.market_cap : 0;

  // Volume surge (0-25)
  const volumeSurge =
    volRatio > 3.0 ? 25 : volRatio > 2.0 ? 22 : volRatio > 1.0 ? 19 :
    volRatio > 0.5 ? 15 : volRatio > 0.2 ? 10 : volRatio > 0.1 ? 6  : 2;

  // Recent 1h momentum (0-30) — primary "early action" signal
  const recentMomentum =
    ch1h > 30 ? 30 : ch1h > 20 ? 27 : ch1h > 15 ? 24 : ch1h > 10 ? 20 :
    ch1h > 7  ? 17 : ch1h > 5  ? 14 : ch1h > 3  ? 10 : ch1h > 1  ? 6  :
    ch1h > 0  ? 3  : ch1h > -2 ? 0  : ch1h > -5 ? -5 : -10;

  // 24h trend (0-20) — context only, capped lower
  const trend24h =
    ch24 > 200 ? 20 : ch24 > 100 ? 18 : ch24 > 50 ? 15 : ch24 > 25 ? 12 :
    ch24 > 15  ? 10 : ch24 > 10  ? 7  : ch24 > 5  ? 4  : ch24 > 0  ? 2  :
    ch24 > -5  ? 0  : -3;

  // Trending bonus (0-15)
  const trendingBonus =
    coin.trendingRank === 1 ? 15 : coin.trendingRank <= 3 ? 13 :
    coin.trendingRank <= 7 ? 10 : coin.trendingRank <= 15 ? 6 : 0;

  // Market cap tier (0-12)
  const mc = coin.market_cap;
  const marketCapTier =
    mc < 500_000      ? 12 : mc < 5_000_000    ? 10 : mc < 25_000_000   ? 8 :
    mc < 100_000_000  ? 6  : mc < 500_000_000  ? 3  : mc < 2_000_000_000 ? 1 : 0;

  // ATH distance (0-8)
  const athDrop = Math.abs(coin.ath_change_percentage ?? 0);
  const athDistance =
    athDrop > 90 ? 8 : athDrop > 70 ? 6 : athDrop > 50 ? 4 :
    athDrop > 30 ? 3 : athDrop > 10 ? 1 : 0;

  // 7d acceleration (0-5)
  const weekBonus = ch7d > 100 ? 5 : ch7d > 50 ? 3 : ch7d > 20 ? 1 : 0;

  // Staleness penalty: move already fading
  const stalenessPenalty = (ch1h < -3 && ch24 > 20) ? -10 : 0;

  const raw = volumeSurge + recentMomentum + trend24h + trendingBonus +
              marketCapTier + athDistance + weekBonus + stalenessPenalty;
  return Math.min(100, Math.max(0, raw));
}

async function fetchTrendingMap() {
  try {
    const data = await cgGet("/search/trending");
    const map = {};
    (data?.coins ?? []).forEach((item, idx) => {
      const id = item?.item?.id;
      if (id) map[id] = idx + 1;
    });
    return map;
  } catch { return {}; }
}

const SKIP_IDS = new Set([
  "tether","usd-coin","dai","binance-usd","trueusd","frax","usdt","usdc",
  "bitcoin","ethereum","binancecoin","solana","xrp","cardano",
  "avalanche-2","polkadot","chainlink","uniswap",
]);

const COMMON = {
  vs_currency: "usd", sparkline: false,
  price_change_percentage: "1h,24h,7d", per_page: 30, page: 1,
};

function mapCoins(raw, trendingMap, opts) {
  return (raw ?? [])
    .filter(c => !SKIP_IDS.has(c.id) && c.current_price > 0 && c.market_cap > 0)
    .map(c => {
      const trendingRank = trendingMap[c.id] ?? 0;
      return {
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        price: c.current_price,
        change1h:  c.price_change_percentage_1h_in_currency  ?? 0,
        change24h: c.price_change_percentage_24h ?? 0,
        change7d:  c.price_change_percentage_7d_in_currency  ?? 0,
        volume24h: c.total_volume,
        marketCap: c.market_cap,
        athChangePct: c.ath_change_percentage ?? 0,
        trendingRank,
        earlyScore: calcEarlyScore({ ...c, trendingRank }),
        ...opts,
      };
    });
}

export async function fetchEarlyCandidates() {
  const trendingMap = await fetchTrendingMap();

  const settled = await Promise.allSettled([
    // 1. Top gainers across all coins today
    cgGet("/coins/markets", {
      ...COMMON, per_page: 40,
      order: "price_change_percentage_24h_desc",
    }),
    // 2. Meme-token by 24h change
    cgGet("/coins/markets", { ...COMMON, category: "meme-token", order: "price_change_percentage_24h_desc" }),
    // 3. Solana meme coins
    cgGet("/coins/markets", { ...COMMON, category: "solana-meme-coins", order: "price_change_percentage_24h_desc" }),
    // 4. Base meme coins
    cgGet("/coins/markets", { ...COMMON, category: "base-meme-coins", order: "price_change_percentage_24h_desc" }),
    // 5. AI meme coins
    cgGet("/coins/markets", { ...COMMON, category: "ai-meme-coins", order: "price_change_percentage_24h_desc" }),
    // 6. Trending coin details
    Object.keys(trendingMap).length > 0
      ? cgGet("/coins/markets", { ...COMMON, ids: Object.keys(trendingMap).slice(0, 15).join(","), order: "market_cap_asc" })
      : Promise.resolve([]),
  ]);

  const get = r => r.status === "fulfilled" ? (r.value ?? []) : [];

  const gainers = get(settled[0]).filter(c =>
    !SKIP_IDS.has(c.id) &&
    c.market_cap > 5_000_000 && c.market_cap < 2_000_000_000 &&
    c.total_volume > 200_000 &&
    (c.price_change_percentage_24h ?? 0) > 5
  );

  const all = [
    ...mapCoins(gainers,          trendingMap, { isMeme: false, isGainer: true,  category: "Gainer"    }),
    ...mapCoins(get(settled[1]),  trendingMap, { isMeme: true,  isGainer: false, category: "Meme"      }),
    ...mapCoins(get(settled[2]),  trendingMap, { isMeme: true,  isGainer: false, category: "SOL Meme"  }),
    ...mapCoins(get(settled[3]),  trendingMap, { isMeme: true,  isGainer: false, category: "Base Meme" }),
    ...mapCoins(get(settled[4]),  trendingMap, { isMeme: true,  isGainer: false, category: "AI Meme"   }),
    ...mapCoins(get(settled[5]).filter(c => !SKIP_IDS.has(c.id)),
                trendingMap, { isMeme: false, isGainer: false, category: "Trending" }),
  ];

  // Dedupe — keep highest score
  const merged = new Map();
  for (const c of all) {
    const ex = merged.get(c.id);
    if (!ex || c.earlyScore > ex.earlyScore) {
      merged.set(c.id, { ...c, isGainer: ex?.isGainer || c.isGainer, isMeme: ex?.isMeme || c.isMeme });
    }
  }

  return [...merged.values()].sort((a, b) => b.earlyScore - a.earlyScore);
}
