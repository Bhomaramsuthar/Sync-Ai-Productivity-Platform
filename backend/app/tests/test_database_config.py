import pytest
from app.core.config import Settings, normalize_database_url
from sqlalchemy import create_engine


def test_normalize_database_url_postgresql_schemes():
    # Standard postgresql:// scheme
    url1 = "postgresql://myuser:mypass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require"
    assert normalize_database_url(url1) == "postgresql+psycopg://myuser:mypass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require"

    # Legacy postgres:// scheme
    url2 = "postgres://myuser:mypass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
    assert normalize_database_url(url2) == "postgresql+psycopg://myuser:mypass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"

    # Explicit postgresql+psycopg2:// scheme
    url3 = "postgresql+psycopg2://myuser:mypass@localhost:5432/testdb"
    assert normalize_database_url(url3) == "postgresql+psycopg://myuser:mypass@localhost:5432/testdb"

    # Already normalized postgresql+psycopg:// scheme
    url4 = "postgresql+psycopg://myuser:mypass@localhost:5432/testdb"
    assert normalize_database_url(url4) == "postgresql+psycopg://myuser:mypass@localhost:5432/testdb"


def test_normalize_database_url_preserves_special_characters_and_params():
    url = "postgresql://user.project:p%40ss:word%21@db.host.supabase.co:5432/postgres?sslmode=require&application_name=test"
    normalized = normalize_database_url(url)
    assert normalized == "postgresql+psycopg://user.project:p%40ss:word%21@db.host.supabase.co:5432/postgres?sslmode=require&application_name=test"


def test_normalize_database_url_non_postgres():
    assert normalize_database_url("sqlite:///./test.db") == "sqlite:///./test.db"
    assert normalize_database_url("") == ""
    assert normalize_database_url(None) == ""


def test_settings_field_validator_normalizes_database_url():
    settings = Settings(DATABASE_URL="postgresql://user:pass@localhost:5432/testdb")
    assert settings.DATABASE_URL == "postgresql+psycopg://user:pass@localhost:5432/testdb"


def test_engine_loads_psycopg3_dialect():
    norm_url = normalize_database_url("postgresql://user:pass@localhost:5432/testdb")
    test_engine = create_engine(norm_url)
    assert test_engine.dialect.dbapi.__name__ == "psycopg"
