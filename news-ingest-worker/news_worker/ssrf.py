from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlparse


CGNAT_NETWORK = ipaddress.ip_network("100.64.0.0/10")
SPECIAL_IPV4_NETWORKS = (
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("192.88.99.0/24"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
)
SPECIAL_IPV6_NETWORKS = (
    ipaddress.ip_network("::/96"),
    ipaddress.ip_network("64:ff9b::/96"),
    ipaddress.ip_network("64:ff9b:1::/48"),
    ipaddress.ip_network("100::/64"),
    ipaddress.ip_network("2001::/32"),
    ipaddress.ip_network("2001:2::/48"),
    ipaddress.ip_network("2001:db8::/32"),
    ipaddress.ip_network("2002::/16"),
    ipaddress.ip_network("fec0::/10"),
)


class SsrfBlockedError(ValueError):
    """Raised when a URL resolves to a disallowed scheme or private/internal address."""


def is_private_ip(raw_ip: str) -> bool:
    clean = raw_ip.strip().strip("[]").split("%")[0]
    try:
        addr = ipaddress.ip_address(clean)
    except ValueError:
        return True

    if isinstance(addr, ipaddress.IPv6Address):
        if addr.ipv4_mapped:
            addr = addr.ipv4_mapped
        elif addr.sixtofour or addr.teredo:
            return True
        elif any(addr in net for net in SPECIAL_IPV6_NETWORKS):
            return True

    if isinstance(addr, ipaddress.IPv4Address):
        if addr in CGNAT_NETWORK or any(addr in net for net in SPECIAL_IPV4_NETWORKS):
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
    if parsed.username or parsed.password:
        raise SsrfBlockedError("URL credentials are not allowed")

    hostname = (parsed.hostname or "").strip().lower().rstrip(".")
    if not hostname:
        raise SsrfBlockedError("Missing hostname")

    if (
        hostname in {"localhost", "localhost.localdomain", "ip6-localhost"}
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


async def assert_public_url_async(url: str) -> None:
    await asyncio.to_thread(assert_public_url, url)
