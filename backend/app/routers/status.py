import asyncio
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..auth import get_current_user
from ..database import get_db
from ..models import ConnectorConfig, StatusSnapshot, User
from ..connectors import registry

router = APIRouter(prefix="/status", tags=["status"], dependencies=[Depends(get_current_user)])

# ── In-Memory-Cache ────────────────────────────────────────────────────────────
# Speichert das letzte Ergebnis pro (user_id, endpoint) damit das Dashboard
# sofort antwortet und der teure Fetch im Hintergrund läuft.
_cache: dict[str, dict] = {}          # key → {"data": ..., "fetched_at": datetime}
_CACHE_TTL   = 25   # Sekunden – etwas kürzer als das 30s-Frontend-Interval
_FETCH_TIMEOUT = 8  # Sekunden – harter Timeout pro Connector-Fetch

# ── Helferfunktionen ───────────────────────────────────────────────────────────

def _summarize(statuses: list[dict]) -> dict:
    total   = len(statuses)
    online  = sum(1 for s in statuses if s["status"] == "online")
    warning = sum(1 for s in statuses if s["status"] == "warning")
    offline = sum(1 for s in statuses if s["status"] in ("offline", "error"))
    overall = "online"
    if offline > 0:
        overall = "critical"
    elif warning > 0:
        overall = "warning"
    return {"overall": overall, "total": total, "online": online, "warning": warning, "offline": offline}


async def _fetch_with_timeout(cls, config: dict, timeout: float) -> object:
    """Ruft connector.fetch() mit hartem Timeout auf."""
    try:
        return await asyncio.wait_for(cls(config).fetch(), timeout=timeout)
    except asyncio.TimeoutError:
        from ..connectors.base import ConnectorResult, ConnectorStatus
        return ConnectorResult(
            status=ConnectorStatus.ERROR,
            error=f"Timeout nach {timeout}s – Connector antwortet zu langsam",
        )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cache_key = f"overview:{current_user.id}"
    cached    = _cache.get(cache_key)
    now       = datetime.utcnow()

    # Cache noch frisch → sofort zurückgeben
    if cached and (now - cached["fetched_at"]).total_seconds() < _CACHE_TTL:
        return cached["data"]

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
            fetch_result = await _fetch_with_timeout(cls, connector.config, _FETCH_TIMEOUT)
            return {
                "id": connector.id, "name": connector.name, "type": connector.type,
                "config": safe_config,
                "status": fetch_result.status.value, "error": fetch_result.error,
            }
        except Exception as e:
            return {
                "id": connector.id, "name": connector.name, "type": connector.type,
                "config": safe_config,
                "status": "error", "error": str(e),
            }

    results  = await asyncio.gather(*[fetch_one(c) for c in connectors]) if connectors else []
    statuses = [r for r in results if r is not None]
    data     = {**_summarize(statuses), "connectors": statuses, "fetched_at": now.isoformat()}
    _cache[cache_key] = {"data": data, "fetched_at": now}
    return data


@router.get("/history/{connector_id}/metrics")
async def get_metric_history(
    connector_id: int,
    key: str = Query(..., description="Metric key path, e.g. 'cpu_pct' or 'gpu.total_vram_used_mb'"),
    hours: int = Query(default=24, ge=1, le=168),
    points: int = Query(default=120, ge=10, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Gibt den Verlauf eines einzelnen Metrik-Wertes zurück.
    key kann geschachtelt sein: 'gpu.total_vram_used_mb' greift auf metrics['gpu']['total_vram_used_mb'].
    Downsampled automatisch auf max `points` Werte (Bucket-Durchschnitt).
    """
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

    # Metrik-Wert aus verschachteltem JSON-Pfad extrahieren
    def _extract(metrics: dict, path: str):
        parts = path.split(".")
        val = metrics
        for p in parts:
            if not isinstance(val, dict):
                return None
            val = val.get(p)
        try:
            return float(val) if val is not None else None
        except (TypeError, ValueError):
            return None

    # Rohdaten extrahieren
    raw: list[tuple[str, float]] = []
    for snap in snapshots:
        metrics = snap.metrics or {}
        val = _extract(metrics, key)
        if val is not None:
            raw.append((snap.captured_at.isoformat(), val))

    # Downsampling: Bucket-Durchschnitt
    if len(raw) > points:
        bucket_size = len(raw) / points
        bucketed: list[tuple[str, float]] = []
        i = 0
        while i < len(raw):
            end = min(int(i + bucket_size) + 1, len(raw))
            bucket = raw[i:end]
            avg_val = sum(v for _, v in bucket) / len(bucket)
            mid_ts  = bucket[len(bucket) // 2][0]
            bucketed.append((mid_ts, round(avg_val, 2)))
            i = end
        raw = bucketed

    return {
        "connector_id":   connector_id,
        "connector_name": connector.name,
        "key":            key,
        "hours":          hours,
        "labels":         [ts for ts, _ in raw],
        "values":         [v  for _, v  in raw],
        "count":          len(raw),
    }


@router.get("/history/{connector_id}")
async def get_history(
    connector_id: int,
    hours: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    cache_key = f"detailed:{current_user.id}"
    cached    = _cache.get(cache_key)
    now       = datetime.utcnow()

    if cached and (now - cached["fetched_at"]).total_seconds() < _CACHE_TTL:
        return cached["data"]

    result = await db.execute(
        select(ConnectorConfig)
        .where(ConnectorConfig.user_id == current_user.id)
        .order_by(ConnectorConfig.id)
    )
    connectors = list(result.scalars().all())

    async def fetch_one(connector: ConnectorConfig) -> dict:
        cls = registry.get(connector.type)
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
            fetch_result = await _fetch_with_timeout(cls, connector.config, _FETCH_TIMEOUT)
            return {**base, "status": fetch_result.status.value,
                    "metrics": fetch_result.metrics, "error": fetch_result.error}
        except Exception as e:
            return {**base, "status": "error", "metrics": {}, "error": str(e)}

    statuses = list(await asyncio.gather(*[fetch_one(c) for c in connectors])) if connectors else []
    enabled  = [s for s in statuses if s["enabled"]]
    data     = {**_summarize(enabled), "connectors": statuses, "fetched_at": now.isoformat()}
    _cache[cache_key] = {"data": data, "fetched_at": now}
    return data
