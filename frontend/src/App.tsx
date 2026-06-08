import { useEffect, useState, useCallback } from "react";
import { Sidebar, type Page } from "./components/Sidebar";
import { DashboardPage } from "./pages/DashboardPage";
import { SignalsPage } from "./pages/SignalsPage";
import { PennyScannerPage } from "./pages/PennyScannerPage";
import { AgentsPage } from "./pages/AgentsPage";
import { OnChainPage } from "./pages/OnChainPage";
import { SentimentPage } from "./pages/SentimentPage";
import { RiskPage } from "./pages/RiskPage";
import { BacktestPage } from "./pages/BacktestPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { AlertsPage } from "./pages/AlertsPage";
import { FuturesScannerPage } from "./pages/FuturesScannerPage";
import { GlobalAlertMonitor } from "./components/GlobalAlertMonitor";
import { fetchSignals, fetchOverview } from "./services/api";
import { fetchSignalsFromMarket, fetchGlobalMarket, fetchFearGreed } from "./services/coingecko";
import type { Signal, MarketOverview } from "./types";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Try backend first
      const [sigData, ovData] = await Promise.all([fetchSignals(20), fetchOverview()]);
      setSignals(sigData.signals);
      setOverview(ovData);
    } catch {
      // Backend offline — fall back to live CoinGecko data
      try {
        const [liveSignals, global, fg] = await Promise.all([
          fetchSignalsFromMarket(30),
          fetchGlobalMarket(),
          fetchFearGreed(),
        ]);
        setSignals(liveSignals);
        setOverview({ global, fear_greed: fg });
      } catch {
        // CoinGecko also unavailable — silent fail
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <div className="flex min-h-screen bg-dark-900">
      {/* Always-on alert monitor — runs on every page, persists across navigation */}
      <GlobalAlertMonitor />
      <Sidebar current={page} onChange={setPage} />
      <main className="flex-1 overflow-y-auto">
        {page === "dashboard" && <DashboardPage overview={overview} signals={signals} loading={loading} />}
        {page === "signals" && <SignalsPage signals={signals} loading={loading} />}
        {page === "penny" && <PennyScannerPage />}
        {page === "agents" && <AgentsPage overview={overview} signals={signals} />}
        {page === "onchain" && <OnChainPage />}
        {page === "sentiment" && <SentimentPage overview={overview} />}
        {page === "risk" && <RiskPage signals={signals} />}
        {page === "backtest" && <BacktestPage />}
        {page === "portfolio" && <PortfolioPage />}
        {page === "alerts" && <AlertsPage signals={signals} />}
        {page === "futures" && <FuturesScannerPage />}
      </main>
    </div>
  );
}
