import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Activity, AlertTriangle, Zap, Users, BarChart2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { FearGreedGauge } from "../components/FearGreedGauge";
import { fetchTrending } from "../services/coingecko";
import type { Signal } from "../types";

interface Props {
  overview: any;
  signals: Signal[];
  loading: boolean;
}

function KpiCard({ title, value, sub, positive, icon }: { title: string; value: string; sub?: string; positive: boolean; icon: any }) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{title}</span>
        <span className="text-slate-600">{icon}</span>
      </div>
      <div className={`text-2xl font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// Simulated 30-day equity curve that trends upward with noise
const EQUITY_BASE = Array.from({ length: 30 }, (_, i) => ({
  day: `D${i + 1}`,
  value: Math.round(100000 + Math.sin(i / 3) * 6000 + i * 1400 + Math.random() * 2500),
}));

export function DashboardPage({ overview, signals, loading }: Props) {
  const [trending, setTrending] = useState<any[]>([]);

  useEffect(() => {
    fetchTrending().then(setTrending).catch(() => {});
  }, []);

  const fg = overview?.fear_greed;
  const fgValue = fg ? parseInt(fg.value ?? "50") : 50;
  const fgLabel = fg?.value_classification ?? "Neutral";

  const global = overview?.global ?? {};
  const mcChange = global.market_cap_change_percentage_24h_usd ?? 0;
  const totalMcap = global.total_market_cap?.usd ?? 0;
  const activeCryptos = global.active_cryptocurrencies ?? 0;
  const btcDominance = global.market_cap_percentage?.btc ?? 0;

  const buySignals = signals.filter(s => s.signal_type === "BUY");
  const topSignals = signals.slice(0, 5);

  // Agent scores driven by real market sentiment
  const baseConf = fgValue;
  const AGENTS = [
    { name: "Technical", confidence: Math.round(Math.min(92, baseConf * 0.85 + 20)), color: "text-blue-400" },
    { name: "News", confidence: Math.round(Math.min(90, baseConf * 0.7 + 18)), color: "text-purple-400" },
    { name: "Sentiment", confidence: Math.round(Math.min(94, baseConf * 0.9 + 8)), color: "text-yellow-400" },
    { name: "On-Chain", confidence: Math.round(Math.min(96, baseConf * 0.8 + 25)), color: "text-emerald-400" },
    { name: "Macro", confidence: Math.round(Math.min(88, baseConf * 0.6 + 22)), color: "text-orange-400" },
    { name: "Risk", confidence: Math.round(Math.min(90, 100 - baseConf * 0.4 + 20)), color: "text-red-400" },
  ];

  // Whale feed items seeded from trending coins
  const whaleItems = trending.slice(0, 5).map((t, i) => {
    const isOut = i % 2 === 0;
    const amounts = ["$4.2M", "$11.8M", "$7.3M", "$18.5M", "$6.1M"];
    const exchanges = ["Binance", "Coinbase", "OKX", "Kraken", "Bybit"];
    return {
      time: `${[2, 7, 14, 31, 55][i]}m ago`,
      action: `${t.symbol} ${isOut ? "outflow" : "accumulation"}`,
      amount: amounts[i],
      from: isOut ? exchanges[i] : "Unknown Whale",
      to: isOut ? "Cold Wallet" : exchanges[(i + 1) % 5],
      type: isOut ? "outflow" : "inflow",
    };
  });

  const fallbackWhale = [
    { time: "2m ago", action: "BTC transfer", amount: "$4.2M", from: "Unknown", to: "Binance", type: "inflow" },
    { time: "7m ago", action: "ETH accumulation", amount: "$11.8M", from: "Coinbase", to: "Cold wallet", type: "outflow" },
    { time: "14m ago", action: "USDT movement", amount: "$28M", from: "Tether Treasury", to: "Exchange", type: "inflow" },
    { time: "31m ago", action: "BTC withdrawal", amount: "$6.7M", from: "Kraken", to: "Cold wallet", type: "outflow" },
  ];

  const displayWhale = whaleItems.length > 0 ? whaleItems : fallbackWhale;

  const mcapDisplay = totalMcap > 0
    ? `$${(totalMcap / 1e12).toFixed(2)}T`
    : "—";

  return (
    <div className="p-6 space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Market Cap"
          value={mcapDisplay}
          sub={`${mcChange >= 0 ? "+" : ""}${mcChange.toFixed(2)}% 24h`}
          positive={mcChange >= 0}
          icon={<BarChart2 size={18} />}
        />
        <KpiCard
          title="BTC Dominance"
          value={`${btcDominance.toFixed(1)}%`}
          sub="of total market cap"
          positive={btcDominance < 55}
          icon={<Activity size={18} />}
        />
        <KpiCard
          title="Active BUY Signals"
          value={`${buySignals.length} BUY`}
          sub={`of ${signals.length} total`}
          positive={buySignals.length > 5}
          icon={<Zap size={18} />}
        />
        <KpiCard
          title="Active Cryptos"
          value={activeCryptos > 0 ? activeCryptos.toLocaleString() : "—"}
          sub="across all markets"
          positive
          icon={<Users size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Portfolio equity curve */}
        <div className="lg:col-span-2 bg-dark-800 border border-dark-600 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Portfolio Equity Curve (30d sim)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={EQUITY_BASE}>
              <defs>
                <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
              <XAxis dataKey="day" tick={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Portfolio"]}
                contentStyle={{ background: "#0f1629", border: "1px solid #1e2d45" }}
              />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="url(#eq)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Fear & Greed */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 flex flex-col items-center justify-center">
          <FearGreedGauge value={fgValue} label={fgLabel} />
          <div className="mt-4 w-full space-y-2">
            {[
              { label: "Extreme Fear", range: "0–24", color: "bg-red-500" },
              { label: "Fear", range: "25–44", color: "bg-orange-500" },
              { label: "Neutral", range: "45–55", color: "bg-yellow-500" },
              { label: "Greed", range: "56–74", color: "bg-lime-500" },
              { label: "Extreme Greed", range: "75–100", color: "bg-emerald-500" },
            ].map(({ label, range, color }) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <div className={`w-2 h-2 rounded-full ${color}`} />
                <span className="text-slate-400">{label}</span>
                <span className="ml-auto text-slate-600">{range}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top signals + AI agents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">
            Top Signals <span className="text-xs text-slate-600 font-normal ml-1">(live from CoinGecko)</span>
          </h3>
          {loading && signals.length === 0 && <p className="text-slate-600 text-sm">Loading live data…</p>}
          <div className="space-y-2">
            {topSignals.map(s => (
              <div key={s.symbol} className="flex items-center gap-3 py-2 border-b border-dark-600 last:border-0">
                {s.image && <img src={s.image} className="w-7 h-7 rounded-full" alt={s.name} />}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-white">{s.symbol}</span>
                  <span className="ml-2 text-xs text-slate-500 truncate">{s.name}</span>
                </div>
                <span className={`text-xs ${(s.price_change_24h ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"} flex items-center gap-0.5`}>
                  {(s.price_change_24h ?? 0) >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {(s.price_change_24h ?? 0).toFixed(1)}%
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  s.signal_type === "BUY" ? "bg-emerald-500/20 text-emerald-400" :
                  s.signal_type === "WATCH" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-red-500/20 text-red-400"}`}>{s.signal_type}</span>
                <span className="text-sm font-semibold text-blue-400 w-6 text-right">{s.confidence_score}</span>
              </div>
            ))}
            {topSignals.length === 0 && !loading && (
              <p className="text-slate-600 text-sm">No signals loaded yet.</p>
            )}
          </div>
        </div>

        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">
            AI Agent Status <span className="text-xs text-slate-600 font-normal ml-1">(keyed to F&G {fgValue})</span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {AGENTS.map(a => (
              <div key={a.name} className="bg-dark-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold ${a.color}`}>{a.name}</span>
                  <span className="text-xs text-emerald-400">● LIVE</span>
                </div>
                <div className="text-2xl font-bold text-white">{a.confidence}</div>
                <div className="text-xs text-slate-500">confidence</div>
                <div className="mt-2 bg-dark-600 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${a.confidence}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trending + Whale feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {trending.length > 0 && (
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">🔥 Trending Now <span className="text-xs text-slate-600 font-normal">(CoinGecko live)</span></h3>
            <div className="space-y-2">
              {trending.slice(0, 7).map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 py-1.5 border-b border-dark-700 last:border-0">
                  <span className="text-xs text-slate-600 w-4">#{i + 1}</span>
                  {t.thumb && <img src={t.thumb} className="w-6 h-6 rounded-full" alt={t.name} />}
                  <span className="text-sm text-white flex-1">{t.name}</span>
                  <span className="text-xs text-slate-400">{t.symbol}</span>
                  <div className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">Social {t.socialScore}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">
            Live Whale Activity <span className="text-xs text-slate-600 font-normal">(simulated)</span>
          </h3>
          <div className="space-y-2">
            {displayWhale.map((w, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-dark-600 last:border-0 text-sm">
                <span className="text-slate-600 text-xs w-12 shrink-0">{w.time}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-bold shrink-0 ${w.type === "outflow" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                  {w.type.toUpperCase()}
                </span>
                <span className="text-slate-300 flex-1 truncate">{w.action}</span>
                <span className="text-yellow-400 font-semibold shrink-0">{w.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
