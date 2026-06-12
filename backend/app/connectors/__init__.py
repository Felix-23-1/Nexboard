from .registry import registry
from .proxmox.connector import ProxmoxConnector
from .docker_connector.connector import DockerConnector
from .uptime_kuma.connector import UptimeKumaConnector
from .truenas.connector import TrueNASConnector
from .unifi.connector import UnifiConnector
from .synology.connector import SynologyConnector
from .pfsense.connector import PfSenseConnector
from .hetzner.connector import HetznerConnector
from .proxmox_backup.connector import ProxmoxBackupConnector
from .cloudflare.connector import CloudflareConnector
from .grafana.connector import GrafanaConnector
from .linux_ssh.connector import LinuxSSHConnector
from .netcup.connector import NetcupConnector

registry.register("proxmox",        ProxmoxConnector)
registry.register("docker",         DockerConnector)
registry.register("uptime_kuma",    UptimeKumaConnector)
registry.register("truenas",        TrueNASConnector)
registry.register("unifi",          UnifiConnector)
registry.register("synology",       SynologyConnector)
registry.register("pfsense",        PfSenseConnector)
registry.register("hetzner",        HetznerConnector)
registry.register("proxmox_backup", ProxmoxBackupConnector)
registry.register("cloudflare",     CloudflareConnector)
registry.register("grafana",        GrafanaConnector)
registry.register("linux_ssh",      LinuxSSHConnector)
registry.register("netcup",         NetcupConnector)

__all__ = ["registry"]
