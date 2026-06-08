from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, Enum
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class AssetType(str, enum.Enum):
    crypto = "crypto"
    stock = "stock"


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True)
    symbol = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    asset_type = Column(Enum(AssetType), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class PriceData(Base):
    __tablename__ = "price_data"

    id = Column(Integer, primary_key=True)
    symbol = Column(String, index=True, nullable=False)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Float)
    timestamp = Column(DateTime, index=True, nullable=False)


class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True)
    symbol = Column(String, index=True, nullable=False)
    signal_type = Column(String, nullable=False)  # BUY, SELL, WATCH
    entry_low = Column(Float)
    entry_high = Column(Float)
    stop_loss = Column(Float)
    take_profit_1 = Column(Float)
    take_profit_2 = Column(Float)
    take_profit_3 = Column(Float)
    confidence_score = Column(Float)
    risk_score = Column(Float)
    technical_score = Column(Float)
    sentiment_score = Column(Float)
    volume_score = Column(Float)
    explanation = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())


class SentimentData(Base):
    __tablename__ = "sentiment_data"

    id = Column(Integer, primary_key=True)
    symbol = Column(String, index=True, nullable=False)
    source = Column(String)
    sentiment = Column(Float)  # -1 to 1
    fear_greed = Column(Float)  # 0 to 100
    raw_text = Column(String)
    created_at = Column(DateTime, server_default=func.now())


class WhaleActivity(Base):
    __tablename__ = "whale_activity"

    id = Column(Integer, primary_key=True)
    symbol = Column(String, index=True)
    transaction_hash = Column(String)
    from_address = Column(String)
    to_address = Column(String)
    amount_usd = Column(Float)
    activity_type = Column(String)  # exchange_inflow, exchange_outflow, transfer
    created_at = Column(DateTime, server_default=func.now())
