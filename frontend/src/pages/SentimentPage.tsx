import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { FearGreedGauge } from "../components/FearGreedGauge";

interface Props { overview: any }

export function SentimentPage({ overview }: Props) {
  const fg = overview?.fear_greed;
  const fgValue = fg ? parseInt(fg.value ?? "50") : 50;
  const fgLabel = fg?.value_classification ?? "Neutral";
  const mcChange = overview?.global?.market_cap_change_percentage_24h_usd ?? 0;

  // Derive sentiment slices from real Fear & Greed + market direction
  const positive = Math.round(Math.min(80, 30 + fgValue * 0.5 + (mcChange > 0 ? 5 : -5)));
  const negative = Math.round(Math.min(60, 70 - fgValue * 0.5 + (mcChange < 0 ? 8 : -3)));
  const neutral = Math.max(5, 100 - positive - negative);

  const pieData = [
    { name: "Positive", value: positive, color: "#10b981" },
    { name: "Neutral", value: neutral, color: "#64748b" },
    { name: "Negative", value: negative, color: "#ef4444" },
  ];

  // Social source sentiment keyed to F&G
  const twitterBull = Math.round(Math.min(85, 40 + fgValue * 0.45));
  const redditBull = Math.round(Math.min(82, 35 + fgValue * 0.4));
  const newsBull = Math.round(Math.min(75, 30 + fgValue * 0.35 + (mcChange > 0 ? 8 : -5)));
  const telegramBull = Math.round(Math.min(90, 45 + fgValue * 0.48));

  const SOURCES = [
    { source: "X / Twitter", sentiment: twitterBull / 100, positive: twitterBull, negative: Math.round((100 - twitterBull) * 0.6), neutral: Math.round((100 - twitterBull) * 0.4), color: "#3b82f6" },
    { source: "Reddit", sentiment: redditBull / 100, positive: redditBull, negative: Math.round((100 - redditBull) * 0.65), neutral: Math.round((100 - redditBull) * 0.35), color: "#f97316" },
    { source: "News", sentiment: newsBull / 100, positive: newsBull, negative: Math.round((100 - newsBull) * 0.7), neutral: Math.round((100 - newsBull) * 0.3), color: "#8b5cf6" },
    { source: "Telegram", sentiment: telegramBull / 100, positive: telegramBull, negative: Math.round((100 - telegramBull) * 0.55), neutral: Math.round((100 - telegramBull) * 0.45), color: "#10b981" },
  ];

  // Topics keyed to real market state
  const TOP_TOPICS = [
    { topic: "Bitcoin ETF flows", sentiment: "Positive", score: mcChange > 0 ? 0.78 : 0.45 },
    { topic: "Fed rate environment", sentiment: "Mixed", score: fgValue > 60 ? 0.31 : -0.28 },
    { topic: "Altcoin season signals", sentiment: fgValue > 55 ? "Positive" : "Negative", score: fgValue > 55 ? 0.62 : -0.35 },
    { topic: "ETH staking yield", sentiment: "Positive", score: 0.65 },
    { topic: "Regulatory environment", sentiment: "Negative", score: -0.32 },
    { topic: "On-chain accumulation", sentiment: mcChange > 0 ? "Positive" : "Neutral", score: mcChange > 0 ? 0.71 : 0.15 },
  ];

  // Historical F&G trend (simulated 30 days converging to current)
  const fgHistory = Array.from({ length: 30 }, (_, i) => {
    const progress = i / 29;
    const base = 50 + (fgValue - 50) * progress;
    return { day: `D${i + 1}`, value: Math.round(Math.max(10, Math.min(90, base + (Math.random() - 0.5) * 15))) };
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Sentiment Analysis</h2>
        <span className="text-xs text-slate-500">
          Fear &amp; Greed from Alternative.me · Social sentiment keyed to F&amp;G index
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* F&G gauge — real API data */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 flex flex-col items-center justify-center">
          <p className="text-xs text-slate-500 mb-2">Live Fear & Greed Index</p>
          <FearGreedGauge value={fgValue} label={fgLabel} />
          <p className="text-xs text-slate-600 mt-3 text-center">
            Source: Alternative.me API (updates daily)
          </p>
        </div>

        {/* Pie — derived from real F&G */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Overall Market Sentiment</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value">
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#0f1629", border: "1px solid #1e2d45" }}
                formatter={(v: any, name: string) => [`${v}%`, name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 text-xs">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-slate-400">{d.name} {d.value}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Topics */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Hot Topics (market-derived)</h3>
          <div className="space-y-3">
            {TOP_TOPICS.map(t => (
              <div key={t.topic} className="flex items-center justify-between text-sm">
                <span className="text-slate-400 text-xs">{t.topic}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  t.score > 0.3 ? "text-emerald-400 bg-emerald-500/10" :
                  t.score < -0.1 ? "text-red-400 bg-red-500/10" :
                  "text-yellow-400 bg-yellow-500/10"
                }`}>
                  {t.score > 0 ? "+" : ""}{(t.score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* F&G history chart */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Fear & Greed Trend (30d sim converging to live value: {fgValue})</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={fgHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
            <XAxis dataKey="day" tick={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
            <Tooltip contentStyle={{ background: "#0f1629", border: "1px solid #1e2d45" }}
              formatter={(v: any) => [`${v}`, "F&G Index"]} />
            <Bar dataKey="value" radius={[2, 2, 0, 0]}
              fill="#3b82f6"
            />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-1 text-xs text-slate-600 justify-center">
          <span className="text-red-400">0–24 Extreme Fear</span>
          <span className="text-yellow-400">25–55 Fear/Neutral</span>
          <span className="text-emerald-400">56–100 Greed</span>
        </div>
      </div>

      {/* Source breakdown */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">
          Sentiment by Source
          <span className="ml-2 text-xs text-slate-600 font-normal">(modeled from live Fear & Greed {fgValue})</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={SOURCES}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
              <XAxis dataKey="source" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "#0f1629", border: "1px solid #1e2d45" }} />
              <Bar dataKey="positive" name="Positive" fill="#10b981" stackId="a" />
              <Bar dataKey="neutral" name="Neutral" fill="#64748b" stackId="a" />
              <Bar dataKey="negative" name="Negative" fill="#ef4444" stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="space-y-3">
            {SOURCES.map(s => (
              <div key={s.source} className="bg-dark-700 rounded-lg p-3">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-white">{s.source}</span>
                  <span className="text-sm font-bold" style={{ color: s.color }}>{s.positive}% bullish</span>
                </div>
                <div className="bg-dark-600 rounded-full h-2">
                  <div className="h-2 rounded-full" style={{ width: `${s.positive}%`, backgroundColor: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
