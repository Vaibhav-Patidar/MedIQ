"""MRI scan endpoints — [HACKATHON STUB] (docs/05-api-spec.md Section 5, stretch).
Accepts the upload, validates extension + size BEFORE anything else, stores
metadata + file on disk, returns processing_status 'pending'. No preprocessing
pipeline is built (ADR-001: only after Sepsis flow is demo-solid)."""
import logging
import os
import uuid as uuidlib

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.errors import ApiError, PatientNotFound, ResourceNotFound
from app.db import get_db
from app.models.orm import MRIScan, Patient
from app.models.schemas import ScanCreatedResponse, ScanResponse

logger = logging.getLogger("mediq.scans")

router = APIRouter(prefix="/api/patients", tags=["scans"],
                   dependencies=[Depends(get_current_user)])

ALLOWED_EXTENSIONS = (".nii", ".nii.gz", ".dcm")


def _ensure_patient(db: Session, patient_id) -> Patient:
    patient = db.scalar(select(Patient).where(Patient.patient_id == str(patient_id)))
    if patient is None:
        raise PatientNotFound()
    return patient


@router.post("/{patient_id}/scans", response_model=ScanCreatedResponse, status_code=202)
async def upload_scan(patient_id, file: UploadFile = File(...),
                      scan_date: str = Form(...),
                      db: Session = Depends(get_db)):
    patient = _ensure_patient(db, patient_id)

    filename = os.path.basename(file.filename or "")
    if not any(filename.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise ApiError(
            message="Only .nii, .nii.gz and .dcm files are accepted.",
            status_code=422, code="validation_error",
            details={"filename": filename, "allowed": list(ALLOWED_EXTENSIONS)},
        )

    settings = get_settings()
    max_bytes = settings.mri_max_upload_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise ApiError(
            message=f"File exceeds maximum size of {settings.mri_max_upload_mb} MB.",
            status_code=422, code="validation_error",
            details={"max_mb": settings.mri_max_upload_mb},
        )

    upload_dir = settings.mri_upload_dir
    os.makedirs(upload_dir, exist_ok=True)
    stored_name = f"{uuidlib.uuid4()}_{filename}"
    with open(os.path.join(upload_dir, stored_name), "wb") as fh:
        fh.write(content)

    from datetime import datetime

    try:
        parsed_date = datetime.fromisoformat(scan_date.replace("Z", "+00:00"))
    except ValueError:
        raise ApiError(message="scan_date must be an ISO-8601 timestamp.",
                       status_code=422, code="validation_error")

    scan = MRIScan(
        patient_id=patient.patient_id,
        scan_date=parsed_date,
        modality="MRI",
        raw_file_path=os.path.join(upload_dir, stored_name),
        processing_status="pending",  # no pipeline in prototype; stays pending
    )
    db.add(scan)
    db.flush()
    logger.info("mri scan stored scan_id=%s bytes=%d (processing stub)", scan.scan_id, len(content))
    return ScanCreatedResponse(scan_id=str(scan.scan_id), processing_status=scan.processing_status)


@router.get("/{patient_id}/scans", response_model=list[ScanResponse])
def list_scans(patient_id, db: Session = Depends(get_db)):
    _ensure_patient(db, patient_id)
    scans = db.scalars(select(MRIScan).where(
        MRIScan.patient_id == str(patient_id))).all()
    return [ScanResponse(scan_id=str(s.scan_id), scan_date=s.scan_date,
                         modality=s.modality, processing_status=s.processing_status)
            for s in scans]


@router.get("/{patient_id}/scans/{scan_id}", response_model=ScanResponse)
def get_scan(patient_id, scan_id, db: Session = Depends(get_db)):
    _ensure_patient(db, patient_id)
    scan = db.scalar(select(MRIScan).where(MRIScan.scan_id == str(scan_id)))
    if scan is None:
        raise ResourceNotFound("Scan does not exist.")
    # Results would be attached once processing_status == "complete"; the stub
    # never completes, so metadata only.
    return ScanResponse(scan_id=str(scan.scan_id), scan_date=scan.scan_date,
                        modality=scan.modality, processing_status=scan.processing_status)
