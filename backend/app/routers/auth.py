from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..database import get_db
from ..models import User
from ..schemas import AuthStatusOut, LoginRequest, SetupRequest, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


async def _user_count(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(User))
    return int(result.scalar_one())


@router.get("/status", response_model=AuthStatusOut)
async def auth_status(db: AsyncSession = Depends(get_db)):
    """Oeffentlich: zeigt ob die Erst-Einrichtung noch noetig ist."""
    count = await _user_count(db)
    return AuthStatusOut(needs_setup=count == 0, user_count=count)


@router.post("/setup", response_model=TokenOut, status_code=201)
async def setup_first_admin(data: SetupRequest, db: AsyncSession = Depends(get_db)):
    """Erst-Einrichtung: legt den ersten Admin an. Nur moeglich solange es keine Nutzer gibt."""
    if await _user_count(db) > 0:
        raise HTTPException(status_code=403, detail="Einrichtung bereits abgeschlossen")

    user = User(
        username=data.username.strip(),
        email=data.email.strip(),
        password_hash=hash_password(data.password),
        role="admin",
        active=True,
        last_login=datetime.utcnow(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == data.username.strip()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Benutzername oder Passwort falsch")
    if not user.active:
        raise HTTPException(status_code=403, detail="Dieses Konto ist deaktiviert")

    user.last_login = datetime.utcnow()
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(current: User = Depends(get_current_user)):
    return UserOut.model_validate(current)
