import { useEffect, useState, useCallback, Component } from "react";
import type { ReactNode } from "react";
import { X, TrendingUp, TrendingDown, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis,
} from "recharts";
import { fetchPennyCoins } from "../services/coingecko";
import type { PennyCoin } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────
type Sector = "All" | "Trending" | "Gainers" | "Meme" | "AI" | "Infrastructure" | "DeFi" | "GameFi";
type Direction = "All" | "Long" | "Short";
type Timeframe = "All" | "Intraday (1-5h)" | "Scalp (1-24h)" | "Swing (2-14d)" | "Position (2-8w)";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function p(n: number): number {
  return isFinite(n) && !isNaN(n) ? n : 0;
}

function dp(n: number): string {
  const v = p(n);
  if (v === 0) return "0";
  if (v < 0.000001) return v.toFixed(10);
  if (v < 0.001) return v.toFixed(8);
  if (v < 0.01) return v.toFixed(6);
  if (v < 1) return v.toFixed(4);
  if (v < 1000) return v.toFixed(3);
  return v.toLocaleString();
}

// ─── Error boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={this.props.onClose}>
        <div className="bg-dark-800 border border-red-500/30 rounded-xl p-8 text-center max-w-sm">
          <p className="text-red-400 font-semibold mb-2">Chart render error</p>
          <p className="text-slate-400 text-sm mb-4">Could not render charts for this coin. Data is still valid.</p>
          <button onClick={this.props.onClose} className="px-4 py-2 bg-dark-700 text-slate-300 rounded-lg text-sm">Close</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

// ─── Score badge ──────────────────────────────────────────────────────────────
function ScoreBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

// ─── Trade plan modal ─────────────────────────────────────────────────────────
function TradePlanModal({ coin, onClose }: { coin: PennyCoin; onClose: () => void }) {
  const price = p(coin.current_price);
  const isIntraday = (coin as any).isGainer || Math.abs(coin.price_change_percentage_24h) > 5;

  const denom = coin.entry_low - coin.stop_loss;
  const rr = denom !== 0 ? Math.abs((coin.take_profit_2 - coin.entry_high) / denom).toFixed(2) : "N/A";

  const days = 30;
  const chartData = Array.from({ length: days }, (_, i) => {
    const t = i / days;
    return {
      day: `D${i + 1}`,
      base: p(price * (1 + t * 0.15 + Math.sin(i / 4) * 0.03)),
      bull: p(price * (1 + t * 0.75 + Math.random() * 0.04)),
      bear: p(price * (1 - t * 0.12 + Math.random() * 0.02)),
    };
  });

  // Use percentage-based bars instead of raw prices to avoid tiny-float chart crashes
  const actionBars = [
    { phase: "Stop",    pct: -15, label: "Exit ALL" },
    { phase: "Entry",   pct: 0,   label: "Buy" },
    { phase: "TP1",     pct: isIntraday ? 20 : 15, label: "Sell 50%" },
    { phase: "TP2",     pct: isIntraday ? 50 : 35, label: "Sell 30%" },
    { phase: "TP3",     pct: isIntraday ? 100 : 75, label: "Sell 20%" },
  ];

  const radarData = [
    { metric: "Technical", value: p(coin.technicalScore) },
    { metric: "Sentiment", value: p(coin.sentimentScore) },
    { metric: "On-Chain",  value: p(coin.onChainScore) },
    { metric: "Volume",    value: Math.min(95, 50 + Math.random() * 35) },
    { metric: "Momentum",  value: Math.min(95, 45 + Math.random() * 40) },
    { metric: "Early Opp", value: p(coin.earlyScore) },
  ];

  const pdRisk = coin.memeAnalysis?.pdRisk;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-600">
          <div className="flex items-center gap-3">
            {coin.image && <img src={coin.image} alt={coin.name} className="w-10 h-10 rounded-full" />}
            <div>
              <h2 className="text-xl font-bold text-white">
                {coin.name} <span className="text-slate-400">({coin.symbol})</span>
              </h2>
              <p className="text-sm text-slate-500">
                {coin.sector} · Early Score: <span className="text-emerald-400 font-bold">{coin.earlyScore}</span>
                {isIntraday && <span className="ml-2 text-orange-400 font-semibold">⚡ Intraday Play</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-6">
          {/* Price prediction */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">30-Day Price Scenarios</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gbull" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gbase" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gbear" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                <XAxis dataKey="day" tick={false} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={v => `$${dp(v)}`} width={80} />
                <Tooltip
                  contentStyle={{ background: "#0f1629", border: "1px solid #1e2d45", fontSize: 11 }}
                  formatter={(v: any) => [`$${dp(Number(v))}`, ""]}
                />
                <ReferenceLine y={p(coin.stop_loss)} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "SL", fill: "#ef4444", fontSize: 10 }} />
                <ReferenceLine y={p(coin.take_profit_1)} stroke="#10b981" strokeDasharray="4 2" label={{ value: "TP1", fill: "#10b981", fontSize: 10 }} />
                <Area type="monotone" dataKey="bull" stroke="#10b981" fill="url(#gbull)" strokeWidth={2} name="Bull" />
                <Area type="monotone" dataKey="base" stroke="#3b82f6" fill="url(#gbase)" strokeWidth={2} name="Base" />
                <Area type="monotone" dataKey="bear" stroke="#ef4444" fill="url(#gbear)" strokeWidth={1.5} strokeDasharray="4 2" name="Bear" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-1 text-xs text-slate-500 justify-center">
              <span className="text-emerald-400">— Bull (+{isIntraday ? "100" : "75"}%)</span>
              <span className="text-blue-400">— Base (+15%)</span>
              <span className="text-red-400">-- Bear (-12%)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Action bars — percentage based, never crashes on tiny prices */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Action Plan (% from entry)</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={actionBars} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                  <XAxis type="number" tick={{ fontSize: 9, fill: "#64748b" }} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="phase" tick={{ fontSize: 10, fill: "#94a3b8" }} width={45} />
                  <Tooltip
                    contentStyle={{ background: "#0f1629", border: "1px solid #1e2d45", fontSize: 11 }}
                    formatter={(v: any, _: any, props: any) => [`${v}% — ${props.payload.label}`, ""]}
                  />
                  <Bar dataKey="pct" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {isIntraday ? (
                <div className="mt-3">
                  <p className="text-xs text-orange-400 font-semibold mb-2">⚡ Intraday Steps (1–5 hours)</p>
                  <ol className="space-y-1 text-xs text-slate-400">
                    <li>1. Confirm 5-min volume is 2× average before entering</li>
                    <li>2. Enter near <span className="text-white">${dp(coin.entry_low)}</span> — full size, no scaling</li>
                    <li>3. Set stop immediately at <span className="text-red-400">${dp(coin.stop_loss)}</span></li>
                    <li>4. Take 50% off at <span className="text-emerald-400">${dp(coin.take_profit_1)}</span></li>
                    <li>5. Trail stop to breakeven on remaining 50%</li>
                    <li>6. Exit rest at <span className="text-emerald-400">${dp(coin.take_profit_2)}</span></li>
                    <li>7. <b>Never hold intraday plays overnight</b></li>
                  </ol>
                </div>
              ) : (
                <ol className="mt-3 space-y-1 text-xs text-slate-400">
                  <li>1. Limit buy at <span className="text-white">${dp(coin.entry_low)}</span> (33%)</li>
                  <li>2. Scale in at <span className="text-white">${dp(coin.entry_high)}</span> (33%)</li>
                  <li>3. Final entry on confirmation (34%)</li>
                  <li>4. Hard stop at <span className="text-red-400">${dp(coin.stop_loss)}</span></li>
                  <li>5. Take 50% off at <span className="text-emerald-400">${dp(coin.take_profit_1)}</span></li>
                  <li>6. Sell 30% at <span className="text-emerald-400">${dp(coin.take_profit_2)}</span></li>
                  <li>7. Trail 20% to <span className="text-emerald-400">${dp(coin.take_profit_3)}</span></li>
                </ol>
              )}
            </div>

            {/* Radar */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Signal Analysis</h3>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#1e2d45" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Trade summary */}
          <div className="bg-dark-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Trade Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-xs text-slate-500 mb-1">Entry Zone</div>
                <div className="text-sm font-bold text-white">${dp(coin.entry_low)} – ${dp(coin.entry_high)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-500 mb-1">Stop Loss</div>
                <div className="text-sm font-bold text-red-400">${dp(coin.stop_loss)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-500 mb-1">Risk/Reward</div>
                <div className="text-sm font-bold text-emerald-400">1 : {rr}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-500 mb-1">Timeframe</div>
                <div className="text-sm font-bold text-blue-400">{isIntraday ? "1–5 hours" : "2–8 weeks"}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: `TP1 (+${isIntraday ? "20" : "15"}%)`, value: coin.take_profit_1 },
                { label: `TP2 (+${isIntraday ? "50" : "35"}%)`, value: coin.take_profit_2 },
                { label: `TP3 (+${isIntraday ? "100" : "75"}%)`, value: coin.take_profit_3 },
              ].map(tp => (
                <div key={tp.label} className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                  <div className="text-xs text-emerald-400 mb-1">{tp.label}</div>
                  <div className="text-sm font-bold text-white">${dp(tp.value)}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{coin.reasoning}</p>
            <p className="text-xs text-slate-600 mt-2">⚠ Probabilistic estimates only. Not financial advice. Max 1–3% portfolio per position.</p>
          </div>

          {/* P&D Analysis */}
          {coin.memeAnalysis && (
            <div className="rounded-xl border overflow-hidden" style={{
              borderColor: pdRisk === "LOW" ? "#10b981" : pdRisk === "MEDIUM" ? "#f59e0b" : "#ef4444"
            }}>
              <div className="px-4 py-3 flex items-center gap-3" style={{
                background: pdRisk === "LOW" ? "rgba(16,185,129,0.1)" : pdRisk === "MEDIUM" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)"
              }}>
                {pdRisk === "LOW"
                  ? <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
                  : <ShieldAlert size={18} className={pdRisk === "MEDIUM" ? "text-yellow-400 shrink-0" : "text-red-400 shrink-0"} />}
                <span className="font-bold text-white text-sm">Pump & Dump Risk Analysis</span>
                <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded ${
                  pdRisk === "LOW" ? "bg-emerald-500/20 text-emerald-400" :
                  pdRisk === "MEDIUM" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"
                }`}>{pdRisk} — Score {coin.memeAnalysis.pdRiskScore}/100</span>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-b border-white/5">
                <div><div className="text-xs text-slate-500 mb-1">Market Cap</div><div className="font-bold text-white">{coin.memeAnalysis.marketCapTier}</div></div>
                <div><div className="text-xs text-slate-500 mb-1">Liquidity</div><div className={`font-bold ${coin.memeAnalysis.liquidityScore >= 50 ? "text-emerald-400" : "text-yellow-400"}`}>{coin.memeAnalysis.liquidityScore}/100</div></div>
                <div><div className="text-xs text-slate-500 mb-1">Holders</div><div className={`font-bold ${coin.memeAnalysis.holderRisk === "Safe" ? "text-emerald-400" : coin.memeAnalysis.holderRisk === "Moderate" ? "text-yellow-400" : "text-red-400"}`}>{coin.memeAnalysis.holderRisk}</div></div>
                <div><div className="text-xs text-slate-500 mb-1">Narrative</div><div className="font-bold text-blue-400">{coin.memeAnalysis.narrativeStrength}/100</div></div>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-emerald-400 font-semibold mb-2">Catalysts</p>
                  <ul className="space-y-1">{coin.memeAnalysis.catalysts.map((c, i) => (
                    <li key={i} className="text-xs text-slate-400 flex gap-2"><span className="text-emerald-500">✓</span>{c}</li>
                  ))}</ul>
                </div>
                <div>
                  <p className="text-xs text-red-400 font-semibold mb-2">Red Flags</p>
                  {coin.memeAnalysis.redFlags.length === 0
                    ? <p className="text-xs text-emerald-400">None detected</p>
                    : <ul className="space-y-1">{coin.memeAnalysis.redFlags.map((f, i) => (
                        <li key={i} className="text-xs text-slate-400 flex gap-2"><span className="text-red-500">⚠</span>{f}</li>
                      ))}</ul>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function PennyScannerPage() {
  const [coins, setCoins] = useState<PennyCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sector, setSector] = useState<Sector>("All");
  const [direction, setDirection] = useState<Direction>("All");
  const [timeframe, setTimeframe] = useState<Timeframe>("All");
  const [sortBy, setSortBy] = useState<"earlyScore" | "price_change_percentage_24h" | "market_cap">("earlyScore");
  const [selected, setSelected] = useState<PennyCoin | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(180);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPennyCoins();
      setCoins(data.filter(c => isFinite(c.current_price) && c.current_price > 0));
      setLastUpdated(new Date());
      setCountdown(180);
    } catch {
      setError("Could not load from CoinGecko. Rate limit may apply — wait 60s and retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 180_000);
    const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => { clearInterval(interval); clearInterval(tick); };
  }, [load]);

  function coinDirection(c: PennyCoin): Direction {
    return c.price_change_percentage_24h >= 0 ? "Long" : "Short";
  }

  function coinTimeframe(c: PennyCoin): Timeframe {
    const vol = Math.abs(c.price_change_percentage_24h);
    if ((c as any).isGainer && vol > 5) return "Intraday (1-5h)";
    if (vol > 10) return "Intraday (1-5h)";
    if (vol > 5) return "Scalp (1-24h)";
    if (c.earlyScore >= 72) return "Swing (2-14d)";
    return "Position (2-8w)";
  }

  const filtered = coins
    .filter(c => !c.memeAnalysis || c.memeAnalysis.passed)
    .filter(c => {
      if (sector === "All") return true;
      if (sector === "Trending") return !!(c as any).isTrending;
      if (sector === "Gainers") return !!(c as any).isGainer;
      return c.sector === sector;
    })
    .filter(c => direction === "All" || coinDirection(c) === direction)
    .filter(c => timeframe === "All" || coinTimeframe(c) === timeframe)
    .sort((a, b) => {
      if (sortBy === "price_change_percentage_24h") return b.price_change_percentage_24h - a.price_change_percentage_24h;
      if (sortBy === "market_cap") return b.market_cap - a.market_cap;
      return b.earlyScore - a.earlyScore;
    });

  const sectors: Sector[] = ["All", "Trending", "Gainers", "Meme", "AI", "Infrastructure", "DeFi", "GameFi"];
  const directions: Direction[] = ["All", "Long", "Short"];
  const timeframes: Timeframe[] = ["All", "Intraday (1-5h)", "Scalp (1-24h)", "Swing (2-14d)", "Position (2-8w)"];

  return (
    <div className="p-6">
      {selected && (
        <ErrorBoundary onClose={() => setSelected(null)}>
          <TradePlanModal coin={selected} onClose={() => setSelected(null)} />
        </ErrorBoundary>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Penny & Meme Crypto Scanner</h2>
          <p className="text-xs text-slate-500">
            Live CoinGecko prices · Trending + top gainers · Auto-refresh every 3min
            {lastUpdated && ` · Next: ${countdown}s`}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 text-yellow-400 text-sm">{error}</div>
      )}

      {/* Filters */}
      <div className="space-y-2 mb-4 bg-dark-800 border border-dark-600 rounded-xl p-3">
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-slate-500 w-16 shrink-0">Sector</span>
          {sectors.map(s => (
            <button key={s} onClick={() => setSector(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sector === s ? "bg-blue-600 text-white" : "bg-dark-700 text-slate-400 hover:text-slate-200"}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-slate-500 w-16 shrink-0">Direction</span>
          {directions.map(d => (
            <button key={d} onClick={() => setDirection(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                direction === d
                  ? d === "Long" ? "bg-emerald-600 text-white" : d === "Short" ? "bg-red-600 text-white" : "bg-blue-600 text-white"
                  : "bg-dark-700 text-slate-400 hover:text-slate-200"}`}>
              {d === "Long" ? "↑ Long" : d === "Short" ? "↓ Short" : d}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-slate-500 w-16 shrink-0">Timeframe</span>
          {timeframes.map(t => (
            <button key={t} onClick={() => setTimeframe(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${timeframe === t ? "bg-purple-600 text-white" : "bg-dark-700 text-slate-400 hover:text-slate-200"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-slate-500 w-16 shrink-0">Sort</span>
          {(["earlyScore", "price_change_percentage_24h", "market_cap"] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${sortBy === s ? "bg-yellow-600 text-white" : "bg-dark-700 text-slate-400 hover:text-slate-200"}`}>
              {s === "earlyScore" ? "Early Score" : s === "price_change_percentage_24h" ? "24h %" : "Market Cap"}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">{filtered.length} coins</span>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && coins.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-dark-800 border border-dark-600 rounded-xl p-4 animate-pulse h-52" />
          ))}
        </div>
      )}

      {/* Coin grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(coin => {
          const change = coin.price_change_percentage_24h ?? 0;
          const tf = coinTimeframe(coin);
          const dir = coinDirection(coin);
          const pd = coin.memeAnalysis?.pdRisk;

          return (
            <button
              key={coin.id}
              onClick={() => setSelected(coin)}
              className="text-left bg-dark-800 border border-dark-600 rounded-xl p-4 hover:border-blue-500/50 hover:bg-dark-700 transition-all"
            >
              {/* Top row */}
              <div className="flex items-start gap-3 mb-3">
                {coin.image && <img src={coin.image} alt={coin.name} className="w-9 h-9 rounded-full shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1 mb-0.5">
                    <span className="font-bold text-white">{coin.symbol}</span>
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">{coin.sector}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${dir === "Long" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                      {dir === "Long" ? "↑" : "↓"} {dir}
                    </span>
                    {pd && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${pd === "LOW" ? "bg-emerald-500/20 text-emerald-400" : pd === "MEDIUM" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
                        {pd === "LOW" ? "✓ Safe" : pd === "MEDIUM" ? "⚠ Med" : "⚠ High"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{coin.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-white">${dp(coin.current_price)}</div>
                  <div className={`text-xs flex items-center justify-end gap-0.5 ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {change >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {change.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1 mb-3">
                {(coin as any).isTrending && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">🔥 Trending</span>}
                {(coin as any).isGainer && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">📈 Top Gainer</span>}
                <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">{tf}</span>
                {(coin as any).socialScore != null && (
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">Social {(coin as any).socialScore}</span>
                )}
              </div>

              {/* Scores */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <ScoreBadge label="Early" value={coin.earlyScore} color="text-emerald-400" />
                <ScoreBadge label="Tech" value={coin.technicalScore} color="text-blue-400" />
                <ScoreBadge label="Sentiment" value={coin.sentimentScore} color="text-purple-400" />
                <ScoreBadge label="On-Chain" value={coin.onChainScore} color="text-yellow-400" />
              </div>

              {/* Entry/Stop/TP */}
              <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                <div className="text-center"><div className="text-slate-500">Entry</div><div className="text-white font-medium">${dp(coin.entry_low)}</div></div>
                <div className="text-center"><div className="text-slate-500">Stop</div><div className="text-red-400 font-medium">${dp(coin.stop_loss)}</div></div>
                <div className="text-center"><div className="text-slate-500">TP1</div><div className="text-emerald-400 font-medium">${dp(coin.take_profit_1)}</div></div>
              </div>

              <p className="text-xs text-slate-500 line-clamp-2 mb-2">{coin.reasoning}</p>
              <div className="text-xs text-center text-blue-400 opacity-60">Click for full trade plan →</div>
            </button>
          );
        })}
      </div>

      {!loading && filtered.length === 0 && coins.length > 0 && (
        <div className="text-center py-20 text-slate-600">No coins match this filter combination.</div>
      )}
    </div>
  );
}
