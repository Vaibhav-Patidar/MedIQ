"""Analytics — [HACKATHON: optional] stubs returning empty arrays so the
endpoints exist and don't 404 (docs/05-api-spec.md Section 9)."""
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"],
                   dependencies=[Depends(get_current_user)])


@router.get("/sepsis-outcomes")
def sepsis_outcomes():
    return []  # [HACKATHON STUB]


@router.get("/alzheimers-progression")
def alzheimers_progression():
    return []  # [HACKATHON STUB]


@router.get("/intervention-efficacy")
def intervention_efficacy():
    return []  # [HACKATHON STUB]
