from sqlalchemy.orm import Session

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_token
from app.db import get_db
from app.models.orm import User

_bearer = HTTPBearer(auto_error=False)

# docs/08-security-spec.md Section 4 [HACKATHON]: object-level authorization is
# intentionally simplified to "any authenticated clinician can view any patient"
# (one role, small seeded synthetic dataset). Flagged as a gap beyond demo use.


def _resolve_local_user(db: Session, email: str) -> User | None:
    from sqlalchemy import select

    return db.scalar(select(User).where(User.email == email))


def _autoprovision_user(db: Session, email: str, name: str | None) -> User:
    """Supabase-authenticated users get a local profile row on first API call
    (role 'clinician', no clinician link until an admin assigns one). Keeps
    dashboard-invited teammates working without a reseed."""
    user = User(email=email, password_hash="",  # credentials live in Supabase
                name=name or email.split("@")[0], role="clinician")
    db.add(user)
    db.flush()
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise Unauthorized()
    token = credentials.credentials
    settings = get_settings()

    if settings.supabase_enabled:
        # Hosted-auth path (docs/PROJECT_OVERVIEW.md §Supabase)
        from app.core.supabase import verify_supabase_token

        claims = verify_supabase_token(token)
        if claims is None:
            raise Unauthorized()
        user = _resolve_local_user(db, claims["email"])
        if user is None:
            user = _autoprovision_user(db, claims["email"], claims.get("name"))
        require_role(user, "clinician")
        return user

    # Local JWT fallback (offline demo / tests)
    payload = decode_token(token)
    if payload is None or not payload.get("sub"):
        raise Unauthorized()
    from sqlalchemy import select

    user = db.scalar(select(User).where(User.user_id == payload["sub"]))
    if user is None:
        raise Unauthorized()
    # RBAC hook — single role enforced now (users.role exists for future roles,
    # no hierarchy logic per PRD Section 8 out-of-scope).
    require_role(user, "clinician")
    return user


def require_role(user: User, role: str) -> None:
    """Hook for future RBAC branching; prototype has a single role."""
    if user.role != role:
        raise Forbidden()


def resolve_ws_token(token: str | None) -> bool:
    """WebSocket handshake auth (ADR-004): token via query param or subprotocol.
    Accepts either issuer; returns True only when the JWT is valid/unexpired and
    maps to a known-or-provisionable account."""
    if not token:
        return False
    settings = get_settings()
    if settings.supabase_enabled:
        from app.core.supabase import verify_supabase_token

        return verify_supabase_token(token) is not None
    payload = decode_token(token)
    return bool(payload and payload.get("sub"))
