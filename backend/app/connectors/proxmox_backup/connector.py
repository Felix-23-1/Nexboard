import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


def _fmt_bytes(b: int | None) -> str:
    if not b:
        return "0 B"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} PB"


class ProxmoxBackupConnector(BaseConnector):
    meta = ConnectorMeta(
        type="proxmox_backup",
        label="Proxmox Backup Server",
        description="Proxmox Backup Server – Datastores, Backups und Snapshots überwachen",
        icon="archive",
        config_schema={
            "host":        {"type": "string", "label": "Host (IP oder Hostname)", "required": True},
            "port":        {"type": "number", "label": "Port", "default": 8007},
            "username":    {"type": "string", "label": "Benutzername (z.B. admin@pbs)", "required": True},
            "token_name":  {"type": "string", "label": "API Token Name", "required": True},
            "token_value": {"type": "string", "label": "API Token Wert", "required": True, "secret": True},
            "verify_ssl":  {"type": "boolean", "label": "SSL verifizieren", "default": False},
        },
    )

    async def fetch(self) -> ConnectorResult:
        host       = self.config.get("host", "")
        port       = self.config.get("port", 8007)
        username   = self.config.get("username", "")
        token_name = self.config.get("token_name", "")
        token_val  = self.config.get("token_value", "")
        verify_ssl = self.config.get("verify_ssl", False)

        base    = f"https://{host}:{port}/api2/json"
        headers = {"Authorization": f"PBSAPIToken={username}!{token_name}={token_val}"}

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=10) as client:
                ds_r   = await client.get(f"{base}/admin/datastore", headers=headers)
                node_r = await client.get(f"{base}/nodes", headers=headers)
                ds_r.raise_for_status()

                datastores = ds_r.json().get("data", [])
                nodes      = node_r.json().get("data", []) if node_r.is_success else []

                ds_metrics = []
                total_used  = 0
                total_avail = 0
                for ds in datastores:
                    used  = ds.get("used", 0) or 0
                    avail = ds.get("avail", 0) or 0
                    total = used + avail
                    total_used  += used
                    total_avail += avail
                    ds_metrics.append({
                        "name":        ds.get("store", "?"),
                        "used_bytes":  used,
                        "avail_bytes": avail,
                        "total_bytes": total,
                        "used_pct":    round(used / total * 100, 1) if total else 0,
                        "gc_status":   ds.get("gc-status", {}).get("upid"),
                    })

                node_metrics = [
                    {
                        "name":       n.get("id", "?"),
                        "status":     n.get("status", "unknown"),
                        "cpu":        round(n.get("cpu", 0) * 100, 1),
                        "mem_used":   n.get("mem", 0),
                        "mem_total":  n.get("maxmem", 0),
                    }
                    for n in nodes
                ]

                any_offline = any(n["status"] != "online" for n in node_metrics)
                high_usage  = any(d["used_pct"] > 90 for d in ds_metrics)

                status = (
                    ConnectorStatus.WARNING if (any_offline or high_usage)
                    else ConnectorStatus.ONLINE
                )

                return ConnectorResult(status=status, metrics={
                    "datastores":        ds_metrics,
                    "datastores_total":  len(datastores),
                    "total_used_bytes":  total_used,
                    "total_avail_bytes": total_avail,
                    "nodes":             node_metrics,
                })

        except httpx.ConnectError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung zu PBS fehlgeschlagen")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                return ConnectorResult(status=ConnectorStatus.ERROR, error="API Token ungültig")
            return ConnectorResult(status=ConnectorStatus.ERROR, error=f"HTTP {e.response.status_code}")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
