import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class PfSenseConnector(BaseConnector):
    meta = ConnectorMeta(
        type="pfsense",
        label="pfSense",
        description="pfSense Firewall – System-Status, Interfaces und Gateway-Übersicht",
        icon="network",
        config_schema={
            "host": {"type": "string", "label": "pfSense Host (IP oder Hostname)", "required": True},
            "api_key": {"type": "string", "label": "API Client ID (pfsense-api)", "required": True},
            "api_secret": {"type": "string", "label": "API Client Secret", "required": True, "secret": True},
            "verify_ssl": {"type": "boolean", "label": "SSL verifizieren", "default": False},
        },
    )

    async def fetch(self) -> ConnectorResult:
        host = self.config.get("host", "").rstrip("/")
        api_key = self.config.get("api_key", "")
        api_secret = self.config.get("api_secret", "")
        verify_ssl = self.config.get("verify_ssl", False)
        base_url = f"https://{host}/api/v1"
        headers = {"Authorization": f"{api_key} {api_secret}"}

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=10) as client:
                sys_resp = await client.get(f"{base_url}/system/status", headers=headers)
                sys_resp.raise_for_status()
                sys_data = sys_resp.json().get("data", {})

                iface_resp = await client.get(f"{base_url}/interface", headers=headers)
                gw_resp = await client.get(f"{base_url}/routing/gateway", headers=headers)

                interfaces = iface_resp.json().get("data", []) if iface_resp.is_success else []
                gateways = gw_resp.json().get("data", []) if gw_resp.is_success else []

                gw_down = [g for g in gateways if g.get("monitor_disable") is False and g.get("timedout") is True]

                metrics = {
                    "version": sys_data.get("pfsense_version", {}).get("version", "unknown"),
                    "hostname": sys_data.get("hostname", host),
                    "uptime": sys_data.get("system_uptime", "unknown"),
                    "cpu_usage": sys_data.get("cpu_usage", 0),
                    "mem_usage": sys_data.get("mem_usage", 0),
                    "interfaces_total": len(interfaces),
                    "gateways_total": len(gateways),
                    "gateways_down": len(gw_down),
                    "gateways": [
                        {
                            "name": g.get("name"),
                            "gateway": g.get("gateway"),
                            "timedout": g.get("timedout"),
                            "latency": g.get("delay"),
                        }
                        for g in gateways
                    ],
                }

                status = ConnectorStatus.WARNING if gw_down else ConnectorStatus.ONLINE
                return ConnectorResult(status=status, metrics=metrics)

        except httpx.ConnectError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung fehlgeschlagen")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                return ConnectorResult(status=ConnectorStatus.ERROR, error="API Key ungültig – pfsense-api installiert?")
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
