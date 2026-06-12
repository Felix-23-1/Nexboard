from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..licensing import LicenseError, LicenseState, get_license_state, verify_license_key
from ..models import User

router = APIRouter(prefix="/license", tags=["license"], dependencies=[Depends(get_current_user)])


class LicenseActivate(BaseModel):
    key: str


def get_current_license(user: User) -> LicenseState:
    """Gibt den Lizenzstatus des übergebenen Users zurück.
    Jeder User hat seinen eigenen Lizenzschlüssel (oder ist Free-Nutzer)."""
    return get_license_state(user.license_key or None)


@router.get("")
async def license_status(current_user: User = Depends(get_current_user)):
    return get_current_license(current_user).to_dict()


@router.post("")
async def activate_license(
    data: LicenseActivate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    key = data.key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Kein Lizenzschlüssel angegeben")

    try:
        verify_license_key(key)
    except LicenseError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    state = get_license_state(key)
    if state.status == "expired":
        raise HTTPException(status_code=400, detail=state.message)

    current_user.license_key = key
    await db.commit()
    return state.to_dict()


@router.delete("")
async def remove_license(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.license_key = None
    await db.commit()
    return get_license_state(None).to_dict()
