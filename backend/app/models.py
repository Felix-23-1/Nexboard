from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(200), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="viewer")  # admin | viewer
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Pro-Lizenz-Schlüssel direkt am User – jeder User hat seinen eigenen Plan
    license_key: Mapped[str | None] = mapped_column(Text, nullable=True)


class ConnectorConfig(Base):
    __tablename__ = "connector_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Besitzer – jeder User sieht nur seine eigenen Connectors
    user_id: Mapped[int] = mapped_column(Integer, default=1, index=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(50))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class UserSetting(Base):
    """Pro-User-Einstellungen (KI-Provider, API-Key, …)."""
    __tablename__ = "user_settings"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")


class Setting(Base):
    """Globale Einstellungen – für Rückwärtskompatibilität behalten."""
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")


class StatusSnapshot(Base):
    """Statusverlauf pro Connector – Basis für History & Trends und Alert-Engine."""
    __tablename__ = "status_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    connector_id: Mapped[int] = mapped_column(Integer, index=True)
    status: Mapped[str] = mapped_column(String(20))
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class NotificationChannel(Base):
    """Benachrichtigungskanal – E-Mail, Discord-Webhook oder Slack-Webhook."""
    __tablename__ = "notification_channels"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, default=1, index=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(30))
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AlertRule(Base):
    """Eine Alarmregel: bei Statuswechsel zu bestimmten Werten an festgelegte Kanäle senden."""
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, default=1, index=True)
    name: Mapped[str] = mapped_column(String(100))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    connector_ids: Mapped[list] = mapped_column(JSON, default=list)  # [] = alle Connectors des Users
    trigger_statuses: Mapped[list] = mapped_column(JSON, default=list)
    channel_ids: Mapped[list] = mapped_column(JSON, default=list)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=30)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AlertEvent(Base):
    """Verlauf: jeder ausgelöste Alarm wird hier protokolliert."""
    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, default=1, index=True)
    rule_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    rule_name: Mapped[str] = mapped_column(String(100))
    connector_id: Mapped[int] = mapped_column(Integer, index=True)
    connector_name: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20))
    previous_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    channels_results: Mapped[list] = mapped_column(JSON, default=list)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
