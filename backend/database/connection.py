import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base


# Project root folder
BASE_DIR = Path(__file__).resolve().parents[2]

# Load .env
load_dotenv(BASE_DIR / ".env")


# Database settings
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_CA = os.getenv("DB_CA")

if DB_CA:
    CA_PATH = Path(DB_CA)
elif Path("/etc/secrets/ca.pem").exists():
    CA_PATH = Path("/etc/secrets/ca.pem")
else:
    CA_PATH = BASE_DIR / "backend" / "ca.pem"

# MySQL connection URL
DATABASE_URL = (
    f"mysql+pymysql://{quote_plus(DB_USER)}:"
    f"{quote_plus(DB_PASSWORD)}@"
    f"{DB_HOST}:{DB_PORT}/{DB_NAME}"
)


# SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={
        "ssl": {
            "ca": str(CA_PATH)
        }
    }
)


# Database session
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# SQLAlchemy Base
Base = declarative_base()


# Dependency
def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()