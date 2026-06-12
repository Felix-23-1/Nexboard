"""TLS-Zertifikats-Monitor Connector.

Prüft das SSL/TLS-Zertifikat einer Domain und meldet:
- Wie viele Tage bis zum Ablauf
- Warnungen bei < 30 Tagen, Fehler bei < 7 Tagen
"""
import asyncio
import ssl
import socket
from datetime import datetime, timezone

from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus


class TlsMonitorConnector(BaseConnector):
    meta = ConnectorMeta(
        type="tls_monitor",
        label="TLS-Zertifikat",
        description="Überwacht SSL/TLS-Zertifikate und warnt vor dem Ablauf.",
        icon="lock",
        config_schema={
            "host":    {"type": "string", "label": "Domain / Hostname", "required": True,
                        "placeholder": "z.B. example.com"},
            "port":    {"type": "number", "label": "Port",              "default": 443},
            "warn_days": {"type": "number", "label": "Warnung ab (Tage vor Ablauf)", "default": 30},
        },
    )

    async def fetch(self) -> ConnectorResult:
        host      = self.config.get("host", "").strip()
        port      = int(self.config.get("port", 443))
        warn_days = int(self.config.get("warn_days", 30))

        if not host:
            return ConnectorResult(status=ConnectorStatus.ERROR, error="Kein Host konfiguriert")

        try:
            result = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, _check_cert, host, port),
                timeout=12,
            )
        except asyncio.TimeoutError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="Timeout – Host nicht erreichbar")
        except ssl.SSLCertVerificationError as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=f"Zertifikat ungültig: {e}")
        except (OSError, ConnectionRefusedError) as e:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error=f"Verbindung fehlgeschlagen: {e}")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))

        days_left = result["days_until_expiry"]

        if days_left < 0:
            status = ConnectorStatus.ERROR
        elif days_left < 7:
            status = ConnectorStatus.ERROR
        elif days_left < warn_days:
            status = ConnectorStatus.WARNING
        else:
            status = ConnectorStatus.ONLINE

        return ConnectorResult(status=status, metrics=result)


def _check_cert(host: str, port: int) -> dict:
    ctx = ssl.create_default_context()
    with socket.create_connection((host, port), timeout=10) as raw:
        with ctx.wrap_socket(raw, server_hostname=host) as ssock:
            cert = ssock.getpeercert()

    # Ablaufdatum parsen
    not_after_str = cert.get("notAfter", "")
    not_after = datetime.strptime(not_after_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    now = datetime.now(tz=timezone.utc)
    days_left = (not_after - now).days

    # Subject / Issuer extrahieren
    def _get(field, name):
        for entry in field:
            for k, v in entry:
                if k == name:
                    return v
        return ""

    subject = cert.get("subject", [])
    issuer  = cert.get("issuer",  [])
    san     = [v for _, v in cert.get("subjectAltName", []) if _ == "DNS"]

    return {
        "host":              host,
        "port":              port,
        "days_until_expiry": days_left,
        "not_after":         not_after_str,
        "subject_cn":        _get(subject, "commonName"),
        "issuer_o":          _get(issuer, "organizationName"),
        "issuer_cn":         _get(issuer, "commonName"),
        "san":               san[:5],  # max 5 SANs
    }
