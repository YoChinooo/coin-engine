from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

# Use SQLite as local fallback when PostgreSQL is not available
db_url = settings.DATABASE_URL
if db_url.startswith("postgresql"):
    try:
        import psycopg2  # noqa
    except ImportError:
        db_url = "sqlite:///./coinengine.db"

connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
engine = create_engine(db_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
