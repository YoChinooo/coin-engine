from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "coin_engine",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.market_tasks"],
)

celery_app.conf.beat_schedule = {
    "refresh-market-data": {
        "task": "app.tasks.market_tasks.refresh_market_data",
        "schedule": 300.0,  # every 5 minutes
    },
}
