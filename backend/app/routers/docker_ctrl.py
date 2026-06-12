"""Docker Container Control Router.

Ermöglicht Start / Stop / Restart einzelner Container direkt aus Das Lab.
Setzt voraus, dass die Docker Engine API über HTTP erreichbar ist (Port 2375 / TLS).
"""
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import ConnectorConfig, User

router = APIRouter(prefix="/docker", tags=["docker-ctrl"])


class ContainerAction(BaseModel):
    action: Literal["start", "stop", "restart"]


def _docker_base(connector: ConnectorConfig) -> str:
    cfg = connector.config
    host = cfg.get("host", "")
    port = cfg.get("port", 2375)
    scheme = "https" if cfg.get("use_tls") else "http"
    return f"{scheme}://{host}:{port}"


@router.post("/{connector_id}/containers/{container_id}/action")
async def container_action(
    connector_id: int,
    container_id: str,
    body: ContainerAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Führt eine Aktion (start/stop/restart) auf einem Docker-Container aus."""
    connector = await db.get(ConnectorConfig, connector_id)
    if not connector or connector.type != "docker" or connector.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Docker-Connector nicht gefunden")

    base_url = _docker_base(connector)
    action = body.action

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(f"{base_url}/containers/{container_id}/{action}")
            # Docker API gibt 204 (No Content) bei Erfolg zurück;
            # 304 = Container bereits im gewünschten Zustand
            if resp.status_code in (204, 304):
                return {"ok": True, "action": action, "container_id": container_id}
            # Fehler-Details aus Docker-API zurückgeben
            try:
                detail = resp.json().get("message", resp.text)
            except Exception:
                detail = resp.text
            raise HTTPException(status_code=resp.status_code, detail=detail)
    except HTTPException:
        raise
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Docker API nicht erreichbar")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
