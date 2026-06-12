from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..alerts.engine import run_check_once
from ..alerts.senders import send_via
from ..auth import get_current_user
from ..database import get_db
from ..models import AlertEvent, AlertRule, ConnectorConfig, NotificationChannel, User
from ..schemas import (
    ChannelCreate, ChannelOut, ChannelUpdate,
    EventOut,
    RuleCreate, RuleOut, RuleUpdate,
)
router = APIRouter(prefix="/alerts", tags=["alerts"], dependencies=[Depends(get_current_user)])

SECRET_KEYS = {"password", "webhook_url", "smtp_password", "api_key", "token"}
MASK = "••••••••"


def _mask(config: dict) -> dict:
    return {k: (MASK if k in SECRET_KEYS and v else v) for k, v in (config or {}).items()}


def _channel_out(ch: NotificationChannel) -> ChannelOut:
    return ChannelOut(id=ch.id, name=ch.name, type=ch.type, enabled=ch.enabled,
                      config=_mask(ch.config or {}), created_at=ch.created_at)


def _own_channel(ch: NotificationChannel | None, user_id: int) -> NotificationChannel:
    if not ch or ch.user_id != user_id:
        raise HTTPException(status_code=404, detail="Kanal nicht gefunden")
    return ch


def _own_rule(rule: AlertRule | None, user_id: int) -> AlertRule:
    if not rule or rule.user_id != user_id:
        raise HTTPException(status_code=404, detail="Regel nicht gefunden")
    return rule


def _merge_config(existing: dict, incoming: dict | None) -> dict:
    if incoming is None:
        return existing or {}
    merged = dict(existing or {})
    for key, value in incoming.items():
        if key in SECRET_KEYS and value == MASK:
            continue
        merged[key] = value
    return merged


# --- Channels -----------------------------------------------------------------

@router.get("/channels", response_model=list[ChannelOut])
async def list_channels(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(NotificationChannel)
        .where(NotificationChannel.user_id == current_user.id)
        .order_by(NotificationChannel.id)
    )).scalars().all()
    return [_channel_out(c) for c in rows]


@router.post("/channels", response_model=ChannelOut, status_code=201)
async def create_channel(
    data: ChannelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channel = NotificationChannel(user_id=current_user.id, name=data.name,
                                   type=data.type, config=data.config or {})
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return _channel_out(channel)


@router.patch("/channels/{channel_id}", response_model=ChannelOut)
async def update_channel(
    channel_id: int,
    data: ChannelUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channel = _own_channel(await db.get(NotificationChannel, channel_id), current_user.id)
    if data.name is not None:
        channel.name = data.name
    if data.enabled is not None:
        channel.enabled = data.enabled
    if data.config is not None:
        channel.config = _merge_config(channel.config, data.config)
    await db.commit()
    await db.refresh(channel)
    return _channel_out(channel)


@router.delete("/channels/{channel_id}", status_code=204)
async def delete_channel(
    channel_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channel = _own_channel(await db.get(NotificationChannel, channel_id), current_user.id)
    await db.delete(channel)
    await db.commit()


@router.post("/channels/{channel_id}/test")
async def test_channel(
    channel_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channel = _own_channel(await db.get(NotificationChannel, channel_id), current_user.id)
    title = "Nexboard – Test-Benachrichtigung"
    body  = (f"Testnachricht von Nexboard.\nKanal: {channel.name} ({channel.type})\n"
             f"Zeit: {datetime.utcnow().isoformat(timespec='seconds')}Z")
    try:
        await send_via(channel.type, channel.config, title, body, "info")
        return {"ok": True, "message": "Test-Benachrichtigung erfolgreich versendet"}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Versand fehlgeschlagen: {exc}")


# --- Rules --------------------------------------------------------------------

@router.get("/rules", response_model=list[RuleOut])
async def list_rules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(AlertRule)
        .where(AlertRule.user_id == current_user.id)
        .order_by(AlertRule.id)
    )).scalars().all()
    return list(rows)


@router.post("/rules", response_model=RuleOut, status_code=201)
async def create_rule(
    data: RuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.connector_ids:
        existing = (await db.execute(
            select(ConnectorConfig.id).where(
                ConnectorConfig.id.in_(data.connector_ids),
                ConnectorConfig.user_id == current_user.id,
            )
        )).scalars().all()
        missing = set(data.connector_ids) - set(existing)
        if missing:
            raise HTTPException(status_code=400, detail=f"Connector-IDs unbekannt: {sorted(missing)}")
    if data.channel_ids:
        existing = (await db.execute(
            select(NotificationChannel.id).where(
                NotificationChannel.id.in_(data.channel_ids),
                NotificationChannel.user_id == current_user.id,
            )
        )).scalars().all()
        missing = set(data.channel_ids) - set(existing)
        if missing:
            raise HTTPException(status_code=400, detail=f"Kanal-IDs unbekannt: {sorted(missing)}")

    rule = AlertRule(
        user_id=current_user.id,
        name=data.name,
        connector_ids=list(data.connector_ids),
        trigger_statuses=list(data.trigger_statuses),
        channel_ids=list(data.channel_ids),
        cooldown_minutes=data.cooldown_minutes,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch("/rules/{rule_id}", response_model=RuleOut)
async def update_rule(
    rule_id: int,
    data: RuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = _own_rule(await db.get(AlertRule, rule_id), current_user.id)
    if data.name is not None:           rule.name = data.name
    if data.enabled is not None:        rule.enabled = data.enabled
    if data.connector_ids is not None:  rule.connector_ids = list(data.connector_ids)
    if data.trigger_statuses is not None: rule.trigger_statuses = list(data.trigger_statuses)
    if data.channel_ids is not None:    rule.channel_ids = list(data.channel_ids)
    if data.cooldown_minutes is not None: rule.cooldown_minutes = data.cooldown_minutes
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = _own_rule(await db.get(AlertRule, rule_id), current_user.id)
    await db.delete(rule)
    await db.commit()


# --- Events -------------------------------------------------------------------

@router.get("/events", response_model=list[EventOut])
async def list_events(
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(AlertEvent)
        .where(AlertEvent.user_id == current_user.id)
        .order_by(desc(AlertEvent.captured_at))
        .limit(limit)
    )).scalars().all()
    return list(rows)


# --- Manual check trigger -----------------------------------------------------

@router.post("/check")
async def trigger_check(
    current_user: User = Depends(get_current_user),
):
    summary = await run_check_once()
    return summary
