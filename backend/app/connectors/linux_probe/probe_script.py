"""
Nexboard SSH Probe Script
Wird via SSH stdin gepiped: ssh user@host python3 -
Gibt einen einzigen JSON-Blob zurück mit: system, gpu, systemd, network, security
Alle Sektionen degradieren graceful wenn Tools/Rechte fehlen.
Nur Python stdlib — kein pip install nötig.
"""

PROBE_SCRIPT = r"""
import json, os, re, subprocess, sys, time
from pathlib import Path

def _run(cmd, timeout=5):
    try:
        r = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            shell=isinstance(cmd, str)
        )
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


# ─── System ────────────────────────────────────────────────────────────────────

def collect_system():
    # OS
    os_name = ""
    try:
        for line in Path("/etc/os-release").read_text().splitlines():
            if line.startswith("PRETTY_NAME="):
                os_name = line.split("=", 1)[1].strip().strip('"')
                break
    except Exception:
        pass
    if not os_name:
        os_name = _run("uname -s")

    kernel   = _run("uname -r")
    arch     = _run("uname -m")
    hostname = _run("hostname -f") or _run("hostname")

    # Uptime
    uptime_s = 0.0
    try:
        uptime_s = float(Path("/proc/uptime").read_text().split()[0])
    except Exception:
        pass

    # CPU info
    cpu_model = ""
    cpu_cores = 0
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if "model name" in line and not cpu_model:
                cpu_model = line.split(":", 1)[1].strip()
            if line.startswith("processor"):
                cpu_cores += 1
    except Exception:
        pass

    # CPU utilisation (2 snapshots, 200ms apart)
    cpu_pct = 0.0
    try:
        def _stat():
            parts = Path("/proc/stat").read_text().splitlines()[0].split()
            total = sum(int(x) for x in parts[1:])
            idle  = int(parts[4])
            return total, idle
        t1, i1 = _stat()
        time.sleep(0.2)
        t2, i2 = _stat()
        dt = t2 - t1
        cpu_pct = round((1 - (i2 - i1) / dt) * 100, 1) if dt else 0.0
    except Exception:
        pass

    # Memory
    mem_total = mem_free = 0
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            k, v = line.split(":", 1)
            k = k.strip()
            val = int(v.split()[0]) * 1024
            if k == "MemTotal":     mem_total = val
            elif k == "MemAvailable": mem_free = val
    except Exception:
        pass
    mem_used = mem_total - mem_free
    mem_pct  = round(mem_used / mem_total * 100, 1) if mem_total else 0.0

    # Disk (root)
    disk_total = disk_used = disk_free = 0
    try:
        import shutil
        d = shutil.disk_usage("/")
        disk_total, disk_used, disk_free = d.total, d.used, d.free
    except Exception:
        pass
    disk_pct = round(disk_used / disk_total * 100, 1) if disk_total else 0.0

    # All mountpoints
    disks = []
    try:
        lines = _run(
            "df -B1 --output=target,size,used,avail,pcent "
            "-x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null"
        ).splitlines()[1:]
        for line in lines:
            parts = line.split()
            if len(parts) >= 5:
                try:
                    disks.append({
                        "mount": parts[0],
                        "total": int(parts[1]),
                        "used":  int(parts[2]),
                        "avail": int(parts[3]),
                        "pct":   int(parts[4].rstrip("%")),
                    })
                except Exception:
                    pass
    except Exception:
        pass

    # Load averages
    load1 = load5 = load15 = 0.0
    try:
        parts = Path("/proc/loadavg").read_text().split()
        load1, load5, load15 = float(parts[0]), float(parts[1]), float(parts[2])
    except Exception:
        pass

    # CPU temperature (first thermal zone)
    temp_c = None
    try:
        for p in sorted(Path("/sys/class/thermal").iterdir()):
            if p.name.startswith("thermal_zone"):
                t = int((p / "temp").read_text().strip()) / 1000
                if 0 < t < 150:
                    temp_c = round(t, 1)
                    break
    except Exception:
        pass

    # VM detection
    is_vm   = False
    vm_type = None
    try:
        dmi = Path("/sys/class/dmi/id/product_name").read_text().strip().lower()
        for kw in ("vmware", "kvm", "virtualbox", "qemu", "xen", "hyper-v", "bochs"):
            if kw in dmi:
                is_vm   = True
                vm_type = kw
                break
    except Exception:
        pass
    if not is_vm:
        virt = _run("systemd-detect-virt --vm 2>/dev/null")
        if virt and virt not in ("none", ""):
            is_vm   = True
            vm_type = virt

    return {
        "hostname":   hostname,
        "os":         os_name,
        "kernel":     kernel,
        "arch":       arch,
        "cpu_model":  cpu_model,
        "cpu_cores":  cpu_cores,
        "cpu_pct":    cpu_pct,
        "mem_total":  mem_total,
        "mem_used":   mem_used,
        "mem_pct":    mem_pct,
        "disk_total": disk_total,
        "disk_used":  disk_used,
        "disk_pct":   disk_pct,
        "disks":      disks,
        "load1":      load1,
        "load5":      load5,
        "load15":     load15,
        "uptime_s":   uptime_s,
        "temp_c":     temp_c,
        "is_vm":      is_vm,
        "vm_type":    vm_type,
    }


# ─── GPU ───────────────────────────────────────────────────────────────────────

def collect_gpu():
    if not _run("which nvidia-smi 2>/dev/null"):
        return {"available": False, "reason": "nvidia-smi not found"}

    xml = _run("nvidia-smi -q -x", timeout=12)
    if not xml:
        return {"available": False, "reason": "nvidia-smi returned no output"}

    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(xml)

        def _txt(tag, parent):
            el = parent.find(tag)
            return el.text.strip() if el is not None and el.text else None

        def _num(tag, parent):
            v = _txt(tag, parent)
            if v:
                try:
                    return float(re.sub(r"[^\d.]", "", v))
                except Exception:
                    pass
            return None

        gpus = []
        for gpu in root.findall("gpu"):
            fb       = gpu.find("fb_memory_usage")
            util_el  = gpu.find("utilization")
            temp_el  = gpu.find("temperature")
            pwr_el   = gpu.find("power_readings") or gpu.find("gpu_power_readings")

            gpus.append({
                "index":         int(_txt("minor_number", gpu) or "0"),
                "name":          _txt("product_name", gpu),
                "uuid":          _txt("uuid", gpu),
                "vram_total_mb": _num("total",       fb)      if fb else None,
                "vram_used_mb":  _num("used",        fb)      if fb else None,
                "vram_free_mb":  _num("free",        fb)      if fb else None,
                "util_pct":      _num("gpu_util",    util_el) if util_el else None,
                "mem_util_pct":  _num("memory_util", util_el) if util_el else None,
                "temp_c":        _num("gpu_temp",    temp_el) if temp_el else None,
                "power_w":       _num("power_draw",  pwr_el)  if pwr_el else None,
                "power_limit_w": _num("power_limit", pwr_el)  if pwr_el else None,
                "fan_pct":       _num("fan_speed",   gpu),
            })

        total_used  = sum(g["vram_used_mb"]  or 0 for g in gpus)
        total_vram  = sum(g["vram_total_mb"] or 0 for g in gpus)
        return {
            "available":          True,
            "gpu_count":          len(gpus),
            "gpus":               gpus,
            "total_vram_used_mb": total_used,
            "total_vram_mb":      total_vram,
        }
    except Exception as e:
        return {"available": False, "reason": f"parse error: {e}"}


# ─── Systemd ───────────────────────────────────────────────────────────────────

def collect_systemd():
    if not _run("which systemctl 2>/dev/null"):
        return {"available": False, "reason": "systemd not found"}

    out = _run(
        "systemctl list-units --all --no-legend --no-pager --plain 2>/dev/null",
        timeout=10,
    )
    units   = []
    failed  = []
    running = 0

    for line in out.splitlines():
        parts = line.split(None, 4)
        if len(parts) < 4:
            continue
        unit, load, active, sub = parts[0], parts[1], parts[2], parts[3]
        desc = parts[4] if len(parts) > 4 else ""
        if active == "active":
            running += 1
        if sub == "failed" or active == "failed":
            failed.append({
                "unit":   unit,
                "load":   load,
                "active": active,
                "sub":    sub,
                "desc":   desc,
            })
        units.append({"unit": unit, "active": active, "sub": sub})

    # User-deployed enabled services (exclude common system units)
    user_services = []
    _vendor = (
        "systemd-", "dbus.", "NetworkManager", "network", "udev", "getty",
        "display-manager", "bluetooth", "avahi", "cups", "accounts",
        "polkit", "snapd", "ModemManager", "colord", "rtkit",
    )
    try:
        enabled_out = _run(
            "systemctl list-unit-files --state=enabled --no-legend --no-pager --plain 2>/dev/null",
            timeout=8,
        )
        for line in enabled_out.splitlines():
            parts = line.split()
            if parts and parts[0].endswith(".service"):
                u = parts[0]
                if not any(u.startswith(p) for p in _vendor):
                    user_services.append(u)
    except Exception:
        pass

    return {
        "available":      True,
        "total":          len(units),
        "running":        running,
        "failed_count":   len(failed),
        "failed":         failed[:20],
        "user_services":  user_services[:40],
    }


# ─── Network ───────────────────────────────────────────────────────────────────

def collect_network():
    interfaces = []

    # Try ip -j addr (JSON) first
    ip_json = _run("ip -j addr show 2>/dev/null", timeout=5)
    if ip_json:
        try:
            import json as _j
            for iface in _j.loads(ip_json):
                if iface.get("link_type") == "loopback":
                    continue
                addrs = []
                for ai in iface.get("addr_info", []):
                    addrs.append({
                        "family":  ai.get("family"),
                        "address": ai.get("local"),
                        "prefix":  ai.get("prefixlen"),
                    })
                interfaces.append({
                    "name":  iface.get("ifname"),
                    "state": iface.get("operstate", "").lower(),
                    "mac":   iface.get("address"),
                    "mtu":   iface.get("mtu"),
                    "addrs": addrs,
                })
        except Exception:
            ip_json = ""

    if not ip_json:
        # Fallback: parse text output
        current = None
        for line in _run("ip addr show 2>/dev/null").splitlines():
            if re.match(r"^\d+:", line):
                if current:
                    interfaces.append(current)
                name = line.split()[1].rstrip(":")
                current = {"name": name, "state": "unknown", "mac": None, "mtu": None, "addrs": []}
            elif current:
                if "inet " in line:
                    m = re.search(r"inet (\S+)", line)
                    if m:
                        ip, _, pfx = m.group(1).partition("/")
                        current["addrs"].append({"family": "inet", "address": ip, "prefix": int(pfx) if pfx else None})
                elif "inet6 " in line:
                    m = re.search(r"inet6 (\S+)", line)
                    if m:
                        ip, _, pfx = m.group(1).partition("/")
                        current["addrs"].append({"family": "inet6", "address": ip, "prefix": int(pfx) if pfx else None})
                elif "link/ether" in line:
                    m = re.search(r"link/ether (\S+)", line)
                    if m:
                        current["mac"] = m.group(1)
        if current:
            interfaces.append(current)

    # RX/TX bytes from /proc/net/dev
    rx_tx = {}
    try:
        for line in Path("/proc/net/dev").read_text().splitlines()[2:]:
            parts = line.split()
            if len(parts) < 10:
                continue
            name = parts[0].rstrip(":")
            rx_tx[name] = {"rx_bytes": int(parts[1]), "tx_bytes": int(parts[9])}
    except Exception:
        pass

    for iface in interfaces:
        iface["rx_bytes"] = rx_tx.get(iface["name"], {}).get("rx_bytes")
        iface["tx_bytes"] = rx_tx.get(iface["name"], {}).get("tx_bytes")

    # DNS
    dns_servers = []
    try:
        for line in Path("/etc/resolv.conf").read_text().splitlines():
            if line.startswith("nameserver") and len(line.split()) >= 2:
                dns_servers.append(line.split()[1])
    except Exception:
        pass

    # Default gateway
    gw = None
    try:
        parts = _run("ip route show default 2>/dev/null").split()
        if len(parts) >= 3:
            gw = parts[2]
    except Exception:
        pass

    # Listening ports via ss (or netstat fallback)
    open_ports = []
    ss_out = _run("ss -tlnp 2>/dev/null")
    if not ss_out:
        ss_out = _run("netstat -tlnp 2>/dev/null")
    for line in ss_out.splitlines()[1:]:
        parts = line.split()
        # ss: State Recv-Q Send-Q Local-Addr:Port Peer ...
        if len(parts) < 4:
            continue
        local = parts[3] if len(parts) > 3 else ""
        # Handle IPv6 brackets: [::]:22 → split on last ":"
        if ":" not in local:
            continue
        try:
            addr, port_s = local.rsplit(":", 1)
            port = int(port_s)
            addr = addr.strip("[]")
            is_public = addr in ("0.0.0.0", "::", "*", "")
            proc = parts[6] if len(parts) > 6 else (parts[5] if len(parts) > 5 else "")
            open_ports.append({
                "port":    port,
                "addr":    addr,
                "public":  is_public,
                "process": proc,
            })
        except Exception:
            pass

    return {
        "interfaces":          interfaces,
        "dns_servers":         dns_servers,
        "gateway":             gw,
        "open_ports":          sorted(open_ports, key=lambda x: x["port"])[:60],
        "public_ports_count":  sum(1 for p in open_ports if p["public"]),
    }


# ─── Security ──────────────────────────────────────────────────────────────────

def collect_security():
    issues = []
    checks = {}

    # Firewall
    firewall = "unknown"
    if _run("which ufw 2>/dev/null"):
        status = _run("ufw status 2>/dev/null")
        if "active" in status.lower():
            firewall = "ufw-active"
        else:
            firewall = "ufw-inactive"
            issues.append("Firewall (ufw) ist inaktiv")
    elif _run("which firewall-cmd 2>/dev/null"):
        state = _run("firewall-cmd --state 2>/dev/null")
        firewall = "firewalld-active" if "running" in state else "firewalld-inactive"
        if "inactive" in firewall:
            issues.append("Firewall (firewalld) ist inaktiv")
    elif _run("which nft 2>/dev/null"):
        rules = _run("nft list ruleset 2>/dev/null")
        firewall = "nftables-active" if rules.strip() else "nftables-empty"
        if "empty" in firewall:
            issues.append("nftables Ruleset ist leer")
    elif _run("which iptables 2>/dev/null"):
        rules = _run("iptables -L 2>/dev/null")
        firewall = "iptables-active" if rules else "iptables-unknown"
    checks["firewall"] = firewall

    # SSH hardening
    ssh_root_login = None
    ssh_pw_auth    = None
    try:
        # Also check drop-in configs
        sshd_files = [Path("/etc/ssh/sshd_config")]
        sshd_dir   = Path("/etc/ssh/sshd_config.d")
        if sshd_dir.is_dir():
            sshd_files += sorted(sshd_dir.glob("*.conf"))

        for fpath in sshd_files:
            try:
                for line in fpath.read_text().splitlines():
                    line = line.strip()
                    if line.startswith("#"):
                        continue
                    low = line.lower()
                    if low.startswith("permitrootlogin") and ssh_root_login is None:
                        val = low.split()[1] if len(low.split()) > 1 else "yes"
                        ssh_root_login = val not in ("no", "prohibit-password")
                    if low.startswith("passwordauthentication") and ssh_pw_auth is None:
                        val = low.split()[1] if len(low.split()) > 1 else "yes"
                        ssh_pw_auth = val == "yes"
            except Exception:
                pass
    except Exception:
        pass

    if ssh_root_login:
        issues.append("SSH PermitRootLogin ist aktiviert")
    if ssh_pw_auth:
        issues.append("SSH Passwort-Authentifizierung ist aktiviert")
    checks["ssh_root_login"] = ssh_root_login
    checks["ssh_pw_auth"]    = ssh_pw_auth

    # fail2ban
    f2b_active = bool(
        _run("which fail2ban-client 2>/dev/null") and
        _run("fail2ban-client status 2>/dev/null")
    )
    checks["fail2ban"] = f2b_active
    if not f2b_active:
        issues.append("fail2ban ist nicht aktiv oder nicht installiert")

    # MAC framework (SELinux / AppArmor)
    mac = None
    selinux = _run("getenforce 2>/dev/null")
    if selinux in ("Enforcing", "Permissive"):
        mac = f"selinux-{selinux.lower()}"
    elif _run("aa-status --enabled 2>/dev/null"):
        mac = "apparmor-active"
    checks["mac"] = mac

    # Reboot required (Debian/Ubuntu)
    reboot_required = Path("/var/run/reboot-required").exists()
    checks["reboot_required"] = reboot_required
    if reboot_required:
        issues.append("Neustart erforderlich (ausstehende Kernel-/Paket-Updates)")

    # Auto-updates
    auto_updates = (
        Path("/etc/apt/apt.conf.d/20auto-upgrades").exists() or
        Path("/etc/dnf/automatic.conf").exists() or
        _run("which unattended-upgrades 2>/dev/null") != ""
    )
    checks["auto_updates"] = auto_updates

    # World-readable sensitive dirs (quick heuristic)
    open_shadow = False
    try:
        shadow = Path("/etc/shadow")
        if shadow.exists() and (shadow.stat().st_mode & 0o004):
            open_shadow = True
            issues.append("/etc/shadow ist world-readable!")
    except Exception:
        pass
    checks["shadow_world_readable"] = open_shadow

    return {
        **checks,
        "issues":      issues,
        "issue_count": len(issues),
    }


# ─── Main ──────────────────────────────────────────────────────────────────────

try:
    result = {
        "system":   collect_system(),
        "gpu":      collect_gpu(),
        "systemd":  collect_systemd(),
        "network":  collect_network(),
        "security": collect_security(),
    }
except Exception as e:
    result = {"_error": str(e)}

print(json.dumps(result, default=str))
"""
