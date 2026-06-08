interface Props {
  label: string;
  value: number;
  max?: number;
  color?: string;
}

export function ScoreBar({ label, value, max = 100, color = "bg-blue-500" }: Props) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 text-slate-400 shrink-0">{label}</span>
      <div className="flex-1 bg-dark-600 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-slate-300">{Math.round(value)}</span>
    </div>
  );
}
