"""
AIModelsConnector — pollt lokale AI-Model-Server.
Unterstützt: Ollama, vLLM, llama.cpp (OpenAI-kompatibler Endpunkt), OpenAI-kompatibel.
Kein GPU-SSH nötig — reine HTTP-Abfrage.
Usage-Tracking: OpenRouter Credits-API, OpenAI Billing-API.
"""
import asyncio
from datetime import datetime
from typing import Any

import httpx

from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class AIModelsConnector(BaseConnector):
    meta = ConnectorMeta(
        type="ai_models",
        label="AI Model Server",
        description=(
            "Überwacht lokale AI-Model-Server: Ollama, vLLM, llama.cpp. "
            "Zeigt geladene Modelle, VRAM-Verbrauch und Server-Version."
        ),
        icon="cpu",
        config_schema={
            "base_url": {
                "type": "string",
                "label": "Server-URL",
                "required": True,
                "placeholder": "http://192.168.1.10:11434",
                "help": "Basis-URL des AI-Servers (ohne Pfad)",
            },
            "server_type": {
                "type": "select",
                "label": "Server-Typ",
                "options": ["auto", "ollama", "vllm", "llamacpp", "openai"],
                "default": "auto",
                "help": "auto = Typ selbst erkennen",
            },
            "api_key": {
                "type": "string",
                "label": "API-Key (optional)",
                "secret": True,
                "help": "Nur nötig wenn Server Auth verlangt",
            },
        },
    )

    # Timeout pro HTTP-Anfrage (Sekunden)
    _HTTP_TIMEOUT = 10

    async def fetch(self) -> ConnectorResult:
        base_url    = self.config.get("base_url", "").rstrip("/")
        server_type = self.config.get("server_type", "auto").lower()
        api_key     = self.config.get("api_key") or None

        if not base_url:
            return ConnectorResult(status=ConnectorStatus.ERROR, error="base_url ist Pflichtfeld")

        headers: dict[str, str] = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        # Kein base_url im Client — wir bauen alle URLs selbst (f"{base_url}/path").
        # Das vermeidet httpx-URL-Merging-Probleme mit Pfad-Präfixen wie /api/v1.
        async with httpx.AsyncClient(
            headers=headers,
            timeout=self._HTTP_TIMEOUT,
            verify=False,
            follow_redirects=True,
        ) as client:

            # Auto-detect: zuerst Ollama versuchen, dann OpenAI-kompatibel
            if server_type == "auto":
                server_type, detect_error = await _detect_server_type(client, base_url)
                if server_type is None:
                    return ConnectorResult(
                        status=ConnectorStatus.OFFLINE,
                        error=detect_error or "Server nicht erreichbar. Tipp: Server-Typ manuell wählen.",
                    )

            try:
                if server_type == "ollama":
                    return await _fetch_ollama(client, base_url)
                else:
                    # vllm, llamacpp, openai, openrouter — alle nutzen <base_url>/models
                    return await _fetch_openai_compat(client, base_url, server_type)

            except httpx.ConnectError:
                return ConnectorResult(status=ConnectorStatus.OFFLINE, error=f"Verbindung zu {base_url} abgelehnt")
            except httpx.TimeoutException:
                return ConnectorResult(status=ConnectorStatus.OFFLINE, error=f"Timeout nach {self._HTTP_TIMEOUT}s")
            except httpx.HTTPStatusError as e:
                return ConnectorResult(status=ConnectorStatus.ERROR, error=f"HTTP {e.response.status_code}: {e.response.text[:120]}")
            except Exception as e:
                return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))


# ─── Auto-Detect ──────────────────────────────────────────────────────────────

async def _detect_server_type(client: httpx.AsyncClient, base_url: str) -> tuple[str | None, str | None]:
    """Probiert Ollama-Endpunkt, dann OpenAI-Compat. Gibt (Typ, Fehlermeldung) zurück."""
    last_error: str | None = None

    # Ollama: /api/tags liefert JSON mit models-Array
    try:
        r = await client.get(f"{base_url}/api/tags", timeout=8)
        if r.status_code == 200 and "models" in r.json():
            return "ollama", None
    except Exception:
        pass

    # OpenAI-kompatibel: <base_url>/models (Nutzer gibt /v1 in URL an)
    try:
        r = await client.get(f"{base_url}/models", timeout=8)
        if r.status_code in (200, 401, 403):
            return "openai", None
        last_error = f"HTTP {r.status_code} von {base_url}/models — Typ nicht erkannt"
    except httpx.ConnectError:
        last_error = f"Verbindung zu {base_url} abgelehnt. Server erreichbar?"
    except httpx.TimeoutException:
        last_error = f"Timeout ({base_url}). Tipp: Server-Typ manuell wählen."
    except Exception as e:
        last_error = f"Auto-Erkennung Fehler: {e}"

    return None, last_error


# ─── Ollama ───────────────────────────────────────────────────────────────────

async def _fetch_ollama(client: httpx.AsyncClient, base_url: str) -> ConnectorResult:
    """Ollama API: /api/tags (available) + /api/ps (running/VRAM)."""

    # Version
    version = None
    try:
        r = await client.get(f"{base_url}/api/version", timeout=5)
        if r.status_code == 200:
            version = r.json().get("version")
    except Exception:
        pass

    # Alle verfügbaren Modelle
    available_models: list[dict[str, Any]] = []
    try:
        r = await client.get(f"{base_url}/api/tags", timeout=8)
        r.raise_for_status()
        for m in r.json().get("models", []):
            available_models.append({
                "name":     m.get("name"),
                "size_gb":  round(m.get("size", 0) / 1e9, 2),
                "modified": m.get("modified_at"),
                "family":   m.get("details", {}).get("family"),
            })
    except Exception as e:
        return ConnectorResult(status=ConnectorStatus.ERROR, error=f"Ollama /api/tags Fehler: {e}")

    # Aktuell laufende Modelle (mit VRAM)
    loaded_models: list[dict[str, Any]] = []
    try:
        r = await client.get(f"{base_url}/api/ps", timeout=8)
        if r.status_code == 200:
            for m in r.json().get("models", []):
                vram_mb = None
                sz = m.get("size_vram") or m.get("size")
                if sz:
                    vram_mb = round(sz / 1e6, 0)
                loaded_models.append({
                    "name":    m.get("name"),
                    "vram_mb": vram_mb,
                    "expires": m.get("expires_at"),
                    "loaded":  True,
                })
    except Exception:
        pass

    models_available = len(available_models)
    status = ConnectorStatus.ONLINE
    if models_available == 0:
        status = ConnectorStatus.WARNING

    return ConnectorResult(status=status, metrics={
        "server_type":       "ollama",
        "server_version":    version,
        "models_loaded":     loaded_models,
        "models_loaded_count": len(loaded_models),
        "models_available":  models_available,
        "available_models":  available_models[:20],
        "idle":              len(loaded_models) == 0,
    })


# ─── OpenAI-kompatibel (vLLM, llama.cpp, …) ──────────────────────────────────

async def _fetch_openai_compat(client: httpx.AsyncClient, base_url: str, server_type: str) -> ConnectorResult:
    """Pollt <base_url>/models — funktioniert für OpenAI, OpenRouter, vLLM, llama.cpp.
    Nutzer gibt die vollständige Basis-URL an, z.B.:
      https://api.openai.com/v1
      https://openrouter.ai/api/v1
      http://localhost:8000/v1
    """

    # Model-Liste
    models: list[dict[str, Any]] = []
    try:
        r = await client.get(f"{base_url}/models", timeout=8)
        r.raise_for_status()
        data = r.json()
        for m in data.get("data", [data]) if isinstance(data, dict) else [data]:
            if isinstance(m, dict):
                models.append({
                    "name":    m.get("id") or m.get("model"),
                    "vram_mb": None,
                    "loaded":  True,
                })
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            return ConnectorResult(status=ConnectorStatus.ERROR, error="Authentifizierung fehlgeschlagen — API-Key prüfen")
        raise

    # Version / Info — vLLM hat /health, llama.cpp hat /props
    version = None
    try:
        r = await client.get(f"{base_url}/props", timeout=4)
        if r.status_code == 200:
            props = r.json()
            version = props.get("build_info") or props.get("version")
    except Exception:
        pass
    if not version:
        try:
            r = await client.get(f"{base_url}/health", timeout=4)
            if r.status_code == 200:
                version = "healthy"
        except Exception:
            pass

    # Usage / Credits abrufen (OpenRouter + OpenAI)
    usage = await _fetch_usage(client, base_url)

    status = ConnectorStatus.ONLINE if models else ConnectorStatus.WARNING
    return ConnectorResult(status=status, metrics={
        "server_type":         server_type,
        "server_version":      version,
        "models_loaded":       models,
        "models_loaded_count": len(models),
        "models_available":    len(models),
        "available_models":    models[:20],
        "idle":                len(models) == 0,
        "usage":               usage,   # None wenn nicht verfügbar
    })


# ─── Usage / Credits ──────────────────────────────────────────────────────────

async def _fetch_usage(client: httpx.AsyncClient, base_url: str) -> dict | None:
    """
    Ruft Verbrauchs-/Credits-Daten ab.
    OpenRouter: GET /api/v1/auth/key  → credits used/remaining
    OpenAI:     GET /dashboard/billing/usage + /subscription → monthly spend
    Gibt None zurück wenn der Server keine Usage-API hat.
    """
    url_lower = base_url.lower()

    # ── OpenRouter ──────────────────────────────────────────────────────────
    if "openrouter.ai" in url_lower:
        try:
            r = await client.get("https://openrouter.ai/api/v1/auth/key", timeout=8)
            if r.status_code == 200:
                d = r.json().get("data", {})
                usage_usd      = d.get("usage")        # float, total USD spent
                limit_usd      = d.get("limit")        # float or None
                is_free        = d.get("is_free_tier", False)
                label          = d.get("label", "")
                remaining_usd  = (limit_usd - usage_usd) if (limit_usd and usage_usd is not None) else None
                return {
                    "provider":       "openrouter",
                    "label":          label,
                    "credits_used":   round(usage_usd, 4) if usage_usd is not None else None,
                    "credits_limit":  round(limit_usd, 2) if limit_usd else None,
                    "credits_remaining": round(remaining_usd, 2) if remaining_usd is not None else None,
                    "is_free_tier":   is_free,
                    "currency":       "USD",
                }
        except Exception:
            pass
        return None

    # ── OpenAI ──────────────────────────────────────────────────────────────
    if "openai.com" in url_lower:
        # Hinweis: OpenAI hat die /dashboard/billing/* API für Standard-API-Keys deprecated.
        # Wir versuchen es trotzdem (funktioniert noch bei einigen älteren Accounts),
        # geben aber immer mindestens das Provider-Objekt zurück.
        result: dict = {"provider": "openai", "currency": "USD"}
        now   = datetime.utcnow()
        start = now.strftime("%Y-%m-01")
        end   = now.strftime("%Y-%m-%d")

        # Legacy billing (funktioniert noch für ältere Pay-as-you-go Accounts)
        try:
            r = await client.get(
                f"https://api.openai.com/dashboard/billing/usage?start_date={start}&end_date={end}",
                timeout=8,
            )
            if r.status_code == 200:
                data = r.json()
                total_cents = data.get("total_usage", 0)
                result["credits_used"] = round(total_cents / 100, 4)
                result["period"]       = f"{start} – {end}"
        except Exception:
            pass

        # Subscription limit
        try:
            r = await client.get(
                "https://api.openai.com/dashboard/billing/subscription", timeout=8
            )
            if r.status_code == 200:
                sub = r.json()
                result["credits_limit"] = round(sub.get("hard_limit_usd", 0), 2)
                result["plan"]          = sub.get("plan", {}).get("title")
        except Exception:
            pass

        used  = result.get("credits_used")
        limit = result.get("credits_limit")
        if limit and used is not None:
            result["credits_remaining"] = round(limit - used, 2)

        # Immer zurückgeben — auch ohne Billing-Daten (damit die Karte OpenAI-styled ist)
        return result

    return None  # lokaler Server — keine Usage-API
