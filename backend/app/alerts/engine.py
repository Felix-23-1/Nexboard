"""Hintergrund-Engine für das Alert-System und History-Recording.

Läuft in einer asyncio-Task neben dem FastAPI-Server.
- Snapshots werden für ALLE User aufgezeichnet (unabhängig von Lizenz)
- Alerts werden nur für User mit aktiver Pro-Lizenz verarbeitet
"""
import asyncio
from datetime import datetime, timedelta

from sqlalchemy import select, desc, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..connectors import registry
from ..database import SessionLocal
from ..licensing import get_license_state
from ..models import AlertEvent, AlertRule, ConnectorConfig, NotificationChannel, StatusSnapshot, User
from .senders import send_via

CHECK_INTERVAL_SECONDS = 60
SNAPSHOT_RETENTION_DAYS = 7
_task: asyncio.Task | None = None


def start_background() -> None:
    global _task
    if _task and not _task.done():
        return
    _task = asyncio.create_task(_loop())


async def stop_background() -> None:
    global _task
    if _task and not _task.done():
        _task.cancel()
        try:
            await _task
        except BaseException:
            pass
        _task = None


async def _loop() -> None:
    await asyncio.sleep(8)
    while True:
        try:
            await run_check_once()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            print(f"[alerts] check failed: {exc}")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


async def _fetch_status(connector: ConnectorConfig):
    cls = registry.get(connector.type)
    if not cls:
        return ("unknown", f"Connector-Typ '{connector.type}' nicht verfügbar")
    try:
        result = await cls(connector.config).fetch()
        return (result.status.value, result.error)
    except Exception as exc:  # noqa: BLE001
        return ("error", str(exc))


async def run_check_once() -> dict:
    """Eine Prüfrunde:
    1. Alle aktiven Connectors parallel abfragen
    2. StatusSnapshots für alle User schreiben
    3. Alte Snapshots bereinigen
    4. Alerts nur für User mit Pro-Lizenz
    """
    summary = {"checked": 0, "changed": 0, "fired": 0}

    async with SessionLocal() as db:
        # Alle aktiven Connectors laden (alle User)
        connectors = list((await db.execute(
            select(ConnectorConfig).where(ConnectorConfig.enabled == True)
        )).scalars().all())
        if not connectors:
            return summary

        # Parallel abfragen
        statuses = await asyncio.gather(*[_fetch_status(c) for c in connectors])

        # Vorherige Snapshots + neue Snapshots schreiben
        previous: dict[int, str | None] = {}
        for connector, (status, error) in zip(connectors, statuses):
            summary["checked"] += 1
            last_q = await db.execute(
                select(StatusSnapshot)
                .where(StatusSnapshot.connector_id == connector.id)
                .order_by(desc(StatusSnapshot.captured_at))
                .limit(1)
            )
            last_snap = last_q.scalar_one_or_none()
            previous[connector.id] = last_snap.status if last_snap else None
            db.add(StatusSnapshot(connector_id=connector.id, status=status, error=error))

        # Alte Snapshots löschen
        cutoff = datetime.utcnow() - timedelta(days=SNAPSHOT_RETENTION_DAYS)
        await db.execute(delete(StatusSnapshot).where(StatusSnapshot.captured_at < cutoff))

        # Alle User mit ihren Connectors laden (für Alert-Verarbeitung)
        users = list((await db.execute(select(User))).scalars().all())
        connectors_by_user: dict[int, list] = {}
        for c in connectors:
            connectors_by_user.setdefault(c.user_id, []).append(c)

        # Pro User: Alerts verarbeiten (nur wenn Pro-Lizenz aktiv)
        for user in users:
            license_state = get_license_state(user.license_key)
            if not license_state.features.get("alerts"):
                continue

            user_connectors = connectors_by_user.get(user.id, [])
            if not user_connectors:
                continue

            rules = list((await db.execute(
                select(AlertRule)
                .where(AlertRule.user_id == user.id, AlertRule.enabled == True)
            )).scalars().all())
            if not rules:
                continue

            channels_by_id = {
                ch.id: ch
                for ch in (await db.execute(
                    select(NotificationChannel).where(NotificationChannel.user_id == user.id)
                )).scalars().all()
            }

            statuses_map = {c.id: s for c, s in zip(connectors, statuses)}

            for connector in user_connectors:
                status, error = statuses_map[connector.id]
                prev = previous[connector.id]

                if prev is None or prev == status:
                    continue
                summary["changed"] += 1

                for rule in rules:
                    if rule.connector_ids and connector.id not in rule.connector_ids:
                        continue
                    if rule.trigger_statuses and status not in rule.trigger_statuses:
                        continue

                    if rule.cooldown_minutes > 0:
                        cd_cutoff = datetime.utcnow() - timedelta(minutes=rule.cooldown_minutes)
                        cd = await db.execute(
                            select(AlertEvent).where(
                                AlertEvent.rule_id == rule.id,
                                AlertEvent.connector_id == connector.id,
                                AlertEvent.captured_at >= cd_cutoff,
                            ).limit(1)
                        )
                        if cd.scalar_one_or_none():
                            continue

                    title = f"{connector.name}: Status {status}"
                    lines = [f"Connector: {connector.name} ({connector.type})", f"Status: {status}"]
                    if prev:
                        lines.append(f"Vorher: {prev}")
                    if error:
                        lines.append(f"Fehler: {error}")
                    lines.append(f"Zeit: {datetime.utcnow().isoformat(timespec='seconds')}Z")
                    message = "\n".join(lines)
                    severity = ("critical" if status in ("offline", "error")
                                else "warning" if status == "warning" else "info")

                    channels_results = []
                    for ch_id in (rule.channel_ids or []):
                        ch = channels_by_id.get(ch_id)
                        if not ch or not ch.enabled:
                            channels_results.append({"channel_id": ch_id, "ok": False,
                                                     "error": "Kanal nicht gefunden"})
                            continue
                        try:
                            await send_via(ch.type, ch.config, title, message, severity)
                            channels_results.append({"channel_id": ch.id, "channel_name": ch.name,
                                                     "type": ch.type, "ok": True})
                        except Exception as exc:  # noqa: BLE001
                            channels_results.append({"channel_id": ch.id, "channel_name": ch.name,
                                                     "type": ch.type, "ok": False, "error": str(exc)})

                    db.add(AlertEvent(
                        user_id=user.id,
                        rule_id=rule.id, rule_name=rule.name,
                        connector_id=connector.id, connector_name=connector.name,
                        status=status, previous_status=prev,
                        message=message, channels_results=channels_results,
                    ))
                    summary["fired"] += 1

        await db.commit()

    return summary
