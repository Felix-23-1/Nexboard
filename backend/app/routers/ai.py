from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

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
