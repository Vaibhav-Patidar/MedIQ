from fastapi import APIRouter, Body, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import InvalidCredentials, Unauthorized
from app.core.security import create_access_token, verify_password
from app.db import get_db
from app.api.deps import get_current_user
from app.models.orm import User
from app.models.schemas import LoginRequest, TokenResponse, UserPublic

router = APIRouter(prefix="/api/auth", tags=["auth"])

# docs/05-api-spec.md Section 1 shapes; `refresh_token` is an additive field
# present only in Supabase mode (needed for POST /refresh).


def _local_token_response(user: User) -> TokenResponse:
    token, expires_in = create_access_token(user.user_id, user.role or "clinician")
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
        user=UserPublic(id=str(user.user_id), name=user.name, role=user.role or "clinician"),
    )


def _upsert_profile(db: Session, email: str, name: str | None) -> User:
    from app.api.deps import _autoprovision_user

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = _autoprovision_user(db, email, name)
    elif name and not user.name:
        user.name = name
    return user


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    settings = get_settings()

    # --- Supabase hosted auth (when configured) ---
    if settings.supabase_enabled:
        from app.core import supabase

        try:
            session = supabase.supabase_login(body.email, body.password)
        except RuntimeError as exc:
            # never log plaintext passwords or hashes (docs/08-security-spec.md §1)
            if str(exc) == "invalid_credentials":
                raise InvalidCredentials()
            raise Unauthorized("Auth provider unavailable, try again shortly.")
        profile = _upsert_profile(
            db, str(session["user"]["email"]).lower(),
            (session["user"].get("user_metadata") or {}).get("full_name"),
        )
        return TokenResponse(
            access_token=session["access_token"],
            token_type="bearer",
            expires_in=int(session.get("expires_in", settings.jwt_expires_in)),
            refresh_token=session.get("refresh_token"),
            user=UserPublic(id=str(profile.user_id), name=profile.name,
                            role=profile.role or "clinician"),
        )

    # --- Local JWT fallback (offline demo / tests) ---
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise InvalidCredentials()
    return _local_token_response(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(refresh_token: str | None = Body(default=None, embed=True),
            current: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    settings = get_settings()
    if settings.supabase_enabled:
        from app.core import supabase

        if not refresh_token:
            raise Unauthorized("refresh_token required in Supabase mode.")
        try:
            session = supabase.supabase_refresh(refresh_token)
        except RuntimeError:
            raise InvalidCredentials()
        profile = _upsert_profile(
            db, str(session["user"]["email"]).lower(),
            (session["user"].get("user_metadata") or {}).get("full_name"),
        )
        return TokenResponse(
            access_token=session["access_token"],
            token_type="bearer",
            expires_in=int(session.get("expires_in", settings.jwt_expires_in)),
            refresh_token=session.get("refresh_token"),
            user=UserPublic(id=str(profile.user_id), name=profile.name,
                            role=profile.role or "clinician"),
        )
    return _local_token_response(current)


@router.post("/logout", status_code=204)
def logout(current: User = Depends(get_current_user)):
    # Stateless tokens: the client simply discards them. Dependency enforces a
    # valid session; nothing to revoke server-side (ADR-004).
    _ = current
    return None
