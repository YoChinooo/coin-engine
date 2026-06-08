import { Activity, RefreshCw } from "lucide-react";
import { FearGreedGauge } from "./FearGreedGauge";
import type { MarketOverview } from "../types";

interface Props {
  overview: MarketOverview | null;
  loading: boolean;
  onRefresh: () => void;
  lastUpdated: Date | null;
}

export function MarketHeader({ overview, loading, onRefresh, lastUpdated }: Props) {
  const fg = overview?.fear_greed;
  const fgValue = fg ? parseInt(fg.value ?? "50") : 50;
  const fgLabel = fg?.value_classification ?? "Neutral";
  const mcChange = overview?.global?.market_cap_change_percentage_24h_usd ?? 0;

  return (
    <div className="bg-dark-800 border-b border-dark-600 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Activity className="text-blue-500" size={28} />
          <div>
            <h1 className="text-xl font-bold text-white">Coin Engine</h1>
            <p className="text-xs text-slate-500">Market Intelligence & Signal Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          {overview && (
            <div className="text-sm">
              <p className="text-slate-500">24h Market Cap</p>
              <p className={`font-semibold ${mcChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {mcChange >= 0 ? "+" : ""}{mcChange.toFixed(2)}%
              </p>
            </div>
          )}

          <FearGreedGauge value={fgValue} label={fgLabel} />

          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {lastUpdated && (
        <p className="text-xs text-slate-600 max-w-7xl mx-auto mt-2">
          Last updated: {lastUpdated.toLocaleTimeString()} · All signals are probabilistic estimates, not financial advice.
        </p>
      )}
    </div>
  );
}
