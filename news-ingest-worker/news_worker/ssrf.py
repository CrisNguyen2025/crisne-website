from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


CGNAT_NETWORK = ipaddress.ip_network("100.64.0.0/10")


class SsrfBlockedError(ValueError):
    """Raised when a URL resolves to a disallowed scheme or private/internal address."""


def is_private_ip(raw_ip: str) -> bool:
    clean = raw_ip.strip().strip("[]").split("%")[0]
    try:
        addr = ipaddress.ip_address(clean)
    except ValueError:
        return True

    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped

    if isinstance(addr, ipaddress.IPv4Address) and addr in CGNAT_NETWORK:
        return True

    return bool(
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


def assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise SsrfBlockedError(f"Unsupported URL scheme: {parsed.scheme}")

    hostname = (parsed.hostname or "").strip().lower().rstrip(".")
    if not hostname:
        raise SsrfBlockedError("Missing hostname")

    if (
        hostname == "localhost"
        or hostname.endswith(".localhost")
        or hostname.endswith(".local")
        or hostname.endswith(".internal")
    ):
        raise SsrfBlockedError(f"Blocked internal hostname: {hostname}")

    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        if is_private_ip(hostname):
            raise SsrfBlockedError(f"Blocked private IP: {hostname}")
        return

    try:
        infos = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise SsrfBlockedError(f"DNS lookup failed for {hostname}: {exc}") from exc

    if not infos:
        raise SsrfBlockedError(f"No DNS records resolved for {hostname}")

    for _, _, _, _, sockaddr in infos:
        ip_str = sockaddr[0]
        if is_private_ip(ip_str):
            raise SsrfBlockedError(f"Hostname {hostname} resolved to private IP {ip_str}")
