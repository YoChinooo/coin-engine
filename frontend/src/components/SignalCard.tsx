import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ScoreBar } from "./ScoreBar";
import type { Signal } from "../types";

function SignalBadge({ type }: { type: Signal["signal_type"] }) {
  const map = {
    BUY: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    WATCH: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    AVOID: "bg-red-500/20 text-red-400 border border-red-500/30",
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded ${map[type]}`}>{type}</span>
  );
}

function ConfidenceRing({ score }: { score: number }) {
  const color = score >= 60 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} fill="none" stroke="#1e2d45" strokeWidth="5" />
      <circle
        cx="28" cy="28" r={r} fill="none"
        stroke={color} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="33" textAnchor="middle" fontSize="12" fontWeight="bold" fill={color}>
        {Math.round(score)}
      </text>
    </svg>
  );
}

export function SignalCard({ signal }: { signal: Signal }) {
  const [expanded, setExpanded] = useState(false);
  const change = signal.price_change_24h ?? 0;

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 hover:border-dark-500 transition-colors">
      <div className="flex items-center gap-3">
        {signal.image && <img src={signal.image} alt={signal.name} className="w-8 h-8 rounded-full" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">{signal.symbol}</span>
            <SignalBadge type={signal.signal_type} />
            <span className="text-xs text-slate-500">#{signal.market_cap_rank}</span>
          </div>
          <p className="text-xs text-slate-400 truncate">{signal.name}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-white">${(signal.current_price ?? 0) >= 1 ? (signal.current_price).toLocaleString() : (signal.current_price ?? 0).toFixed(6)}</p>
          <p className={`text-xs flex items-center justify-end gap-0.5 ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {change.toFixed(2)}%
          </p>
        </div>
        <ConfidenceRing score={signal.confidence_score} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
        <div>Entry: <span className="text-slate-200">${signal.entry_low?.toLocaleString()} – ${signal.entry_high?.toLocaleString()}</span></div>
        <div>Stop: <span className="text-red-400">${signal.stop_loss?.toLocaleString()}</span></div>
        <div>TP1: <span className="text-emerald-400">${signal.take_profit_1?.toLocaleString()}</span></div>
        <div>TP2: <span className="text-emerald-400">${signal.take_profit_2?.toLocaleString()}</span></div>
      </div>

      <div className="mt-3 space-y-1">
        <ScoreBar label="Technical" value={signal.technical_score} max={40} color="bg-blue-500" />
        <ScoreBar label="Sentiment" value={signal.sentiment_score} max={30} color="bg-purple-500" />
        <ScoreBar label="Volume" value={signal.volume_score} max={30} color="bg-yellow-500" />
        <ScoreBar label="ML Score" value={signal.ml_score} color="bg-emerald-500" />
        <ScoreBar label="Risk" value={signal.risk_score} color="bg-red-500" />
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-3 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? "Hide" : "Show"} explanation
      </button>

      {expanded && (
        <ul className="mt-2 space-y-1">
          {signal.explanation.map((reason, i) => (
            <li key={i} className="text-xs text-slate-400 flex gap-2">
              <Minus size={10} className="mt-0.5 shrink-0 text-slate-600" />
              {reason}
            </li>
          ))}
          {signal.indicators.rsi && (
            <li className="text-xs text-slate-500">RSI: {signal.indicators.rsi} | Trend: {signal.indicators.trend}</li>
          )}
        </ul>
      )}
    </div>
  );
}
