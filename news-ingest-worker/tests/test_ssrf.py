from __future__ import annotations

import pytest

from news_worker.ssrf import is_private_ip


@pytest.mark.parametrize("ip", ["76.76.21.21", "8.8.8.8", "2606:4700:4700::1111"])
def test_public_ips_are_allowed(ip: str) -> None:
    assert is_private_ip(ip) is False


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "10.0.0.5",
        "192.168.1.10",
        "169.254.169.254",
        "100.64.0.1",
        "::1",
        "fec0::1",
        "::ffff:10.0.0.1",
    ],
)
def test_private_and_special_ips_are_blocked(ip: str) -> None:
    assert is_private_ip(ip) is True
