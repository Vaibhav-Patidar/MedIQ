"""Supabase integration: hosted auth (GoTrue) + token verification.

Design (docs/PROJECT_OVERVIEW.md §Supabase):
  * When SUPABASE_URL + SUPABASE_ANON_KEY are configured, /api/auth/login and
    /api/auth/refresh proxy to Supabase Auth and the returned access_token is
    what clients present afterwards.
  * get_current_user verifies those tokens either with the legacy HS256
    SUPABASE_JWT_SECRET or via the project's JWKS endpoint (asymmetric keys).
  * When Supabase is NOT configured, everything falls back to the built-in
    local JWT flow — tests and the offline demo need zero cloud setup.
"""
import logging
import time
from typing import Any

import httpx
import jwt as pyjwt

from app.core.config import get_settings

logger = logging.getLogger("mediq.supabase")

_jwks_client = None
_jwks_cached_at = 0.0


def auth_headers() -> dict[str, str]:
    settings = get_settings()
    return {"apikey": settings.supabase_anon_key or "",
            "Content-Type": "application/json"}


def supabase_login(email: str, password: str) -> dict[str, Any]:
    """Password grant against {url}/auth/v1/token. Raises RuntimeError with a
    safe message on failure (never leaks Supabase internals to clients)."""
    settings = get_settings()
    url = f"{settings.supabase_url}/auth/v1/token?grant_type=password"
    try:
        resp = httpx.post(url, json={"email": email, "password": password},
                          headers=auth_headers(), timeout=10.0)
    except httpx.HTTPError as exc:
        logger.warning("supabase login unreachable: %s", exc)
        raise RuntimeError("auth provider unavailable") from exc
    if resp.status_code != 200:
        raise RuntimeError("invalid_credentials")
    return resp.json()


def supabase_refresh(refresh_token: str) -> dict[str, Any]:
    settings = get_settings()
    url = f"{settings.supabase_url}/auth/v1/token?grant_type=refresh_token"
    try:
        resp = httpx.post(url, json={"refresh_token": refresh_token},
                          headers=auth_headers(), timeout=10.0)
    except httpx.HTTPError as exc:
        logger.warning("supabase refresh unreachable: %s", exc)
        raise RuntimeError("auth provider unavailable") from exc
    if resp.status_code != 200:
        raise RuntimeError("invalid_refresh_token")
    return resp.json()


def _jwks_verify(token: str) -> dict[str, Any]:
    """Verify an asymmetric Supabase JWT via the project's JWKS endpoint."""
    global _jwks_client, _jwks_cached_at
    settings = get_settings()
    # re-discover keys at most every hour in case of rotation
    if _jwks_client is None or time.time() - _jwks_cached_at > 3600:
        jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
        _jwks_client = pyjwt.PyJWKClient(jwks_url)
        _jwks_cached_at = time.time()
    signing_key = _jwks_client.get_signing_key_from_jwt(token)
    return pyjwt.decode(
        token, signing_key.key,
        algorithms=["ES256", "RS256", "PS256"],
        options={"verify_aud": False},  # aud varies ('authenticated'/'anon')
    )


def verify_supabase_token(token: str) -> dict[str, Any] | None:
    """Returns normalized claims {sub, email, name} for a valid Supabase JWT,
    else None. Tries HS256 shared-secret first (legacy), then JWKS."""
    settings = get_settings()
    if not token:
        return None
    try:
        header = pyjwt.get_unverified_header(token)
    except pyjwt.PyJWTError:
        return None

    try:
        if settings.supabase_jwt_secret and header.get("alg") == "HS256":
            payload = pyjwt.decode(
                token, settings.supabase_jwt_secret,
                algorithms=["HS256"], options={"verify_aud": False},
            )
        else:
            payload = _jwks_verify(token)
    except Exception as exc:
        logger.debug("supabase token rejected: %s", exc)
        return None

    email = payload.get("email") or (payload.get("user_metadata") or {}).get("email")
    if not email:
        return None
    return {
        "sub": payload.get("sub"),
        "email": str(email).lower(),
        "name": (payload.get("user_metadata") or {}).get("full_name"),
        "provider": "supabase",
    }
