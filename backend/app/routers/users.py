from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, hash_password, require_admin
from ..database import get_db
from ..models import User
from ..schemas import UserCreate, UserOut, UserUpdate
router = APIRouter(prefix="/users", tags=["users"])


async def _user_count(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(User))
    return int(result.scalar_one())


async def _active_admin_count(db: AsyncSession, exclude_id: int | None = None) -> int:
    query = select(func.count()).select_from(User).where(
        User.role == "admin", User.active == True
    )
    if exclude_id is not None:
        query = query.where(User.id != exclude_id)
    result = await db.execute(query)
    return int(result.scalar_one())


def _owner_guard(target: User, admin: User) -> None:
    """Schützt den primären Admin (user_id=1 / niedrigste ID).
    Nur der Owner selbst darf sein eigenes Konto verändern."""
    if target.id == 1 and admin.id != 1:
        raise HTTPException(
            status_code=403,
            detail="Der Eigentümer-Account kann nur vom Eigentümer selbst verändert werden.",
        )


@router.get("", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(User).order_by(User.id))
    return list(result.scalars().all())


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    username = data.username.strip()
    existing = await db.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Benutzername '{username}' ist bereits vergeben")

    user = User(
        username=username,
        email=data.email.strip(),
        password_hash=hash_password(data.password),
        role=data.role,
        active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    # Owner-Schutz: user_id=1 kann nur von sich selbst verändert werden
    _owner_guard(user, admin)

    # Letzten aktiven Admin schützen
    losing_admin = (user.role == "admin") and (
        (data.role is not None and data.role != "admin")
        or (data.active is not None and data.active is False)
    )
    if losing_admin and await _active_admin_count(db, exclude_id=user.id) == 0:
        raise HTTPException(
            status_code=400,
            detail="Der letzte aktive Admin kann nicht herabgestuft oder deaktiviert werden",
        )

    if data.email is not None:
        user.email = data.email.strip()
    if data.password is not None:
        user.password_hash = hash_password(data.password)
    if data.role is not None:
        user.role = data.role
    if data.active is not None:
        user.active = data.active

    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    # Owner-Schutz
    _owner_guard(user, admin)

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Du kannst dein eigenes Konto nicht löschen")
    if user.role == "admin" and await _active_admin_count(db, exclude_id=user.id) == 0:
        raise HTTPException(status_code=400, detail="Der letzte aktive Admin kann nicht gelöscht werden")

    await db.delete(user)
    await db.commit()
