import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class GrafanaConnector(BaseConnector):
    meta = ConnectorMeta(
        type="grafana",
        label="Grafana",
        description="Grafana – Dashboards, Datasources, Alert-Regeln und Instanz-Gesundheit",
        icon="bar-chart",
        config_schema={
            "url":     {"type": "string", "label": "Grafana URL", "required": True,
                        "help": "z.B. http://192.168.1.10:3000"},
            "api_key": {"type": "string", "label": "Service Account Token", "required": True, "secret": True,
                        "help": "Grafana → Administration → Service Accounts → Token erstellen"},
        },
    )

    async def fetch(self) -> ConnectorResult:
        url     = self.config.get("url", "").rstrip("/")
        api_key = self.config.get("api_key", "")
        if not url or not api_key:
            return ConnectorResult(status=ConnectorStatus.ERROR, error="URL und API Key erforderlich")

        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                # Health-Check zuerst
                health_r = await client.get(f"{url}/api/health", headers=headers)
                if not health_r.is_success:
                    return ConnectorResult(
                        status=ConnectorStatus.OFFLINE,
                        error=f"Grafana antwortet nicht (HTTP {health_r.status_code})",
                    )

                health = health_r.json()
                db_ok  = health.get("database") == "ok"

                import asyncio
                ds_r, dash_r, alerts_r = await asyncio.gather(
                    client.get(f"{url}/api/datasources", headers=headers),
                    client.get(f"{url}/api/search?type=dash-db&limit=500", headers=headers),
                    client.get(f"{url}/api/alerts?limit=100", headers=headers),
                )

                datasources = ds_r.json() if ds_r.is_success else []
                dashboards  = dash_r.json() if dash_r.is_success else []
                alerts_raw  = alerts_r.json() if alerts_r.is_success else []

                # Alerts können ein Objekt oder eine Liste sein (Grafana Version abhängig)
                if isinstance(alerts_raw, dict):
                    alerts_raw = []

                firing_alerts = [a for a in alerts_raw if a.get("state") in ("alerting", "pending")]

                ds_list = [
                    {
                        "name":   d.get("name"),
                        "type":   d.get("type"),
                        "url":    d.get("url"),
                        "access": d.get("access"),
                    }
                    for d in (datasources if isinstance(datasources, list) else [])
                ]

                metrics = {
                    "version":           health.get("version"),
                    "database_ok":       db_ok,
                    "datasources_total": len(ds_list),
                    "dashboards_total":  len(dashboards),
                    "alerts_total":      len(alerts_raw),
                    "alerts_firing":     len(firing_alerts),
                    "datasources":       ds_list[:10],
                    "firing_alert_names": [a.get("name") for a in firing_alerts[:5]],
                }

                if not db_ok:
                    status = ConnectorStatus.ERROR
                elif firing_alerts:
                    status = ConnectorStatus.WARNING
                else:
                    status = ConnectorStatus.ONLINE

                return ConnectorResult(status=status, metrics=metrics)

        except httpx.ConnectError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung zu Grafana fehlgeschlagen")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                return ConnectorResult(status=ConnectorStatus.ERROR, error="API Token ungültig")
            return ConnectorResult(status=ConnectorStatus.ERROR, error=f"HTTP {e.response.status_code}")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
