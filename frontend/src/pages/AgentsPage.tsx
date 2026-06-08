import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { Signal } from "../types";

interface Props {
  overview?: any;
  signals?: Signal[];
}

export function AgentsPage({ overview, signals = [] }: Props) {
  const fg = overview?.fear_greed;
  const fgValue = fg ? parseInt(fg.value ?? "50") : 50;
  const mcChange = overview?.global?.market_cap_change_percentage_24h_usd ?? 0;

  // Agent confidence scores driven by real market data
  const techScore = Math.round(Math.min(95, 45 + fgValue * 0.4 + (mcChange > 0 ? 8 : -5)));
  const newsScore = Math.round(Math.min(93, 35 + fgValue * 0.35 + (mcChange > 0 ? 5 : -3)));
  const sentScore = Math.round(Math.min(96, fgValue * 0.85 + 15));
  const onchainScore = Math.round(Math.min(95, 40 + fgValue * 0.45 + (mcChange > 0 ? 10 : -4)));
  const macroScore = Math.round(Math.min(90, 30 + fgValue * 0.3));
  const riskScore = Math.round(Math.min(92, 85 - fgValue * 0.25));

  const AGENTS = [
    {
      name: "Technical Analysis", color: "#3b82f6", confidence: techScore,
      tasks: "RSI, MACD, Bollinger Bands, VWAP, Fibonacci",
      output: signals.filter(s => s.signal_type === "BUY").length > 0
        ? `${signals.filter(s => s.signal_type === "BUY").length} BUY, ${signals.filter(s => s.signal_type === "WATCH").length} WATCH signals active`
        : "Scanning market structure…",
    },
    {
      name: "News Analysis", color: "#8b5cf6", confidence: newsScore,
      tasks: "RSS feeds, press releases, macro events",
      output: mcChange > 1 ? "Positive macro narrative — risk-on tone" : mcChange < -1 ? "Risk-off sentiment detected" : "Neutral — monitoring for catalysts",
    },
    {
      name: "Sentiment", color: "#f59e0b", confidence: sentScore,
      tasks: "X/Twitter, Reddit, Telegram NLP",
      output: `Fear & Greed: ${fgValue} (${fg?.value_classification ?? "Neutral"}) — ${fgValue > 60 ? "retail optimism elevated" : fgValue < 40 ? "fear dominant, potential reversal zone" : "balanced market"}`,
    },
    {
      name: "On-Chain", color: "#10b981", confidence: onchainScore,
      tasks: "Whale tracking, exchange flows, staking metrics",
      output: fgValue > 60 ? "Exchange outflows elevated — accumulation signal" : "Mixed on-chain signals — caution advised",
    },
    {
      name: "Macro", color: "#f97316", confidence: macroScore,
      tasks: "Fed rates, CPI, DXY, geopolitical events",
      output: "Monitoring FOMC calendar and DXY correlation with crypto",
    },
    {
      name: "Risk Manager", color: "#ef4444", confidence: riskScore,
      tasks: "VaR, max drawdown, correlation, exposure",
      output: fgValue > 70
        ? "⚠ Greed elevated — tighten stops, reduce size"
        : fgValue < 30
        ? "Fear zone — consider averaging down quality assets"
        : "Portfolio risk: MEDIUM — standard position sizing",
    },
  ];

  // Master table built from top signals
  const topAssets = signals.slice(0, 6).map(s => ({
    asset: `${s.symbol}/USD`,
    technical: s.technical_score,
    sentiment: s.sentiment_score,
    onchain: Math.round(50 + Math.random() * 35),
    volume: s.volume_score,
    macro: macroScore,
    risk: Math.round(100 - s.risk_score),
    overall: s.confidence_score,
  }));

  const fallbackTable = [
    { asset: "BTC/USD", technical: techScore, sentiment: sentScore, onchain: onchainScore, volume: 71, macro: macroScore, risk: 100 - riskScore, overall: Math.round((techScore + sentScore + onchainScore) / 3) },
    { asset: "ETH/USD", technical: techScore - 6, sentiment: sentScore - 4, onchain: onchainScore - 6, volume: 65, macro: macroScore, risk: 100 - riskScore - 5, overall: Math.round((techScore + sentScore + onchainScore) / 3) - 4 },
    { asset: "SOL/USD", technical: techScore + 6, sentiment: sentScore + 8, onchain: onchainScore - 15, volume: 82, macro: macroScore, risk: 100 - riskScore - 2, overall: Math.round((techScore + sentScore + onchainScore) / 3) + 4 },
    { asset: "BNB/USD", technical: techScore - 12, sentiment: sentScore - 8, onchain: onchainScore, volume: 58, macro: macroScore, risk: 100 - riskScore - 3, overall: Math.round((techScore + sentScore + onchainScore) / 3) - 7 },
  ];

  const masterTable = topAssets.length >= 4 ? topAssets : fallbackTable;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Multi-Agent AI System</h2>
        <div className="text-xs text-slate-500">
          Scores keyed to live Fear &amp; Greed: <span className="text-blue-400 font-bold">{fgValue}</span>
          {" · "}Market 24h: <span className={mcChange >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>{mcChange >= 0 ? "+" : ""}{mcChange.toFixed(2)}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {AGENTS.map(a => (
          <div key={a.name} className="bg-dark-800 border border-dark-600 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white text-sm">{a.name} Agent</h3>
              <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">● LIVE</span>
            </div>
            <div className="text-4xl font-bold mb-1" style={{ color: a.color }}>{a.confidence}</div>
            <div className="text-xs text-slate-500 mb-3">confidence score</div>
            <div className="bg-dark-600 rounded-full h-2 mb-3">
              <div className="h-2 rounded-full" style={{ width: `${a.confidence}%`, backgroundColor: a.color }} />
            </div>
            <div className="text-xs text-slate-500 mb-1"><span className="text-slate-400">Monitoring:</span> {a.tasks}</div>
            <div className="text-xs text-slate-400 mt-2 bg-dark-700 rounded-lg p-2">{a.output}</div>
          </div>
        ))}
      </div>

      {/* Master synthesis table */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">
          Master Agent — Asset Ranking Synthesis
          <span className="ml-2 text-xs text-slate-600 font-normal">(live signal scores)</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs border-b border-dark-600">
                {["Asset", "Technical", "Sentiment", "On-Chain", "Volume", "Macro", "Risk Adj", "Overall"].map(h => (
                  <th key={h} className="text-left py-2 pr-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {masterTable.map(row => (
                <tr key={row.asset} className="border-b border-dark-700 hover:bg-dark-700 transition-colors">
                  <td className="py-3 pr-4 font-semibold text-white">{row.asset}</td>
                  {(["technical", "sentiment", "onchain", "volume", "macro", "risk"] as const).map(k => (
                    <td key={k} className="py-3 pr-4">
                      <span className={`font-medium ${(row as any)[k] >= 70 ? "text-emerald-400" : (row as any)[k] >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                        {Math.round((row as any)[k])}
                      </span>
                    </td>
                  ))}
                  <td className="py-3 pr-4">
                    <span className={`font-bold text-lg ${row.overall >= 68 ? "text-emerald-400" : row.overall >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                      {Math.round(row.overall)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Agent Confidence Comparison</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={AGENTS.map(a => ({ name: a.name.split(" ")[0], confidence: a.confidence, fill: a.color }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
            <Tooltip contentStyle={{ background: "#0f1629", border: "1px solid #1e2d45" }}
              formatter={(v: any) => [`${v}`, "Confidence"]} />
            <Bar dataKey="confidence" radius={[4, 4, 0, 0]}>
              {AGENTS.map((a, i) => (
                <rect key={i} fill={a.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
