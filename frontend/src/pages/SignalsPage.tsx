import { useState } from "react";
import { SignalCard } from "../components/SignalCard";
import type { Signal } from "../types";

interface Props { signals: Signal[]; loading: boolean }

type Tab = "all" | "buy" | "watch" | "avoid";

export function SignalsPage({ signals, loading }: Props) {
  const [tab, setTab] = useState<Tab>("all");

  const filtered = signals.filter(s => {
    if (tab === "buy") return s.signal_type === "BUY";
    if (tab === "watch") return s.signal_type === "WATCH";
    if (tab === "avoid") return s.signal_type === "AVOID";
    return true;
  });

  const tabs: { id: Tab; label: string; color: string }[] = [
    { id: "all", label: `All (${signals.length})`, color: "bg-blue-600" },
    { id: "buy", label: `Buy (${signals.filter(s => s.signal_type === "BUY").length})`, color: "bg-emerald-600" },
    { id: "watch", label: `Watch (${signals.filter(s => s.signal_type === "WATCH").length})`, color: "bg-yellow-600" },
    { id: "avoid", label: `Avoid (${signals.filter(s => s.signal_type === "AVOID").length})`, color: "bg-red-600" },
  ];

  return (
    <div className="p-6">
      <h2 className="text-lg font-bold text-white mb-4">Signal Feed</h2>
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? t.color + " text-white" : "bg-dark-800 text-slate-400 hover:text-slate-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && signals.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-dark-800 border border-dark-600 rounded-xl p-4 animate-pulse h-56" />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => <SignalCard key={s.symbol} signal={s} />)}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-20 text-slate-600">
          No signals. Start the backend server to load live data.
        </div>
      )}
    </div>
  );
}
