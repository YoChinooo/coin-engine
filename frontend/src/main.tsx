import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
// BUILD: 2026-06-10-v9 — entry at market price, candle outlier filter 15%, ATR floor

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
