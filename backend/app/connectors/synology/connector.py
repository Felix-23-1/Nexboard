import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class SynologyConnector(BaseConnector):
    meta = ConnectorMeta(
        type="synology",
        label="Synology NAS",
        description="Synology DiskStation Manager – Storage, Volumes und System-Status",
        icon="hard-drive",
        config_schema={
            "host": {"type": "string", "label": "Host (IP oder Hostname)", "required": True},
            "port": {"type": "number", "label": "Port", "default": 5001},
            "username": {"type": "string", "label": "Benutzername", "required": True},
            "password": {"type": "string", "label": "Passwort", "required": True, "secret": True},
            "use_https": {"type": "boolean", "label": "HTTPS verwenden", "default": True},
            "verify_ssl": {"type": "boolean", "label": "SSL verifizieren", "default": False},
        },
    )

    async def fetch(self) -> ConnectorResult:
        host = self.config.get("host", "")
        port = self.config.get("port", 5001)
        username = self.config.get("username", "")
        password = self.config.get("password", "")
        use_https = self.config.get("use_https", True)
        verify_ssl = self.config.get("verify_ssl", False)
        scheme = "https" if use_https else "http"
        base_url = f"{scheme}://{host}:{port}/webapi"

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=10) as client:
                login_resp = await client.get(
                    f"{base_url}/auth.cgi",
                    params={
                        "api": "SYNO.API.Auth",
                        "version": "3",
                        "method": "login",
                        "account": username,
                        "passwd": password,
                        "session": "nexboard",
                        "format": "sid",
                    },
                )
                login_resp.raise_for_status()
                login_data = login_resp.json()

                if not login_data.get("success"):
                    code = login_data.get("error", {}).get("code", "unknown")
                    return ConnectorResult(status=ConnectorStatus.ERROR, error=f"Login fehlgeschlagen (Code {code})")

                sid = login_data["data"]["sid"]
                params_base = {"_sid": sid}

                sys_resp = await client.get(
                    f"{base_url}/entry.cgi",
                    params={**params_base, "api": "SYNO.Core.System", "version": "1", "method": "info"},
                )
                storage_resp = await client.get(
                    f"{base_url}/entry.cgi",
                    params={**params_base, "api": "SYNO.Storage.CGI.Storage", "version": "1", "method": "load_info"},
                )

                sys_info = sys_resp.json().get("data", {}) if sys_resp.is_success else {}
                storage_data = storage_resp.json().get("data", {}) if storage_resp.is_success else {}

                volumes = storage_data.get("volumes", [])
                degraded = [v for v in volumes if v.get("status") not in ("normal",)]

                metrics = {
                    "model": sys_info.get("model", "Synology NAS"),
                    "ram": sys_info.get("ram_size", 0),
                    "cpu_cores": sys_info.get("cpu_cores", 0),
                    "volumes_total": len(volumes),
                    "volumes_degraded": len(degraded),
                    "volumes": [
                        {
                            "id": v.get("vol_path"),
                            "status": v.get("status"),
                            "size_total": v.get("size", {}).get("total", 0),
                            "size_used": v.get("size", {}).get("used", 0),
                        }
                        for v in volumes
                    ],
                }

                await client.get(
                    f"{base_url}/auth.cgi",
                    params={**params_base, "api": "SYNO.API.Auth", "version": "1", "method": "logout"},
                )

                status = ConnectorStatus.WARNING if degraded else ConnectorStatus.ONLINE
                return ConnectorResult(status=status, metrics=metrics)

        except httpx.ConnectError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung fehlgeschlagen")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
