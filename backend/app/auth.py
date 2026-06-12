"""Authentifizierung: Passwort-Hashing, JWT-Token und FastAPI-Dependencies."""
import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from .database import DATA_DIR, get_db
from .models import User

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24 * 7  # 7 Tage

# Secret liegt im Datenverzeichnis, damit es zusammen mit der DB persistiert.
_SECRET_FILE = Path(DATA_DIR) / ".jwt_secret"


def _load_secret() -> str:
    """JWT-Secret aus Env, Datei oder neu generiert (persistiert)."""
    env = os.getenv("NEXBOARD_JWT_SECRET")
    if env:
        return env
    try:
        if _SECRET_FILE.exists():
            existing = _SECRET_FILE.read_text().strip()
            if existing:
                return existing
        generated = secrets.token_hex(32)
        _SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
        _SECRET_FILE.write_text(generated)
        return generated
    except OSError:
        # Fallback falls Dateisystem schreibgeschuetzt ist
        return secrets.token_hex(32)


SECRET_KEY = _load_secret()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# --- Passwort-Hashing ---------------------------------------------------------

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# --- JWT ----------------------------------------------------------------------

def create_access_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# --- Dependencies -------------------------------------------------------------

_credentials_exc = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Nicht authentifiziert",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise _credentials_exc
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _credentials_exc

    user = await db.get(User, user_id)
    if not user or not user.active:
        raise _credentials_exc
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Diese Aktion erfordert Admin-Rechte",
        )
    return user
