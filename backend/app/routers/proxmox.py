import asyncio
import ssl as ssl_module
from urllib.parse import quote as url_quote

import httpx
import websockets as ws_lib
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import decode_token, get_current_user
from ..database import get_db
from ..models import ConnectorConfig, User

# Router ohne router-weite Auth – jeder Endpunkt authentifiziert selbst.
router = APIRouter(prefix="/proxmox", tags=["proxmox"])

ALLOWED_ACTIONS = {"reboot", "start", "stop", "shutdown"}


class VmActionRequest(BaseModel):
    connector_id: int
    node: str
    vmid: int
    action: str  # "reboot" | "start" | "stop" | "shutdown"


# ── VM-Aktion (HTTP POST) ─────────────────────────────────────────────────────

@router.post("/vm-action")
async def vm_action(
    req: VmActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if req.action not in ALLOWED_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Ungültige Aktion: {req.action}. Erlaubt: {', '.join(ALLOWED_ACTIONS)}",
        )

    connector = await db.get(ConnectorConfig, req.connector_id)
    if not connector or connector.type != "proxmox" or connector.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Proxmox-Connector nicht gefunden")

    cfg = connector.config
    host = cfg.get("host", "")
    port = cfg.get("port", 8006)
    username = cfg.get("username", "")
    token_name = cfg.get("token_name", "")
    token_value = cfg.get("token_value", "")
    verify_ssl = cfg.get("verify_ssl", False)

    base_url = f"https://{host}:{port}/api2/json"
    headers = {"Authorization": f"PVEAPIToken={username}!{token_name}={token_value}"}
    url = f"{base_url}/nodes/{req.node}/qemu/{req.vmid}/status/{req.action}"

    try:
        async with httpx.AsyncClient(verify=verify_ssl, timeout=15) as client:
            resp = await client.post(url, headers=headers)
            if not resp.is_success:
                detail = (
                    resp.json().get("errors", resp.text)
                    if resp.headers.get("content-type", "").startswith("application/json")
                    else resp.text
                )
                raise HTTPException(status_code=resp.status_code, detail=f"Proxmox-Fehler: {detail}")
            return {"ok": True, "task": resp.json().get("data")}
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Verbindung zu Proxmox fehlgeschlagen")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Terminal-WebSocket-Proxy ──────────────────────────────────────────────────

@router.websocket("/{connector_id}/terminal")
async def vm_terminal(
    websocket: WebSocket,
    connector_id: int,
    vmid: int = Query(...),
    node: str = Query(...),
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Proxied xterm.js-Terminal via Proxmox termproxy.
    Auth: JWT im 'token'-Queryparameter (Browser kann keinen Authorization-Header setzen).
    Protokoll: raw text/binary – Resize-Nachricht: '1:{cols}:{rows}:0:0\\n'
    """
    # Token-Validierung
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except Exception:
        await websocket.close(code=4001)
        return

    connector = await db.get(ConnectorConfig, connector_id)
    if not connector or connector.type != "proxmox" or connector.user_id != user_id:
        await websocket.close(code=4004)
        return

    cfg = connector.config
    host = cfg.get("host", "")
    port = cfg.get("port", 8006)
    username = cfg.get("username", "")
    token_name = cfg.get("token_name", "")
    token_value = cfg.get("token_value", "")
    verify_ssl = cfg.get("verify_ssl", False)

    base_url = f"https://{host}:{port}/api2/json"
    api_headers = {"Authorization": f"PVEAPIToken={username}!{token_name}={token_value}"}

    # Schritt 1 – termproxy auf Proxmox anlegen
    try:
        async with httpx.AsyncClient(verify=verify_ssl, timeout=10) as client:
            resp = await client.post(
                f"{base_url}/nodes/{node}/qemu/{vmid}/termproxy",
                headers=api_headers,
            )
            if not resp.is_success:
                await websocket.accept()
                await websocket.send_text(
                    f"\r\n\x1b[31mFehler: Termproxy-Erstellung fehlgeschlagen "
                    f"({resp.status_code})\x1b[0m\r\n"
                )
                await websocket.close()
                return
            data = resp.json().get("data", {})
            vncticket = data.get("ticket", "")
            ws_port = data.get("port")
    except Exception as e:
        await websocket.accept()
        await websocket.send_text(f"\r\n\x1b[31mVerbindungsfehler: {e}\x1b[0m\r\n")
        await websocket.close()
        return

    await websocket.accept()

    # Schritt 2 – WebSocket zu Proxmox vncwebsocket öffnen
    pve_ws_url = (
        f"wss://{host}:{port}/api2/json/nodes/{node}/qemu/{vmid}/vncwebsocket"
        f"?port={ws_port}&vncticket={url_quote(vncticket, safe='')}"
    )

    ssl_ctx = ssl_module.create_default_context()
    if not verify_ssl:
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl_module.CERT_NONE

    try:
        async with ws_lib.connect(
            pve_ws_url,
            ssl=ssl_ctx,
            additional_headers={"Authorization": f"PVEAPIToken={username}!{token_name}={token_value}"},
            subprotocols=["binary"],
            open_timeout=10,
        ) as pve_ws:

            async def browser_to_proxmox():
                try:
                    while True:
                        msg = await websocket.receive()
                        if msg.get("type") == "websocket.disconnect":
                            break
                        text = msg.get("text")
                        data = msg.get("bytes")
                        if text is not None:
                            await pve_ws.send(text)
                        elif data is not None:
                            await pve_ws.send(data)
                except (WebSocketDisconnect, Exception):
                    pass

            async def proxmox_to_browser():
                try:
                    async for msg in pve_ws:
                        if isinstance(msg, bytes):
                            await websocket.send_bytes(msg)
                        else:
                            await websocket.send_text(msg)
                except Exception:
                    pass

            t1 = asyncio.create_task(browser_to_proxmox())
            t2 = asyncio.create_task(proxmox_to_browser())
            done, pending = await asyncio.wait([t1, t2], return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    except Exception as e:
        try:
            await websocket.send_text(f"\r\n\x1b[31mProxy-Fehler: {e}\x1b[0m\r\n")
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
