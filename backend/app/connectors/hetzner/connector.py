import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class HetznerConnector(BaseConnector):
    meta = ConnectorMeta(
        type="hetzner",
        label="Hetzner Cloud",
        description="Hetzner Cloud – Server, Floating IPs und Volumes überwachen",
        icon="cloud",
        config_schema={
            "api_token": {
                "type": "string", "label": "API Token", "required": True, "secret": True,
                "help": "Hetzner Cloud Console → Projekt → API Tokens → Token erstellen (Read-Only reicht)",
            },
        },
    )

    async def fetch(self) -> ConnectorResult:
        token = self.config.get("api_token", "")
        if not token:
            return ConnectorResult(status=ConnectorStatus.ERROR, error="Kein API Token konfiguriert")

        headers = {"Authorization": f"Bearer {token}"}
        base = "https://api.hetzner.cloud/v1"

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                servers_r, volumes_r, ips_r = await __import__("asyncio").gather(
                    client.get(f"{base}/servers", headers=headers),
                    client.get(f"{base}/volumes", headers=headers),
                    client.get(f"{base}/floating_ips", headers=headers),
                )
                servers_r.raise_for_status()

                servers = servers_r.json().get("servers", [])
                volumes = volumes_r.json().get("volumes", []) if volumes_r.is_success else []
                floating_ips = ips_r.json().get("floating_ips", []) if ips_r.is_success else []

                running  = [s for s in servers if s.get("status") == "running"]
                stopped  = [s for s in servers if s.get("status") in ("off", "stopped")]
                errored  = [s for s in servers if s.get("status") in ("error", "rebuilding", "migrating")]

                metrics = {
                    "servers_total":   len(servers),
                    "servers_running": len(running),
                    "servers_stopped": len(stopped),
                    "servers_error":   len(errored),
                    "volumes_total":   len(volumes),
                    "floating_ips":    len(floating_ips),
                    "servers": [
                        {
                            "id":         s["id"],
                            "name":       s["name"],
                            "status":     s["status"],
                            "type":       s.get("server_type", {}).get("name", "?"),
                            "location":   s.get("datacenter", {}).get("location", {}).get("name", "?"),
                            "ipv4":       s.get("public_net", {}).get("ipv4", {}).get("ip"),
                            "cores":      s.get("server_type", {}).get("cores"),
                            "memory_gb":  s.get("server_type", {}).get("memory"),
                            "disk_gb":    s.get("server_type", {}).get("disk"),
                        }
                        for s in servers
                    ],
                }

                if errored:
                    status = ConnectorStatus.ERROR
                elif stopped:
                    status = ConnectorStatus.WARNING
                else:
                    status = ConnectorStatus.ONLINE

                return ConnectorResult(status=status, metrics=metrics)

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                return ConnectorResult(status=ConnectorStatus.ERROR, error="API Token ungültig")
            return ConnectorResult(status=ConnectorStatus.ERROR, error=f"HTTP {e.response.status_code}")
        except httpx.ConnectError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung zu Hetzner API fehlgeschlagen")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
