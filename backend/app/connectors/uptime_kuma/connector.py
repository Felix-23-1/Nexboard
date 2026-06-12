import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class UptimeKumaConnector(BaseConnector):
    meta = ConnectorMeta(
        type="uptime_kuma",
        label="Uptime Kuma",
        description="Uptime Kuma – Service-Monitoring und Verfügbarkeit",
        icon="activity",
        config_schema={
            "url": {"type": "string", "label": "Uptime Kuma URL (z.B. http://192.168.1.10:3001)", "required": True},
            "api_key": {"type": "string", "label": "API Key", "required": True, "secret": True},
        },
    )

    async def fetch(self) -> ConnectorResult:
        url = self.config.get("url", "").rstrip("/")
        api_key = self.config.get("api_key", "")
        headers = {"Authorization": f"Bearer {api_key}"}

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{url}/api/status-page/heartbeat/default", headers=headers)

                if resp.status_code == 404:
                    resp = await client.get(f"{url}/api/status-page/heartbeat", headers=headers)

                resp.raise_for_status()
                data = resp.json()

                heartbeat_list = data.get("heartbeatList", {})
                monitor_list = data.get("monitorList", {})

                monitors = []
                up = 0
                down = 0
                for monitor_id, heartbeats in heartbeat_list.items():
                    last = heartbeats[-1] if heartbeats else {}
                    monitor_info = monitor_list.get(str(monitor_id), {})
                    is_up = last.get("status") == 1
                    if is_up:
                        up += 1
                    else:
                        down += 1
                    monitors.append({
                        "id": monitor_id,
                        "name": monitor_info.get("name", f"Monitor {monitor_id}"),
                        "up": is_up,
                        "ping": last.get("ping"),
                    })

                metrics = {"total": len(monitors), "up": up, "down": down, "monitors": monitors[:30]}

                if down > 0:
                    status = ConnectorStatus.WARNING if up > 0 else ConnectorStatus.OFFLINE
                else:
                    status = ConnectorStatus.ONLINE

                return ConnectorResult(status=status, metrics=metrics)

        except httpx.ConnectError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung fehlgeschlagen")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
