from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings, normalize_database_url

db_url = normalize_database_url(settings.DATABASE_URL)

engine = create_engine(
    db_url, 
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"check_same_thread": False} if "sqlite" in db_url else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
