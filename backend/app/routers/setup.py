"""Setup-Wizard-Endpunkte: Status auslesen und Wizard-Abschluss markieren."""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, require_admin
from ..database import get_db
from ..licensing import get_license_state
from ..models import ConnectorConfig, Setting, User
from .settings import _get_setting, _set_setting

router = APIRouter(prefix="/setup", tags=["setup"], dependencies=[Depends(get_current_user)])

WIZARD_KEY = "wizard_completed"


async def _get_global(db: AsyncSession, key: str, default: str = "") -> str:
    """Liest einen globalen (nicht per-User) Einstellungswert aus der settings-Tabelle."""
    row = await db.get(Setting, key)
    return row.value if row else default


async def _set_global(db: AsyncSession, key: str, value: str) -> None:
    row = await db.get(Setting, key)
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))


@router.get("")
async def get_setup_state(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Status für den Wizard. Implizit abgeschlossen sobald bereits ein Connector existiert."""
    explicit = (await _get_global(db, WIZARD_KEY)) == "1"

    connector_count = int(
        (await db.execute(
            select(func.count()).select_from(ConnectorConfig)
            .where(ConnectorConfig.user_id == current_user.id)
        )).scalar_one()
    )

    ai_provider = await _get_setting(db, current_user.id, "ai_provider")
    ai_key = await _get_setting(db, current_user.id, "ai_api_key")
    ai_configured = bool(ai_provider) and (ai_provider == "ollama" or bool(ai_key))

    license_state = get_license_state(current_user.license_key)

    return {
        "wizard_completed": explicit or connector_count > 0,
        "ai_configured": ai_configured,
        "connector_count": connector_count,
        "license_active": license_state.valid,
        "license_plan": license_state.plan,
    }


@router.post("/complete")
async def complete_setup(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    await _set_global(db, WIZARD_KEY, "1")
    await db.commit()
    return {"ok": True}
