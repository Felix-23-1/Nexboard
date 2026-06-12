from datetime import datetime, timezone

import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


def _image_age_days(created_str: str | None) -> int | None:
    """Berechnet das Alter eines Docker-Images in Tagen aus dem ISO-Timestamp."""
    if not created_str:
        return None
    try:
        # Docker gibt z.B. "2024-11-15T12:34:56.789Z" zurück
        dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
        return (datetime.now(tz=timezone.utc) - dt).days
    except Exception:
        return None


class DockerConnector(BaseConnector):
    meta = ConnectorMeta(
        type="docker",
        label="Docker",
        description="Docker Engine – Container Status und Ressourcenverbrauch",
        icon="box",
        config_schema={
            "host":    {"type": "string",  "label": "Docker Host (IP oder Hostname)", "required": True},
            "port":    {"type": "number",  "label": "Docker API Port",                "default": 2375},
            "use_tls": {"type": "boolean", "label": "TLS verwenden",                  "default": False},
        },
    )

    async def fetch(self) -> ConnectorResult:
        host   = self.config.get("host", "")
        port   = self.config.get("port", 2375)
        scheme = "https" if self.config.get("use_tls") else "http"
        base_url = f"{scheme}://{host}:{port}"

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                ping = await client.get(f"{base_url}/_ping")
                ping.raise_for_status()

                containers_resp = await client.get(f"{base_url}/containers/json?all=true")
                containers_resp.raise_for_status()
                containers = containers_resp.json()

                # Image-Alter: /images/{imageId}/json für die ersten 20 Container
                image_ages: dict[str, int | None] = {}
                for c in containers[:20]:
                    image_id = c.get("ImageID", "")
                    if image_id and image_id not in image_ages:
                        try:
                            img_resp = await client.get(f"{base_url}/images/{image_id}/json")
                            if img_resp.status_code == 200:
                                image_ages[image_id] = _image_age_days(img_resp.json().get("Created"))
                        except Exception:
                            image_ages[image_id] = None

                running   = [c for c in containers if c.get("State") == "running"]
                exited    = [c for c in containers if c.get("State") == "exited"]
                unhealthy = [c for c in containers if c.get("Status", "").startswith("unhealthy")]

                metrics = {
                    "total":     len(containers),
                    "running":   len(running),
                    "exited":    len(exited),
                    "unhealthy": len(unhealthy),
                    "containers": [
                        {
                            "id":        c["Id"][:12],
                            "name":      c["Names"][0].lstrip("/") if c["Names"] else "unknown",
                            "image":     c["Image"],
                            "state":     c["State"],
                            "status":    c["Status"],
                            "image_age": image_ages.get(c.get("ImageID", "")),
                        }
                        for c in containers[:20]
                    ],
                }

                if unhealthy:
                    status = ConnectorStatus.WARNING
                elif len(exited) > len(running):
                    status = ConnectorStatus.WARNING
                else:
                    status = ConnectorStatus.ONLINE

                return ConnectorResult(status=status, metrics=metrics)

        except httpx.ConnectError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung fehlgeschlagen")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
