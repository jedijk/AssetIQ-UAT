"""Client network helpers for display pairing discovery."""
from __future__ import annotations

import ipaddress
import re
from typing import Optional

from fastapi import Request

_PRIVATE_IP_RE = re.compile(
    r"^(?:10\.(?:\d{1,3}\.){2}\d{1,3}|"
    r"172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3})\.\d{1,3}|"
    r"192\.168\.(?:\d{1,3})\.\d{1,3})$"
)


def extract_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return ""


def normalize_local_subnet(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    parts = raw.split(".")
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        return ".".join(parts)
    if len(parts) == 4 and all(p.isdigit() for p in parts):
        if _PRIVATE_IP_RE.match(raw):
            return ".".join(parts[:3])
        try:
            ip = ipaddress.ip_address(raw)
            if ip.is_private:
                return ".".join(str(ip).split(".")[:3])
        except ValueError:
            return None
    return None


def is_private_ip(ip: str) -> bool:
    if not ip:
        return False
    if _PRIVATE_IP_RE.match(ip):
        return True
    try:
        addr = ipaddress.ip_address(ip)
        return addr.is_private and not addr.is_loopback and not addr.is_link_local
    except ValueError:
        return False


def is_lan_ip(ip: str) -> bool:
    """RFC1918-style LAN addresses only (for /24 matching)."""
    return bool(ip and _PRIVATE_IP_RE.match(ip))


def pairing_on_same_network(
    *,
    viewer_ip: str,
    viewer_subnet: Optional[str],
    pairing_ip: Optional[str],
    pairing_subnet: Optional[str],
) -> bool:
    """True when TV and app appear to share a LAN (same public IP or same private /24)."""
    if viewer_ip and pairing_ip and viewer_ip == pairing_ip:
        return True

    if viewer_subnet and pairing_subnet and viewer_subnet == pairing_subnet:
        return True

    # Same private /24 derived from stored public-facing IPs (rare but cheap check)
    if viewer_ip and pairing_ip and is_lan_ip(viewer_ip) and is_lan_ip(pairing_ip):
        v_parts = viewer_ip.split(".")
        p_parts = pairing_ip.split(".")
        if len(v_parts) == 4 and len(p_parts) == 4 and v_parts[:3] == p_parts[:3]:
            return True

    return False
