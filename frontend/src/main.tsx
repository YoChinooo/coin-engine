import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
// BUILD: 2026-06-16-v11 — counter-trend (falling-knife) dampening for RSI/BB/Stoch mean-reversion signals

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
