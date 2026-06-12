#!/usr/bin/env python3
"""Nexboard Lizenz-Generator – nur für den Anbieter.

Erzeugt signierte Lizenzschlüssel mit dem privaten Ed25519-Schlüssel.
Die Datei license_signing_key.pem muss GEHEIM bleiben und darf niemals
in das Repository oder das Docker-Image gelangen.

Beispiele:
  python generate_license.py --plan pro --holder "Max Mustermann" --years 1
  python generate_license.py --plan pro --holder "Beispiel GmbH" --days 30
  python generate_license.py --plan pro --holder "Felix" --lifetime
"""
import argparse
import base64
import json
import secrets
from datetime import date, timedelta
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

KEY_PREFIX = "NEXB1"
PRIVATE_KEY_FILE = Path(__file__).resolve().parent / "license_signing_key.pem"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def load_private_key() -> Ed25519PrivateKey:
    if not PRIVATE_KEY_FILE.exists():
        raise SystemExit(f"Privater Schlüssel nicht gefunden: {PRIVATE_KEY_FILE}")
    key = serialization.load_pem_private_key(PRIVATE_KEY_FILE.read_bytes(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise SystemExit("Datei enthält keinen Ed25519-Schlüssel")
    return key


def generate(plan: str, holder: str, expires: str | None) -> tuple[str, dict]:
    payload = {
        "plan": plan,
        "holder": holder,
        "issued": date.today().isoformat(),
        "expires": expires,
        "id": "lic_" + secrets.token_hex(6),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    signature = load_private_key().sign(payload_bytes)
    key = f"{KEY_PREFIX}.{b64url(payload_bytes)}.{b64url(signature)}"
    return key, payload


def main():
    parser = argparse.ArgumentParser(description="Nexboard Lizenz-Generator")
    parser.add_argument("--plan", default="pro", choices=["free", "pro"])
    parser.add_argument("--holder", required=True, help="Name des Lizenznehmers")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--years", type=int, help="Gültigkeit in Jahren")
    group.add_argument("--days", type=int, help="Gültigkeit in Tagen")
    group.add_argument("--lifetime", action="store_true", help="Unbegrenzt gültig")
    args = parser.parse_args()

    expires = None
    if args.years:
        expires = (date.today() + timedelta(days=365 * args.years)).isoformat()
    elif args.days:
        expires = (date.today() + timedelta(days=args.days)).isoformat()

    key, payload = generate(args.plan, args.holder, expires)

    print()
    print("  Plan:         " + payload["plan"])
    print("  Lizenznehmer: " + payload["holder"])
    print("  Ausgestellt:  " + payload["issued"])
    print("  Gültig bis:   " + (payload["expires"] or "unbegrenzt"))
    print("  Lizenz-ID:    " + payload["id"])
    print()
    print("  LIZENZSCHLÜSSEL (an den Kunden weitergeben):")
    print("  " + key)
    print()


if __name__ == "__main__":
    main()
