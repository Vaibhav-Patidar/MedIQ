from sqlalchemy.orm import Session

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_token
from app.db import get_db
from app.models.orm import User

_bearer = HTTPBearer(auto_error=False)

# docs/08-security-spec.md Section 4 [HACKATHON]: object-level authorization is
# intentionally simplified to "any authenticated clinician can view any patient"
# (one role, small seeded synthetic dataset). Flagged as a gap beyond demo use.


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise Unauthorized()
    payload = decode_token(credentials.credentials)
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
    Returns True only when the JWT is valid and unexpired."""
    if not token:
        return False
    payload = decode_token(token)
    return bool(payload and payload.get("sub"))
