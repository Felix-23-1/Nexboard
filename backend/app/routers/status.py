import asyncio
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..auth import get_current_user
from ..database import get_db
from ..models import ConnectorConfig, StatusSnapshot, User
from ..connectors import registry
from .license import get_current_license

router = APIRouter(prefix="/status", tags=["status"], dependencies=[Depends(get_current_user)])


def _summarize(statuses: list[dict]) -> dict:
    total = len(statuses)
    online  = sum(1 for s in statuses if s["status"] == "online")
    warning = sum(1 for s in statuses if s["status"] == "warning")
    offline = sum(1 for s in statuses if s["status"] in ("offline", "error"))
    overall = "online"
    if offline > 0:
        overall = "critical"
    elif warning > 0:
        overall = "warning"
    return {"overall": overall, "total": total, "online": online, "warning": warning, "offline": offline}


@router.get("/overview")
async def get_overview(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kompakter Status aller aktiven Connectors des eingeloggten Users – parallel abgefragt."""
    result = await db.execute(
        select(ConnectorConfig).where(
            ConnectorConfig.user_id == current_user.id,
            ConnectorConfig.enabled == True,
        )
    )
    connectors = list(result.scalars().all())

    async def fetch_one(connector: ConnectorConfig) -> dict | None:
        cls = registry.get(connector.type)
        if not cls:
            return None
        secret_keys = {k for k, v in cls.meta.config_schema.items() if v.get("secret")}
        safe_config = {k: v for k, v in connector.config.items() if k not in secret_keys}
        try:
            fetch_result = await cls(connector.config).fetch()
            return {"id": connector.id, "name": connector.name, "type": connector.type,
                    "config": safe_config,
                    "status": fetch_result.status.value, "error": fetch_result.error}
        except Exception as e:  # noqa: BLE001
            return {"id": connector.id, "name": connector.name, "type": connector.type,
                    "config": safe_config,
                    "status": "error", "error": str(e)}

    results  = await asyncio.gather(*[fetch_one(c) for c in connectors]) if connectors else []
    statuses = [r for r in results if r is not None]
    return {**_summarize(statuses), "connectors": statuses, "fetched_at": datetime.utcnow().isoformat()}


@router.get("/history/{connector_id}")
async def get_history(
    connector_id: int,
    hours: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Statusverlauf eines Connectors – nur für Pro-Nutzer."""
    license_state = get_current_license(current_user)
    if not license_state.features.get("history"):
        raise HTTPException(
            status_code=403,
            detail="History & Trends ist ein Pro-Feature. Bitte Lizenz aktivieren.",
        )

    connector = await db.get(ConnectorConfig, connector_id)
    if not connector or connector.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Connector nicht gefunden")

    since  = datetime.utcnow() - timedelta(hours=hours)
    result = await db.execute(
        select(StatusSnapshot)
        .where(StatusSnapshot.connector_id == connector_id, StatusSnapshot.captured_at >= since)
        .order_by(StatusSnapshot.captured_at.asc())
    )
    snapshots = result.scalars().all()

    return {
        "connector_id":   connector_id,
        "connector_name": connector.name,
        "connector_type": connector.type,
        "hours": hours,
        "snapshots": [
            {"status": s.status, "error": s.error, "captured_at": s.captured_at.isoformat()}
            for s in snapshots
        ],
    }


@router.get("/detailed")
async def get_detailed(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vollständige Metriken aller Connectors des eingeloggten Users – parallel abgefragt."""
    result = await db.execute(
        select(ConnectorConfig)
        .where(ConnectorConfig.user_id == current_user.id)
        .order_by(ConnectorConfig.id)
    )
    connectors = list(result.scalars().all())

    async def fetch_one(connector: ConnectorConfig) -> dict:
        cls = registry.get(connector.type)
        # Sichere Config-Felder (ohne secret-Felder wie Passwörter/Keys)
        if cls:
            secret_keys = {k for k, v in cls.meta.config_schema.items() if v.get("secret")}
        else:
            secret_keys = set()
        safe_config = {k: v for k, v in connector.config.items() if k not in secret_keys}

        base = {
            "id": connector.id, "name": connector.name,
            "type": connector.type, "enabled": connector.enabled,
            "config": safe_config,
        }
        if not cls:
            return {**base, "status": "unknown", "metrics": {}, "error": f"Typ '{connector.type}' nicht verfügbar"}
        try:
            fetch_result = await cls(connector.config).fetch()
            return {**base, "status": fetch_result.status.value,
                    "metrics": fetch_result.metrics, "error": fetch_result.error}
        except Exception as e:  # noqa: BLE001
            return {**base, "status": "error", "metrics": {}, "error": str(e)}

    statuses = list(await asyncio.gather(*[fetch_one(c) for c in connectors])) if connectors else []
    enabled  = [s for s in statuses if s["enabled"]]
    return {**_summarize(enabled), "connectors": statuses, "fetched_at": datetime.utcnow().isoformat()}
