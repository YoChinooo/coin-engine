import { useState, useEffect } from "react";
import {
  Smartphone, Bell, BellOff, X, CheckCircle, AlertTriangle,
  ExternalLink, Copy, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  loadNotifyConfig, saveNotifyConfig, sendTestNotification,
  loadAlertsEnabled, saveAlertsEnabled,
} from "../services/phoneNotify";
import type { NotifyConfig, NotifyProvider } from "../services/phoneNotify";

interface Props {
  onClose: () => void;
  alertsEnabled: boolean;
  onAlertsEnabledChange: (v: boolean) => void;
}

export function PhoneNotifySettings({ onClose, alertsEnabled, onAlertsEnabledChange }: Props) {
  const [cfg, setCfg] = useState<NotifyConfig>(loadNotifyConfig);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "fail" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [showNtfyGuide, setShowNtfyGuide] = useState(false);
  const [showTgGuide, setShowTgGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notifPerm, setNotifPerm] = useState(Notification.permission);

  // Sync alertsEnabled into config
  useEffect(() => {
    setCfg(c => ({ ...c, enabled: alertsEnabled }));
  }, [alertsEnabled]);

  const save = (patch: Partial<NotifyConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveNotifyConfig(next);
  };

  const toggleAlerts = (v: boolean) => {
    onAlertsEnabledChange(v);
    save({ enabled: v });
    saveAlertsEnabled(v);
    if (v && Notification.permission === "default") {
      Notification.requestPermission().then(p => setNotifPerm(p));
    }
  };

  const requestDesktopPerm = async () => {
    const result = await Notification.requestPermission();
    setNotifPerm(result);
  };

  const handleTest = async () => {
    if (!cfg.provider || cfg.provider === "none") return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    const result = await sendTestNotification(cfg);
    setTestResult(result.ok ? "success" : "fail");
    if (!result.ok && result.error) setTestError(result.error);
    setTesting(false);
  };

  const copyTopic = () => {
    navigator.clipboard.writeText(cfg.ntfyTopic).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const suggestedTopic = `coinengine-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-600 bg-dark-900/40">
          <div className="flex items-center gap-2">
            <Smartphone size={16} className="text-blue-400" />
            <span className="text-sm font-bold text-white">Phone Notifications</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Master toggle */}
          <div className={`flex items-center justify-between p-4 rounded-xl border ${alertsEnabled ? "bg-blue-500/10 border-blue-500/30" : "bg-dark-700 border-dark-600"}`}>
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                {alertsEnabled ? <Bell size={14} className="text-blue-400" /> : <BellOff size={14} className="text-slate-500" />}
                Signal Alerts
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {alertsEnabled ? "Monitoring favorited symbols — runs on all pages" : "Turn on to monitor favorited symbols"}
              </div>
            </div>
            <button onClick={() => toggleAlerts(!alertsEnabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${alertsEnabled ? "bg-blue-600" : "bg-dark-500"}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${alertsEnabled ? "left-7" : "left-1"}`} />
            </button>
          </div>

          {/* Desktop browser notification permission */}
          <div className="bg-dark-700 border border-dark-600 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-white">Browser (Desktop) Notifications</span>
              <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                notifPerm === "granted" ? "bg-emerald-500/20 text-emerald-400" :
                notifPerm === "denied"  ? "bg-red-500/20 text-red-400" :
                "bg-yellow-500/20 text-yellow-400"}`}>
                {notifPerm === "granted" ? "✓ Enabled" : notifPerm === "denied" ? "✗ Blocked" : "Not set"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-3">Pop-up alerts on this computer when you're on the page.</p>
            {notifPerm !== "granted" && notifPerm !== "denied" && (
              <button onClick={requestDesktopPerm}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors">
                Enable Desktop Notifications
              </button>
            )}
            {notifPerm === "denied" && (
              <p className="text-xs text-red-400">Blocked by browser — open Site Settings and allow notifications for localhost.</p>
            )}
          </div>

          {/* Provider selection */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-2">Phone Notification Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(["none", "ntfy", "telegram"] as NotifyProvider[]).map(p => (
                <button key={p} onClick={() => save({ provider: p })}
                  className={`py-2.5 rounded-lg text-sm font-medium capitalize border transition-all ${cfg.provider === p
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-dark-700 border-dark-600 text-slate-400 hover:text-white hover:border-slate-500"}`}>
                  {p === "none" ? "None" : p === "ntfy" ? "📱 ntfy" : "✈️ Telegram"}
                </button>
              ))}
            </div>
          </div>

          {/* ntfy configuration */}
          {cfg.provider === "ntfy" && (
            <div className="space-y-3">
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-white">ntfy.sh Setup</div>
                    <div className="text-xs text-slate-500">Free · No account needed · Open source</div>
                  </div>
                  <button onClick={() => setShowNtfyGuide(g => !g)}
                    className="text-xs text-blue-400 flex items-center gap-1">
                    Setup guide {showNtfyGuide ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>

                {showNtfyGuide && (
                  <div className="mb-4 space-y-2 text-xs text-slate-400 bg-dark-800 rounded-lg p-3">
                    <div className="font-semibold text-slate-300 mb-1">📱 3 steps to get phone alerts:</div>
                    <div className="flex gap-2"><span className="text-blue-400 font-bold shrink-0">1.</span>
                      Install the free <span className="text-white font-medium">ntfy</span> app:
                      <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noreferrer" className="text-blue-400 underline flex items-center gap-0.5 ml-1">Android <ExternalLink size={9} /></a>
                      <span className="mx-1">/</span>
                      <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noreferrer" className="text-blue-400 underline flex items-center gap-0.5">iOS <ExternalLink size={9} /></a>
                    </div>
                    <div className="flex gap-2"><span className="text-blue-400 font-bold shrink-0">2.</span>
                      In the ntfy app tap <span className="text-white font-medium">+</span> → Subscribe to topic → type your topic below.
                    </div>
                    <div className="flex gap-2"><span className="text-blue-400 font-bold shrink-0">3.</span>
                      Paste the same topic into the field below and click Test.
                    </div>
                    <div className="text-slate-600 mt-1">Tip: pick a unique topic name — anyone who knows your topic can subscribe to it.</div>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Your ntfy Topic</label>
                    <div className="flex gap-2">
                      <input
                        value={cfg.ntfyTopic}
                        onChange={e => save({ ntfyTopic: e.target.value.trim() })}
                        placeholder={suggestedTopic}
                        className="flex-1 bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                      />
                      {cfg.ntfyTopic && (
                        <button onClick={copyTopic}
                          className="px-2.5 py-2 bg-dark-600 hover:bg-dark-500 border border-dark-500 rounded-lg text-slate-400 hover:text-white transition-colors"
                          title="Copy topic">
                          {copied ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      )}
                    </div>
                    {!cfg.ntfyTopic && (
                      <button onClick={() => save({ ntfyTopic: suggestedTopic })}
                        className="mt-1.5 text-xs text-blue-400 hover:text-blue-300">
                        Use suggested: <span className="font-mono">{suggestedTopic}</span>
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Server (default: ntfy.sh)</label>
                    <input
                      value={cfg.ntfyServer}
                      onChange={e => save({ ntfyServer: e.target.value.trim() })}
                      placeholder="https://ntfy.sh"
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Telegram configuration */}
          {cfg.provider === "telegram" && (
            <div className="space-y-3">
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Telegram Bot Setup</div>
                    <div className="text-xs text-slate-500">Free · Instant · Rich text formatting</div>
                  </div>
                  <button onClick={() => setShowTgGuide(g => !g)}
                    className="text-xs text-blue-400 flex items-center gap-1">
                    Setup guide {showTgGuide ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>

                {showTgGuide && (
                  <div className="mb-4 space-y-2 text-xs text-slate-400 bg-dark-800 rounded-lg p-3">
                    <div className="font-semibold text-slate-300 mb-1">✈️ Telegram bot in 3 steps:</div>
                    <div className="flex gap-2"><span className="text-blue-400 font-bold shrink-0">1.</span>
                      Open Telegram → search <span className="text-white font-mono">@BotFather</span> → send <span className="text-white font-mono">/newbot</span> → copy the token it gives you.
                    </div>
                    <div className="flex gap-2"><span className="text-blue-400 font-bold shrink-0">2.</span>
                      Message your new bot once (say hi), then open:<br />
                      <span className="text-white font-mono break-all">https://api.telegram.org/bot&#123;TOKEN&#125;/getUpdates</span><br />
                      Find <span className="text-white font-mono">"chat":&#123;"id": 123456789&#125;</span> — that's your Chat ID.
                    </div>
                    <div className="flex gap-2"><span className="text-blue-400 font-bold shrink-0">3.</span>
                      Paste both below and hit Test.
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Bot Token</label>
                    <input
                      type="password"
                      value={cfg.telegramToken}
                      onChange={e => save({ telegramToken: e.target.value.trim() })}
                      placeholder="123456789:ABCDefgh..."
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Chat ID</label>
                    <input
                      value={cfg.telegramChatId}
                      onChange={e => save({ telegramChatId: e.target.value.trim() })}
                      placeholder="123456789"
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Alert filters */}
          <div className="bg-dark-700 border border-dark-600 rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Alert Filters</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white">Min Win Probability</div>
                <div className="text-xs text-slate-500">Only alert when win prob ≥ this</div>
              </div>
              <div className="flex items-center gap-2">
                <input type="range" min={50} max={85} step={5} value={cfg.minWinProb}
                  onChange={e => save({ minWinProb: Number(e.target.value) })}
                  className="w-24 accent-blue-500" />
                <span className="text-sm font-bold text-blue-400 w-8 text-right">{cfg.minWinProb}%</span>
              </div>
            </div>
            <div className="flex gap-4 flex-wrap">
              {[{ key: "notifyLong", label: "📈 LONG signals" }, { key: "notifyShort", label: "📉 SHORT signals" }].map(item => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={cfg[item.key as keyof NotifyConfig] as boolean}
                    onChange={e => save({ [item.key]: e.target.checked })}
                    className="accent-blue-500 w-4 h-4" />
                  <span className="text-sm text-slate-300">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Early Crypto Alerts */}
          <div className="bg-dark-700 border border-orange-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🚀</span>
                <div>
                  <div className="text-sm font-semibold text-white">Early Action Meme / Crypto Alerts</div>
                  <div className="text-xs text-slate-500">Get notified when meme coins score high on early breakout signals</div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={cfg.notifyEarlyCrypto ?? true}
                  onChange={e => save({ notifyEarlyCrypto: e.target.checked })}
                  className="sr-only peer" />
                <div className="w-9 h-5 bg-dark-500 peer-checked:bg-orange-500 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
            {(cfg.notifyEarlyCrypto ?? true) && (
              <div className="flex items-center justify-between pt-1 border-t border-dark-600">
                <div>
                  <div className="text-sm text-white">Min Early Score</div>
                  <div className="text-xs text-slate-500">Alert when score ≥ this (max 100)</div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="range" min={60} max={95} step={5} value={cfg.earlyScoreThreshold ?? 80}
                    onChange={e => save({ earlyScoreThreshold: Number(e.target.value) })}
                    className="w-24 accent-orange-500" />
                  <span className="text-sm font-bold text-orange-400 w-8 text-right">{cfg.earlyScoreThreshold ?? 80}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Test button */}
          {cfg.provider !== "none" && (
            <div className="flex items-center gap-3">
              <button onClick={handleTest} disabled={testing || (!cfg.ntfyTopic && !cfg.telegramToken)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm rounded-lg transition-colors">
                <RefreshCw size={13} className={testing ? "animate-spin" : ""} />
                {testing ? "Sending…" : "Send Test Notification"}
              </button>
              {testResult === "success" && (
                <div className="flex items-center gap-1 text-emerald-400 text-sm">
                  <CheckCircle size={14} />Sent! Check your phone.
                </div>
              )}
              {testResult === "fail" && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1 text-red-400 text-sm">
                    <AlertTriangle size={14} />
                    {testError ?? "Failed — check your settings."}
                  </div>
                  {testError && (
                    <div className="text-xs text-slate-500">Open browser DevTools → Console for more detail.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Summary */}
          <div className={`rounded-xl p-4 border text-xs space-y-1.5 ${alertsEnabled && cfg.provider !== "none" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-dark-700 border-dark-600 text-slate-500"}`}>
            {alertsEnabled && cfg.provider !== "none" ? (
              <>
                <div className="font-semibold text-emerald-300">✓ Phone alerts active</div>
                <div>Checking favorited symbols every 90 seconds on all pages</div>
                <div>Sending to: {cfg.provider === "ntfy" ? `ntfy.sh/${cfg.ntfyTopic}` : "Telegram"}</div>
                <div>Firing when win probability ≥ {cfg.minWinProb}%</div>
              </>
            ) : alertsEnabled ? (
              <>
                <div className="font-semibold text-slate-300">✓ In-app alerts active (no phone)</div>
                <div>Select ntfy or Telegram above to also get phone notifications</div>
              </>
            ) : (
              <div>Toggle alerts ON above to start monitoring</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-dark-700 flex justify-end">
          <button onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
