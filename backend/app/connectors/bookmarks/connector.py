"""
BookmarkGroupConnector — kein Netzwerk-Fetch, reine Link-Verwaltung.
Gibt immer ONLINE zurück; metrics enthält die konfigurierten Links.
Wird auf dem Dashboard als Quick-Link-Grid gerendert.
"""
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class BookmarkGroupConnector(BaseConnector):
    meta = ConnectorMeta(
        type="bookmarks",
        label="Bookmark-Gruppe",
        description=(
            "Schnellzugriff-Links für Web-Services. "
            "Erscheint als Link-Grid auf dem Dashboard."
        ),
        icon="bookmark",
        config_schema={
            "links": {
                "type": "array",
                "label": "Links",
                "help": "JSON-Array: [{\"name\": \"Proxmox\", \"url\": \"https://pve:8006\", \"icon\": \"server\", \"description\": \"Virtualisierung\"}]",
                "required": True,
                "placeholder": '[{"name":"Proxmox","url":"https://pve:8006","icon":"server","description":"VMs & Container"}]',
            },
            "description": {
                "type": "string",
                "label": "Gruppen-Beschreibung",
                "help": "Kurze Beschreibung der Gruppe (optional)",
            },
        },
    )

    async def fetch(self) -> ConnectorResult:
        raw_links = self.config.get("links", [])

        # links kann als JSON-String oder als bereits geparste Liste kommen
        if isinstance(raw_links, str):
            import json
            try:
                raw_links = json.loads(raw_links)
            except Exception:
                raw_links = []

        # Normalisieren
        links = []
        for item in (raw_links if isinstance(raw_links, list) else []):
            if isinstance(item, dict) and item.get("url"):
                links.append({
                    "name":        str(item.get("name", "Link")),
                    "url":         str(item.get("url", "")),
                    "icon":        str(item.get("icon", "globe")),
                    "description": str(item.get("description", "")),
                })

        return ConnectorResult(
            status=ConnectorStatus.ONLINE,
            metrics={
                "links":       links,
                "link_count":  len(links),
                "description": self.config.get("description", ""),
            },
        )
