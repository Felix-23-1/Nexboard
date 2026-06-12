"""Lizenz-System: Offline-Validierung kryptografisch signierter Lizenzschluessel.

Ein Lizenzschluessel hat das Format:  NEXB1.<base64url(payload)>.<base64url(signatur)>
Die Signatur wird mit dem privaten Ed25519-Schluessel des Anbieters erzeugt und
hier mit dem fest eingebetteten oeffentlichen Schluessel geprueft. Es ist keine
Internetverbindung noetig ("Self-hosted License Key Validierung").
"""
import base64
import json
from dataclasses import dataclass, field
from datetime import date

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

KEY_PREFIX = "NEXB1"

# Oeffentlicher Schluessel des Anbieters (Ed25519, raw, hex).
# Der zugehoerige private Schluessel liegt ausschliesslich beim Anbieter.
_PUBLIC_KEY_HEX = "e562a68ccd6d53aa36a49988a87969f419337bb848388c0623740a2655301c8c"
_PUBLIC_KEY = Ed25519PublicKey.from_public_bytes(bytes.fromhex(_PUBLIC_KEY_HEX))


# --- Feature-Matrix -----------------------------------------------------------

PLANS: dict[str, dict] = {
    "free": {
        "label": "Free",
        "max_connectors": 3,
        "max_users": 1,
        "ai_analysis": False,
        "executive_view": False,
        "alerts": False,
        "history": False,
    },
    "pro": {
        "label": "Pro",
        "max_connectors": None,  # unbegrenzt
        "max_users": None,
        "ai_analysis": True,
        "executive_view": True,
        "alerts": True,
        "history": True,
    },
}


class LicenseError(Exception):
    """Lizenzschluessel ist formal ungueltig oder die Signatur stimmt nicht."""


@dataclass
class LicenseState:
    plan: str = "free"
    status: str = "none"  # none | active | expired | invalid
    valid: bool = False
    holder: str | None = None
    issued: str | None = None
    expires: str | None = None
    days_remaining: int | None = None
    license_id: str | None = None
    message: str = "Keine Lizenz hinterlegt – Free-Version aktiv."
    features: dict = field(default_factory=lambda: dict(PLANS["free"]))

    def to_dict(self) -> dict:
        return {
            "plan": self.plan,
            "status": self.status,
            "valid": self.valid,
            "holder": self.holder,
            "issued": self.issued,
            "expires": self.expires,
            "days_remaining": self.days_remaining,
            "license_id": self.license_id,
            "message": self.message,
            "features": self.features,
        }


# --- Hilfsfunktionen ----------------------------------------------------------

def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def verify_license_key(key: str) -> dict:
    """Prueft Format und Signatur eines Schluessels. Gibt die Nutzdaten zurueck
    oder wirft LicenseError. Eine Pruefung auf Ablauf erfolgt hier NICHT."""
    parts = key.strip().split(".")
    if len(parts) != 3 or parts[0] != KEY_PREFIX:
        raise LicenseError("Ungültiges Schlüsselformat")

    try:
        payload_bytes = _b64url_decode(parts[1])
        signature = _b64url_decode(parts[2])
    except (ValueError, TypeError):
        raise LicenseError("Schlüssel ist beschädigt")

    try:
        _PUBLIC_KEY.verify(signature, payload_bytes)
    except InvalidSignature:
        raise LicenseError("Signatur ungültig – Schlüssel stammt nicht vom Anbieter")

    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise LicenseError("Nutzdaten des Schlüssels sind beschädigt")

    if payload.get("plan") not in PLANS:
        raise LicenseError("Unbekannter Lizenz-Plan")
    return payload


def get_license_state(key: str | None) -> LicenseState:
    """Ermittelt den vollstaendigen Lizenz-Status inkl. Feature-Freischaltung."""
    if not key:
        return LicenseState()

    try:
        payload = verify_license_key(key)
    except LicenseError as exc:
        state = LicenseState(status="invalid", message=f"Lizenz ungültig: {exc}")
        state.features = dict(PLANS["free"])
        return state

    plan = payload["plan"]
    holder = payload.get("holder")
    issued = payload.get("issued")
    expires = payload.get("expires")
    license_id = payload.get("id")

    days_remaining = None
    if expires:
        try:
            exp_date = date.fromisoformat(expires)
            days_remaining = (exp_date - date.today()).days
        except ValueError:
            return LicenseState(
                status="invalid",
                message="Lizenz ungültig: fehlerhaftes Ablaufdatum",
            )
        if days_remaining < 0:
            return LicenseState(
                plan="free",
                status="expired",
                holder=holder,
                issued=issued,
                expires=expires,
                days_remaining=days_remaining,
                license_id=license_id,
                message=f"Lizenz am {expires} abgelaufen – Free-Version aktiv.",
                features=dict(PLANS["free"]),
            )

    msg = f"{PLANS[plan]['label']}-Lizenz aktiv"
    if holder:
        msg += f" – lizenziert für {holder}"
    if expires:
        msg += f" (gültig bis {expires})"
    else:
        msg += " (unbegrenzt gültig)"

    return LicenseState(
        plan=plan,
        status="active",
        valid=True,
        holder=holder,
        issued=issued,
        expires=expires,
        days_remaining=days_remaining,
        license_id=license_id,
        message=msg,
        features=dict(PLANS[plan]),
    )
