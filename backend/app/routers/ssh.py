"""SSH-Terminal WebSocket-Proxy + SSH-Befehlsausführung.

Öffnet eine direkte SSH-Verbindung zum Linux-Server und leitet
WebSocket-Nachrichten (xterm.js) an die SSH-Shell weiter.

Auth: JWT im ?token= Query-Parameter
Protokoll: text/binary – Resize-Nachricht: '1:{cols}:{rows}:0:0\\n'

Wichtig: encoding=None (binary mode) damit asyncssh echoed Zeichen
sofort weiterleitet statt sie in einem UTF-8-Buffer zu puffern.
"""
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import decode_token, get_current_user
from ..database import get_db
from ..models import ConnectorConfig, User

router = APIRouter(prefix="/ssh", tags=["ssh"])

try:
    import asyncssh  # type: ignore
    _SSH_AVAILABLE = True
except ImportError:
    _SSH_AVAILABLE = False

# PTY-Modes nach RFC 4254 Sec. 8
# 53 = ECHO    – Eingabe sofort zurückspiegeln
# 51 = ICANON  – Canonical mode (Enter schickt Zeile)
# 36 = ICRNL   – CR → NL auf Eingabe
# 70 = OPOST   – Output-Processing aktiv
# 72 = ONLCR   – NL → CR+NL auf Ausgabe
_PTY_MODES = {53: 1, 51: 1, 36: 1, 70: 1, 72: 1}


@router.websocket("/{connector_id}/terminal")
async def ssh_terminal(
    websocket: WebSocket,
    connector_id: int,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    # ── 1. Token validieren ────────────────────────────────────────────
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except Exception:
        await websocket.close(code=4001)
        return

    # ── 2. Connector laden + Ownership prüfen ─────────────────────────
    connector = await db.get(ConnectorConfig, connector_id)
    if not connector or connector.type not in ("linux_ssh", "linux_probe") or connector.user_id != user_id:
        await websocket.close(code=4004)
        return

    if not _SSH_AVAILABLE:
        await websocket.accept()
        await websocket.send_text(
            "\r\n\x1b[31masyncssh nicht installiert – Container neu bauen.\x1b[0m\r\n"
        )
        await websocket.close()
        return

    cfg      = connector.config
    host     = cfg.get("host", "")
    port     = int(cfg.get("port", 22))
    username = cfg.get("username", "")
    password = cfg.get("password") or None
    ssh_key  = cfg.get("ssh_key") or None

    # ── 3. WebSocket annehmen ──────────────────────────────────────────
    await websocket.accept()
    await websocket.send_text(f"Verbinde mit {username}@{host}:{port}…\r\n")

    # ── 4. asyncssh-Verbindung aufbauen ────────────────────────────────
    connect_kwargs: dict = dict(
        host=host, port=port, username=username,
        known_hosts=None,
    )
    if ssh_key:
        try:
            connect_kwargs["client_keys"] = [asyncssh.import_private_key(ssh_key)]
        except Exception as e:
            await websocket.send_text(f"\r\n\x1b[31mSSH-Key Fehler: {e}\x1b[0m\r\n")
            await websocket.close()
            return
    if password:
        connect_kwargs["password"] = password

    try:
        async with asyncssh.connect(**connect_kwargs) as conn:
            await websocket.send_text("\x1b[1A\x1b[2K")  # "Verbinde…" löschen

            # encoding=None → binary mode → Bytes werden sofort weitergeleitet,
            # kein UTF-8-Puffer der einzelne Zeichen zurückhält
            process = await conn.create_process(
                term_type="xterm-256color",
                term_size=(220, 50),
                term_modes=_PTY_MODES,
                encoding=None,
            )

            async def ws_to_ssh():
                try:
                    while True:
                        msg = await websocket.receive()
                        if msg.get("type") == "websocket.disconnect":
                            break
                        text = msg.get("text")
                        data = msg.get("bytes")
                        if text is not None:
                            # Resize-Nachricht: "1:cols:rows:0:0\n"
                            if text.startswith("1:") and text.strip().count(":") == 4:
                                parts = text.strip().split(":")
                                try:
                                    cols, rows = int(parts[1]), int(parts[2])
                                    process.change_terminal_size(cols, rows)
                                except Exception:
                                    pass
                            else:
                                process.stdin.write(text.encode("utf-8", errors="replace"))
                        elif data is not None:
                            process.stdin.write(data)
                except (WebSocketDisconnect, Exception):
                    pass
                finally:
                    try:
                        process.stdin.write_eof()
                    except Exception:
                        pass

            async def ssh_to_ws():
                try:
                    # read() statt "async for" – async for nutzt readline() intern
                    # und puffert bis \n; read(4096) liefert sofort was da ist
                    while True:
                        chunk = await process.stdout.read(4096)
                        if not chunk:
                            break
                        if isinstance(chunk, bytes):
                            await websocket.send_bytes(chunk)
                        else:
                            await websocket.send_bytes(chunk.encode("utf-8", errors="replace"))
                except Exception:
                    pass

            t1 = asyncio.create_task(ws_to_ssh())
            t2 = asyncio.create_task(ssh_to_ws())
            done, pending = await asyncio.wait([t1, t2], return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    except asyncssh.PermissionDenied:
        try:
            await websocket.send_text("\r\n\x1b[31mAuthentifizierung fehlgeschlagen – Passwort oder Key prüfen.\x1b[0m\r\n")
        except Exception:
            pass
    except (OSError, asyncssh.Error) as e:
        try:
            await websocket.send_text(f"\r\n\x1b[31mSSH-Fehler: {e}\x1b[0m\r\n")
        except Exception:
            pass
    except Exception as e:
        try:
            await websocket.send_text(f"\r\n\x1b[31mFehler: {e}\x1b[0m\r\n")
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# ── SSH-Befehlsausführung (Script-Runner) ──────────────────────────────────

class ExecuteRequest(BaseModel):
    command: str


@router.post("/{connector_id}/execute")
async def ssh_execute(
    connector_id: int,
    body: ExecuteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Führt einen einzelnen Bash-Befehl via SSH aus und gibt stdout/stderr zurück.

    Kein PTY – für Scripts und Quick-Commands.
    Max. 30 Sekunden Laufzeit.
    """
    connector = await db.get(ConnectorConfig, connector_id)
    if not connector or connector.type not in ("linux_ssh", "linux_probe") or connector.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="SSH-Connector nicht gefunden")

    if not _SSH_AVAILABLE:
        raise HTTPException(status_code=503, detail="asyncssh nicht installiert")

    cfg      = connector.config
    host     = cfg.get("host", "")
    port     = int(cfg.get("port", 22))
    username = cfg.get("username", "")
    password = cfg.get("password") or None
    ssh_key  = cfg.get("ssh_key") or None

    connect_kwargs: dict = dict(host=host, port=port, username=username, known_hosts=None)
    if ssh_key:
        try:
            connect_kwargs["client_keys"] = [asyncssh.import_private_key(ssh_key)]
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"SSH-Key Fehler: {e}")
    if password:
        connect_kwargs["password"] = password

    try:
        async with asyncssh.connect(**connect_kwargs) as conn:
            result = await asyncio.wait_for(
                conn.run(body.command, check=False),
                timeout=30,
            )
            return {
                "stdout":    result.stdout or "",
                "stderr":    result.stderr or "",
                "exit_code": result.exit_status,
            }
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="Befehl Timeout nach 30 Sekunden")
    except asyncssh.PermissionDenied:
        raise HTTPException(status_code=403, detail="Authentifizierung fehlgeschlagen")
    except (OSError, asyncssh.Error) as e:
        raise HTTPException(status_code=503, detail=f"SSH-Fehler: {e}")
