"""Comprehensive live-API verification. Run against a seeded stack:
    docker compose exec backend python scripts/final_check.py
"""
import json, sys, urllib.request, urllib.error

BASE = "http://localhost:8000"
PASS = FAIL = 0
def check(name, cond, extra=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"  PASS  {name}")
    else: FAIL += 1; print(f"  FAIL  {name} :: {extra}")

def call(m, p, b=None, t=None):
    r = urllib.request.Request(BASE+p, method=m)
    r.add_header("Content-Type", "application/json")
    if t: r.add_header("Authorization", f"Bearer {t}")
    d = json.dumps(b).encode() if b is not None else None
    try:
        with urllib.request.urlopen(r, d) as x: return x.status, json.loads(x.read().decode() or "null")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read().decode())

print("== AUTH ==")
c,bad = call("POST","/api/auth/login",{"email":"doctor@mediq.local","password":"nope"})
check("bad password -> 401 invalid_credentials", c==401 and bad["error"]=="invalid_credentials")
c,tok = call("POST","/api/auth/login",{"email":"doctor@mediq.local","password":"mediq-demo"})
t = tok["access_token"]; H = t
check("login shape (bearer/expires/user)", c==200 and tok["token_type"]=="bearer"
      and tok["expires_in"]==3600 and tok["user"]["role"]=="clinician")
c,_ = call("GET","/api/patients")
check("missing token -> 401 unauthorized envelope", c==401)
c,_ = call("POST","/api/auth/refresh",t=H); check("refresh -> 200", c==200)
c,_ = call("POST","/api/auth/logout",t=H); check("logout -> 204", c==204)

print("== PATIENTS ==")
c,ps = call("GET","/api/patients",t=H)
by = {p["name"]: p for p in ps}
check("seeded patients present", {"Ramesh Yadav","Sunita Devi","Kavita Sharma",
      "Devika Menon","Meera Joshi"} <= set(by), list(by))
ramesh, sunita, kavita, devika = by["Ramesh Yadav"], by["Sunita Devi"], by["Kavita Sharma"], by["Devika Menon"]
import urllib.parse
req = urllib.request.Request(BASE+"/api/patients?ward=HDU-1"); req.add_header("Authorization",f"Bearer {H}")
hdus = json.load(urllib.request.urlopen(req))
check("ward filter", len(hdus)==3 and all(x["ward"]=="HDU-1" for x in hdus))
req = urllib.request.Request(BASE+"/api/patients?risk_min=70"); req.add_header("Authorization",f"Bearer {H}")
hi = json.load(urllib.request.urlopen(req))
check("risk_min filter", all((x["current_risk_score"] or 0)>=70 for x in hi) and hi)
c,det = call("GET", f"/api/patients/{ramesh['patient_id']}", t=H)
check("diabetic adjustment object", det["comorbidities"][0]["adjustment"]==
      {"threshold":55,"reason":"diabetic_lactate_sensitivity"})
check("escalated assignment persisted", det["assigned_doctor"]["name"]=="Dr. Rao"
      and det["assigned_doctor"]["is_available"])
c,g = call("GET", f"/api/patients/{ramesh['patient_id']}/graph", t=H)
types={n["type"] for n in g["nodes"]}; rels={e["relation"] for e in g["edges"]}
check("neo4j graph rich traversal", {"Patient","Disease","Clinician","VitalReading","ProgressionState"}<=types
      and {"HAS_CONDITION","COMORBID_WITH","ASSIGNED_TO","IN_PROGRESSION","HAS_VITAL"}<=rels)
c,c404 = call("GET","/api/patients/00000000-0000-0000-0000-000000000000",t=H)
check("404 patient_not_found", c==404 and c404["error"]=="patient_not_found")
body={"name":"Sweep Temp","age":50,"sex":"F","blood_type":"O+","admission_date":"2026-08-23T09:00:00Z",
      "ward":"TEST","bed_number":"99","conditions":[],"comorbidities":[],"medications":[]}
c,newp = call("POST","/api/patients",b=body,t=H)
check("patient created 201", c==201 and newp["assigned_doctor"] is None)
upd = dict(body); upd["ward"]="ICU-X"
c,updp = call("PUT", f"/api/patients/{newp['patient_id']}", b=upd, t=H)
check("patient updated", c==200 and updp["ward"]=="ICU-X")

print("== VITALS ==")
from datetime import datetime, timedelta, timezone
nowiso = datetime.now(timezone.utc).isoformat()
c,_ = call("POST", f"/api/patients/{kavita['patient_id']}/vitals", b={"timestamp":nowiso,"heart_rate":-3}, t=H)
check("negative HR 422", c==422)
c,v = call("POST", f"/api/patients/{kavita['patient_id']}/vitals", b={"timestamp":nowiso,"spo2":101}, t=H)
check("SpO2>100 422", c==422)
good = dict(timestamp=nowiso, heart_rate=103, bp_systolic=116, bp_diastolic=69,
            temperature=38.0, respiratory_rate=21, spo2=97, wbc=11.0,
            lactate=2.4, creatinine=1.2, urine_output=45)
c,vr = call("POST", f"/api/patients/{kavita['patient_id']}/vitals", b=good, t=H)
check("valid reading 201, <2h not triggered", c==201 and vr["prediction_triggered"] is False)
c,e409 = call("GET", f"/api/patients/{kavita['patient_id']}/predictions/sepsis", t=H)
check("409 insufficient_data contract", c==409 and e409["error"]=="insufficient_data"
      and e409["hours_required"]==2 and "hours_available" in e409)

print("== PREDICTIONS ==")
KEYS = {"risk_score","risk_score_change","trajectory","trajectory_confidence_band","window_open",
        "window_closes_at","hours_remaining","urgency","threshold_used","threshold_adjustment_reason",
        "shap_explanation","generated_at"}
c,d = call("GET", f"/api/patients/{ramesh['patient_id']}/predictions/sepsis", t=H)
check("exact §4 key set", set(d.keys())==KEYS)
check("trained-model OPEN @55 diabetic", d["window_open"] is True and d["threshold_used"]==55
      and d["threshold_adjustment_reason"]=="diabetic_lactate_sensitivity")
check("trajectory/band lengths", len(d["trajectory"])==6 and
      len(d["trajectory_confidence_band"]["lower"])==len(d["trajectory"]))
check("SHAP <=5 sorted, correct entry shape", 0<len(d["shap_explanation"])<=5 and
      all(set(e)=={"feature","value","threshold","impact","direction"} for e in d["shap_explanation"]))
sd = call("GET", f"/api/patients/{sunita['patient_id']}/predictions/sepsis", t=H)[1]
check("Journey B control closed @65 reason null", sd["window_open"] is False
      and sd["threshold_used"]==65 and sd["threshold_adjustment_reason"] is None
      and abs(sd["risk_score"]-d["risk_score"])<15)
dd = call("GET", f"/api/patients/{devika['patient_id']}/predictions/sepsis", t=H)[1]
check("PhysioNet septic case alerts", dd["window_open"] and dd["urgency"] in ("HIGH","CRITICAL"))
_,hist = call("GET", f"/api/patients/{ramesh['patient_id']}/predictions/history", t=H)
check("history newest-first", len(hist)>0 and hist[0]["generated_at"]>=hist[-1]["generated_at"])
c,mock = call("GET", f"/api/patients/{ramesh['patient_id']}/predictions/alzheimers", t=H)
check("alzheimers mock stub", c==200 and mock["stage"]=="Mild AD")

print("== ALERTS / WINDOWS ==")
c,a = call("GET","/api/alerts/active",t=H)
order={"CRITICAL":0,"HIGH":1,"MEDIUM":2,"LOW":3}
u=[order[i["urgency"]] for i in a]
check("alerts pre-sorted", u==sorted(u) and len(a)>=2)
wid=a[0]["window_id"]
c,wl = call("GET", f"/api/patients/{a[0]['patient_id']}/windows", t=H)
check("patient windows includes active", any(x["window_id"]==wid for x in wl))
c,ack = call("POST", f"/api/windows/{wid}/acknowledge", t=H)
check("acknowledge shape", c==200 and ack["window_id"]==wid and ack["acknowledged_at"])
c,a2 = call("GET","/api/alerts/active",t=H)
check("acked removed from active", wid not in {x["window_id"] for x in a2})

print("== INTERVENTIONS ==")
ivb={"type":"medication_change","description":"IV antibiotics + fluids","performed_at":nowiso,"window_id":None}
c,iv = call("POST", f"/api/patients/{ramesh['patient_id']}/interventions", b=ivb, t=H)
check("created 201 attributed", c==201 and iv["clinician_id"] and iv["outcome"] is None)
c,ou = call("PUT", f"/api/interventions/{iv['intervention_id']}/outcome", b={"outcome":"improved"}, t=H)
check("outcome improved + timestamp", c==200 and ou["outcome"]=="improved" and ou["outcome_recorded_at"])
c,bad_o = call("PUT", f"/api/interventions/{iv['intervention_id']}/outcome", b={"outcome":"miracle"}, t=H)
check("invalid outcome 422 envelope", c==422 and bad_o["error"]=="validation_error")
c,lst = call("GET", f"/api/patients/{ramesh['patient_id']}/interventions", t=H)
check("list newest-first", lst[0]["intervention_id"]==iv["intervention_id"])

print("== CLINICIANS ==")
c,cl = call("GET","/api/clinicians",t=H)
check("4 clinicians", c==200 and len(cl)==4)
rao=[x for x in cl if x["name"]=="Dr. Rao"][0]
mehta=[x for x in cl if x["name"]=="Dr. Mehta"][0]
check("escalation persisted (Mehta unavailable)", mehta["is_available"] is False and rao["current_patient_count"]>=1)
c,x = call("PUT", f"/api/clinicians/{rao['clinician_id']}/availability", b={"is_available":False}, t=H)
check("availability flip false", c==200 and x["is_available"] is False)
c,x = call("PUT", f"/api/clinicians/{rao['clinician_id']}/availability", b={"is_available":True}, t=H)
check("availability flip back true", c==200 and x["is_available"] is True)

print("== SCANS / ANALYTICS / HEALTH ==")
boundary="XxX"
def multipart(fname, content):
    return (f"--{boundary}\r\nContent-Disposition: form-data; name=\"scan_date\"\r\n\r\n{nowiso}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{fname}\"\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n").encode()+content+f"\r\n--{boundary}--\r\n".encode()
def up(fname, content):
    r=urllib.request.Request(BASE+f"/api/patients/{ramesh['patient_id']}/scans", data=multipart(fname,content), method="POST")
    r.add_header("Authorization",f"Bearer {H}"); r.add_header("Content-Type",f"multipart/form-data; boundary={boundary}")
    try:
        with urllib.request.urlopen(r) as x: return x.status, json.loads(x.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read())
c,s = up("brain.nii.gz", b"\x00\x01fake")
check("scan accepted 202 pending", c==202 and s["processing_status"]=="pending")
c,s = up("notes.txt", b"x")
check("scan wrong ext 422", c==422 and s["error"]=="validation_error")
c,scans = call("GET", f"/api/patients/{ramesh['patient_id']}/scans", t=H)
check("scan listed", len(scans)>=1)
c,det_scan = call("GET", f"/api/patients/{ramesh['patient_id']}/scans/{scans[0]['scan_id']}", t=H)
check("scan detail pending", c==200 and det_scan["processing_status"]=="pending")
for path in ("/api/analytics/sepsis-outcomes","/api/analytics/alzheimers-progression","/api/analytics/intervention-efficacy"):
    c,x = call("GET", path, t=H); check(f"stub {path.rsplit('/',1)[1]} -> []", c==200 and x==[])
c,h = call("GET","/api/health")
check("health ok/up/up", h=={"status":"ok","postgres":"up","neo4j":"up"}, str(h))

print(f"\n===== FINAL CHECK: {PASS} passed / {FAIL} failed =====")
sys.exit(1 if FAIL else 0)
