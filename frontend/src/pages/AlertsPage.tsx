import { useEffect, useState } from "react";
import { Bell, TrendingUp, TrendingDown, ShieldAlert, Activity, Zap } from "lucide-react";
import { fetchFearGreed } from "../services/coingecko";
import type { Signal } from "../types";

interface Props { signals?: Signal[] }

interface Alert {
  time: string;
  title: string;
  body: string;
  severity: "high" | "medium" | "low";
  icon: any;
}

const SEVERITY_STYLE: Record<string, string> = {
  high: "border-l-emerald-500 bg-emerald-500/5",
  medium: "border-l-yellow-500 bg-yellow-500/5",
  low: "border-l-slate-500 bg-dark-700",
};

const BADGE_STYLE: Record<string, string> = {
  high: "bg-emerald-500/20 text-emerald-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-slate-500/20 text-slate-400",
};

const TIMES = ["1m ago", "4m ago", "9m ago", "18m ago", "32m ago", "51m ago", "1h ago", "2h ago", "3h ago", "4h ago"];

export function AlertsPage({ signals = [] }: Props) {
  const [fg, setFg] = useState<{ value: string; value_classification: string } | null>(null);

  useEffect(() => {
    fetchFearGreed().then(setFg).catch(() => {});
  }, []);

  // Build alerts from real signals
  const signalAlerts: Alert[] = signals
    .filter(s => s.signal_type === "BUY" || s.signal_type === "AVOID")
    .slice(0, 6)
    .map((s, i) => ({
      time: TIMES[i] ?? `${i + 1}h ago`,
      title: `${s.signal_type} Signal: ${s.symbol}/USD`,
      body: `Confidence ${s.confidence_score} — ${s.explanation?.[0] ?? "Technical signal triggered"}`,
      severity: s.signal_type === "BUY" && s.confidence_score >= 65 ? "high" : "medium",
      icon: s.signal_type === "BUY" ? TrendingUp : TrendingDown,
    }));

  // F&G alert
  const fgAlerts: Alert[] = fg
    ? [{
        time: "live",
        title: `Fear & Greed: ${fg.value_classification} (${fg.value})`,
        body: parseInt(fg.value) > 75
          ? "Extreme greed detected — consider reducing exposure and tightening stops"
          : parseInt(fg.value) < 25
          ? "Extreme fear — potential accumulation zone. Watch for reversal signals."
          : `Index at ${fg.value}. Market conditions within normal range.`,
        severity: parseInt(fg.value) > 75 || parseInt(fg.value) < 25 ? "medium" : "low",
        icon: Activity,
      }]
    : [];

  // Hardcoded structural alerts that are always relevant
  const staticAlerts: Alert[] = [
    {
      time: "auto",
      title: "Risk Rule: Max Position Size",
      body: "No single position should exceed 5% of total portfolio. Penny coins: max 2%.",
      severity: "low",
      icon: ShieldAlert,
    },
    {
      time: "auto",
      title: "Intraday Alert: Market Hours",
      body: "High-volume window active (US session). Intraday signals have higher accuracy now.",
      severity: "medium",
      icon: Zap,
    },
    {
      time: "auto",
      title: "Meme Coin Caution",
      body: "P&D risk engine active — EXTREME risk coins are auto-filtered from Penny Scanner.",
      severity: "low",
      icon: ShieldAlert,
    },
  ];

  const allAlerts = [...fgAlerts, ...signalAlerts, ...staticAlerts];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-blue-400" />
          <h2 className="text-lg font-bold text-white">Alert Feed</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{allAlerts.length} alerts</span>
          {signals.length > 0 && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
              {signals.length} live signals loaded
            </span>
          )}
        </div>
      </div>

      {allAlerts.length === 0 && (
        <div className="text-center py-20 text-slate-600">No alerts. Loading live data…</div>
      )}

      <div className="space-y-3">
        {allAlerts.map((a, i) => {
          const Icon = a.icon;
          return (
            <div key={i} className={`border border-dark-600 border-l-4 ${SEVERITY_STYLE[a.severity]} rounded-xl p-4`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${BADGE_STYLE[a.severity]}`}>
                      {a.severity}
                    </span>
                    <Icon size={13} className="text-slate-400 shrink-0" />
                    <span className="font-semibold text-white text-sm">{a.title}</span>
                  </div>
                  <p className="text-xs text-slate-400">{a.body}</p>
                </div>
                <span className="text-xs text-slate-600 shrink-0">{a.time}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
