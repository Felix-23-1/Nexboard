from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_db
from ..models import UserSetting, User

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(get_current_user)])

DEFAULTS = {
    "ai_provider":   "openai",
    "ai_api_key":    "",
    "ai_model":      "",
    "ai_ollama_url": "http://localhost:11434",
}


class SettingsPayload(BaseModel):
    ai_provider:   str = "openai"
    ai_api_key:    str = ""
    ai_model:      str = ""
    ai_ollama_url: str = "http://localhost:11434"


async def _get_setting(db: AsyncSession, user_id: int, key: str) -> str:
    row = await db.get(UserSetting, (user_id, key))
    return row.value if row else DEFAULTS.get(key, "")


async def _set_setting(db: AsyncSession, user_id: int, key: str, value: str):
    row = await db.get(UserSetting, (user_id, key))
    if row:
        row.value = value
    else:
        db.add(UserSetting(user_id=user_id, key=key, value=value))


@router.get("")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserSetting).where(UserSetting.user_id == current_user.id)
    )
    rows = {r.key: r.value for r in result.scalars().all()}
    data = {k: rows.get(k, v) for k, v in DEFAULTS.items()}
    if data.get("ai_api_key"):
        data["ai_api_key"] = "••••••••"
    return data


@router.put("")
async def save_settings(
    payload: SettingsPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fields = payload.model_dump()
    for key, value in fields.items():
        if key == "ai_api_key" and value == "••••••••":
            continue
        await _set_setting(db, current_user.id, key, str(value))
    await db.commit()
    return {"ok": True}
