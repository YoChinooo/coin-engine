export interface Signal {
  symbol: string;
  name: string;
  image?: string;
  current_price: number;
  market_cap_rank: number;
  price_change_24h: number;
  signal_type: "BUY" | "WATCH" | "AVOID";
  confidence_score: number;
  risk_score: number;
  technical_score: number;
  sentiment_score: number;
  volume_score: number;
  ml_score: number;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  take_profit_3: number;
  explanation: string[];
  indicators: {
    rsi?: number;
    macd?: number;
    macd_histogram?: number;
    bb_upper?: number;
    bb_lower?: number;
    ma50?: number;
    ma200?: number;
    trend?: string;
    price_vs_bb?: string;
  };
}

export interface MarketOverview {
  global: {
    total_market_cap?: Record<string, number>;
    market_cap_change_percentage_24h_usd?: number;
    active_cryptocurrencies?: number;
    markets?: number;
  };
  fear_greed: {
    value?: string;
    value_classification?: string;
  };
}

export interface MemeAnalysis {
  pdRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  pdRiskScore: number;        // 0-100, higher = more risky
  passed: boolean;            // false = skip this coin
  skipReason?: string;
  marketCapTier: "Micro" | "Small" | "Mid" | "Large";
  liquidityScore: number;     // 0-100
  holderRisk: "Safe" | "Moderate" | "Concentrated";
  narrativeStrength: number;  // 0-100
  catalysts: string[];
  redFlags: string[];
  verdict: string;
}

export interface PennyCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h: number;
  total_volume: number;
  sector: string;
  earlyScore: number;
  technicalScore: number;
  sentimentScore: number;
  onChainScore: number;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  take_profit_3: number;
  reasoning: string;
  signals: string[];
  priceHistory: number[];
  memeAnalysis?: MemeAnalysis;
}
