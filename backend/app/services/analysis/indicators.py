import pandas as pd
import numpy as np


def compute_indicators(ohlcv: list[list]) -> dict:
    """
    Compute RSI, MACD, Bollinger Bands, VWAP, and moving averages
    from raw OHLCV data [[timestamp, open, high, low, close], ...].
    """
    if len(ohlcv) < 20:
        return {}

    df = pd.DataFrame(ohlcv, columns=["timestamp", "open", "high", "low", "close"])
    df["close"] = df["close"].astype(float)
    df["high"] = df["high"].astype(float)
    df["low"] = df["low"].astype(float)

    close = df["close"]

    # RSI (14)
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))

    # MACD
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal_line = macd.ewm(span=9, adjust=False).mean()
    macd_hist = macd - signal_line

    # Bollinger Bands (20)
    sma20 = close.rolling(20).mean()
    std20 = close.rolling(20).std()
    bb_upper = sma20 + 2 * std20
    bb_lower = sma20 - 2 * std20

    # Moving Averages
    ma50 = close.rolling(min(50, len(close))).mean()
    ma200 = close.rolling(min(200, len(close))).mean()

    # VWAP approximation (no volume in CoinGecko OHLC free tier)
    vwap = ((df["high"] + df["low"] + df["close"]) / 3).mean()

    last = close.iloc[-1]

    return {
        "current_price": last,
        "rsi": round(rsi.iloc[-1], 2) if not pd.isna(rsi.iloc[-1]) else None,
        "macd": round(macd.iloc[-1], 4) if not pd.isna(macd.iloc[-1]) else None,
        "macd_signal": round(signal_line.iloc[-1], 4) if not pd.isna(signal_line.iloc[-1]) else None,
        "macd_histogram": round(macd_hist.iloc[-1], 4) if not pd.isna(macd_hist.iloc[-1]) else None,
        "bb_upper": round(bb_upper.iloc[-1], 4) if not pd.isna(bb_upper.iloc[-1]) else None,
        "bb_middle": round(sma20.iloc[-1], 4) if not pd.isna(sma20.iloc[-1]) else None,
        "bb_lower": round(bb_lower.iloc[-1], 4) if not pd.isna(bb_lower.iloc[-1]) else None,
        "ma50": round(ma50.iloc[-1], 4) if not pd.isna(ma50.iloc[-1]) else None,
        "ma200": round(ma200.iloc[-1], 4) if not pd.isna(ma200.iloc[-1]) else None,
        "vwap": round(vwap, 4),
        "price_vs_bb": _bb_position(last, bb_upper.iloc[-1], bb_lower.iloc[-1]),
        "trend": _detect_trend(close),
    }


def _bb_position(price: float, upper: float, lower: float) -> str:
    if pd.isna(upper) or pd.isna(lower):
        return "unknown"
    if price > upper:
        return "overbought"
    if price < lower:
        return "oversold"
    mid = (upper + lower) / 2
    return "upper_half" if price > mid else "lower_half"


def _detect_trend(close: pd.Series) -> str:
    if len(close) < 10:
        return "unknown"
    recent = close.iloc[-5:].mean()
    earlier = close.iloc[-10:-5].mean()
    if recent > earlier * 1.02:
        return "uptrend"
    if recent < earlier * 0.98:
        return "downtrend"
    return "sideways"
