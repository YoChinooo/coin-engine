"""
Signal scorer — combines technical indicators, sentiment, and volume
into a 0-100 confidence score with a full explanation.
"""


def score_signal(indicators: dict, coin_data: dict, fear_greed: dict) -> dict:
    scores = {}
    reasons = []

    # --- Technical score (0-40 points) ---
    tech = 0
    rsi = indicators.get("rsi")
    if rsi is not None:
        if rsi < 30:
            tech += 15
            reasons.append(f"RSI={rsi:.1f} — oversold, potential reversal zone")
        elif rsi < 45:
            tech += 8
            reasons.append(f"RSI={rsi:.1f} — approaching oversold")
        elif rsi > 70:
            tech -= 5
            reasons.append(f"RSI={rsi:.1f} — overbought, caution")

    macd = indicators.get("macd")
    macd_hist = indicators.get("macd_histogram")
    if macd is not None and macd_hist is not None:
        if macd > 0 and macd_hist > 0:
            tech += 10
            reasons.append("MACD positive and rising — bullish momentum")
        elif macd < 0 and macd_hist < 0:
            tech -= 5
            reasons.append("MACD negative — bearish momentum")

    bb_pos = indicators.get("price_vs_bb")
    if bb_pos == "oversold":
        tech += 10
        reasons.append("Price below lower Bollinger Band — mean reversion likely")
    elif bb_pos == "overbought":
        tech -= 5
        reasons.append("Price above upper Bollinger Band — extended")

    trend = indicators.get("trend")
    if trend == "uptrend":
        tech += 5
        reasons.append("Short-term uptrend confirmed")
    elif trend == "downtrend":
        tech -= 5

    scores["technical_score"] = max(0, min(40, tech + 20))

    # --- Sentiment score (0-30 points) ---
    fg_value = int(fear_greed.get("value", 50)) if fear_greed else 50
    if fg_value < 20:
        sent = 25
        reasons.append(f"Extreme Fear (F&G={fg_value}) — historically good buy zone")
    elif fg_value < 40:
        sent = 18
        reasons.append(f"Fear present (F&G={fg_value}) — cautious opportunity")
    elif fg_value > 80:
        sent = 5
        reasons.append(f"Extreme Greed (F&G={fg_value}) — elevated risk")
    else:
        sent = 12

    scores["sentiment_score"] = sent

    # --- Volume / momentum score (0-30 points) ---
    vol_score = 15
    price_change_24h = coin_data.get("price_change_percentage_24h", 0) or 0
    price_change_7d = coin_data.get("price_change_percentage_7d_in_currency", 0) or 0

    if price_change_24h > 5:
        vol_score += 8
        reasons.append(f"Strong 24h gain: +{price_change_24h:.1f}%")
    elif price_change_24h < -10:
        vol_score -= 5
        reasons.append(f"Sharp 24h drop: {price_change_24h:.1f}% — watch for bounce")

    if price_change_7d > 10:
        vol_score += 7
        reasons.append(f"Strong 7d momentum: +{price_change_7d:.1f}%")
    elif price_change_7d < -20:
        vol_score += 5
        reasons.append(f"Heavy 7d selloff: {price_change_7d:.1f}% — oversold territory")

    scores["volume_score"] = max(0, min(30, vol_score))

    # --- Final confidence ---
    total = scores["technical_score"] + scores["sentiment_score"] + scores["volume_score"]
    scores["confidence_score"] = round(total, 1)

    # --- Risk score (0=low risk, 100=high risk) ---
    volatility = abs(price_change_24h)
    risk = min(100, volatility * 3)
    if rsi and rsi > 75:
        risk = min(100, risk + 20)
    scores["risk_score"] = round(risk, 1)

    # --- Signal type ---
    if total >= 60:
        signal_type = "BUY"
    elif total >= 40:
        signal_type = "WATCH"
    else:
        signal_type = "AVOID"

    # --- Price targets ---
    price = indicators.get("current_price", coin_data.get("current_price", 0))
    scores["signal_type"] = signal_type
    scores["entry_low"] = round(price * 0.99, 6)
    scores["entry_high"] = round(price * 1.01, 6)
    scores["stop_loss"] = round(price * 0.93, 6)
    scores["take_profit_1"] = round(price * 1.05, 6)
    scores["take_profit_2"] = round(price * 1.10, 6)
    scores["take_profit_3"] = round(price * 1.20, 6)
    scores["explanation"] = reasons

    return scores
