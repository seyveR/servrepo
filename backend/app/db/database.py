from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from typing import Iterator
from . import __init__ as _  # noqa: F401  (пусть пакет точно считается пакетом)
from app.settings import DB_URL

engine = create_engine(DB_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()

def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()