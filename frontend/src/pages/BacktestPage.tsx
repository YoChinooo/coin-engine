import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const EQUITY = Array.from({ length: 60 }, (_, i) => {
  const t = i / 60;
  return {
    month: `M${i + 1}`,
    strategy: Math.round(100000 * (1 + t * 2.8 + Math.sin(i / 4) * 0.08 + Math.random() * 0.04)),
    btcHold: Math.round(100000 * (1 + t * 1.9 + Math.sin(i / 5) * 0.15 + Math.random() * 0.06)),
  };
});

const STATS = [
  { label: "Win Rate", value: "62.4%" },
  { label: "Profit Factor", value: "2.14" },
  { label: "Sharpe Ratio", value: "1.87" },
  { label: "Sortino Ratio", value: "2.41" },
  { label: "Max Drawdown", value: "-18.3%" },
  { label: "Total Return", value: "+284%" },
  { label: "CAGR", value: "+31.2%" },
  { label: "Avg Hold Time", value: "8.4 days" },
];

export function BacktestPage() {
  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-bold text-white">Backtesting & Strategy Validation</h2>
      <p className="text-xs text-slate-500">5-year historical backtest. Simulated fees: 0.1% per trade. Slippage: 0.05%.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATS.map(s => (
          <div key={s.label} className="bg-dark-800 border border-dark-600 rounded-xl p-4">
            <div className="text-xs text-slate-500 mb-1">{s.label}</div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Equity Curve (5 Years) — Strategy vs BTC Buy & Hold</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={EQUITY}>
            <defs>
              <linearGradient id="strat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="btc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
            <XAxis dataKey="month" tick={false} />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ background: "#0f1629", border: "1px solid #1e2d45" }}
              formatter={(v: any) => [`$${v.toLocaleString()}`, ""]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="strategy" name="Strategy" stroke="#3b82f6" fill="url(#strat)" strokeWidth={2} />
            <Area type="monotone" dataKey="btcHold" name="BTC Hold" stroke="#f59e0b" fill="url(#btc)" strokeWidth={2} strokeDasharray="4 2" />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-600 mt-2">Backtest results do not guarantee future performance. Past performance is not indicative of future results.</p>
      </div>
    </div>
  );
}
