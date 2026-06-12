"""Netcup SCP (Server Control Panel) Connector.
Nutzt die Netcup SCP Webservice API (JSON/SOAP-ähnlich) um vServer abzufragen.
API-Doku: https://www.netcup-wiki.de/wiki/SCP_Webservice
"""
import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus

_SCP_URL = "https://www.servercontrolpanel.de/SCP/WSEndUser"


def _call(action: str, params: dict) -> dict:
    """Baut einen SCP-Webservice-Request-Body."""
    return {"action": action, "param": params}


class NetcupConnector(BaseConnector):
    meta = ConnectorMeta(
        type="netcup",
        label="Netcup",
        description="Netcup SCP – vServer-Liste, Status und Traffic überwachen",
        icon="server",
        config_schema={
            "customer_id": {
                "type": "string", "label": "Kundennummer", "required": True,
                "help": "Deine Netcup-Kundennummer (z.B. 123456)",
            },
            "api_key": {
                "type": "string", "label": "API Key", "required": True, "secret": True,
                "help": "Netcup CCP → Stammdaten → API → API Key",
            },
            "api_password": {
                "type": "string", "label": "API Passwort", "required": True, "secret": True,
                "help": "Netcup CCP → Stammdaten → API → API Passwort",
            },
        },
    )

    async def fetch(self) -> ConnectorResult:
        customer_id  = str(self.config.get("customer_id", ""))
        api_key      = self.config.get("api_key", "")
        api_password = self.config.get("api_password", "")

        if not customer_id or not api_key or not api_password:
            return ConnectorResult(status=ConnectorStatus.ERROR, error="Kundennummer, API Key und API Passwort erforderlich")

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # 1. Login
                login_r = await client.post(_SCP_URL, json=_call("login", {
                    "customernumber": customer_id,
                    "apikey":         api_key,
                    "apipassword":    api_password,
                }))
                login_r.raise_for_status()
                login_data = login_r.json()

                if login_data.get("status") != "success":
                    msg = login_data.get("longmessage") or login_data.get("shortmessage", "Login fehlgeschlagen")
                    return ConnectorResult(status=ConnectorStatus.ERROR, error=msg)

                session_id = login_data["responsedata"]["apisessionid"]

                # 2. vServer-Liste
                vservers_r = await client.post(_SCP_URL, json=_call("getVServers", {
                    "customernumber": customer_id,
                    "apikey":         api_key,
                    "apisessionid":   session_id,
                }))
                vservers_data = vservers_r.json() if vservers_r.is_success else {}
                vserver_names = vservers_data.get("responsedata", []) or []

                servers = []
                for name in vserver_names[:20]:  # max 20 parallel
                    info_r = await client.post(_SCP_URL, json=_call("getVServerInformation", {
                        "customernumber": customer_id,
                        "apikey":         api_key,
                        "apisessionid":   session_id,
                        "vservername":    name,
                    }))
                    if info_r.is_success:
                        info = info_r.json().get("responsedata", {})
                        servers.append({
                            "name":      name,
                            "status":    info.get("vserverstatus", "unknown"),
                            "ipv4":      info.get("ipv4address"),
                            "ipv6":      info.get("ipv6address"),
                            "memory_mb": info.get("memory"),
                            "cores":     info.get("cpucores"),
                            "disk_gb":   info.get("harddisk"),
                        })

                # 3. Logout
                await client.post(_SCP_URL, json=_call("logout", {
                    "customernumber": customer_id,
                    "apikey":         api_key,
                    "apisessionid":   session_id,
                }))

                running = [s for s in servers if s["status"] == "on"]
                stopped = [s for s in servers if s["status"] in ("off", "stopped")]

                status = ConnectorStatus.WARNING if stopped else ConnectorStatus.ONLINE
                if not servers:
                    status = ConnectorStatus.ONLINE

                return ConnectorResult(status=status, metrics={
                    "servers_total":   len(servers),
                    "servers_running": len(running),
                    "servers_stopped": len(stopped),
                    "servers":         servers,
                })

        except httpx.ConnectError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung zu Netcup SCP fehlgeschlagen")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
