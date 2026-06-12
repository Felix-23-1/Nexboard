import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class DockerConnector(BaseConnector):
    meta = ConnectorMeta(
        type="docker",
        label="Docker",
        description="Docker Engine – Container Status und Ressourcenverbrauch",
        icon="box",
        config_schema={
            "host": {"type": "string", "label": "Docker Host (IP oder Hostname)", "required": True},
            "port": {"type": "number", "label": "Docker API Port", "default": 2375},
            "use_tls": {"type": "boolean", "label": "TLS verwenden", "default": False},
        },
    )

    async def fetch(self) -> ConnectorResult:
        host = self.config.get("host", "")
        port = self.config.get("port", 2375)
        scheme = "https" if self.config.get("use_tls") else "http"
        base_url = f"{scheme}://{host}:{port}"

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                ping = await client.get(f"{base_url}/_ping")
                ping.raise_for_status()

                containers_resp = await client.get(f"{base_url}/containers/json?all=true")
                containers_resp.raise_for_status()
                containers = containers_resp.json()

                running = [c for c in containers if c.get("State") == "running"]
                exited = [c for c in containers if c.get("State") == "exited"]
                unhealthy = [c for c in containers if c.get("Status", "").startswith("unhealthy")]

                metrics = {
                    "total": len(containers),
                    "running": len(running),
                    "exited": len(exited),
                    "unhealthy": len(unhealthy),
                    "containers": [
                        {
                            "id": c["Id"][:12],
                            "name": c["Names"][0].lstrip("/") if c["Names"] else "unknown",
                            "image": c["Image"],
                            "state": c["State"],
                            "status": c["Status"],
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
