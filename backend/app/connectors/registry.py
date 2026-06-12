from typing import Type
from .base import BaseConnector, ConnectorMeta


class ConnectorRegistry:
    def __init__(self):
        self._connectors: dict[str, Type[BaseConnector]] = {}

    def register(self, type_id: str, cls: Type[BaseConnector]):
        self._connectors[type_id] = cls

    def get(self, type_id: str) -> Type[BaseConnector] | None:
        return self._connectors.get(type_id)

    def all_meta(self) -> list[ConnectorMeta]:
        return [cls.meta for cls in self._connectors.values()]

    def available_types(self) -> list[str]:
        return list(self._connectors.keys())


registry = ConnectorRegistry()
