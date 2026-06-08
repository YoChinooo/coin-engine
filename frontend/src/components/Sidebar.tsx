import { Activity, BarChart2, Brain, Link, MessageSquare, Shield, FlaskConical, Briefcase, Bell, Coins, TrendingUp } from "lucide-react";

export type Page =
  | "dashboard" | "signals" | "agents" | "onchain"
  | "sentiment" | "risk" | "backtest" | "portfolio" | "alerts" | "penny" | "futures";

interface Props {
  current: Page;
  onChange: (p: Page) => void;
}

const nav: { id: Page; label: string; icon: any; badge?: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "signals", label: "Signals", icon: BarChart2 },
  { id: "penny", label: "Penny Scanner", icon: Coins },
  { id: "futures", label: "Futures & Stocks", icon: TrendingUp, badge: "NEW" },
  { id: "agents", label: "AI Agents", icon: Brain },
  { id: "onchain", label: "On-Chain", icon: Link },
  { id: "sentiment", label: "Sentiment", icon: MessageSquare },
  { id: "risk", label: "Risk Manager", icon: Shield },
  { id: "backtest", label: "Backtest", icon: FlaskConical },
  { id: "portfolio", label: "Portfolio", icon: Briefcase },
  { id: "alerts", label: "Alerts", icon: Bell },
];

export function Sidebar({ current, onChange }: Props) {
  return (
    <aside className="w-56 shrink-0 bg-dark-800 border-r border-dark-600 flex flex-col py-4 min-h-screen">
      <div className="px-4 mb-6 flex items-center gap-2">
        <Activity className="text-blue-500" size={22} />
        <span className="font-bold text-white text-sm">Coin Engine</span>
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {nav.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
              current === id
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-dark-700"
            }`}
          >
            <Icon size={16} />
            <span className="flex-1">{label}</span>
            {badge && (
              <span className="text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded font-bold leading-none">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="mt-auto px-4 py-3">
        <p className="text-xs text-slate-600">Not financial advice.</p>
        <p className="text-xs text-slate-600">All signals are probabilistic.</p>
      </div>
    </aside>
  );
}
