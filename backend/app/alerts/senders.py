"""Versand-Funktionen für Benachrichtigungskanäle.

Unterstützte Typen:
- email   : SMTP (STARTTLS / SSL / plain)
- discord : Incoming Webhook
- slack   : Incoming Webhook
- teams   : Microsoft Teams Incoming Webhook
- telegram: Telegram Bot API
- webhook : Generischer HTTP-Webhook
"""
import asyncio
import smtplib
import ssl
from email.message import EmailMessage

import httpx

_DISCORD_COLOR = {
    "info":     0x3B82F6,
    "warning":  0xFACC15,
    "critical": 0xEF4444,
}


# ── Discord ────────────────────────────────────────────────────────────────────

async def send_discord(webhook_url: str, title: str, message: str, severity: str = "warning"):
    if not webhook_url:
        raise ValueError("Discord-Webhook-URL fehlt")
    payload = {
        "embeds": [{
            "title": title,
            "description": message,
            "color": _DISCORD_COLOR.get(severity, 0x9CA3AF),
        }]
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(webhook_url, json=payload)
        if not resp.is_success:
            raise ValueError(f"Discord-Webhook antwortete mit HTTP {resp.status_code}: {resp.text[:200]}")


# ── Slack ──────────────────────────────────────────────────────────────────────

async def send_slack(webhook_url: str, title: str, message: str, severity: str = "warning"):
    if not webhook_url:
        raise ValueError("Slack-Webhook-URL fehlt")
    emoji = {"info": ":information_source:", "warning": ":warning:", "critical": ":rotating_light:"}.get(severity, ":bell:")
    payload = {"text": f"{emoji} *{title}*\n{message}"}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(webhook_url, json=payload)
        if not resp.is_success:
            raise ValueError(f"Slack-Webhook antwortete mit HTTP {resp.status_code}: {resp.text[:200]}")


# ── Microsoft Teams ────────────────────────────────────────────────────────────

async def send_teams(webhook_url: str, title: str, message: str, severity: str = "warning"):
    if not webhook_url:
        raise ValueError("Teams-Webhook-URL fehlt")
    color = {"info": "0078D4", "warning": "FFC107", "critical": "D13438"}.get(severity, "9CA3AF")
    payload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": color,
        "summary": title,
        "sections": [{"activityTitle": title, "activityText": message}],
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(webhook_url, json=payload)
        if not resp.is_success:
            raise ValueError(f"Teams-Webhook antwortete mit HTTP {resp.status_code}: {resp.text[:200]}")


# ── Telegram ───────────────────────────────────────────────────────────────────

async def send_telegram(bot_token: str, chat_id: str, title: str, message: str, parse_mode: str = "text"):
    if not bot_token:
        raise ValueError("Telegram Bot-Token fehlt")
    if not chat_id:
        raise ValueError("Telegram Chat-ID fehlt")
    text = f"<b>{title}</b>\n{message}" if parse_mode == "HTML" else f"*{title}*\n{message}" if parse_mode == "Markdown" else f"{title}\n{message}"
    params: dict = {"chat_id": chat_id, "text": text}
    if parse_mode in ("HTML", "Markdown"):
        params["parse_mode"] = parse_mode
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(f"https://api.telegram.org/bot{bot_token}/sendMessage", json=params)
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(f"Telegram-Fehler: {data.get('description', 'Unbekannter Fehler')}")


# ── Generic Webhook ────────────────────────────────────────────────────────────

async def send_webhook(config: dict, title: str, message: str, severity: str = "warning"):
    url = config.get("webhook_url") or config.get("url")
    if not url:
        raise ValueError("Webhook-URL fehlt")
    method = (config.get("method") or "POST").upper()
    secret = config.get("secret") or ""
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["Authorization"] = secret
    payload = {"title": title, "message": message, "severity": severity}
    async with httpx.AsyncClient(timeout=10) as client:
        req = client.build_request(method, url, json=payload, headers=headers)
        resp = await client.send(req)
        if not resp.is_success:
            raise ValueError(f"Webhook antwortete mit HTTP {resp.status_code}: {resp.text[:200]}")


# ── E-Mail (SMTP) ──────────────────────────────────────────────────────────────

def _send_email_sync(config: dict, subject: str, body: str):
    # Unterstützt beide Key-Varianten (smtp_host/host, smtp_user/username, etc.)
    host     = config.get("smtp_host") or config.get("host") or ""
    port     = int(config.get("smtp_port") or config.get("port") or 587)
    tls_mode = config.get("smtp_tls") or ("ssl" if config.get("use_ssl") else "starttls" if config.get("use_tls", True) else "none")
    username = config.get("smtp_user") or config.get("username") or ""
    password = config.get("smtp_pass") or config.get("smtp_password") or config.get("password") or ""
    from_addr = config.get("from_addr") or username
    to_addr   = config.get("to_email") or config.get("to_addr") or ""

    if not host:
        raise ValueError("SMTP-Host fehlt")
    if not to_addr:
        raise ValueError("Empfänger-E-Mail fehlt (to_email)")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"]    = from_addr or "nexboard@localhost"
    msg["To"]      = to_addr
    msg.set_content(body)

    if tls_mode == "ssl":
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, timeout=15, context=ctx) as smtp:
            if username:
                smtp.login(username, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.ehlo()
            if tls_mode == "starttls":
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            if username:
                smtp.login(username, password)
            smtp.send_message(msg)


async def send_email(config: dict, subject: str, body: str):
    await asyncio.to_thread(_send_email_sync, config, subject, body)


# ── Dispatcher ─────────────────────────────────────────────────────────────────

async def send_via(channel_type: str, channel_config: dict, title: str, message: str, severity: str = "warning"):
    """Versendet Titel + Nachricht über den angegebenen Kanal."""
    cfg = channel_config or {}
    if channel_type == "discord":
        await send_discord(cfg.get("webhook_url", ""), title, message, severity)
    elif channel_type == "slack":
        await send_slack(cfg.get("webhook_url", ""), title, message, severity)
    elif channel_type == "teams":
        await send_teams(cfg.get("webhook_url", ""), title, message, severity)
    elif channel_type == "telegram":
        await send_telegram(cfg.get("bot_token", ""), cfg.get("chat_id", ""), title, message, cfg.get("parse_mode", "text"))
    elif channel_type == "webhook":
        await send_webhook(cfg, title, message, severity)
    elif channel_type == "email":
        await send_email(cfg, title, message)
    else:
        raise ValueError(f"Unbekannter Kanal-Typ: {channel_type}")
