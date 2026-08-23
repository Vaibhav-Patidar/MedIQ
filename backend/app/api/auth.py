from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidCredentials, Unauthorized
from app.core.security import create_access_token, verify_password
from app.db import get_db
from app.api.deps import get_current_user
from app.models.orm import User
from app.models.schemas import LoginRequest, TokenResponse, UserPublic

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_response(user: User) -> TokenResponse:
    token, expires_in = create_access_token(user.user_id, user.role or "clinician")
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
        user=UserPublic(id=str(user.user_id), name=user.name, role=user.role or "clinician"),
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email))
    # never log plaintext passwords or hashes (docs/08-security-spec.md Section 1)
    if user is None or not verify_password(body.password, user.password_hash):
        raise InvalidCredentials()
    return _token_response(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current is None:
        raise Unauthorized()
    return _token_response(current)


@router.post("/logout", status_code=204)
def logout():
    # Stateless JWT (ADR-004): no server-side session to revoke; client discards.
    return None
