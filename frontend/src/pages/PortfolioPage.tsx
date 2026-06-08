/**
 * Paper Trading Journal
 * - Add trades manually (or import from TradingView CSV export)
 * - Live P&L on open positions via Yahoo Finance
 * - Performance stats: win rate, profit factor, avg winner/loser, drawdown
 * - Equity curve chart
 * - Export to CSV
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
  BarChart, Bar, Cell,
} from "recharts";
import {
  Plus, Upload, Download, X, CheckCircle, TrendingUp, TrendingDown,
  Target, Shield, Activity, RefreshCw, AlertTriangle, ChevronDown,
  ChevronUp, Edit3, Trash2, Clock,
} from "lucide-react";
import { fetchQuote } from "../services/marketData";

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetType = "futures" | "stock" | "crypto";
type TradeStatus = "OPEN" | "CLOSED" | "STOPPED" | "TP_HIT";
type TradeDir = "LONG" | "SHORT";

export interface PaperTrade {
  id: string;
  symbol: string;
  assetType: AssetType;
  direction: TradeDir;
  entryDate: string;       // ISO
  entryPrice: number;
  quantity: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  exitDate?: string;
  exitPrice?: number;
  status: TradeStatus;
  realizedPnl?: number;
  realizedPnlPct?: number;
  commission: number;      // total commission (both legs)
  strategy?: string;
  notes?: string;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORE_KEY = "coinEngine_paperTrades_v2";

function loadTrades(): PaperTrade[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
  } catch { return []; }
}

function saveTrades(trades: PaperTrade[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(trades));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function fmtD(n: number, digits = 2) {
  if (!isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(digits);
}

function fmtUSD(n: number) {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const str = abs >= 10000 ? abs.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : abs >= 100 ? abs.toFixed(2)
    : abs.toFixed(4);
  return (n < 0 ? "-$" : "$") + str;
}

function duration(entry: string, exit?: string): string {
  const start = new Date(entry).getTime();
  const end   = exit ? new Date(exit).getTime() : Date.now();
  const ms = end - start;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 48)  return `${Math.floor(h / 24)}d`;
  if (h >= 1)   return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Performance calculator ───────────────────────────────────────────────────

interface PerfStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  totalPnl: number;
  totalPnlPct: number;
  avgWinner: number;
  avgLoser: number;
  profitFactor: number;
  maxDrawdown: number;
  bestTrade: number;
  worstTrade: number;
  avgHoldTime: string;
  currentStreak: number;
  currentStreakType: "W" | "L" | "-";
  equityCurve: { date: string; pnl: number; cumulative: number }[];
}

function calcStats(trades: PaperTrade[]): PerfStats {
  const closed = trades.filter(t => t.status !== "OPEN" && t.realizedPnl !== undefined);
  const open   = trades.filter(t => t.status === "OPEN");

  const wins   = closed.filter(t => (t.realizedPnl ?? 0) > 0);
  const losses = closed.filter(t => (t.realizedPnl ?? 0) <= 0);

  const totalPnl = closed.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const totalEntry = closed.reduce((s, t) => s + t.entryPrice * t.quantity, 0);
  const totalPnlPct = totalEntry > 0 ? (totalPnl / totalEntry) * 100 : 0;

  const avgWinner = wins.length > 0
    ? wins.reduce((s, t) => s + (t.realizedPnl ?? 0), 0) / wins.length : 0;
  const avgLoser = losses.length > 0
    ? losses.reduce((s, t) => s + (t.realizedPnl ?? 0), 0) / losses.length : 0;

  const grossProfit = wins.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const grossLoss   = Math.abs(losses.reduce((s, t) => s + (t.realizedPnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  // Equity curve & drawdown
  const sorted = [...closed].sort((a, b) =>
    new Date(a.exitDate ?? a.entryDate).getTime() - new Date(b.exitDate ?? b.entryDate).getTime()
  );
  let cum = 0, peak = 0, maxDD = 0;
  const equityCurve = sorted.map(t => {
    cum += (t.realizedPnl ?? 0);
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
    return {
      date: new Date(t.exitDate ?? t.entryDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      pnl: parseFloat((t.realizedPnl ?? 0).toFixed(2)),
      cumulative: parseFloat(cum.toFixed(2)),
    };
  });

  // Streak
  let streak = 0;
  let streakType: "W" | "L" | "-" = "-";
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i].realizedPnl ?? 0;
    const isWin = p > 0;
    if (streak === 0) { streakType = isWin ? "W" : "L"; streak = 1; }
    else if ((isWin && streakType === "W") || (!isWin && streakType === "L")) streak++;
    else break;
  }

  const holdMs = closed.filter(t => t.exitDate).map(t =>
    new Date(t.exitDate!).getTime() - new Date(t.entryDate).getTime()
  );
  const avgMs = holdMs.length > 0 ? holdMs.reduce((a, b) => a + b, 0) / holdMs.length : 0;
  const avgH  = Math.floor(avgMs / 3_600_000);
  const avgM  = Math.floor((avgMs % 3_600_000) / 60_000);
  const avgHoldTime = avgH >= 48 ? `${Math.floor(avgH / 24)}d`
    : avgH >= 1 ? `${avgH}h ${avgM}m` : `${avgM}m`;

  return {
    totalTrades: trades.length, openTrades: open.length, closedTrades: closed.length,
    winCount: wins.length, lossCount: losses.length,
    winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
    totalPnl, totalPnlPct, avgWinner, avgLoser, profitFactor,
    maxDrawdown: maxDD,
    bestTrade:  closed.length > 0 ? Math.max(...closed.map(t => t.realizedPnl ?? 0)) : 0,
    worstTrade: closed.length > 0 ? Math.min(...closed.map(t => t.realizedPnl ?? 0)) : 0,
    avgHoldTime, currentStreak: streak, currentStreakType: streakType,
    equityCurve,
  };
}

// ─── TradingView CSV parser ───────────────────────────────────────────────────

function parseTradingViewCSV(text: string): PaperTrade[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  // Find the header row
  const headerIdx = lines.findIndex(l =>
    /date|time|symbol|trade|side|price|qty|quantity/i.test(l)
  );
  if (headerIdx === -1) return [];

  const headers = lines[headerIdx].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  const col = (name: string) => headers.findIndex(h => h.includes(name));

  const idxDate   = col("date") !== -1 ? col("date") : col("time");
  const idxSym    = col("symbol");
  const idxSide   = col("side") !== -1 ? col("side") : col("trade") !== -1 ? col("trade") : col("type");
  const idxPrice  = col("price");
  const idxQty    = col("qty") !== -1 ? col("qty") : col("quantity");
  const idxPnl    = col("pnl") !== -1 ? col("pnl") : col("profit") !== -1 ? col("profit") : col("net");
  const idxFee    = col("fee") !== -1 ? col("fee") : col("commission");

  if (idxSym === -1 || idxPrice === -1) return [];

  const dataLines = lines.slice(headerIdx + 1).filter(l => l.trim() && !l.startsWith("#"));

  // TradingView groups buy+sell pairs into trades
  // We'll group consecutive same-symbol rows into OPEN then CLOSE
  interface RawRow {
    date: string; symbol: string; side: string;
    price: number; qty: number; pnl?: number; fee: number;
  }

  const rows: RawRow[] = dataLines.map(l => {
    const cols = l.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    return {
      date:   cols[idxDate]   ?? new Date().toISOString(),
      symbol: (cols[idxSym]   ?? "").replace(/^[A-Z]+:/, ""),  // strip EXCHANGE: prefix
      side:   (cols[idxSide]  ?? "buy").toLowerCase(),
      price:  parseFloat(cols[idxPrice]  ?? "0") || 0,
      qty:    parseFloat(cols[idxQty]    ?? "0") || 0,
      pnl:    idxPnl !== -1 ? (parseFloat(cols[idxPnl] ?? "") || undefined) : undefined,
      fee:    idxFee !== -1 ? (parseFloat(cols[idxFee] ?? "") || 0) : 0,
    };
  }).filter(r => r.symbol && r.price > 0 && r.qty > 0);

  const trades: PaperTrade[] = [];

  // Match buy → sell (or sell → buy for shorts)
  const pending: Map<string, RawRow[]> = new Map();

  for (const row of rows) {
    const key = row.symbol;
    if (!pending.has(key)) pending.set(key, []);
    const stack = pending.get(key)!;

    const isBuy  = /buy|long/i.test(row.side);
    const isSell = /sell|short/i.test(row.side);

    if (stack.length === 0 || (isBuy && /buy|long/i.test(stack[0].side)) || (isSell && /sell|short/i.test(stack[0].side))) {
      stack.push(row); // opening
    } else {
      // Closing
      const open = stack.shift()!;
      const dir: TradeDir = /buy|long/i.test(open.side) ? "LONG" : "SHORT";
      const pnl = row.pnl ?? (dir === "LONG"
        ? (row.price - open.price) * open.qty - open.fee - row.fee
        : (open.price - row.price) * open.qty - open.fee - row.fee);
      const pnlPct = (pnl / (open.price * open.qty)) * 100;

      // Guess asset type from symbol
      const assetType: AssetType =
        /BTC|ETH|SOL|BNB|XRP|DOGE|ADA|USDT|USDC/i.test(row.symbol) ? "crypto"
        : /ES|NQ|CL|GC|SI|YM|ZB|6E|=F/.test(row.symbol) ? "futures"
        : "stock";

      trades.push({
        id: uid(),
        symbol: row.symbol, assetType, direction: dir,
        entryDate: new Date(open.date).toISOString(),
        entryPrice: open.price, quantity: open.qty,
        exitDate: new Date(row.date).toISOString(),
        exitPrice: row.price, status: pnl >= 0 ? "TP_HIT" : "STOPPED",
        realizedPnl: parseFloat(pnl.toFixed(4)),
        realizedPnlPct: parseFloat(pnlPct.toFixed(2)),
        commission: open.fee + row.fee,
        strategy: "Imported",
      });
    }
  }

  // Any remaining in stack = still open
  for (const [, stack] of pending) {
    for (const open of stack) {
      const dir: TradeDir = /buy|long/i.test(open.side) ? "LONG" : "SHORT";
      const assetType: AssetType =
        /BTC|ETH|SOL|BNB|XRP|DOGE|ADA/i.test(open.symbol) ? "crypto"
        : /ES|NQ|CL|GC|SI|YM|=F/.test(open.symbol) ? "futures" : "stock";
      trades.push({
        id: uid(), symbol: open.symbol, assetType, direction: dir,
        entryDate: new Date(open.date).toISOString(),
        entryPrice: open.price, quantity: open.qty,
        status: "OPEN", commission: open.fee, strategy: "Imported",
      });
    }
  }

  return trades;
}

// ─── Add / Edit trade modal ────────────────────────────────────────────────────

const STRATEGIES = ["Trend Follow", "Breakout", "Mean Reversion", "Scalp", "EMA Cross", "VWAP Bounce", "BB Squeeze", "Divergence", "Other"];

function TradeModal({
  initial, onSave, onClose,
}: {
  initial?: Partial<PaperTrade>;
  onSave: (t: PaperTrade) => void;
  onClose: () => void;
}) {
  const now = new Date().toISOString().slice(0, 16);
  const [symbol,     setSymbol]     = useState(initial?.symbol     ?? "");
  const [assetType,  setAssetType]  = useState<AssetType>(initial?.assetType  ?? "futures");
  const [direction,  setDirection]  = useState<TradeDir>(initial?.direction  ?? "LONG");
  const [entryDate,  setEntryDate]  = useState(initial?.entryDate  ? initial.entryDate.slice(0, 16) : now);
  const [entryPrice, setEntryPrice] = useState(String(initial?.entryPrice ?? ""));
  const [quantity,   setQuantity]   = useState(String(initial?.quantity   ?? ""));
  const [stopLoss,   setStopLoss]   = useState(String(initial?.stopLoss   ?? ""));
  const [tp1,        setTp1]        = useState(String(initial?.takeProfit1 ?? ""));
  const [tp2,        setTp2]        = useState(String(initial?.takeProfit2 ?? ""));
  const [commission, setCommission] = useState(String(initial?.commission ?? "0"));
  const [strategy,   setStrategy]   = useState(initial?.strategy ?? "");
  const [notes,      setNotes]      = useState(initial?.notes ?? "");
  const [exitPrice,  setExitPrice]  = useState(String(initial?.exitPrice  ?? ""));
  const [exitDate,   setExitDate]   = useState(initial?.exitDate ? initial.exitDate.slice(0, 16) : "");
  const [status,     setStatus]     = useState<TradeStatus>(initial?.status ?? "OPEN");

  const isClosed = status !== "OPEN";

  // Auto-calc P&L preview
  const ep  = parseFloat(entryPrice);
  const ex  = parseFloat(exitPrice);
  const qty = parseFloat(quantity);
  const com = parseFloat(commission) || 0;
  let previewPnl: number | null = null;
  let previewPct: number | null = null;
  if (isClosed && isFinite(ep) && isFinite(ex) && isFinite(qty) && qty > 0) {
    previewPnl = ((direction === "LONG" ? ex - ep : ep - ex) * qty) - com;
    previewPct = (previewPnl / (ep * qty)) * 100;
  }

  const handleSave = () => {
    if (!symbol.trim() || !entryPrice || !quantity) return;
    const base: PaperTrade = {
      id: initial?.id ?? uid(),
      symbol: symbol.trim().toUpperCase(),
      assetType, direction,
      entryDate: new Date(entryDate).toISOString(),
      entryPrice: parseFloat(entryPrice),
      quantity:   parseFloat(quantity),
      stopLoss:   stopLoss   ? parseFloat(stopLoss)   : undefined,
      takeProfit1: tp1       ? parseFloat(tp1)         : undefined,
      takeProfit2: tp2       ? parseFloat(tp2)         : undefined,
      commission: com,
      strategy: strategy || undefined,
      notes:    notes    || undefined,
      status,
    };
    if (isClosed && exitPrice && exitDate) {
      base.exitDate  = new Date(exitDate).toISOString();
      base.exitPrice = parseFloat(exitPrice);
      if (previewPnl !== null) {
        base.realizedPnl    = parseFloat(previewPnl.toFixed(4));
        base.realizedPnlPct = parseFloat((previewPct ?? 0).toFixed(2));
      }
    }
    onSave(base);
    onClose();
  };

  const inputCls = "w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500";
  const labelCls = "text-xs text-slate-500 mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-600">
          <h3 className="text-base font-bold text-white">{initial?.id ? "Edit Trade" : "Add Trade"}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Asset type + direction */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>Asset Type</label>
              <div className="flex gap-1">
                {(["futures", "stock", "crypto"] as AssetType[]).map(t => (
                  <button key={t} onClick={() => setAssetType(t)}
                    className={`flex-1 text-xs py-2 rounded-lg capitalize font-medium transition-colors ${assetType === t ? "bg-blue-600 text-white" : "bg-dark-700 text-slate-400 hover:text-white"}`}>
                    {t === "futures" ? "📊 Futures" : t === "stock" ? "📈 Stock" : "🪙 Crypto"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className={labelCls}>Direction</label>
              <div className="flex gap-1">
                <button onClick={() => setDirection("LONG")}
                  className={`flex-1 text-xs py-2 rounded-lg font-bold transition-all ${direction === "LONG" ? "bg-emerald-600 text-white" : "bg-dark-700 text-slate-400 hover:text-emerald-400"}`}>
                  ▲ LONG
                </button>
                <button onClick={() => setDirection("SHORT")}
                  className={`flex-1 text-xs py-2 rounded-lg font-bold transition-all ${direction === "SHORT" ? "bg-red-600 text-white" : "bg-dark-700 text-slate-400 hover:text-red-400"}`}>
                  ▼ SHORT
                </button>
              </div>
            </div>
          </div>

          {/* Symbol + entry */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Symbol *</label>
              <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
                placeholder="BTC / ES / AAPL" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Entry Price *</label>
              <input type="number" value={entryPrice} onChange={e => setEntryPrice(e.target.value)}
                placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Quantity *</label>
              <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)}
                placeholder="1" className={inputCls} />
            </div>
          </div>

          {/* Entry date + stops */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Entry Date/Time *</label>
              <input type="datetime-local" value={entryDate} onChange={e => setEntryDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Stop Loss</label>
              <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)}
                placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Take Profit 1</label>
              <input type="number" value={tp1} onChange={e => setTp1(e.target.value)}
                placeholder="0.00" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Take Profit 2</label>
              <input type="number" value={tp2} onChange={e => setTp2(e.target.value)}
                placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Commission ($)</label>
              <input type="number" value={commission} onChange={e => setCommission(e.target.value)}
                placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Strategy</label>
              <select value={strategy} onChange={e => setStrategy(e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Status</label>
            <div className="flex gap-2">
              {(["OPEN", "CLOSED", "STOPPED", "TP_HIT"] as TradeStatus[]).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${status === s
                    ? s === "OPEN" ? "bg-blue-600 text-white"
                    : s === "CLOSED" || s === "TP_HIT" ? "bg-emerald-600 text-white"
                    : "bg-red-600 text-white"
                    : "bg-dark-700 text-slate-400 hover:text-white"}`}>
                  {s === "TP_HIT" ? "TP Hit" : s}
                </button>
              ))}
            </div>
          </div>

          {/* Exit fields (shown when not open) */}
          {isClosed && (
            <div className="grid grid-cols-2 gap-3 bg-dark-700/50 rounded-xl p-4 border border-dark-500">
              <div>
                <label className={labelCls}>Exit Price</label>
                <input type="number" value={exitPrice} onChange={e => setExitPrice(e.target.value)}
                  placeholder="0.00" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Exit Date/Time</label>
                <input type="datetime-local" value={exitDate} onChange={e => setExitDate(e.target.value)} className={inputCls} />
              </div>
              {previewPnl !== null && (
                <div className="col-span-2 flex items-center gap-4 text-sm">
                  <span className="text-slate-500">Realized P&L:</span>
                  <span className={`font-bold text-lg ${previewPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtUSD(previewPnl)} ({fmtD(previewPct ?? 0)}%)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes / Thesis</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="e.g. EMA cross + VWAP reclaim on 5m, entering at key support"
              className={`${inputCls} resize-none`} />
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 bg-dark-700 text-slate-300 rounded-xl text-sm hover:bg-dark-600 transition-colors">Cancel</button>
          <button onClick={handleSave}
            disabled={!symbol.trim() || !entryPrice || !quantity}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
            {initial?.id ? "Save Changes" : "Add Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Close trade modal (quick exit) ───────────────────────────────────────────

function CloseTradeModal({
  trade, onClose, onSave,
}: {
  trade: PaperTrade;
  onClose: () => void;
  onSave: (t: PaperTrade) => void;
}) {
  const [exitPrice, setExitPrice] = useState("");
  const [exitDate,  setExitDate]  = useState(new Date().toISOString().slice(0, 16));
  const [status,    setStatus]    = useState<TradeStatus>("CLOSED");

  const ep  = trade.entryPrice;
  const ex  = parseFloat(exitPrice);
  const pnl = isFinite(ex) && ex > 0
    ? ((trade.direction === "LONG" ? ex - ep : ep - ex) * trade.quantity) - trade.commission
    : null;
  const pct = pnl !== null ? (pnl / (ep * trade.quantity)) * 100 : null;

  const handleClose = () => {
    if (!exitPrice) return;
    onSave({
      ...trade,
      exitDate:        new Date(exitDate).toISOString(),
      exitPrice:       parseFloat(exitPrice),
      status,
      realizedPnl:     pnl !== null ? parseFloat(pnl.toFixed(4)) : undefined,
      realizedPnlPct:  pct !== null ? parseFloat(pct.toFixed(2)) : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-600">
          <h3 className="text-sm font-bold text-white">Close {trade.symbol} {trade.direction}</h3>
          <button onClick={onClose}><X size={16} className="text-slate-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-dark-700 rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-slate-500">Entry</span><span className="text-white font-mono">${trade.entryPrice}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Qty</span><span className="text-white">{trade.quantity}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Opened</span><span className="text-slate-300">{new Date(trade.entryDate).toLocaleString()}</span></div>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Exit Price *</label>
            <input type="number" value={exitPrice} onChange={e => setExitPrice(e.target.value)}
              autoFocus placeholder="0.00"
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Exit Date/Time</label>
            <input type="datetime-local" value={exitDate} onChange={e => setExitDate(e.target.value)}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>

          <div className="flex gap-2">
            {(["CLOSED", "TP_HIT", "STOPPED"] as TradeStatus[]).map(s => (
              <button key={s} onClick={() => setStatus(s)}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${status === s
                  ? s === "STOPPED" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
                  : "bg-dark-700 text-slate-400"}`}>
                {s === "TP_HIT" ? "TP Hit" : s}
              </button>
            ))}
          </div>

          {pnl !== null && (
            <div className={`text-center py-3 rounded-xl ${pnl >= 0 ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
              <div className={`text-2xl font-bold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtUSD(pnl)}</div>
              <div className={`text-sm ${pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>{fmtD(pct ?? 0)}%</div>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 bg-dark-700 text-slate-300 rounded-xl text-sm hover:bg-dark-600">Cancel</button>
          <button onClick={handleClose} disabled={!exitPrice}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-bold">
            Close Trade
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Live P&L for open positions ───────────────────────────────────────────────

interface LivePrice { price: number; changePct: number; loading: boolean }

function useLivePrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    if (symbols.length === 0) return;
    setRefreshing(true);
    const results: Record<string, LivePrice> = {};
    for (const sym of symbols) {
      try {
        const q = await fetchQuote(sym);
        results[sym] = { price: q.price, changePct: q.changePct, loading: false };
      } catch {
        results[sym] = { price: 0, changePct: 0, loading: false };
      }
    }
    setPrices(results);
    setRefreshing(false);
  }, [symbols.join(",")]); // eslint-disable-line

  useEffect(() => { fetch(); const iv = setInterval(fetch, 30_000); return () => clearInterval(iv); }, [fetch]);
  return { prices, refreshing, refresh: fetch };
}

// ─── Equity curve tooltip ─────────────────────────────────────────────────────

function EquityTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-lg p-3 text-xs shadow-xl">
      <div className="text-slate-400 mb-1">{label}</div>
      <div className={`font-bold text-base ${d.cumulative >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        Cumulative: {fmtUSD(d.cumulative)}
      </div>
      <div className={`text-xs ${d.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        This trade: {fmtUSD(d.pnl)}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "open" | "history" | "performance";

export function PortfolioPage() {
  const [trades,      setTrades]     = useState<PaperTrade[]>(loadTrades);
  const [tab,         setTab]        = useState<Tab>("open");
  const [showAdd,     setShowAdd]    = useState(false);
  const [editTrade,   setEditTrade]  = useState<PaperTrade | null>(null);
  const [closeTrade,  setCloseTrade] = useState<PaperTrade | null>(null);
  const [filterSym,   setFilterSym]  = useState("");
  const [filterDir,   setFilterDir]  = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [sortField,   setSortField]  = useState<"date" | "pnl" | "symbol">("date");
  const [sortAsc,     setSortAsc]    = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Persist on every change
  useEffect(() => saveTrades(trades), [trades]);

  const saveTrade = useCallback((t: PaperTrade) => {
    setTrades(prev => {
      const idx = prev.findIndex(p => p.id === t.id);
      if (idx === -1) return [t, ...prev];
      const next = [...prev];
      next[idx] = t;
      return next;
    });
  }, []);

  const deleteTrade = useCallback((id: string) => {
    if (!confirm("Delete this trade?")) return;
    setTrades(prev => prev.filter(t => t.id !== id));
  }, []);

  // Live prices for all open positions
  const openTrades  = useMemo(() => trades.filter(t => t.status === "OPEN"), [trades]);
  const openSymbols = useMemo(() => [...new Set(openTrades.map(t => t.symbol))], [openTrades]);
  const { prices, refreshing, refresh } = useLivePrices(openSymbols);

  const stats = useMemo(() => calcStats(trades), [trades]);

  // Closed trade filters + sort
  const closedTrades = useMemo(() => {
    let ct = trades.filter(t => t.status !== "OPEN");
    if (filterSym) ct = ct.filter(t => t.symbol.includes(filterSym.toUpperCase()));
    if (filterDir !== "ALL") ct = ct.filter(t => t.direction === filterDir);
    ct = ct.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (sortField === "date") { va = a.exitDate ?? a.entryDate; vb = b.exitDate ?? b.entryDate; }
      else if (sortField === "pnl") { va = a.realizedPnl ?? 0; vb = b.realizedPnl ?? 0; }
      else { va = a.symbol; vb = b.symbol; }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return ct;
  }, [trades, filterSym, filterDir, sortField, sortAsc]);

  // CSV import
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const imported = parseTradingViewCSV(text);
      if (imported.length === 0) {
        setImportError("Could not parse CSV. Make sure it's a TradingView trade history export.");
        return;
      }
      setTrades(prev => {
        // Avoid duplicates by checking entryDate+symbol+price
        const existing = new Set(prev.map(t => `${t.symbol}_${t.entryDate}_${t.entryPrice}`));
        const fresh = imported.filter(t => !existing.has(`${t.symbol}_${t.entryDate}_${t.entryPrice}`));
        return [...prev, ...fresh];
      });
      setImportError(null);
      alert(`✅ Imported ${imported.length} trade(s) from TradingView CSV`);
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  // CSV export
  const handleExport = useCallback(() => {
    const headers = ["Date","Symbol","AssetType","Direction","EntryPrice","Qty","ExitDate","ExitPrice","Status","PnL$","PnL%","Commission","Strategy","Notes"];
    const rows = trades.map(t => [
      new Date(t.entryDate).toLocaleString(),
      t.symbol, t.assetType, t.direction,
      t.entryPrice, t.quantity,
      t.exitDate ? new Date(t.exitDate).toLocaleString() : "",
      t.exitPrice ?? "",
      t.status,
      t.realizedPnl ?? "",
      t.realizedPnlPct ?? "",
      t.commission,
      t.strategy ?? "",
      (t.notes ?? "").replace(/,/g, ";"),
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [trades]);

  const sortBtn = (field: typeof sortField, label: string) => (
    <button onClick={() => { if (sortField === field) setSortAsc(a => !a); else { setSortField(field); setSortAsc(false); } }}
      className="flex items-center gap-1 hover:text-white transition-colors">
      {label}
      {sortField === field ? (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : null}
    </button>
  );

  const statusBadge = (s: TradeStatus) => {
    const map: Record<TradeStatus, string> = {
      OPEN:    "bg-blue-500/20 text-blue-400",
      CLOSED:  "bg-slate-500/20 text-slate-400",
      TP_HIT:  "bg-emerald-500/20 text-emerald-400",
      STOPPED: "bg-red-500/20 text-red-400",
    };
    const labels: Record<TradeStatus, string> = { OPEN: "OPEN", CLOSED: "Closed", TP_HIT: "TP Hit", STOPPED: "Stopped" };
    return <span className={`text-xs px-2 py-0.5 rounded font-medium ${map[s]}`}>{labels[s]}</span>;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Modals */}
      {showAdd && (
        <TradeModal onSave={saveTrade} onClose={() => setShowAdd(false)} />
      )}
      {editTrade && (
        <TradeModal initial={editTrade} onSave={saveTrade} onClose={() => setEditTrade(null)} />
      )}
      {closeTrade && (
        <CloseTradeModal trade={closeTrade} onSave={saveTrade} onClose={() => setCloseTrade(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">📋 Paper Trading Journal</h2>
          <p className="text-xs text-slate-500 mt-0.5">Track trades, import from TradingView, live P&L on open positions</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-xs text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Refresh P&L
          </button>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-xs text-slate-400 hover:text-white transition-colors">
            <Upload size={12} /> Import CSV
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-xs text-slate-400 hover:text-white transition-colors">
            <Download size={12} /> Export CSV
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs text-white font-semibold transition-colors">
            <Plus size={12} /> Add Trade
          </button>
        </div>
      </div>

      {importError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2 rounded-lg flex items-center gap-2">
          <AlertTriangle size={14} />{importError}
          <button onClick={() => setImportError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* How to import banner */}
      {trades.length === 0 && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5 text-center">
          <div className="text-2xl mb-2">📥</div>
          <div className="text-sm font-semibold text-blue-300 mb-1">Import from TradingView</div>
          <div className="text-xs text-slate-400 max-w-md mx-auto">
            In TradingView Paper Trading: open the <strong>Trade History</strong> tab →
            click the <strong>download icon</strong> → save as CSV → click <strong>Import CSV</strong> above.
            Or add trades manually with the <strong>Add Trade</strong> button.
          </div>
        </div>
      )}

      {/* Stats banner */}
      {trades.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Total P&L",     val: fmtUSD(stats.totalPnl), color: stats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "Win Rate",      val: `${stats.winRate.toFixed(0)}%`, color: stats.winRate >= 55 ? "text-emerald-400" : stats.winRate >= 45 ? "text-yellow-400" : "text-red-400" },
            { label: "Profit Factor", val: stats.profitFactor >= 999 ? "∞" : stats.profitFactor.toFixed(2), color: stats.profitFactor >= 2 ? "text-emerald-400" : stats.profitFactor >= 1 ? "text-yellow-400" : "text-red-400" },
            { label: "Avg Winner",    val: fmtUSD(stats.avgWinner), color: "text-emerald-400" },
            { label: "Avg Loser",     val: fmtUSD(stats.avgLoser),  color: "text-red-400" },
            { label: "Max Drawdown",  val: fmtUSD(-stats.maxDrawdown), color: stats.maxDrawdown > 0 ? "text-red-400" : "text-slate-400" },
            { label: "Streak",        val: stats.currentStreak > 0 ? `${stats.currentStreak}${stats.currentStreakType}` : "—", color: stats.currentStreakType === "W" ? "text-emerald-400" : stats.currentStreakType === "L" ? "text-red-400" : "text-slate-400" },
          ].map(s => (
            <div key={s.label} className="bg-dark-800 border border-dark-600 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">{s.label}</div>
              <div className={`text-lg font-bold ${s.color}`}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {trades.length > 0 && (
        <>
          <div className="flex gap-1 border-b border-dark-600">
            {([
              { key: "open",        label: `Open (${stats.openTrades})` },
              { key: "history",     label: `History (${stats.closedTrades})` },
              { key: "performance", label: "Performance" },
            ] as { key: Tab; label: string }[]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.key
                  ? "border-blue-500 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-200"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── OPEN POSITIONS ────────────────────────────────────────────── */}
          {tab === "open" && (
            <div className="space-y-3">
              {openTrades.length === 0 ? (
                <div className="bg-dark-800 border border-dark-600 rounded-xl p-8 text-center text-slate-500 text-sm">
                  No open positions — add a trade or import from TradingView
                </div>
              ) : (
                <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{openTrades.length} Open Position{openTrades.length !== 1 ? "s" : ""}</span>
                    <span className="text-xs text-slate-600 flex items-center gap-1"><RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />Live prices refresh every 30s</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-dark-600">
                          {["Symbol","Dir","Entry Price","Qty","Live Price","Unreal. P&L","P&L %","Stop","TP1","Opened","Duration","Strategy",""].map(h => (
                            <th key={h} className="text-left py-2.5 px-3 font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-700">
                        {openTrades.map(t => {
                          const lp  = prices[t.symbol];
                          const cur = lp?.price ?? 0;
                          const unreal = cur > 0
                            ? ((t.direction === "LONG" ? cur - t.entryPrice : t.entryPrice - cur) * t.quantity) - t.commission
                            : null;
                          const unrealPct = unreal !== null && t.entryPrice > 0
                            ? (unreal / (t.entryPrice * t.quantity)) * 100 : null;
                          return (
                            <tr key={t.id} className="hover:bg-dark-700/50 transition-colors">
                              <td className="py-3 px-3">
                                <div className="font-bold text-white">{t.symbol}</div>
                                <div className="text-xs text-slate-500">{t.assetType}</div>
                              </td>
                              <td className="py-3 px-3">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${t.direction === "LONG" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                                  {t.direction}
                                </span>
                              </td>
                              <td className="py-3 px-3 font-mono text-slate-200">${t.entryPrice}</td>
                              <td className="py-3 px-3 text-slate-300">{t.quantity}</td>
                              <td className="py-3 px-3">
                                {lp && cur > 0
                                  ? <span className="font-mono text-white">${cur.toLocaleString()}</span>
                                  : <span className="text-slate-600 text-xs">loading…</span>}
                              </td>
                              <td className="py-3 px-3">
                                {unreal !== null
                                  ? <span className={`font-bold ${unreal >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtUSD(unreal)}</span>
                                  : <span className="text-slate-600 text-xs">—</span>}
                              </td>
                              <td className="py-3 px-3">
                                {unrealPct !== null
                                  ? <span className={`text-sm font-semibold ${unrealPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtD(unrealPct)}%</span>
                                  : "—"}
                              </td>
                              <td className="py-3 px-3 font-mono text-red-400 text-xs">{t.stopLoss ? `$${t.stopLoss}` : "—"}</td>
                              <td className="py-3 px-3 font-mono text-emerald-400 text-xs">{t.takeProfit1 ? `$${t.takeProfit1}` : "—"}</td>
                              <td className="py-3 px-3 text-slate-400 text-xs whitespace-nowrap">{new Date(t.entryDate).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                              <td className="py-3 px-3 text-slate-400 text-xs">
                                <div className="flex items-center gap-1"><Clock size={10} />{duration(t.entryDate)}</div>
                              </td>
                              <td className="py-3 px-3 text-slate-500 text-xs">{t.strategy ?? "—"}</td>
                              <td className="py-3 px-3">
                                <div className="flex gap-1">
                                  <button onClick={() => setCloseTrade(t)} title="Close trade"
                                    className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors">
                                    <CheckCircle size={14} />
                                  </button>
                                  <button onClick={() => setEditTrade(t)} title="Edit"
                                    className="p-1.5 text-slate-500 hover:text-white hover:bg-dark-600 rounded transition-colors">
                                    <Edit3 size={13} />
                                  </button>
                                  <button onClick={() => deleteTrade(t.id)} title="Delete"
                                    className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TRADE HISTORY ─────────────────────────────────────────────── */}
          {tab === "history" && (
            <div className="space-y-3">
              {/* Filters */}
              <div className="flex gap-3 flex-wrap items-center">
                <input value={filterSym} onChange={e => setFilterSym(e.target.value.toUpperCase())}
                  placeholder="Filter by symbol…"
                  className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 w-44" />
                <div className="flex gap-1">
                  {(["ALL", "LONG", "SHORT"] as const).map(d => (
                    <button key={d} onClick={() => setFilterDir(d)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${filterDir === d
                        ? d === "LONG" ? "bg-emerald-600 text-white" : d === "SHORT" ? "bg-red-600 text-white" : "bg-blue-600 text-white"
                        : "bg-dark-700 text-slate-400 hover:text-white"}`}>{d}</button>
                  ))}
                </div>
                <span className="text-xs text-slate-600 ml-auto">{closedTrades.length} trade{closedTrades.length !== 1 ? "s" : ""}</span>
              </div>

              {closedTrades.length === 0 ? (
                <div className="bg-dark-800 border border-dark-600 rounded-xl p-8 text-center text-slate-500 text-sm">
                  No closed trades yet
                </div>
              ) : (
                <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-dark-600">
                          <th className="text-left py-2.5 px-3">{sortBtn("date", "Date")}</th>
                          <th className="text-left py-2.5 px-3">{sortBtn("symbol", "Symbol")}</th>
                          <th className="text-left py-2.5 px-3">Dir</th>
                          <th className="text-left py-2.5 px-3">Entry</th>
                          <th className="text-left py-2.5 px-3">Exit</th>
                          <th className="text-left py-2.5 px-3">Qty</th>
                          <th className="text-left py-2.5 px-3">{sortBtn("pnl", "P&L $")}</th>
                          <th className="text-left py-2.5 px-3">P&L %</th>
                          <th className="text-left py-2.5 px-3">Status</th>
                          <th className="text-left py-2.5 px-3">Duration</th>
                          <th className="text-left py-2.5 px-3">Strategy</th>
                          <th className="text-left py-2.5 px-3">Notes</th>
                          <th className="py-2.5 px-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-700">
                        {closedTrades.map(t => (
                          <tr key={t.id} className="hover:bg-dark-700/50 transition-colors">
                            <td className="py-2.5 px-3 text-slate-400 text-xs whitespace-nowrap">
                              {new Date(t.exitDate ?? t.entryDate).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-white">{t.symbol}</td>
                            <td className="py-2.5 px-3">
                              <span className={`text-xs font-bold ${t.direction === "LONG" ? "text-emerald-400" : "text-red-400"}`}>
                                {t.direction === "LONG" ? "▲" : "▼"} {t.direction}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-300 text-xs">${t.entryPrice}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-300 text-xs">{t.exitPrice ? `$${t.exitPrice}` : "—"}</td>
                            <td className="py-2.5 px-3 text-slate-400">{t.quantity}</td>
                            <td className="py-2.5 px-3">
                              {t.realizedPnl !== undefined
                                ? <span className={`font-bold ${t.realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtUSD(t.realizedPnl)}</span>
                                : "—"}
                            </td>
                            <td className="py-2.5 px-3">
                              {t.realizedPnlPct !== undefined
                                ? <span className={`text-xs font-semibold ${t.realizedPnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtD(t.realizedPnlPct)}%</span>
                                : "—"}
                            </td>
                            <td className="py-2.5 px-3">{statusBadge(t.status)}</td>
                            <td className="py-2.5 px-3 text-slate-500 text-xs">
                              <div className="flex items-center gap-1"><Clock size={9} />{duration(t.entryDate, t.exitDate)}</div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-xs">{t.strategy ?? "—"}</td>
                            <td className="py-2.5 px-3 text-slate-600 text-xs max-w-[140px] truncate" title={t.notes}>{t.notes ?? "—"}</td>
                            <td className="py-2.5 px-3">
                              <div className="flex gap-1">
                                <button onClick={() => setEditTrade(t)}
                                  className="p-1 text-slate-600 hover:text-white hover:bg-dark-600 rounded transition-colors"><Edit3 size={12} /></button>
                                <button onClick={() => deleteTrade(t.id)}
                                  className="p-1 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"><Trash2 size={12} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PERFORMANCE ────────────────────────────────────────────────── */}
          {tab === "performance" && (
            <div className="space-y-6">
              {stats.closedTrades === 0 ? (
                <div className="bg-dark-800 border border-dark-600 rounded-xl p-8 text-center text-slate-500 text-sm">
                  Close some trades to see performance metrics
                </div>
              ) : (
                <>
                  {/* Equity curve */}
                  <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                      <TrendingUp size={15} className="text-blue-400" />Equity Curve (Cumulative P&L)
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={stats.equityCurve} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false}
                          tickFormatter={v => `$${v >= 0 ? "" : "-"}${Math.abs(v) >= 1000 ? (Math.abs(v)/1000).toFixed(1)+"k" : Math.abs(v).toFixed(0)}`} width={55} />
                        <Tooltip content={<EquityTooltip />} />
                        <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="cumulative"
                          stroke={stats.totalPnl >= 0 ? "#10b981" : "#ef4444"}
                          strokeWidth={2} dot={{ r: 3, fill: stats.totalPnl >= 0 ? "#10b981" : "#ef4444" }}
                          activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Detailed stats grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Win/Loss */}
                    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Target size={14} className="text-emerald-400" />Trade Breakdown</h3>
                      <div className="space-y-3">
                        {[
                          { label: "Total Closed Trades", val: stats.closedTrades, color: "text-white" },
                          { label: "Winning Trades",  val: `${stats.winCount} (${stats.winRate.toFixed(0)}%)`, color: "text-emerald-400" },
                          { label: "Losing Trades",   val: `${stats.lossCount} (${(100 - stats.winRate).toFixed(0)}%)`, color: "text-red-400" },
                          { label: "Best Trade",  val: fmtUSD(stats.bestTrade),  color: "text-emerald-400" },
                          { label: "Worst Trade", val: fmtUSD(stats.worstTrade), color: "text-red-400" },
                          { label: "Avg Hold Time", val: stats.avgHoldTime, color: "text-slate-300" },
                          { label: "Current Streak", val: stats.currentStreak > 0 ? `${stats.currentStreak} ${stats.currentStreakType}` : "—",
                            color: stats.currentStreakType === "W" ? "text-emerald-400" : stats.currentStreakType === "L" ? "text-red-400" : "text-slate-400" },
                        ].map(row => (
                          <div key={row.label} className="flex justify-between items-center py-1 border-b border-dark-700 last:border-0">
                            <span className="text-xs text-slate-500">{row.label}</span>
                            <span className={`text-sm font-semibold ${row.color}`}>{row.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Risk metrics */}
                    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Shield size={14} className="text-blue-400" />Risk Metrics</h3>
                      <div className="space-y-3">
                        {[
                          { label: "Total Realized P&L", val: fmtUSD(stats.totalPnl), color: stats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400" },
                          { label: "Profit Factor", val: stats.profitFactor >= 999 ? "∞" : stats.profitFactor.toFixed(2),
                            color: stats.profitFactor >= 2 ? "text-emerald-400" : stats.profitFactor >= 1.5 ? "text-yellow-400" : stats.profitFactor >= 1 ? "text-orange-400" : "text-red-400" },
                          { label: "Avg Winner", val: fmtUSD(stats.avgWinner), color: "text-emerald-400" },
                          { label: "Avg Loser",  val: fmtUSD(stats.avgLoser),  color: "text-red-400" },
                          { label: "Win/Loss Ratio", val: stats.avgLoser !== 0 ? Math.abs(stats.avgWinner / stats.avgLoser).toFixed(2) + ":1" : "—",
                            color: Math.abs(stats.avgWinner) > Math.abs(stats.avgLoser) ? "text-emerald-400" : "text-red-400" },
                          { label: "Max Drawdown", val: fmtUSD(-stats.maxDrawdown), color: stats.maxDrawdown > 0 ? "text-red-400" : "text-slate-400" },
                          { label: "Expectancy / trade", val: stats.closedTrades > 0 ? fmtUSD(stats.totalPnl / stats.closedTrades) : "—",
                            color: stats.totalPnl / Math.max(1, stats.closedTrades) >= 0 ? "text-emerald-400" : "text-red-400" },
                        ].map(row => (
                          <div key={row.label} className="flex justify-between items-center py-1 border-b border-dark-700 last:border-0">
                            <span className="text-xs text-slate-500">{row.label}</span>
                            <span className={`text-sm font-semibold ${row.color}`}>{row.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* P&L by symbol */}
                  {(() => {
                    const bySymbol = trades
                      .filter(t => t.realizedPnl !== undefined)
                      .reduce((acc, t) => {
                        acc[t.symbol] = (acc[t.symbol] ?? 0) + (t.realizedPnl ?? 0);
                        return acc;
                      }, {} as Record<string, number>);
                    const barData = Object.entries(bySymbol)
                      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                      .slice(0, 12)
                      .map(([sym, pnl]) => ({ sym, pnl: parseFloat(pnl.toFixed(2)) }));
                    if (barData.length < 2) return null;
                    return (
                      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Activity size={14} className="text-purple-400" />P&L by Symbol</h3>
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={barData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" vertical={false} />
                            <XAxis dataKey="sym" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false}
                              tickFormatter={v => `$${v}`} width={50} />
                            <Tooltip formatter={(v: number) => [fmtUSD(v), "P&L"]} contentStyle={{ background: "#1e2d45", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
                            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                              {barData.map((entry, i) => (
                                <Cell key={i} fill={entry.pnl >= 0 ? "#10b981" : "#ef4444"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}

                  {/* P&L by strategy */}
                  {(() => {
                    const strats = trades.filter(t => t.realizedPnl !== undefined && t.strategy);
                    if (strats.length < 2) return null;
                    const byStrat = strats.reduce((acc, t) => {
                      const s = t.strategy!;
                      if (!acc[s]) acc[s] = { pnl: 0, wins: 0, total: 0 };
                      acc[s].pnl   += t.realizedPnl ?? 0;
                      acc[s].total += 1;
                      if ((t.realizedPnl ?? 0) > 0) acc[s].wins += 1;
                      return acc;
                    }, {} as Record<string, { pnl: number; wins: number; total: number }>);
                    return (
                      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Target size={14} className="text-yellow-400" />Performance by Strategy</h3>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-slate-500 border-b border-dark-600">
                              {["Strategy","Trades","Win Rate","Total P&L"].map(h => <th key={h} className="text-left py-2 pr-4">{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(byStrat).sort((a, b) => b[1].pnl - a[1].pnl).map(([strat, d]) => (
                              <tr key={strat} className="border-b border-dark-700 hover:bg-dark-700 transition-colors">
                                <td className="py-2.5 pr-4 text-white font-medium">{strat}</td>
                                <td className="py-2.5 pr-4 text-slate-400">{d.total}</td>
                                <td className="py-2.5 pr-4">
                                  <span className={d.wins / d.total >= 0.5 ? "text-emerald-400" : "text-red-400"}>
                                    {((d.wins / d.total) * 100).toFixed(0)}%
                                  </span>
                                </td>
                                <td className="py-2.5 pr-4">
                                  <span className={d.pnl >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                    {fmtUSD(d.pnl)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
