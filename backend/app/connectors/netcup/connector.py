"""Netcup CCP Webservice Connector.
Nutzt die Netcup CCP API (Customer Control Panel).
Credentials: CCP → Stammdaten → API
"""
import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus

# Korrekte CCP-API-URL (nicht die alte SCP/WSEndUser die 404 gibt)
_CCP_URL = "https://ccp.netcup.net/run/webservice/servers/endpoint.php"


def _call(action: str, params: dict) -> dict:
    return {"action": action, "param": params}


class NetcupConnector(BaseConnector):
    meta = ConnectorMeta(
        type="netcup",
        label="Netcup",
        description="Netcup – vServer-Liste, Status und Traffic überwachen",
        icon="server",
        config_schema={
            "customer_id": {
                "type": "string",
                "label": "Kundennummer",
                "required": True,
                "placeholder": "123456",
            },
            "api_key": {
                "type": "string",
                "label": "API Key",
                "required": True,
                "secret": True,
                "hint": "CCP → Stammdaten → API → API Key",
            },
            "api_password": {
                "type": "string",
                "label": "API Passwort",
                "required": True,
                "secret": True,
                "hint": "CCP → Stammdaten → API → API Passwort",
            },
        },
    )

    async def fetch(self) -> ConnectorResult:
        customer_id  = str(self.config.get("customer_id", "")).strip()
        api_key      = self.config.get("api_key", "").strip()
        api_password = self.config.get("api_password", "").strip()

        if not customer_id or not api_key or not api_password:
            return ConnectorResult(
                status=ConnectorStatus.ERROR,
                error="Kundennummer, API Key und API Passwort erforderlich.",
            )

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # 1. Login
                login_r = await client.post(_CCP_URL, json=_call("login", {
                    "customernumber": customer_id,
                    "apikey":         api_key,
                    "apipassword":    api_password,
                }))
                login_r.raise_for_status()
                try:
                    login_data = login_r.json()
                except Exception:
                    return ConnectorResult(
                        status=ConnectorStatus.ERROR,
                        error=f"Netcup API hat keine gültige JSON-Antwort geliefert. Status: {login_r.status_code}, Body: {login_r.text[:200]}",
                    )

                if login_data.get("status") != "success":
                    msg = login_data.get("longmessage") or login_data.get("shortmessage", "Login fehlgeschlagen")
                    return ConnectorResult(status=ConnectorStatus.ERROR, error=f"Login: {msg}")

                session_id = login_data.get("responsedata", {}).get("apisessionid")
                if not session_id:
                    return ConnectorResult(status=ConnectorStatus.ERROR, error="Kein Session-Token erhalten.")

                # 2. vServer-Liste
                vs_r = await client.post(_CCP_URL, json=_call("getVServers", {
                    "customernumber": customer_id,
                    "apikey":         api_key,
                    "apisessionid":   session_id,
                }))
                try:
                    vs_data = vs_r.json() if vs_r.is_success else {}
                except Exception:
                    vs_data = {}
                vserver_names = vs_data.get("responsedata", []) or []

                servers = []
                for name in vserver_names[:20]:
                    info_r = await client.post(_CCP_URL, json=_call("getVServerInformation", {
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
                await client.post(_CCP_URL, json=_call("logout", {
                    "customernumber": customer_id,
                    "apikey":         api_key,
                    "apisessionid":   session_id,
                }))

                running = [s for s in servers if s["status"] == "on"]
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
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung zu Netcup fehlgeschlagen.")
        except httpx.HTTPStatusError as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=f"HTTP {e.response.status_code}")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
