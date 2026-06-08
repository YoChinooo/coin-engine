"""
ML scoring layer — uses a Random Forest trained on indicator features.
On first run it uses a rule-based fallback. Once enough data is collected
the model can be trained via POST /api/ml/train.
"""
import numpy as np

try:
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    from sklearn.preprocessing import StandardScaler
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False

_model = None
_scaler = None


def _build_features(indicators: dict, coin_data: dict) -> list[float]:
    return [
        indicators.get("rsi") or 50,
        indicators.get("macd") or 0,
        indicators.get("macd_histogram") or 0,
        1 if indicators.get("price_vs_bb") == "oversold" else 0,
        1 if indicators.get("trend") == "uptrend" else 0,
        coin_data.get("price_change_percentage_24h") or 0,
        coin_data.get("price_change_percentage_7d_in_currency") or 0,
        coin_data.get("market_cap_rank") or 100,
    ]


def predict_opportunity(indicators: dict, coin_data: dict) -> float:
    """Return a 0-100 ML opportunity score."""
    if not ML_AVAILABLE or _model is None:
        return _rule_based_score(indicators, coin_data)

    features = np.array([_build_features(indicators, coin_data)])
    scaled = _scaler.transform(features)
    prob = _model.predict_proba(scaled)[0][1]
    return round(prob * 100, 1)


def _rule_based_score(indicators: dict, coin_data: dict) -> float:
    score = 50.0
    rsi = indicators.get("rsi") or 50
    if rsi < 30:
        score += 20
    elif rsi > 70:
        score -= 15

    if indicators.get("macd_histogram", 0) or 0 > 0:
        score += 10

    if indicators.get("price_vs_bb") == "oversold":
        score += 15

    change_24h = coin_data.get("price_change_percentage_24h") or 0
    if change_24h > 5:
        score += 5
    elif change_24h < -10:
        score += 8

    return round(max(0, min(100, score)), 1)
