"""Auth-path tests: local JWT fallback still works when Supabase is disabled,
and Supabase-mode verification + auto-provisioning behave with faked claims."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from datetime import datetime, timedelta, timezone

import pytest

from app.core import supabase
from app.core.security import create_access_token


def test_local_token_verifies_via_local_path():
    token, _ = create_access_token("11111111-1111-1111-1111-111111111111", "clinician")
    # local decode (no Supabase configured in tests)
    from app.core.security import decode_token

    payload = decode_token(token)
    assert payload and payload["sub"] == "11111111-1111-1111-1111-111111111111"


def test_verify_supabase_token_rejects_garbage(monkeypatch):
    monkeypatch.setattr(supabase, "_jwks_verify", lambda t: (_ for _ in ()).throw(Exception("bad")))
    assert supabase.verify_supabase_token("not-a-jwt") is None


def _jwt_with_header(payload: dict) -> str:
    import jwt as pyjwt

    return pyjwt.encode(payload, "dummy-key", algorithm="HS256")


def test_supabase_claims_normalize(monkeypatch):
    token = _jwt_with_header({"sub": "sb-user-1", "email": "Doctor@MedIQ.local",
                              "user_metadata": {"full_name": "Dr. Supa"}})
    monkeypatch.setattr(
        supabase, "_jwks_verify",
        lambda t: {"sub": "sb-user-1", "email": "Doctor@MedIQ.local",
                   "user_metadata": {"full_name": "Dr. Supa"}},
    )
    claims = supabase.verify_supabase_token(token)
    assert claims == {"sub": "sb-user-1", "email": "doctor@mediq.local",
                      "name": "Dr. Supa", "provider": "supabase"}


def test_autoprovision_creates_profile(db_session):
    from app.api.deps import _autoprovision_user

    user = _autoprovision_user(db_session, "new.doc@mediq.local", "Dr. New")
    assert user.user_id is not None
    assert user.role == "clinician"
    assert user.password_hash == ""  # credentials live in Supabase
    again = _autoprovision_user(db_session, "other@x.io", None)
    assert again.user_id != user.user_id
