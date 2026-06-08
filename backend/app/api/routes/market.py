from fastapi import APIRouter
from app.services.data_collectors.crypto import fetch_top_coins, fetch_ohlcv, fetch_fear_greed, fetch_global_market
from app.services.analysis.indicators import compute_indicators
from app.services.analysis.scorer import score_signal
from app.services.ml.model import predict_opportunity

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/overview")
async def market_overview():
    global_data = await fetch_global_market()
    fear_greed = await fetch_fear_greed()
    return {
        "global": global_data,
        "fear_greed": fear_greed,
        "disclaimer": "All data is informational only. Not financial advice.",
    }


@router.get("/coins")
async def list_coins(limit: int = 50):
    coins = await fetch_top_coins(limit)
    return coins


@router.get("/signals")
async def get_signals(limit: int = 20):
    coins = await fetch_top_coins(limit)
    fear_greed = await fetch_fear_greed()
    signals = []

    for coin in coins:
        try:
            ohlcv = await fetch_ohlcv(coin["id"], days=30)
            indicators = compute_indicators(ohlcv)
            if not indicators:
                continue
            scored = score_signal(indicators, coin, fear_greed)
            ml_score = predict_opportunity(indicators, coin)
            signals.append({
                "symbol": coin["symbol"].upper(),
                "name": coin["name"],
                "image": coin.get("image"),
                "current_price": coin.get("current_price"),
                "market_cap_rank": coin.get("market_cap_rank"),
                "price_change_24h": coin.get("price_change_percentage_24h"),
                "indicators": indicators,
                **scored,
                "ml_score": ml_score,
            })
        except Exception:
            continue

    signals.sort(key=lambda x: x["confidence_score"], reverse=True)
    return {
        "signals": signals,
        "disclaimer": "All predictions are probabilistic estimates. Not financial advice.",
    }


@router.get("/analysis/{coin_id}")
async def coin_analysis(coin_id: str):
    ohlcv = await fetch_ohlcv(coin_id, days=90)
    fear_greed = await fetch_fear_greed()
    indicators = compute_indicators(ohlcv)
    coins = await fetch_top_coins(250)
    coin_data = next((c for c in coins if c["id"] == coin_id), {})
    scored = score_signal(indicators, coin_data, fear_greed) if indicators else {}
    ml_score = predict_opportunity(indicators, coin_data) if indicators else 50

    return {
        "coin_id": coin_id,
        "indicators": indicators,
        "signal": scored,
        "ml_score": ml_score,
        "fear_greed": fear_greed,
        "disclaimer": "All predictions are probabilistic estimates. Not financial advice.",
    }
