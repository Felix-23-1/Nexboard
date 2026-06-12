"""Wake-on-LAN Connector.

Prüft via Ping ob ein Gerät erreichbar ist.
Das tatsächliche Wake-Up-Paket (Magic Packet) wird über den
separaten Endpoint /api/wol/{id}/wake gesendet.
"""
import asyncio
import sys

from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class WolConnector(BaseConnector):
    meta = ConnectorMeta(
        type="wol",
        label="Wake-on-LAN",
        description="Überwacht ob ein Gerät online ist und weckt es per Magic Packet.",
        icon="zap",
        config_schema={
            "name":      {"type": "string",  "label": "Gerätename",             "required": True},
            "host":      {"type": "string",  "label": "IP-Adresse / Hostname",  "required": True},
            "mac":       {"type": "string",  "label": "MAC-Adresse (AA:BB:CC:DD:EE:FF)", "required": True},
            "broadcast": {"type": "string",  "label": "Broadcast-Adresse",      "default": "255.255.255.255"},
            "port":      {"type": "number",  "label": "WOL UDP-Port",           "default": 9},
        },
    )

    async def fetch(self) -> ConnectorResult:
        host = self.config.get("host", "")
        mac  = self.config.get("mac",  "")

        if not host:
            return ConnectorResult(
                status=ConnectorStatus.ERROR,
                error="Keine IP-Adresse konfiguriert",
            )

        online = await _ping(host)
        return ConnectorResult(
            status=ConnectorStatus.ONLINE if online else ConnectorStatus.OFFLINE,
            metrics={
                "host":   host,
                "mac":    mac,
                "online": online,
            },
        )


async def _ping(host: str, timeout: float = 2.0) -> bool:
    """Schneller ICMP-Ping via subprocess."""
    flag = "-n" if sys.platform == "win32" else "-c"
    wait = ["-w", "2000"] if sys.platform == "win32" else ["-W", "2"]
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", flag, "1", *wait, host,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=timeout + 1)
        return proc.returncode == 0
    except Exception:
        return False
