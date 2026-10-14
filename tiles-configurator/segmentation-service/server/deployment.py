"""Bounded deployment settings; no credentials or endpoint secrets in frontend JS."""
from __future__ import annotations
import ipaddress
import os
import re

LIMITS = {
    'PAVING_MAX_PENDING': ('max_pending', 4, 1, 16),
    'PAVING_MAX_RESULTS': ('max_results', 8, 1, 32),
    'PAVING_RESULT_TTL_SECONDS': ('ttl_s', 900, 60, 3600),
    'PAVING_MAX_CLIENTS': ('max_clients', 128, 1, 4096),
}

def configured_job_options(environ=None):
    env = os.environ if environ is None else environ
    result = {}
    for name, (key, default, low, high) in LIMITS.items():
        raw = env.get(name, str(default))
        if not re.fullmatch(r'[0-9]+', raw or '') or not low <= int(raw) <= high:
            raise ValueError(f'{name} must be an integer from {low} to {high}.')
        result[key] = int(raw)
    return result

def configured_hosts(value=None):
    raw = os.getenv('PAVING_ALLOWED_HOSTS') if value is None else value
    if raw is None:
        return None  # Backward compatibility. Container deployment sets an explicit list.
    hosts = []
    for value in raw.split(','):
        host = value.strip().lower()
        if not host or any(c in host for c in '/@?#*'):
            raise ValueError('PAVING_ALLOWED_HOSTS requires exact hostnames/IPs without schemes, paths or ports.')
        if host.startswith('[') and host.endswith(']'):
            host = host[1:-1]
        try:
            ipaddress.ip_address(host)
        except ValueError:
            if not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?', host) or '..' in host or ':' in host:
                raise ValueError('Invalid PAVING_ALLOWED_HOSTS hostname.')
        hosts.append(host)
    return frozenset(hosts)

def legacy_api_enabled(value=None):
    raw = os.getenv('PAVING_ENABLE_LEGACY_API', '1') if value is None else value
    if raw not in ('0', '1'):
        raise ValueError('PAVING_ENABLE_LEGACY_API must be 0 or 1.')
    return raw == '1'
