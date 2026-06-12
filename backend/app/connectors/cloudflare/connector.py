import asyncio
import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class CloudflareConnector(BaseConnector):
    meta = ConnectorMeta(
        type="cloudflare",
        label="Cloudflare",
        description="Cloudflare – Zones, DNS, Requests, Threats und Tunnel-Status",
        icon="shield",
        config_schema={
            "api_token": {
                "type": "string", "label": "API Token", "required": True, "secret": True,
                "help": "Cloudflare Dashboard → My Profile → API Tokens → Token mit Zone:Read, Analytics:Read",
            },
            "account_id": {
                "type": "string", "label": "Account ID (optional)",
                "help": "Für Tunnel-Status benötigt. Cloudflare Dashboard → Rechte Seite",
            },
        },
    )

    async def fetch(self) -> ConnectorResult:
        token      = self.config.get("api_token", "")
        account_id = self.config.get("account_id", "")
        if not token:
            return ConnectorResult(status=ConnectorStatus.ERROR, error="Kein API Token konfiguriert")

        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        base    = "https://api.cloudflare.com/client/v4"

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                zones_r = await client.get(f"{base}/zones?per_page=50", headers=headers)
                zones_r.raise_for_status()
                zones   = zones_r.json().get("result", [])

                active   = [z for z in zones if z.get("status") == "active"]
                inactive = [z for z in zones if z.get("status") != "active"]

                # Tunnel-Status (nur wenn account_id gesetzt)
                tunnels = []
                if account_id:
                    tun_r = await client.get(
                        f"{base}/accounts/{account_id}/cfd_tunnel?is_deleted=false",
                        headers=headers,
                    )
                    if tun_r.is_success:
                        tunnels = tun_r.json().get("result", [])

                healthy_tunnels  = [t for t in tunnels if t.get("status") == "healthy"]
                degraded_tunnels = [t for t in tunnels if t.get("status") != "healthy"]

                zone_list = [
                    {
                        "name":         z.get("name"),
                        "status":       z.get("status"),
                        "plan":         z.get("plan", {}).get("name"),
                        "name_servers": z.get("name_servers", [])[:2],
                    }
                    for z in zones
                ]

                tunnel_list = [
                    {
                        "name":   t.get("name"),
                        "status": t.get("status"),
                        "id":     t.get("id"),
                    }
                    for t in tunnels
                ]

                metrics = {
                    "zones_total":       len(zones),
                    "zones_active":      len(active),
                    "zones_inactive":    len(inactive),
                    "tunnels_total":     len(tunnels),
                    "tunnels_healthy":   len(healthy_tunnels),
                    "tunnels_degraded":  len(degraded_tunnels),
                    "zones":   zone_list,
                    "tunnels": tunnel_list,
                }

                if inactive or degraded_tunnels:
                    status = ConnectorStatus.WARNING
                else:
                    status = ConnectorStatus.ONLINE

                return ConnectorResult(status=status, metrics=metrics)

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 403:
                return ConnectorResult(status=ConnectorStatus.ERROR, error="API Token hat keine Berechtigung")
            if e.response.status_code == 401:
                return ConnectorResult(status=ConnectorStatus.ERROR, error="API Token ungültig")
            return ConnectorResult(status=ConnectorStatus.ERROR, error=f"HTTP {e.response.status_code}")
        except httpx.ConnectError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung zu Cloudflare API fehlgeschlagen")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
