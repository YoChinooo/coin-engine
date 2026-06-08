import httpx
from app.core.config import settings


async def fetch_top_coins(limit: int = 50) -> list[dict]:
    """Fetch top coins by market cap from CoinGecko (free, no key needed)."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.COINGECKO_BASE_URL}/coins/markets",
            params={
                "vs_currency": "usd",
                "order": "market_cap_desc",
                "per_page": limit,
                "page": 1,
                "sparkline": False,
                "price_change_percentage": "1h,24h,7d",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def fetch_ohlcv(coin_id: str, days: int = 30) -> list[list]:
    """Fetch OHLCV data for a coin from CoinGecko."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.COINGECKO_BASE_URL}/coins/{coin_id}/ohlc",
            params={"vs_currency": "usd", "days": days},
        )
        resp.raise_for_status()
        return resp.json()


async def fetch_global_market() -> dict:
    """Fetch global crypto market data."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{settings.COINGECKO_BASE_URL}/global")
        resp.raise_for_status()
        return resp.json().get("data", {})


async def fetch_fear_greed() -> dict:
    """Fetch Fear & Greed index from Alternative.me (free)."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get("https://api.alternative.me/fng/?limit=1")
        resp.raise_for_status()
        data = resp.json()
        return data["data"][0] if data.get("data") else {}
