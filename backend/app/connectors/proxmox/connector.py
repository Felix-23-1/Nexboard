import asyncio
import httpx
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


def _pick_best_ip(interfaces: list) -> str | None:
    """Wählt die erste nicht-loopback IPv4-Adresse aus den qemu-agent Interfaces."""
    for iface in interfaces:
        if iface.get("name", "") in ("lo", "lo0"):
            continue
        for addr in iface.get("ip-addresses", []):
            if addr.get("ip-address-type") == "ipv4":
                ip = addr.get("ip-address", "")
                if ip and not ip.startswith("127."):
                    return ip
    return None


class ProxmoxConnector(BaseConnector):
    meta = ConnectorMeta(
        type="proxmox",
        label="Proxmox VE",
        description="Proxmox Virtual Environment – VMs, LXC Container und Node-Metriken",
        icon="server",
        config_schema={
            "host": {"type": "string", "label": "Host (IP oder Hostname)", "required": True},
            "port": {"type": "number", "label": "Port", "default": 8006},
            "username": {"type": "string", "label": "Benutzername (z.B. root@pam)", "required": True},
            "token_name": {"type": "string", "label": "API Token Name", "required": True},
            "token_value": {"type": "string", "label": "API Token Wert", "required": True, "secret": True},
            "verify_ssl": {"type": "boolean", "label": "SSL verifizieren", "default": False},
        },
    )

    async def fetch(self) -> ConnectorResult:
        host = self.config.get("host", "")
        port = self.config.get("port", 8006)
        username = self.config.get("username", "")
        token_name = self.config.get("token_name", "")
        token_value = self.config.get("token_value", "")
        verify_ssl = self.config.get("verify_ssl", False)

        base_url = f"https://{host}:{port}/api2/json"
        headers = {"Authorization": f"PVEAPIToken={username}!{token_name}={token_value}"}

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=10) as client:
                nodes_resp = await client.get(f"{base_url}/nodes", headers=headers)
                nodes_resp.raise_for_status()
                nodes = nodes_resp.json().get("data", [])

                metrics = {
                    "nodes": [],
                    "vms_total": 0,
                    "vms_running": 0,
                    "console_base_url": f"https://{host}:{port}",
                }

                for node in nodes:
                    node_name = node["node"]
                    node_status = node.get("status", "unknown")

                    vms_resp = await client.get(f"{base_url}/nodes/{node_name}/qemu", headers=headers)
                    vms = vms_resp.json().get("data", []) if vms_resp.is_success else []

                    running = sum(1 for v in vms if v.get("status") == "running")
                    metrics["vms_total"] += len(vms)
                    metrics["vms_running"] += running

                    # IPs parallel für alle laufenden VMs abrufen (qemu-agent, best-effort)
                    async def _fetch_ip(vmid: int) -> str | None:
                        try:
                            r = await asyncio.wait_for(
                                client.get(
                                    f"{base_url}/nodes/{node_name}/qemu/{vmid}/agent/network-get-interfaces",
                                    headers=headers,
                                ),
                                timeout=3,
                            )
                            if r.is_success:
                                return _pick_best_ip(r.json().get("data", {}).get("result", []))
                        except Exception:
                            pass
                        return None

                    running_vms = [v for v in vms if v.get("status") == "running"]
                    ip_tasks = [_fetch_ip(v["vmid"]) for v in running_vms]
                    ip_results = await asyncio.gather(*ip_tasks) if ip_tasks else []
                    ip_map = {v["vmid"]: ip for v, ip in zip(running_vms, ip_results)}

                    vms_detail = [
                        {
                            "vmid": v.get("vmid"),
                            "name": v.get("name", f"vm-{v.get('vmid')}"),
                            "status": v.get("status", "unknown"),
                            "cpu": round(v.get("cpu", 0) * 100, 1),
                            "mem_used": v.get("mem", 0),
                            "mem_total": v.get("maxmem", 0),
                            "node": node_name,
                            "ip": ip_map.get(v.get("vmid")),
                        }
                        for v in vms
                    ]

                    metrics["nodes"].append({
                        "name": node_name,
                        "status": node_status,
                        "cpu": round(node.get("cpu", 0) * 100, 1),
                        "mem_used": node.get("mem", 0),
                        "mem_total": node.get("maxmem", 0),
                        "vms": len(vms),
                        "vms_running": running,
                        "vms_detail": vms_detail,
                    })

                status = ConnectorStatus.ONLINE
                if any(n["status"] != "online" for n in metrics["nodes"]):
                    status = ConnectorStatus.WARNING

                return ConnectorResult(status=status, metrics=metrics)

        except httpx.ConnectError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung fehlgeschlagen")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
