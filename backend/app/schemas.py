from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field


# --- Connectors ---------------------------------------------------------------

class ConnectorConfigCreate(BaseModel):
    name: str
    type: str
    config: dict[str, Any] = {}


class ConnectorConfigUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    config: dict[str, Any] | None = None


class ConnectorConfigOut(BaseModel):
    id: int
    name: str
    type: str
    enabled: bool
    config: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class ConnectorStatusOut(BaseModel):
    connector_id: int
    connector_name: str
    connector_type: str
    status: str
    metrics: dict[str, Any]
    error: str | None
    fetched_at: datetime


class ConnectorTypeOut(BaseModel):
    type: str
    label: str
    description: str
    icon: str
    config_schema: dict[str, Any]


# --- Auth & Users -------------------------------------------------------------

Role = Literal["admin", "viewer"]


class LoginRequest(BaseModel):
    username: str
    password: str


class SetupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: str = ""
    password: str = Field(min_length=6, max_length=200)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: str = ""
    password: str = Field(min_length=6, max_length=200)
    role: Role = "viewer"


class UserUpdate(BaseModel):
    email: str | None = None
    password: str | None = Field(default=None, min_length=6, max_length=200)
    role: Role | None = None
    active: bool | None = None


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: str
    active: bool
    created_at: datetime
    last_login: datetime | None

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AuthStatusOut(BaseModel):
    needs_setup: bool
    user_count: int


# --- Alerts -------------------------------------------------------------------

ChannelType = Literal["email", "discord", "slack", "teams", "telegram", "webhook"]
TriggerStatus = Literal["online", "warning", "offline", "error", "unknown"]


class ChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: ChannelType
    config: dict[str, Any] = {}


class ChannelUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    config: dict[str, Any] | None = None


class ChannelOut(BaseModel):
    id: int
    name: str
    type: str
    enabled: bool
    config: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class RuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    connector_ids: list[int] = Field(default_factory=list)
    trigger_statuses: list[TriggerStatus] = Field(default_factory=lambda: ["warning", "offline", "error"])
    channel_ids: list[int] = Field(default_factory=list)
    cooldown_minutes: int = Field(default=30, ge=0, le=10080)


class RuleUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    connector_ids: list[int] | None = None
    trigger_statuses: list[TriggerStatus] | None = None
    channel_ids: list[int] | None = None
    cooldown_minutes: int | None = Field(default=None, ge=0, le=10080)


class RuleOut(BaseModel):
    id: int
    name: str
    enabled: bool
    connector_ids: list[int]
    trigger_statuses: list[str]
    channel_ids: list[int]
    cooldown_minutes: int
    created_at: datetime

    model_config = {"from_attributes": True}


class EventOut(BaseModel):
    id: int
    rule_id: int | None
    rule_name: str
    connector_id: int
    connector_name: str
    status: str
    previous_status: str | None
    message: str
    channels_results: list[dict[str, Any]]
    captured_at: datetime

    model_config = {"from_attributes": True}
