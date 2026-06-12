import httpx
import json
from dataclasses import dataclass


@dataclass
class AIAnalysis:
    explanation: str
    actions: list[str]
    severity: str


@dataclass
class LogAnalysis:
    summary: str
    findings: list[str]
    actions: list[str]
    severity: str


@dataclass
class ChatAnswer:
    answer: str


HELPDESK_SYSTEM_PROMPT = """Du bist ein persönlicher IT-Assistent (Help Desk) für einen Systemadministrator.
Du hast Zugriff auf Live-Daten seiner Infrastruktur (VMs, Connectors, Metriken) die dir als Kontext mitgegeben werden.
Antworte immer auf Deutsch. Sei direkt, präzise und hilfreich. Keine Marketing-Sprache, keine langen Einleitungen.
Beantworte Fragen zu aktuellen Systemzuständen, empfehle konkrete Befehle oder nächste Schritte.
Gib deine Antwort als JSON zurück mit diesem Feld:
- answer: Deine Antwort als Fließtext (Markdown erlaubt für Code-Blöcke)
"""

CONNECTOR_SYSTEM_PROMPT = """Du bist ein IT-Experte der Systemadministratoren hilft Fehler in ihrer Infrastruktur zu verstehen.
Antworte immer auf Deutsch. Sei präzise und konkret. Keine Marketing-Sprache.
Gib deine Antwort als JSON zurück mit diesen Feldern:
- explanation: Kurze Erklärung was das Problem ist (1-2 Sätze)
- actions: Liste mit 2-4 konkreten Handlungsschritten
- severity: "low", "medium" oder "high"
"""

LOG_SYSTEM_PROMPT = """Du bist ein IT-Experte der Logdateien für Systemadministratoren analysiert.
Antworte immer auf Deutsch. Sei präzise und konkret. Keine Marketing-Sprache.
Konzentriere dich auf Fehler, Warnungen und auffällige Muster.
Gib deine Antwort als JSON zurück mit diesen Feldern:
- summary: Kurze Zusammenfassung was in den Logs passiert (2-3 Sätze)
- findings: Liste mit den wichtigsten Auffälligkeiten oder Fehlern (2-5 Einträge, je 1 Satz)
- actions: Liste mit 2-4 konkreten Handlungsschritten
- severity: "low", "medium" oder "high"
"""

MAX_LOG_CHARS = 15000


def _as_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(x) for x in value if str(x).strip()]
    if value:
        return [str(value)]
    return []


def _extract_json(content: str) -> dict:
    start = content.find("{")
    end = content.rfind("}") + 1
    if start == -1 or end <= start:
        raise ValueError("Keine JSON-Antwort vom Modell erhalten")
    return json.loads(content[start:end])


def _build_connector_prompt(connector_name: str, connector_type: str, status: str, error: str | None, metrics: dict) -> str:
    lines = [
        f"Connector: {connector_name} ({connector_type})",
        f"Status: {status}",
    ]
    if error:
        lines.append(f"Fehlermeldung: {error}")
    if metrics:
        lines.append(f"Metriken: {json.dumps(metrics, ensure_ascii=False, indent=2)}")
    return "\n".join(lines)


def _build_log_prompt(logs: str, context: str | None) -> str:
    cleaned = logs.strip()
    note = ""
    if len(cleaned) > MAX_LOG_CHARS:
        cleaned = cleaned[-MAX_LOG_CHARS:]
        note = "(Hinweis: Die Logdatei wurde gekürzt – nur die letzten Zeilen werden analysiert.)\n"
    parts = []
    if context and context.strip():
        parts.append(f"Kontext: {context.strip()}")
    parts.append(note + "Logdaten:\n" + cleaned)
    return "\n\n".join(parts)


# --- Provider-Aufrufe ---------------------------------------------------------

async def _chat_openai(api_key: str, model: str, system: str, user: str) -> dict:
    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model or "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "response_format": {"type": "json_object"},
                "max_tokens": 800,
            },
        )
        resp.raise_for_status()
        return json.loads(resp.json()["choices"][0]["message"]["content"])


async def _chat_anthropic(api_key: str, model: str, system: str, user: str) -> dict:
    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model or "claude-3-5-haiku-20241022",
                "max_tokens": 800,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
        )
        if not resp.is_success:
            err = resp.json().get("error", {}).get("message", resp.text)
            raise ValueError(f"Anthropic API: {err}")
        return _extract_json(resp.json()["content"][0]["text"])


async def _chat_ollama(base_url: str, model: str, system: str, user: str) -> dict:
    url = base_url.rstrip("/")
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            f"{url}/api/chat",
            json={
                "model": model or "llama3.2",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "stream": False,
                "format": "json",
            },
        )
        resp.raise_for_status()
        return _extract_json(resp.json()["message"]["content"])


async def _dispatch(provider: str, api_key: str, model: str, ollama_url: str, system: str, user: str) -> dict:
    if provider == "openai":
        return await _chat_openai(api_key, model, system, user)
    elif provider == "anthropic":
        return await _chat_anthropic(api_key, model, system, user)
    elif provider == "ollama":
        return await _chat_ollama(ollama_url or "http://localhost:11434", model, system, user)
    else:
        raise ValueError(f"Unbekannter AI-Provider: {provider}")


# --- Öffentliche Funktionen ---------------------------------------------------

async def analyze(
    provider: str,
    api_key: str,
    model: str,
    ollama_url: str,
    connector_name: str,
    connector_type: str,
    status: str,
    error: str | None,
    metrics: dict,
) -> AIAnalysis:
    user = _build_connector_prompt(connector_name, connector_type, status, error, metrics)
    data = await _dispatch(provider, api_key, model, ollama_url, CONNECTOR_SYSTEM_PROMPT, user)
    return AIAnalysis(
        explanation=data.get("explanation", ""),
        actions=_as_list(data.get("actions")),
        severity=data.get("severity", "medium"),
    )


async def analyze_logs(
    provider: str,
    api_key: str,
    model: str,
    ollama_url: str,
    logs: str,
    context: str | None = None,
) -> LogAnalysis:
    user = _build_log_prompt(logs, context)
    data = await _dispatch(provider, api_key, model, ollama_url, LOG_SYSTEM_PROMPT, user)
    return LogAnalysis(
        summary=data.get("summary", ""),
        findings=_as_list(data.get("findings")),
        actions=_as_list(data.get("actions")),
        severity=data.get("severity", "medium"),
    )


async def chat(
    provider: str,
    api_key: str,
    model: str,
    ollama_url: str,
    question: str,
    infra_context: str | None = None,
) -> ChatAnswer:
    parts = []
    if infra_context and infra_context.strip():
        parts.append(f"Aktuelle Infrastruktur-Daten:\n{infra_context.strip()}")
    parts.append(f"Frage: {question.strip()}")
    user = "\n\n".join(parts)
    data = await _dispatch(provider, api_key, model, ollama_url, HELPDESK_SYSTEM_PROMPT, user)
    return ChatAnswer(answer=data.get("answer", ""))
