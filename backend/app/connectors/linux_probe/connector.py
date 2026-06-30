"""
LinuxProbeConnector — vollständiger Systemprobe via SSH.
Führt probe_script.py via stdin-pipe aus und liefert:
  system (CPU, RAM, Disk, Uptime, Temp, VM-Flag)
  gpu (VRAM, Util, Temp, Power — graceful wenn nvidia-smi fehlt)
  systemd (failed units, running count)
  network (interfaces, DNS, offene Ports)
  security (Firewall, SSH-Härtung, fail2ban, Reboot-pending)
"""
import asyncio
import json

from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus
from .probe_script import PROBE_SCRIPT

try:
    import asyncssh  # type: ignore
    _SSH_AVAILABLE = True
except ImportError:
    _SSH_AVAILABLE = False


class LinuxProbeConnector(BaseConnector):
    meta = ConnectorMeta(
        type="linux_probe",
        label="Linux Full-Probe (SSH)",
        description=(
            "Vollständige Systemdiagnose via SSH: CPU, RAM, Disk, GPU, "
            "Systemd-Services, Netzwerk-Interfaces, Security-Posture – alles in einem SSH-Call."
        ),
        icon="cpu",
        config_schema={
            "host":     {"type": "string", "label": "Hostname / IP",         "required": True},
            "port":     {"type": "number", "label": "SSH Port",              "default": 22},
            "username": {"type": "string", "label": "SSH-Benutzer",          "required": True},
            "password": {
                "type": "string", "label": "Passwort", "secret": True,
                "help": "Passwort oder SSH-Key verwenden",
            },
            "ssh_key":  {
                "type": "text", "label": "Privater SSH-Key (PEM)", "secret": True,
                "help": "Inhalt des privaten Schlüssels, z.B. ~/.ssh/id_rsa",
            },
        },
    )

    async def fetch(self) -> ConnectorResult:
        if not _SSH_AVAILABLE:
            return ConnectorResult(
                status=ConnectorStatus.ERROR,
                error="asyncssh nicht installiert. 'asyncssh' zu requirements.txt hinzufügen.",
            )

        host     = self.config.get("host", "").strip()
        port     = int(self.config.get("port", 22))
        username = self.config.get("username", "").strip()
        password = self.config.get("password") or None
        ssh_key  = self.config.get("ssh_key") or None

        if not host or not username:
            return ConnectorResult(
                status=ConnectorStatus.ERROR,
                error="Host und Benutzername sind Pflichtfelder.",
            )
        if not password and not ssh_key:
            return ConnectorResult(
                status=ConnectorStatus.ERROR,
                error="Passwort oder SSH-Key (PEM) erforderlich.",
            )

        connect_kwargs: dict = dict(
            host=host, port=port, username=username,
            known_hosts=None,          # self-hosted: kein strict host checking
            connect_timeout=12,
        )
        if ssh_key:
            connect_kwargs["client_keys"] = [asyncssh.import_private_key(ssh_key)]
        if password:
            connect_kwargs["password"] = password

        try:
            async with asyncio.timeout(30):
                async with asyncssh.connect(**connect_kwargs) as conn:
                    result = await conn.run(
                        "python3 -",
                        input=PROBE_SCRIPT,
                        check=False,
                    )

            stdout = (result.stdout or "").strip()
            if not stdout:
                stderr = (result.stderr or "").strip()
                return ConnectorResult(
                    status=ConnectorStatus.ERROR,
                    error=f"Probe-Script gab kein JSON zurück. Stderr: {stderr[:200]}",
                )

            try:
                probe = json.loads(stdout)
            except json.JSONDecodeError as e:
                return ConnectorResult(
                    status=ConnectorStatus.ERROR,
                    error=f"JSON-Parse-Fehler: {e} — Ausgabe: {stdout[:200]}",
                )

            if "_error" in probe:
                return ConnectorResult(
                    status=ConnectorStatus.ERROR,
                    error=f"Probe-Script Fehler: {probe['_error']}",
                )

            metrics = _build_metrics(probe)
            status  = _determine_status(metrics)
            return ConnectorResult(status=status, metrics=metrics)

        except asyncssh.DisconnectError as e:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error=f"SSH getrennt: {e}")
        except asyncssh.PermissionDenied:
            return ConnectorResult(status=ConnectorStatus.ERROR, error="SSH Authentifizierung fehlgeschlagen")
        except (OSError, asyncssh.Error) as e:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error=f"SSH Fehler: {e}")
        except TimeoutError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="SSH Verbindung Timeout (30s)")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))


def _build_metrics(probe: dict) -> dict:
    """Flacht die Probe-Sektionen in ein einheitliches metrics-Dict."""
    sys  = probe.get("system",   {})
    gpu  = probe.get("gpu",      {})
    sysd = probe.get("systemd",  {})
    net  = probe.get("network",  {})
    sec  = probe.get("security", {})

    # Flat top-level: kompatibel mit linux_ssh + erweitert
    metrics: dict = {
        # System
        "hostname":   sys.get("hostname"),
        "os":         sys.get("os"),
        "kernel":     sys.get("kernel"),
        "arch":       sys.get("arch"),
        "cpu_model":  sys.get("cpu_model"),
        "cpu_cores":  sys.get("cpu_cores"),
        "cpu_pct":    sys.get("cpu_pct"),
        "mem_pct":    sys.get("mem_pct"),
        "mem_used":   sys.get("mem_used"),
        "mem_total":  sys.get("mem_total"),
        "disk_pct":   sys.get("disk_pct"),
        "disk_used":  sys.get("disk_used"),
        "disk_total": sys.get("disk_total"),
        "disks":      sys.get("disks", []),
        "load1":      sys.get("load1"),
        "load5":      sys.get("load5"),
        "load15":     sys.get("load15"),
        "uptime_s":   sys.get("uptime_s"),
        "uptime_h":   round(sys.get("uptime_s", 0) / 3600, 1),
        "temp_c":     sys.get("temp_c"),
        "is_vm":      sys.get("is_vm"),
        "vm_type":    sys.get("vm_type"),

        # GPU (nested, graceful)
        "gpu": {
            "available":          gpu.get("available", False),
            "reason":             gpu.get("reason"),
            "gpu_count":          gpu.get("gpu_count", 0),
            "gpus":               gpu.get("gpus", []),
            "total_vram_used_mb": gpu.get("total_vram_used_mb"),
            "total_vram_mb":      gpu.get("total_vram_mb"),
        },

        # Systemd (nested)
        "systemd": {
            "available":     sysd.get("available", False),
            "total":         sysd.get("total", 0),
            "running":       sysd.get("running", 0),
            "failed_count":  sysd.get("failed_count", 0),
            "failed":        sysd.get("failed", []),
            "user_services": sysd.get("user_services", []),
        },

        # Network (nested)
        "network": {
            "interfaces":         net.get("interfaces", []),
            "dns_servers":        net.get("dns_servers", []),
            "gateway":            net.get("gateway"),
            "open_ports":         net.get("open_ports", []),
            "public_ports_count": net.get("public_ports_count", 0),
        },

        # Security (nested)
        "security": {
            "firewall":            sec.get("firewall"),
            "ssh_root_login":      sec.get("ssh_root_login"),
            "ssh_pw_auth":         sec.get("ssh_pw_auth"),
            "fail2ban":            sec.get("fail2ban"),
            "mac":                 sec.get("mac"),
            "reboot_required":     sec.get("reboot_required", False),
            "auto_updates":        sec.get("auto_updates"),
            "shadow_world_readable": sec.get("shadow_world_readable", False),
            "issues":              sec.get("issues", []),
            "issue_count":         sec.get("issue_count", 0),
        },
    }
    return metrics


def _determine_status(metrics: dict) -> ConnectorStatus:
    """WARNING bei hoher Last / Failed-Units / Security-Problemen, sonst ONLINE."""
    cpu_pct    = metrics.get("cpu_pct")   or 0
    mem_pct    = metrics.get("mem_pct")   or 0
    disk_pct   = metrics.get("disk_pct")  or 0
    failed     = metrics.get("systemd", {}).get("failed_count", 0)
    sec_issues = metrics.get("security",  {}).get("issue_count", 0)

    if cpu_pct > 90 or mem_pct > 90 or disk_pct > 92:
        return ConnectorStatus.WARNING
    if failed > 0:
        return ConnectorStatus.WARNING
    if sec_issues >= 3:
        return ConnectorStatus.WARNING
    return ConnectorStatus.ONLINE
