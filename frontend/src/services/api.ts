import axios from "axios";
import type { Signal, MarketOverview } from "../types";

const api = axios.create({ baseURL: "/api" });

export async function fetchSignals(limit = 20): Promise<{ signals: Signal[]; disclaimer: string }> {
  const { data } = await api.get(`/market/signals?limit=${limit}`);
  return data;
}

export async function fetchOverview(): Promise<MarketOverview> {
  const { data } = await api.get("/market/overview");
  return data;
}

export async function fetchCoins(limit = 50) {
  const { data } = await api.get(`/market/coins?limit=${limit}`);
  return data;
}
