from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..auth import get_current_user
from ..database import get_db
from ..models import ConnectorConfig, User
from ..schemas import ConnectorConfigCreate, ConnectorConfigUpdate, ConnectorConfigOut, ConnectorStatusOut, ConnectorTypeOut
from ..connectors import registry

router = APIRouter(prefix="/connectors", tags=["connectors"], dependencies=[Depends(get_current_user)])


def _own_or_404(connector: ConnectorConfig | None, user_id: int) -> ConnectorConfig:
    """Wirft 404 wenn der Connector nicht existiert oder einem anderen User gehört."""
    if not connector or connector.user_id != user_id:
        raise HTTPException(status_code=404, detail="Connector nicht gefunden")
    return connector


@router.get("/types", response_model=list[ConnectorTypeOut])
async def list_connector_types():
    return [
        ConnectorTypeOut(
            type=m.type,
            label=m.label,
            description=m.description,
            icon=m.icon,
            config_schema=m.config_schema,
        )
        for m in registry.all_meta()
    ]


@router.get("", response_model=list[ConnectorConfigOut])
async def list_connectors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ConnectorConfig).where(ConnectorConfig.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("", response_model=ConnectorConfigOut, status_code=201)
async def create_connector(
    data: ConnectorConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not registry.get(data.type):
        raise HTTPException(status_code=400, detail=f"Unbekannter Connector-Typ: {data.type}")

    connector = ConnectorConfig(
        user_id=current_user.id,
        name=data.name,
        type=data.type,
        config=data.config,
    )
    db.add(connector)
    await db.commit()
    await db.refresh(connector)
    return connector


@router.get("/{connector_id}", response_model=ConnectorConfigOut)
async def get_connector(
    connector_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    connector = await db.get(ConnectorConfig, connector_id)
    return _own_or_404(connector, current_user.id)


@router.patch("/{connector_id}", response_model=ConnectorConfigOut)
async def update_connector(
    connector_id: int,
    data: ConnectorConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    connector = _own_or_404(await db.get(ConnectorConfig, connector_id), current_user.id)
    if data.name is not None:
        connector.name = data.name
    if data.enabled is not None:
        connector.enabled = data.enabled
    if data.config is not None:
        connector.config = data.config
    await db.commit()
    await db.refresh(connector)
    return connector


@router.delete("/{connector_id}", status_code=204)
async def delete_connector(
    connector_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    connector = _own_or_404(await db.get(ConnectorConfig, connector_id), current_user.id)
    await db.delete(connector)
    await db.commit()


@router.get("/{connector_id}/status", response_model=ConnectorStatusOut)
async def fetch_connector_status(
    connector_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    connector = _own_or_404(await db.get(ConnectorConfig, connector_id), current_user.id)

    cls = registry.get(connector.type)
    if not cls:
        raise HTTPException(status_code=400, detail=f"Connector-Typ nicht verfügbar: {connector.type}")

    result = await cls(connector.config).fetch()

    return ConnectorStatusOut(
        connector_id=connector.id,
        connector_name=connector.name,
        connector_type=connector.type,
        status=result.status.value,
        metrics=result.metrics,
        error=result.error,
        fetched_at=datetime.utcnow(),
    )
