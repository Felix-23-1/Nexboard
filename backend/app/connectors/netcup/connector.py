"""Netcup SCP REST API Connector.

Die alte WSEndUser-API wurde von Netcup abgeschaltet (gibt 404).
Die neue REST-API nutzt Bearer-Token-Authentifizierung.

Token erstellen:
  1. servercontrolpanel.de einloggen
  2. Oben rechts: REST-API Doku → Authorize
  3. Token kopieren und hier eintragen

API-URL steht ebenfalls in der REST-API Doku im SCP.
Standard ist: https://www.servercontrolpanel.de/SCP/api/v1
"""
import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus

_DEFAULT_BASE = "https://www.servercontrolpanel.de/SCP/api/v1"


class NetcupConnector(BaseConnector):
    meta = ConnectorMeta(
        type="netcup",
        label="Netcup",
        description="Netcup SCP – vServer-Liste und Status überwachen",
        icon="server",
        config_schema={
            "api_token": {
                "type": "string",
                "label": "SCP API-Token (Bearer)",
                "required": True,
                "secret": True,
                "placeholder": "eyJ... oder langer Hex-String",
                "hint": "SCP → oben rechts → REST-API Doku → Authorize → Token kopieren",
            },
            "api_base_url": {
                "type": "string",
                "label": "API Base-URL (aus SCP REST-Doku)",
                "required": False,
                "placeholder": "https://www.servercontrolpanel.de/SCP/api/v1",
                "hint": "Nur ändern wenn die SCP-Doku eine andere URL zeigt",
            },
        },
    )

    async def fetch(self) -> ConnectorResult:
        token    = self.config.get("api_token", "").strip()
        base_url = (self.config.get("api_base_url") or _DEFAULT_BASE).rstrip("/")

        if not token:
            return ConnectorResult(
                status=ConnectorStatus.ERROR,
                error=(
                    "Kein API-Token. Im SCP erstellen: "
                    "servercontrolpanel.de → oben rechts → REST-API Doku → Authorize"
                ),
            )

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(f"{base_url}/vservers", headers=headers)

                if r.status_code == 401:
                    return ConnectorResult(
                        status=ConnectorStatus.ERROR,
                        error="401 – Token ungültig oder abgelaufen. Neuen Token im SCP erstellen.",
                    )
                if r.status_code == 404:
                    return ConnectorResult(
                        status=ConnectorStatus.ERROR,
                        error=(
                            f"404 – Endpunkt nicht gefunden ({base_url}/vservers). "
                            "Prüfe die API-URL in der SCP REST-Doku und trage sie im Connector ein."
                        ),
                    )

                r.raise_for_status()

                try:
                    data = r.json()
                except Exception:
                    return ConnectorResult(
                        status=ConnectorStatus.ERROR,
                        error=f"Keine gültige JSON-Antwort (Status {r.status_code}): {r.text[:200]}",
                    )

                vservers = data if isinstance(data, list) else data.get("data", data.get("vservers", []))

                servers = []
                for vs in vservers:
                    servers.append({
                        "name":   vs.get("name") or vs.get("vservername", "unbekannt"),
                        "status": vs.get("status", "unknown"),
                        "ipv4":   vs.get("ipv4") or vs.get("ipv4address"),
                        "ipv6":   vs.get("ipv6") or vs.get("ipv6address"),
                    })

                running = [s for s in servers if s["status"] in ("on", "running", "started")]
                stopped = [s for s in servers if s["status"] in ("off", "stopped", "shutdown")]

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
                error=f"Verbindung zu {base_url} fehlgeschlagen.",
            )
        except httpx.HTTPStatusError as e:
            return ConnectorResult(
                status=ConnectorStatus.ERROR,
                error=f"HTTP {e.response.status_code}: {e.response.text[:200]}",
            )
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
