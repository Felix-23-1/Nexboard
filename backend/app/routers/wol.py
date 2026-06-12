"""Wake-on-LAN – Magic Packet Sender."""
import socket

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import ConnectorConfig, User

router = APIRouter(prefix="/wol", tags=["wol"])


def _send_magic_packet(mac: str, broadcast: str = "255.255.255.255", port: int = 9) -> None:
    """Sendet einen Magic Packet (Wake-on-LAN) an die angegebene MAC-Adresse."""
    mac_clean = mac.replace(":", "").replace("-", "").replace(".", "")
    if len(mac_clean) != 12:
        raise ValueError(f"Ungültige MAC-Adresse: {mac}")
    try:
        mac_bytes = bytes.fromhex(mac_clean)
    except ValueError:
        raise ValueError(f"Ungültige MAC-Adresse (kein Hex): {mac}")

    magic = b"\xff" * 6 + mac_bytes * 16

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.settimeout(3)
        sock.sendto(magic, (broadcast, port))


@router.post("/{connector_id}/wake")
async def wake_device(
    connector_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sendet einen Magic Packet an das konfigurierte Gerät."""
    connector = await db.get(ConnectorConfig, connector_id)
    if not connector or connector.type != "wol" or connector.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="WOL-Connector nicht gefunden")

    mac       = connector.config.get("mac", "")
    broadcast = connector.config.get("broadcast", "255.255.255.255")
    port      = int(connector.config.get("port", 9))

    if not mac:
        raise HTTPException(status_code=400, detail="Keine MAC-Adresse konfiguriert")

    try:
        _send_magic_packet(mac, broadcast, port)
        return {"ok": True, "mac": mac, "broadcast": broadcast, "port": port}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except OSError as e:
        raise HTTPException(status_code=503, detail=f"Netzwerkfehler: {e}")
