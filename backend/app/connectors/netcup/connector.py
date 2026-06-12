"""Netcup SCP (Server Control Panel) Connector.
Nutzt die neue Netcup SCP REST API.
API-Token im SCP erstellen: SCP → oben rechts → REST-API Doku
"""
import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus

# Netcup hat die alte WSEndUser-API abgeschaltet.
# Die neue REST-API läuft unter diesem Basis-URL.
_SCP_BASE = "https://www.servercontrolpanel.de/SCP/api/v1"


class NetcupConnector(BaseConnector):
    meta = ConnectorMeta(
        type="netcup",
        label="Netcup",
        description="Netcup SCP – vServer-Liste, Status und Traffic überwachen",
        icon="server",
        config_schema={
            "api_token": {
                "type": "string",
                "label": "SCP API-Token",
                "required": True,
                "secret": True,
                "placeholder": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                "hint": (
                    "Im SCP erstellen: oben rechts → REST-API Doku → "
                    "Authorize. Token hat die Form eines langen Hex-Strings."
                ),
            },
        },
    )

    async def fetch(self) -> ConnectorResult:
        token = self.config.get("api_token", "").strip()

        if not token:
            return ConnectorResult(
                status=ConnectorStatus.ERROR,
                error="SCP API-Token fehlt. Im Netcup SCP erstellen: oben rechts → REST-API Doku.",
            )

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # vServer-Liste abrufen
                r = await client.get(f"{_SCP_BASE}/vservers", headers=headers)

                if r.status_code == 401:
                    return ConnectorResult(
                        status=ConnectorStatus.ERROR,
                        error="401 – API-Token ungültig oder abgelaufen. Neuen Token im SCP erstellen.",
                    )
                if r.status_code == 404:
                    return ConnectorResult(
                        status=ConnectorStatus.ERROR,
                        error=(
                            "404 – API-Endpunkt nicht gefunden. "
                            "Netcup hat die API-URL möglicherweise geändert. "
                            "Aktuelle Doku: SCP → oben rechts → REST-API Doku."
                        ),
                    )

                r.raise_for_status()
                vservers = r.json() if isinstance(r.json(), list) else r.json().get("data", [])

                servers = []
                for vs in vservers:
                    name   = vs.get("name") or vs.get("vservername", "unbekannt")
                    status = vs.get("status", "unknown")
                    servers.append({
                        "name":   name,
                        "status": status,
                        "ipv4":   vs.get("ipv4address") or vs.get("ipv4"),
                        "ipv6":   vs.get("ipv6address") or vs.get("ipv6"),
                    })

                running = [s for s in servers if s["status"] in ("on", "running")]
                stopped = [s for s in servers if s["status"] in ("off", "stopped")]

                return ConnectorResult(
                    status=ConnectorStatus.WARNING if stopped else ConnectorStatus.ONLINE,
                    metrics={
                        "servers_total":   len(servers),
                        "servers_running": len(running),
                        "servers_stopped": len(stopped),
                        "servers":         servers,
                    },
                )

        except httpx.ConnectError:
            return ConnectorResult(
                status=ConnectorStatus.OFFLINE,
                error="Verbindung zu Netcup SCP fehlgeschlagen.",
            )
        except httpx.HTTPStatusError as e:
            return ConnectorResult(
                status=ConnectorStatus.ERROR,
                error=f"HTTP {e.response.status_code}: {e.response.text[:300]}",
            )
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
