"""docs/09-testing-strategy.md Section 3 — integration flows, plus API-contract
shape assertions against docs/05-api-spec.md."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from datetime import datetime, timedelta, timezone

from tests.conftest import BENIGN, ELEVATED_57, HIGH_RISK_72


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _hours_ago(h: float) -> str:
    dt = datetime.now(timezone.utc) - timedelta(hours=h)
    return dt.isoformat().replace("+00:00", "Z")


PREDICTION_KEYS = {
    "risk_score", "risk_score_change", "trajectory", "trajectory_confidence_band",
    "window_open", "window_closes_at", "hours_remaining", "urgency",
    "threshold_used", "threshold_adjustment_reason", "shap_explanation",
    "generated_at",
}


# ---------------------------------------------------------------------------
# Auth (docs/05-api-spec.md Section 1)
# ---------------------------------------------------------------------------


def test_login_success_shape(client):
    resp = client.post("/api/auth/login",
                       json={"email": "test@mediq.local", "password": "test-pass"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 3600
    assert set(body["user"].keys()) >= {"id", "name", "role"}
    assert body["user"]["role"] == "clinician"


def test_login_bad_credentials_envelope(client):
    resp = client.post("/api/auth/login",
                       json={"email": "test@mediq.local", "password": "wrong"})
    assert resp.status_code == 401
    assert resp.json()["error"] == "invalid_credentials"


def test_missing_token_unauthorized(client):
    resp = client.get("/api/patients")
    assert resp.status_code == 401
    assert resp.json()["error"] == "unauthorized"


def test_refresh_and_logout(client, auth_headers):
    resp = client.post("/api/auth/refresh", headers=auth_headers)
    assert resp.status_code == 200
    assert "access_token" in resp.json()
    resp = client.post("/api/auth/logout", headers=auth_headers)
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Insufficient data contract (Section 3 of testing strategy + spec §4)
# ---------------------------------------------------------------------------


def test_vitals_under_two_hours_no_trigger_and_409(client, auth_headers, seeded_db):
    pid = seeded_db["fresh"]
    resp = client.post(f"/api/patients/{pid}/vitals", headers=auth_headers,
                       json={"timestamp": _hours_ago(0.1), **BENIGN})
    assert resp.status_code == 201
    body = resp.json()
    assert body["prediction_triggered"] is False
    assert "reading_id" in body

    resp = client.get(f"/api/patients/{pid}/predictions/sepsis", headers=auth_headers)
    assert resp.status_code == 409
    body = resp.json()
    # EXACT docs/05-api-spec.md Section 4 contract
    assert body["error"] == "insufficient_data"
    assert body["hours_required"] == 2
    assert isinstance(body["hours_available"], (int, float))
    assert body["hours_available"] < 2


# ---------------------------------------------------------------------------
# Vitals -> inference trigger
# ---------------------------------------------------------------------------


def test_completing_two_hours_triggers_prediction(client, auth_headers, seeded_db):
    pid = seeded_db["diab"]
    resp = client.post(f"/api/patients/{pid}/vitals", headers=auth_headers,
                       json={"timestamp": _now_iso(), **ELEVATED_57})
    assert resp.status_code == 201
    assert resp.json()["prediction_triggered"] is True

    # Background task ran synchronously under TestClient -> snapshot exists.
    resp = client.get(f"/api/patients/{pid}/predictions/sepsis", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == PREDICTION_KEYS
    assert 0 <= body["risk_score"] <= 100
    assert len(body["trajectory"]) == 6
    band = body["trajectory_confidence_band"]
    assert set(band.keys()) == {"lower", "upper"}
    assert len(band["lower"]) == len(body["trajectory"])
    assert body["urgency"] in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
    assert body["shap_explanation"], "SHAP entries must exist"
    for entry in body["shap_explanation"]:
        assert set(entry.keys()) == {"feature", "value", "threshold", "impact", "direction"}


# ---------------------------------------------------------------------------
# Journey B — comorbidity-adjusted threshold contrast (THE critical test)
# ---------------------------------------------------------------------------


def test_journey_b_diabetic_window_vs_nondiabetic_none(client, auth_headers, seeded_db):
    """Same ~57 risk score: diabetic opens at 55; non-diabetic stays closed at 65.
    Both assertions in ONE test run (testing-strategy.md Section 4 step 6)."""
    # non-diabetic hasn't been predicted yet -> drive its final reading now
    resp = client.post(f"/api/patients/{seeded_db['nondiab']}/vitals",
                       headers=auth_headers, json={"timestamp": _now_iso(), **ELEVATED_57})
    assert resp.json()["prediction_triggered"] is True

    diab = client.get(f"/api/patients/{seeded_db['diab']}/predictions/sepsis",
                      headers=auth_headers).json()
    nondiab = client.get(f"/api/patients/{seeded_db['nondiab']}/predictions/sepsis",
                         headers=auth_headers).json()

    # both sit between 55 and 65
    assert 55 < diab["risk_score"] < 65
    assert 55 < nondiab["risk_score"] < 65

    # THE contrast — same ~57 score, different thresholds (provided
    # get_threshold returns reason=None for the default case)
    assert diab["threshold_used"] == 55
    assert diab["threshold_adjustment_reason"] == "diabetic_lactate_sensitivity"
    assert diab["window_open"] is True
    assert diab["window_closes_at"] is not None
    assert diab["hours_remaining"] > 0

    assert nondiab["threshold_used"] == 65
    assert nondiab["threshold_adjustment_reason"] is None
    assert nondiab["window_open"] is False
    # null window_closes_at handled: countdown hidden frontend-side
    assert nondiab["window_closes_at"] is None
    assert nondiab["hours_remaining"] is None


# ---------------------------------------------------------------------------
# Window open -> alert routing escalation (testing-strategy Section 3)
# ---------------------------------------------------------------------------


def test_window_routes_to_next_available_clinician(client, auth_headers, seeded_db):
    pid = seeded_db["routing"]  # assigned doctor is_available=False
    # ~71.7 risk crosses this (non-diabetic, non-elderly) patient's default 65
    resp = client.post(f"/api/patients/{pid}/vitals", headers=auth_headers,
                       json={"timestamp": _now_iso(), **HIGH_RISK_72})
    assert resp.json()["prediction_triggered"] is True

    detail = client.get(f"/api/patients/{pid}", headers=auth_headers).json()
    # escalated to an AVAILABLE clinician of matching specialization
    assert detail["assigned_doctor"]["name"] == "Dr. Available"
    assert detail["assigned_doctor"]["is_available"] is True

    clinicians = client.get("/api/clinicians", headers=auth_headers).json()
    routed = [c for c in clinicians if c["clinician_id"] ==
              detail["assigned_doctor"]["clinician_id"]][0]
    assert routed["specialization"] == "Critical Care"


def test_active_alerts_shape_sorted_and_acknowledge(client, auth_headers, seeded_db):
    resp = client.get("/api/alerts/active", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert items, "expected at least one active window from earlier triggers"
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    urgencies = [order[i["urgency"]] for i in items]
    assert urgencies == sorted(urgencies)
    for item in items:
        assert {"window_id", "patient_id", "patient_name", "urgency",
                "hours_remaining", "window_closes_at", "recommended_action"} <= set(item.keys())

    target = items[0]
    ack = client.post(f"/api/windows/{target['window_id']}/acknowledge",
                      headers=auth_headers)
    assert ack.status_code == 200
    body = ack.json()
    assert body["window_id"] == target["window_id"]
    assert body["acknowledged_at"]
    assert body["acknowledged_by"]

    remaining_ids = [i["window_id"] for i in
                     client.get("/api/alerts/active", headers=auth_headers).json()]
    assert target["window_id"] not in remaining_ids

    # history endpoint still includes acknowledged windows
    pwindows = client.get(f"/api/patients/{target['patient_id']}/windows",
                          headers=auth_headers).json()
    assert target["window_id"] in [w["window_id"] for w in pwindows]


# ---------------------------------------------------------------------------
# Interventions (Postgres row + Neo4j node when enabled)
# ---------------------------------------------------------------------------


def test_intervention_create_outcome_list(client, auth_headers, seeded_db):
    pid = seeded_db["nondiab"]
    created = client.post(f"/api/patients/{pid}/interventions", headers=auth_headers,
                          json={"type": "medication_change",
                                "description": "Started IV antibiotics, increased fluids",
                                "performed_at": _now_iso()})
    assert created.status_code == 201
    body = created.json()
    assert body["type"] == "medication_change"
    assert body["outcome"] is None

    listed = client.get(f"/api/patients/{pid}/interventions", headers=auth_headers).json()
    assert any(i["intervention_id"] == body["intervention_id"] for i in listed)

    updated = client.put(f"/api/interventions/{body['intervention_id']}/outcome",
                         headers=auth_headers, json={"outcome": "improved"})
    assert updated.status_code == 200
    assert updated.json()["outcome"] == "improved"
    assert updated.json()["outcome_recorded_at"]

    bad = client.put(f"/api/interventions/{body['intervention_id']}/outcome",
                     headers=auth_headers, json={"outcome": "cured"})
    assert bad.status_code == 422
    assert bad.json()["error"] == "validation_error"


# ---------------------------------------------------------------------------
# Patients CRUD + graph (ADR-002: identical shape either backend)
# ---------------------------------------------------------------------------


def test_patient_create_get_update_graph(client, auth_headers, seeded_db):
    created = client.post("/api/patients", headers=auth_headers, json={
        "name": "Create Test", "age": 66, "sex": "M", "blood_type": "A-",
        "admission_date": _now_iso(), "ward": "ICU-9", "bed_number": "99",
        "conditions": [{"name": "Sepsis", "icd_code": "A41.9", "type": "critical"}],
        "comorbidities": [{"name": "Diabetes", "threshold_adjustment": 55,
                           "adjustment_reason": "diabetic_lactate_sensitivity"}],
    })
    assert created.status_code == 201
    pid = created.json()["patient_id"]

    detail = client.get(f"/api/patients/{pid}", headers=auth_headers).json()
    assert detail["name"] == "Create Test"
    assert detail["conditions"][0]["icd_code"] == "A41.9"
    assert detail["comorbidities"][0]["adjustment"]["threshold"] == 55
    assert detail["medications"] == []
    assert detail["assigned_doctor"] is None

    updated = client.put(f"/api/patients/{pid}", headers=auth_headers, json={
        "name": "Create Test", "age": 66, "sex": "M", "blood_type": "A-",
        "admission_date": _now_iso(), "ward": "ICU-1", "bed_number": "99",
        "conditions": [], "comorbidities": [],
    })
    assert updated.status_code == 200
    assert updated.json()["ward"] == "ICU-1"

    missing = client.get("/api/patients/00000000-0000-0000-0000-000000000000",
                         headers=auth_headers)
    assert missing.status_code == 404
    assert missing.json()["error"] == "patient_not_found"

    graph = client.get(f"/api/patients/{seeded_db['diab']}/graph",
                       headers=auth_headers).json()
    assert {"nodes", "edges"} <= set(graph.keys())
    types = {n["type"] for n in graph["nodes"]}
    assert "Patient" in types
    relations = {e["relation"] for e in graph["edges"]}
    assert {"HAS_CONDITION", "COMORBID_WITH", "ASSIGNED_TO"} <= relations
    for n in graph["nodes"]:
        assert set(n.keys()) == {"id", "type", "label"}
    for e in graph["edges"]:
        assert set(e.keys()) == {"source", "target", "relation"}


def test_patient_list_filters_and_shapes(client, auth_headers, seeded_db):
    resp = client.get("/api/patients", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert items
    for item in items:
        assert {"patient_id", "name", "age", "sex", "ward", "bed_number",
                "conditions", "comorbidities", "current_risk_score",
                "window_open", "assigned_doctor"} == set(item.keys())
        assert isinstance(item["conditions"], list)
        assert all(isinstance(c, str) for c in item["conditions"])

    filtered = client.get("/api/patients", headers=auth_headers,
                          params={"risk_min": 60}).json()
    assert all((i["current_risk_score"] or 0) >= 60 for i in filtered)


# ---------------------------------------------------------------------------
# WebSocket push (testing-strategy Section 3 'WebSocket push')
# ---------------------------------------------------------------------------


def test_ws_alerts_receives_window_opened(client, auth_headers, ws_token, seeded_db):
    # fresh patient with <2h data -> extend to exactly >=2h via API, then trigger
    created = client.post("/api/patients", headers=auth_headers, json={
        "name": "WS Test", "age": 70, "sex": "F",
        "admission_date": _now_iso(), "ward": "ICU-5", "bed_number": "05",
        "conditions": [{"name": "Sepsis", "icd_code": "A41.9", "type": "critical"}],
        "comorbidities": [],
    })
    pid = created.json()["patient_id"]

    with client.websocket_connect(f"/ws/alerts?token={ws_token}") as ws:
        client.post(f"/api/patients/{pid}/vitals", headers=auth_headers,
                    json={"timestamp": _hours_ago(2), **BENIGN})
        client.post(f"/api/patients/{pid}/vitals", headers=auth_headers,
                    json={"timestamp": _now_iso(), "heart_rate": 155,
                          "bp_systolic": 90, "bp_diastolic": 50,
                          "temperature": 40.0, "respiratory_rate": 32,
                          "spo2": 92, "wbc": 18.0, "lactate": 6.0,
                          "creatinine": 2.0, "urine_output": 15})
        event = ws.receive_json()

    # This patient has NO assigned clinician -> routing escalates to the next
    # available clinician and the event reflects that (docs/05-api-spec.md §10
    # covers open/close/escalation pushes).
    assert event["event"] in {"window_opened", "escalated"}
    data = event["data"]
    assert data["patient_id"] == pid
    assert data["urgency"] == "CRITICAL"
    assert data["hours_remaining"] > 0
    assert "recommended_action" in data

    pred = client.get(f"/api/patients/{pid}/predictions/sepsis",
                      headers=auth_headers).json()
    assert pred["window_open"] is True
    assert pred["urgency"] == "CRITICAL"
    assert pred["risk_score"] >= 85


def test_ws_rejects_invalid_token(client):
    from starlette.websockets import WebSocketDisconnect

    try:
        with client.websocket_connect("/ws/alerts?token=not-a-jwt") as ws:
            ws.receive_json()
        raised = False
    except Exception:
        raised = True
    assert raised


# ---------------------------------------------------------------------------
# Stubs + health (Sections 5, 9; observability §3)
# ---------------------------------------------------------------------------


def test_alzheimers_stub_shape(client, auth_headers, seeded_db):
    resp = client.get(f"/api/patients/{seeded_db['fresh']}/predictions/alzheimers",
                      headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["stage"] == "Mild AD"
    assert {"stage", "months_to_next_stage", "atrophy_rate_mm3_per_year",
            "treatment_effectiveness_score", "heatmap_url", "generated_at"} == set(body.keys())


def test_prediction_history_endpoint(client, auth_headers, seeded_db):
    resp = client.get(f"/api/patients/{seeded_db['diab']}/predictions/history",
                      headers=auth_headers)
    assert resp.status_code == 200
    history = resp.json()
    assert history
    for snap in history:
        assert PREDICTION_KEYS <= set(snap.keys())


def test_mri_scan_stub_validation_and_flow(client, auth_headers, seeded_db):
    pid = seeded_db["fresh"]
    bad = client.post(f"/api/patients/{pid}/scans", headers=auth_headers,
                      files={"file": ("scan.txt", b"nope", "text/plain")},
                      data={"scan_date": _now_iso()})
    assert bad.status_code == 422
    assert bad.json()["error"] == "validation_error"

    big = client.post(f"/api/patients/{pid}/scans", headers=auth_headers,
                      files={"file": ("big.nii.gz", b"x" * (3 * 1024 * 1024),
                                      "application/octet-stream")},
                      data={"scan_date": _now_iso()})
    assert big.status_code == 422

    ok = client.post(f"/api/patients/{pid}/scans", headers=auth_headers,
                     files={"file": ("scan.nii.gz", b"\x00\x01fake", 
                                     "application/octet-stream")},
                     data={"scan_date": _now_iso()})
    assert ok.status_code == 202
    scan_id = ok.json()["scan_id"]
    assert ok.json()["processing_status"] == "pending"

    listing = client.get(f"/api/patients/{pid}/scans", headers=auth_headers).json()
    assert scan_id in [s["scan_id"] for s in listing]

    single = client.get(f"/api/patients/{pid}/scans/{scan_id}", headers=auth_headers)
    assert single.status_code == 200
    assert single.json()["processing_status"] == "pending"

    missing = client.get(f"/api/patients/{pid}/scans/00000000-0000-0000-0000-000000000000",
                         headers=auth_headers)
    assert missing.status_code == 404


def test_analytics_stubs_return_empty_arrays(client, auth_headers):
    for path in ("/api/analytics/sepsis-outcomes",
                 "/api/analytics/alzheimers-progression",
                 "/api/analytics/intervention-efficacy"):
        resp = client.get(path, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []


def test_health_shape(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"status", "postgres", "neo4j"}
    assert body["postgres"] == "up"
    assert body["neo4j"] in {"up", "down"}
    assert body["status"] in {"ok", "degraded"}


def test_clinicians_endpoints(client, auth_headers, seeded_db):
    clinicians = client.get("/api/clinicians", headers=auth_headers).json()
    assert clinicians
    cid = seeded_db["cc_available"]
    resp = client.put(f"/api/clinicians/{cid}/availability", headers=auth_headers,
                      json={"is_available": False})
    assert resp.status_code == 200
    assert resp.json()["is_available"] is False
    # restore
    client.put(f"/api/clinicians/{cid}/availability", headers=auth_headers,
               json={"is_available": True})


def test_vitals_listing_filters_and_latest(client, auth_headers, seeded_db):
    pid = seeded_db["diab"]
    resp = client.get(f"/api/patients/{pid}/vitals", headers=auth_headers,
                      params={"from": _hours_ago(1)})
    assert resp.status_code == 200
    readings = resp.json()
    assert readings
    assert "reading_id" in readings[0]

    latest = client.get(f"/api/patients/{pid}/vitals/latest", headers=auth_headers).json()
    assert latest
    stamps = [r["timestamp"] for r in latest]
    assert stamps == sorted(stamps)
