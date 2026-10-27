"""Acceso a PostgreSQL."""
from contextlib import contextmanager

import psycopg2

from .config import settings


@contextmanager
def get_conn(database_url: str = None):
    conn = psycopg2.connect(
        database_url or settings.database_url,
        connect_timeout=settings.db_connect_timeout,
    )
    try:
        yield conn
    finally:
        conn.close()
