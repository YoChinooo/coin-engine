interface Props {
  value: number;
  label: string;
}

export function FearGreedGauge({ value, label }: Props) {
  const color =
    value < 25 ? "#ef4444" :
    value < 45 ? "#f97316" :
    value < 55 ? "#f59e0b" :
    value < 75 ? "#84cc16" : "#10b981";

  const angle = -90 + (value / 100) * 180;

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="80" viewBox="0 0 140 80">
        {/* Background arc */}
        <path d="M 10 75 A 60 60 0 0 1 130 75" fill="none" stroke="#1e2d45" strokeWidth="12" strokeLinecap="round" />
        {/* Colored arc */}
        <path d="M 10 75 A 60 60 0 0 1 130 75" fill="none" stroke={color} strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * 188} 188`}
        />
        {/* Needle */}
        <line
          x1="70" y1="75"
          x2={70 + 50 * Math.cos((angle * Math.PI) / 180)}
          y2={75 + 50 * Math.sin((angle * Math.PI) / 180)}
          stroke="white" strokeWidth="2" strokeLinecap="round"
        />
        <circle cx="70" cy="75" r="4" fill="white" />
        {/* Value */}
        <text x="70" y="60" textAnchor="middle" fontSize="20" fontWeight="bold" fill={color}>{value}</text>
      </svg>
      <p className="text-sm font-semibold mt-1" style={{ color }}>{label}</p>
      <p className="text-xs text-slate-500">Fear & Greed Index</p>
    </div>
  );
}
