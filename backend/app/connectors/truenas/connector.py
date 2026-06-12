import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class TrueNASConnector(BaseConnector):
    meta = ConnectorMeta(
        type="truenas",
        label="TrueNAS",
        description="TrueNAS SCALE/CORE – Storage, Pools und Disk-Gesundheit",
        icon="hard-drive",
        config_schema={
            "host": {"type": "string", "label": "Host (IP oder Hostname)", "required": True},
            "api_key": {"type": "string", "label": "API Key", "required": True, "secret": True},
            "verify_ssl": {"type": "boolean", "label": "SSL verifizieren", "default": False},
        },
    )

    async def fetch(self) -> ConnectorResult:
        host = self.config.get("host", "").rstrip("/")
        api_key = self.config.get("api_key", "")
        verify_ssl = self.config.get("verify_ssl", False)
        base_url = f"https://{host}/api/v2.0"
        headers = {"Authorization": f"Bearer {api_key}"}

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=10) as client:
                sys_resp = await client.get(f"{base_url}/system/info", headers=headers)
                sys_resp.raise_for_status()
                sys_info = sys_resp.json()

                pool_resp = await client.get(f"{base_url}/pool", headers=headers)
                pools = pool_resp.json() if pool_resp.is_success else []

                disk_resp = await client.get(f"{base_url}/disk", headers=headers)
                disks = disk_resp.json() if disk_resp.is_success else []

                degraded_pools = [p for p in pools if p.get("status") not in ("ONLINE", "HEALTHY")]
                unhealthy_disks = [d for d in disks if d.get("hddstandby") == "ALWAYS" or d.get("togglesmart") is False]

                metrics = {
                    "hostname": sys_info.get("hostname", host),
                    "version": sys_info.get("version", "unknown"),
                    "uptime_seconds": sys_info.get("uptime_seconds", 0),
                    "pools_total": len(pools),
                    "pools_degraded": len(degraded_pools),
                    "disks_total": len(disks),
                    "pools": [
                        {
                            "name": p.get("name"),
                            "status": p.get("status"),
                            "size": p.get("size"),
                            "free": p.get("free"),
                        }
                        for p in pools
                    ],
                }

                if degraded_pools:
                    status = ConnectorStatus.WARNING
                else:
                    status = ConnectorStatus.ONLINE

                return ConnectorResult(status=status, metrics=metrics)

        except httpx.ConnectError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung fehlgeschlagen")
        except httpx.HTTPStatusError as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
