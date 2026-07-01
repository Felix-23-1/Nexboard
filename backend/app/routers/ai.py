from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import httpx

from ..auth import get_current_user
from ..database import get_db
from ..models import ConnectorConfig, User
from ..connectors import registry
from ..ai.analyzer import analyze, analyze_logs, chat
from .settings import _get_setting

router = APIRouter(prefix="/ai", tags=["ai"], dependencies=[Depends(get_current_user)])


class AnalyzeRequest(BaseModel):
    connector_id: int


class LogAnalyzeRequest(BaseModel):
    logs: str
    context: str | None = None


class ChatRequest(BaseModel):
    question: str
    infra_context: str | None = None


class ConnectorChatMessage(BaseModel):
    role: str   # "user" | "assistant" | "system"
    content: str


class ConnectorChatRequest(BaseModel):
    connector_id: int
    messages: list[ConnectorChatMessage]
    model: str | None = None
    max_tokens: int = 2048
    temperature: float = 0.7


async def _get_ai_config(db: AsyncSession, user_id: int) -> dict:
    """Liest die KI-Konfiguration des Users."""
    provider   = await _get_setting(db, user_id, "ai_provider")
    api_key    = await _get_setting(db, user_id, "ai_api_key")
    model      = await _get_setting(db, user_id, "ai_model")
    ollama_url = await _get_setting(db, user_id, "ai_ollama_url")

    if not provider:
        raise HTTPException(status_code=400, detail="Kein AI-Provider konfiguriert. Gehe zu Einstellungen.")
    if provider in ("openai", "anthropic") and not api_key:
        raise HTTPException(status_code=400, detail="Kein API Key konfiguriert. Gehe zu Einstellungen.")

    return {"provider": provider, "api_key": api_key, "model": model, "ollama_url": ollama_url}


@router.post("/analyze")
async def analyze_connector(
    req: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    connector = await db.get(ConnectorConfig, req.connector_id)
    if not connector or connector.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Connector nicht gefunden")

    cls = registry.get(connector.type)
    if not cls:
        raise HTTPException(status_code=400, detail="Connector-Typ nicht verfügbar")

    result = await cls(connector.config).fetch()
    cfg = await _get_ai_config(db, current_user.id)

    try:
        analysis = await analyze(
            **cfg,
            connector_name=connector.name,
            connector_type=connector.type,
            status=result.status.value,
            error=result.error,
            metrics=result.metrics,
        )
        return {
            "connector_id":   connector.id,
            "connector_name": connector.name,
            "status":         result.status.value,
            "explanation":    analysis.explanation,
            "actions":        analysis.actions,
            "severity":       analysis.severity,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI-Analyse fehlgeschlagen: {e}")


@router.post("/analyze-logs")
async def analyze_log_text(
    req: LogAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    if not req.logs or not req.logs.strip():
        raise HTTPException(status_code=400, detail="Keine Logdaten angegeben")

    cfg = await _get_ai_config(db, current_user.id)
    try:
        analysis = await analyze_logs(**cfg, logs=req.logs, context=req.context)
        return {"summary": analysis.summary, "findings": analysis.findings,
                "actions": analysis.actions, "severity": analysis.severity}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Log-Analyse fehlgeschlagen: {e}")


@router.post("/connector-chat")
async def connector_chat(
    req: ConnectorChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Proxied Chat direkt an einen ai_models-Connector (OpenRouter, OpenAI, Ollama, …)."""

    connector = await db.get(ConnectorConfig, req.connector_id)
    if not connector or connector.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Connector nicht gefunden")
    if connector.type != "ai_models":
        raise HTTPException(status_code=400, detail="Nur AI-Modell-Connectors unterstützen Chat")

    config      = connector.config or {}
    base_url    = config.get("base_url", "").rstrip("/")
    api_key     = config.get("api_key") or None
    server_type = config.get("server_type", "auto").lower()

    if not base_url:
        raise HTTPException(status_code=400, detail="Connector hat keine Server-URL konfiguriert")

    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    async with httpx.AsyncClient(
        headers=headers,
        timeout=120,
        verify=False,
        follow_redirects=True,
    ) as client:

        # ── Detect Ollama ──────────────────────────────────────────────────────
        is_ollama = server_type == "ollama"
        if server_type == "auto":
            try:
                r = await client.get(f"{base_url}/api/tags", timeout=5)
                if r.status_code == 200 and "models" in r.json():
                    is_ollama = True
            except Exception:
                pass

        try:
            # ── Ollama ─────────────────────────────────────────────────────────
            if is_ollama:
                model = req.model or "llama3"
                payload = {
                    "model": model,
                    "messages": [{"role": m.role, "content": m.content} for m in req.messages],
                    "stream": False,
                    "options": {"temperature": req.temperature},
                }
                r = await client.post(f"{base_url}/api/chat", json=payload)
                r.raise_for_status()
                data = r.json()
                return {
                    "content": data.get("message", {}).get("content", ""),
                    "model":   data.get("model"),
                    "usage":   {
                        "prompt_tokens":     data.get("prompt_eval_count"),
                        "completion_tokens": data.get("eval_count"),
                    },
                }

            # ── OpenAI-compatible (OpenRouter, OpenAI, vLLM, llama.cpp) ────────
            else:
                model = req.model
                # Auto-pick first model if none given
                if not model:
                    try:
                        r = await client.get(f"{base_url}/models", timeout=5)
                        if r.status_code == 200:
                            items = r.json().get("data", [])
                            if items:
                                model = items[0].get("id")
                    except Exception:
                        pass
                if not model:
                    model = "gpt-4o-mini"  # last-resort fallback

                payload = {
                    "model":       model,
                    "messages":    [{"role": m.role, "content": m.content} for m in req.messages],
                    "max_tokens":  req.max_tokens,
                    "temperature": req.temperature,
                }
                r = await client.post(f"{base_url}/chat/completions", json=payload)
                r.raise_for_status()
                data = r.json()
                return {
                    "content": data["choices"][0]["message"]["content"],
                    "model":   data.get("model"),
                    "usage":   data.get("usage"),
                }

        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=502,
                detail=f"AI-Server Fehler: HTTP {e.response.status_code} — {e.response.text[:300]}",
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="AI-Server Timeout (>120s)")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Verbindungsfehler: {str(e)[:200]}")


@router.post("/chat")
async def helpdesk_chat(
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="Keine Frage angegeben")

    cfg = await _get_ai_config(db, current_user.id)
    try:
        result = await chat(**cfg, question=req.question, infra_context=req.infra_context)
        return {"answer": result.answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Help Desk Fehler: {e}")
