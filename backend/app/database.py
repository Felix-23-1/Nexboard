import os
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

# Datenverzeichnis: in Docker auf ein persistentes Volume gelegt,
# in der lokalen Entwicklung das aktuelle Verzeichnis.
DATA_DIR = os.getenv("NEXBOARD_DATA_DIR", ".")
Path(DATA_DIR).mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite+aiosqlite:///{DATA_DIR}/nexboard.db"

engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session


async def init_db():
    # Modelle importieren, damit alle Tabellen registriert sind
    from . import models  # noqa: F401
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _run_migrations(conn)


async def _run_migrations(conn) -> None:
    """SQLite-sichere Migrationen: neue Spalten hinzufügen, Daten migrieren.
    ALTER TABLE schlägt still fehl wenn die Spalte bereits existiert – das ist gewollt."""
    from sqlalchemy import text

    migrations = [
        # --- User: Lizenzschlüssel direkt am User-Objekt ---
        "ALTER TABLE users ADD COLUMN license_key TEXT",

        # --- Connectors: jedem Connector einen Besitzer zuweisen ---
        "ALTER TABLE connector_configs ADD COLUMN user_id INTEGER DEFAULT 1",
        "UPDATE connector_configs SET user_id = 1 WHERE user_id IS NULL",

        # --- Notification Channels: pro User ---
        "ALTER TABLE notification_channels ADD COLUMN user_id INTEGER DEFAULT 1",
        "UPDATE notification_channels SET user_id = 1 WHERE user_id IS NULL",

        # --- Alert Rules: pro User ---
        "ALTER TABLE alert_rules ADD COLUMN user_id INTEGER DEFAULT 1",
        "UPDATE alert_rules SET user_id = 1 WHERE user_id IS NULL",

        # --- Alert Events: pro User ---
        "ALTER TABLE alert_events ADD COLUMN user_id INTEGER DEFAULT 1",
        "UPDATE alert_events SET user_id = 1 WHERE user_id IS NULL",

        # --- Lizenz aus globaler Settings-Tabelle zu User 1 migrieren ---
        """UPDATE users SET license_key = (
               SELECT value FROM settings WHERE key = 'license_key' AND value != ''
           ) WHERE id = 1 AND license_key IS NULL""",
    ]

    for sql in migrations:
        try:
            await conn.execute(text(sql))
        except Exception:
            pass  # Spalte existiert bereits oder keine Daten vorhanden – ignorieren
