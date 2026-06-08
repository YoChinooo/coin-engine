import asyncio
from app.tasks.celery_app import celery_app
from app.services.data_collectors.crypto import fetch_top_coins, fetch_ohlcv, fetch_fear_greed
from app.services.analysis.indicators import compute_indicators
from app.services.analysis.scorer import score_signal


@celery_app.task
def refresh_market_data():
    asyncio.run(_refresh())


async def _refresh():
    coins = await fetch_top_coins(20)
    fear_greed = await fetch_fear_greed()

    results = []
    for coin in coins:
        try:
            ohlcv = await fetch_ohlcv(coin["id"], days=30)
            indicators = compute_indicators(ohlcv)
            if indicators:
                signal = score_signal(indicators, coin, fear_greed)
                results.append({"coin": coin["symbol"], **signal})
        except Exception:
            pass

    return results
