"""
AIModelsConnector — pollt lokale AI-Model-Server.
Unterstützt: Ollama, vLLM, llama.cpp (OpenAI-kompatibler Endpunkt), OpenAI-kompatibel.
Kein GPU-SSH nötig — reine HTTP-Abfrage.
"""
import asyncio
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

        async with httpx.AsyncClient(
            base_url=base_url,
            headers=headers,
            timeout=self._HTTP_TIMEOUT,
            verify=False,          # self-signed TLS akzeptieren
            follow_redirects=True,
        ) as client:

            # Auto-detect: zuerst Ollama versuchen, dann OpenAI-kompatibel
            if server_type == "auto":
                server_type, detect_error = await _detect_server_type(client, base_url)
                if server_type is None:
                    return ConnectorResult(
                        status=ConnectorStatus.OFFLINE,
                        error=detect_error or "Server nicht erreichbar oder Typ nicht erkannt",
                    )

            try:
                if server_type == "ollama":
                    return await _fetch_ollama(client)
                else:
                    # vllm, llamacpp, openai — alle nutzen OpenAI /v1/models API
                    return await _fetch_openai_compat(client, server_type)

            except httpx.ConnectError:
                return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Verbindung abgelehnt")
            except httpx.TimeoutException:
                return ConnectorResult(status=ConnectorStatus.OFFLINE, error=f"Timeout nach {_AIModelsConnector_timeout(self)}s")
            except httpx.HTTPStatusError as e:
                return ConnectorResult(status=ConnectorStatus.ERROR, error=f"HTTP {e.response.status_code}")
            except Exception as e:
                return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))


def _AIModelsConnector_timeout(self) -> int:
    return AIModelsConnector._HTTP_TIMEOUT


# ─── Auto-Detect ──────────────────────────────────────────────────────────────

async def _detect_server_type(client: httpx.AsyncClient, base_url: str) -> tuple[str | None, str | None]:
    """Probiert Ollama-Endpunkt, dann OpenAI-Compat. Gibt (Typ, Fehlermeldung) zurück."""
    last_error: str | None = None

    # Ollama hat /api/tags (GET → JSON mit models-Array)
    try:
        r = await client.get("/api/tags", timeout=8)
        if r.status_code == 200 and "models" in r.json():
            return "ollama", None
    except Exception:
        pass

    # OpenAI-kompatibel hat /v1/models
    try:
        r = await client.get("/v1/models", timeout=8)
        if r.status_code in (200, 401, 403):
            return "openai", None
        last_error = f"Unerwarteter HTTP-Status {r.status_code} von {base_url}/v1/models"
    except httpx.ConnectError:
        last_error = f"Verbindung zu {base_url} abgelehnt — Server erreichbar?"
    except httpx.TimeoutException:
        last_error = f"Timeout beim Verbinden mit {base_url} — Server zu langsam oder nicht erreichbar. Tipp: Server-Typ manuell auf 'openai' setzen."
    except Exception as e:
        last_error = f"Fehler bei Auto-Erkennung: {e}"

    return None, last_error


# ─── Ollama ───────────────────────────────────────────────────────────────────

async def _fetch_ollama(client: httpx.AsyncClient) -> ConnectorResult:
    """Ollama API: /api/tags (available) + /api/ps (running/VRAM)."""

    # Version
    version = None
    try:
        r = await client.get("/api/version", timeout=5)
        if r.status_code == 200:
            version = r.json().get("version")
    except Exception:
        pass

    # Alle verfügbaren Modelle
    available_models: list[dict[str, Any]] = []
    try:
        r = await client.get("/api/tags", timeout=8)
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
        r = await client.get("/api/ps", timeout=8)
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

async def _fetch_openai_compat(client: httpx.AsyncClient, server_type: str) -> ConnectorResult:
    """Pollt /v1/models und optional /v1/completions health-Check."""

    # Model-Liste
    models: list[dict[str, Any]] = []
    try:
        r = await client.get("/v1/models", timeout=8)
        r.raise_for_status()
        data = r.json()
        for m in data.get("data", [data]) if isinstance(data, dict) else [data]:
            if isinstance(m, dict):
                models.append({
                    "name":   m.get("id") or m.get("model"),
                    "vram_mb": None,       # OpenAI-API gibt kein VRAM zurück
                    "loaded": True,
                })
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            return ConnectorResult(status=ConnectorStatus.ERROR, error="Authentifizierung fehlgeschlagen — API-Key prüfen")
        raise

    # Version / Info — vLLM hat /health, llama.cpp hat /props
    version = None
    try:
        r = await client.get("/props", timeout=4)
        if r.status_code == 200:
            props = r.json()
            version = props.get("build_info") or props.get("version")
    except Exception:
        pass
    if not version:
        try:
            r = await client.get("/health", timeout=4)
            if r.status_code == 200:
                version = "healthy"
        except Exception:
            pass

    status = ConnectorStatus.ONLINE if models else ConnectorStatus.WARNING
    return ConnectorResult(status=status, metrics={
        "server_type":         server_type,
        "server_version":      version,
        "models_loaded":       models,
        "models_loaded_count": len(models),
        "models_available":    len(models),
        "available_models":    models[:20],
        "idle":                len(models) == 0,
    })
