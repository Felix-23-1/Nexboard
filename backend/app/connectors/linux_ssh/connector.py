"""Linux SSH-Agent Connector.
Verbindet sich per SSH und liest CPU, RAM, Disk und Load via Shell-Befehle.
Benötigt: asyncssh (in requirements.txt)
"""
import asyncio
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus

# asyncssh optional importieren – falls nicht installiert saubere Fehlermeldung
try:
    import asyncssh  # type: ignore
    _SSH_AVAILABLE = True
except ImportError:
    _SSH_AVAILABLE = False

_SCRIPT = r"""
python3 -c "
import os, json
with open('/proc/stat') as f: cpu_line = f.readline().split()
with open('/proc/meminfo') as f: mem = {l.split(':')[0]: int(l.split()[1]) for l in f}
with open('/proc/loadavg') as f: load = f.read().split()
import subprocess
df = subprocess.check_output(['df','-B1','--output=size,used,avail','/'], text=True).splitlines()[1].split()
print(json.dumps({
  'cpu_idle': int(cpu_line[4]),
  'cpu_total': sum(int(x) for x in cpu_line[1:]),
  'mem_total_kb': mem.get('MemTotal',0),
  'mem_free_kb': mem.get('MemAvailable',0),
  'disk_total': int(df[0]),
  'disk_used':  int(df[1]),
  'disk_avail': int(df[2]),
  'load1': float(load[0]),
  'load5': float(load[1]),
  'load15': float(load[2]),
}))
" 2>/dev/null || echo '{}'
"""

_HOSTNAME_CMD = "hostname -f 2>/dev/null || hostname"
_UPTIME_CMD   = "cat /proc/uptime | awk '{print $1}'"
_OS_CMD       = "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"' || uname -s"


class LinuxSSHConnector(BaseConnector):
    meta = ConnectorMeta(
        type="linux_ssh",
        label="Linux Server (SSH)",
        description="Universeller Linux-Server-Monitor via SSH – CPU, RAM, Disk, Load",
        icon="terminal",
        config_schema={
            "host":       {"type": "string",  "label": "Hostname / IP", "required": True},
            "port":       {"type": "number",  "label": "SSH Port", "default": 22},
            "username":   {"type": "string",  "label": "SSH-Benutzer", "required": True},
            "password":   {"type": "string",  "label": "Passwort", "secret": True,
                           "help": "Passwort oder SSH-Key verwenden"},
            "ssh_key":    {"type": "text",    "label": "Privater SSH-Key (PEM)",  "secret": True,
                           "help": "Inhalt des privaten Schlüssels, z.B. ~/.ssh/id_rsa"},
        },
    )

    async def fetch(self) -> ConnectorResult:
        if not _SSH_AVAILABLE:
            return ConnectorResult(
                status=ConnectorStatus.ERROR,
                error="asyncssh nicht installiert. Bitte 'asyncssh' zu requirements.txt hinzufügen und Container neu bauen.",
            )

        host     = self.config.get("host", "")
        port     = int(self.config.get("port", 22))
        username = self.config.get("username", "")
        password = self.config.get("password") or None
        ssh_key  = self.config.get("ssh_key") or None

        if not host or not username:
            return ConnectorResult(status=ConnectorStatus.ERROR, error="Host und Benutzername erforderlich")
        if not password and not ssh_key:
            return ConnectorResult(status=ConnectorStatus.ERROR, error="Passwort oder SSH-Key erforderlich")

        connect_kwargs: dict = dict(
            host=host, port=port, username=username,
            known_hosts=None,  # self-hosted: kein strict host checking
        )
        if ssh_key:
            connect_kwargs["client_keys"] = [asyncssh.import_private_key(ssh_key)]
        if password:
            connect_kwargs["password"] = password

        try:
            async with asyncio.timeout(15):
                async with asyncssh.connect(**connect_kwargs) as conn:
                    metrics_r, hostname_r, uptime_r, os_r = await asyncio.gather(
                        conn.run(_SCRIPT),
                        conn.run(_HOSTNAME_CMD),
                        conn.run(_UPTIME_CMD),
                        conn.run(_OS_CMD),
                    )

            import json
            raw = json.loads(metrics_r.stdout.strip() or "{}")

            cpu_idle  = raw.get("cpu_idle",  0)
            cpu_total = raw.get("cpu_total", 1) or 1
            cpu_pct   = round((1 - cpu_idle / cpu_total) * 100, 1)

            mem_total = raw.get("mem_total_kb", 0) * 1024
            mem_free  = raw.get("mem_free_kb",  0) * 1024
            mem_used  = mem_total - mem_free
            mem_pct   = round(mem_used / mem_total * 100, 1) if mem_total else 0

            disk_total = raw.get("disk_total", 0)
            disk_used  = raw.get("disk_used",  0)
            disk_pct   = round(disk_used / disk_total * 100, 1) if disk_total else 0

            uptime_s  = float(uptime_r.stdout.strip() or 0)
            uptime_h  = round(uptime_s / 3600, 1)

            status = ConnectorStatus.ONLINE
            if cpu_pct > 90 or mem_pct > 90 or disk_pct > 90:
                status = ConnectorStatus.WARNING

            return ConnectorResult(status=status, metrics={
                "hostname":    hostname_r.stdout.strip(),
                "os":          os_r.stdout.strip(),
                "cpu_pct":     cpu_pct,
                "mem_used":    mem_used,
                "mem_total":   mem_total,
                "mem_pct":     mem_pct,
                "disk_used":   disk_used,
                "disk_total":  disk_total,
                "disk_pct":    disk_pct,
                "load1":       raw.get("load1"),
                "load5":       raw.get("load5"),
                "load15":      raw.get("load15"),
                "uptime_h":    uptime_h,
            })

        except asyncssh.DisconnectError as e:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error=f"SSH Verbindung getrennt: {e}")
        except asyncssh.PermissionDenied:
            return ConnectorResult(status=ConnectorStatus.ERROR, error="Authentifizierung fehlgeschlagen")
        except (OSError, asyncssh.Error) as e:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error=f"SSH Fehler: {e}")
        except TimeoutError:
            return ConnectorResult(status=ConnectorStatus.OFFLINE, error="SSH Verbindung Timeout")
        except Exception as e:
            return ConnectorResult(status=ConnectorStatus.ERROR, error=str(e))
