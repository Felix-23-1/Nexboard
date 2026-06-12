import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class UnifiConnector(BaseConnector):
    meta = ConnectorMeta(
        type="unifi",
        label="Unifi",
        description="Unifi Network Application – Geräte, Clients und Access Points",
        icon="network",
        config_schema={
            "host": {"type": "string", "label": "Controller Host (IP oder Hostname)", "required": True},
            "port": {"type": "number", "label": "Port", "default": 8443},
            "username": {"type": "string", "label": "Benutzername", "required": True},
            "password": {"type": "string", "label": "Passwort", "required": True, "secret": True},
            "site": {"type": "string", "label": "Site Name", "default": "default"},
            "verify_ssl": {"type": "boolean", "label": "SSL verifizieren", "default": False},
        },
    )

    async def fetch(self) -> ConnectorResult:
        host = self.config.get("host", "")
        port = self.config.get("port", 8443)
        username = self.config.get("username", "")
        password = self.config.get("password", "")
        site = self.config.get("site", "default")
        verify_ssl = self.config.get("verify_ssl", False)
        base_url = f"https://{host}:{port}"

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=15) as client:
                login = await client.post(
                    f"{base_url}/api/login",
                    json={"username": username, "password": password},
                )
                login.raise_for_status()

                devices_resp = await client.get(f"{base_url}/api/s/{site}/stat/device")
                clients_resp = await client.get(f"{base_url}/api/s/{site}/stat/sta")

                devices = devices_resp.json().get("data", []) if devices_resp.is_success else []
                clients = clients_resp.json().get("data", []) if clients_resp.is_success else []

                aps = [d for d in devices if d.get("type") == "uap"]
                switches = [d for d in devices if d.get("type") == "usw"]
                gateways = [d for d in devices if d.get("type") == "ugw"]
                disconnected = [d for d in devices if d.get("state") != 1]

                metrics = {
                    "devices_total": len(devices),
                    "devices_disconnected": len(disconnected),
                    "access_points": len(aps),
                    "switches": len(switches),
                    "gateways": len(gateways),
                    "clients_total": len(clients),
                    "devices": [
                        {
                            "name": d.get("name", d.get("mac", "unknown")),
                            "type": d.get("type"),
                            "state": d.get("state"),
                            "ip": d.get("ip"),
                            "model": d.get("model"),
                        }
                        for d in devices[:20]
                    ],
                }

                status = ConnectorStatus.WARNING if disconnected else ConnectorStatus.ONLINE
                return ConnectorResult(status=status, metrics=metrics)

        except httpx.ConnectError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung fehlgeschlagen")
        except httpx.HTTPStatusError as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
