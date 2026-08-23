"""docs/09-testing-strategy.md Section 2 — Pydantic schema validation with
clinical-range sanity bounds (docs/08-security-spec.md Section 3)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.schemas import VitalsRequest


def _valid(**overrides):
    body = dict(timestamp=datetime.now(timezone.utc), heart_rate=88,
                bp_systolic=124, bp_diastolic=78, temperature=36.8,
                respiratory_rate=16, spo2=98, wbc=8.0, lactate=1.5,
                creatinine=0.9, urine_output=60)
    body.update(overrides)
    return VitalsRequest(**body)


def test_valid_payload_accepted():
    parsed = _valid()
    assert parsed.heart_rate == 88


def test_negative_heart_rate_rejected():
    with pytest.raises(ValidationError):
        _valid(heart_rate=-5)


def test_hr_above_clinical_range_rejected():
    with pytest.raises(ValidationError):
        _valid(heart_rate=301)


def test_spo2_above_100_rejected():
    with pytest.raises(ValidationError):
        _valid(spo2=100.5)


def test_absurd_temperature_rejected():
    with pytest.raises(ValidationError):
        _valid(temperature=55.0)


def test_missing_timestamp_rejected():
    body = dict(heart_rate=80)
    with pytest.raises(ValidationError):
        VitalsRequest(**body)


def test_optional_fields_allowed():
    parsed = VitalsRequest(timestamp=datetime.now(timezone.utc))
    assert parsed.heart_rate is None


def test_bad_sex_enum_rejected_in_patient_create():
    from app.models.schemas import PatientCreateRequest

    with pytest.raises(ValidationError):
        PatientCreateRequest(name="X", age=50, sex="XY",
                             admission_date=datetime.now(timezone.utc))


def test_negative_age_rejected():
    from app.models.schemas import PatientCreateRequest

    with pytest.raises(ValidationError):
        PatientCreateRequest(name="X", age=-1, sex="M",
                             admission_date=datetime.now(timezone.utc))
