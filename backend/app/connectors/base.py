from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any
from enum import Enum


class ConnectorStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    WARNING = "warning"
    UNKNOWN = "unknown"
    ERROR = "error"


@dataclass
class ConnectorResult:
    status: ConnectorStatus
    metrics: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


@dataclass
class ConnectorMeta:
    type: str
    label: str
    description: str
    icon: str
    config_schema: dict[str, Any] = field(default_factory=dict)


class BaseConnector(ABC):
    meta: ConnectorMeta

    def __init__(self, config: dict[str, Any]):
        self.config = config

    @abstractmethod
    async def fetch(self) -> ConnectorResult:
        """Fetch current status and metrics from the service."""
        ...

    @classmethod
    def get_meta(cls) -> ConnectorMeta:
        return cls.meta
