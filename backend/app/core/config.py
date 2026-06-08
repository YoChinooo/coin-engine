from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://coinengine:coinengine@localhost:5432/coinengine"
    REDIS_URL: str = "redis://localhost:6379"

    # Optional API keys — add yours in .env
    BINANCE_API_KEY: str = ""
    BINANCE_SECRET: str = ""
    COINBASE_API_KEY: str = ""
    TWITTER_BEARER_TOKEN: str = ""
    NEWSAPI_KEY: str = ""
    DISCORD_WEBHOOK_URL: str = ""
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    # Free APIs (no key required)
    COINGECKO_BASE_URL: str = "https://api.coingecko.com/api/v3"
    YAHOO_FINANCE_BASE_URL: str = "https://query1.finance.yahoo.com/v8/finance"

    class Config:
        env_file = ".env"


settings = Settings()
