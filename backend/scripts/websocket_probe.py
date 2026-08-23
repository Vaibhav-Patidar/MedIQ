"""Live WebSocket verification using a REAL PhysioNet case from the training
samples (p016276 - genuinely septic, trained model scores it ~84/HIGH).
    docker compose exec backend python scripts/websocket_probe.py
"""
import asyncio, json, sys, urllib.request
import pandas as pd

BASE = "http://localhost:8000"
SAMPLE = "/app/data/sepsis_samples/p016276.psv"
PASS = FAIL = 0
def check(name, cond, extra=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"  PASS  {name}")
    else: FAIL += 1; print(f"  FAIL  {name} :: {extra}")

def call(m,p,b=None,t=None):
    r=urllib.request.Request(BASE+p,method=m); r.add_header("Content-Type","application/json")
    if t: r.add_header("Authorization",f"Bearer {t}")
    d=json.dumps(b).encode() if b is not None else None
    try:
        with urllib.request.urlopen(r,d) as x: return x.status,json.loads(x.read().decode() or "null")
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read().decode())

def _num(row, col):
    v = row.get(col)
    return None if pd.isna(v) else float(v)

async def main():
    import websockets
    _,tok = call("POST","/api/auth/login",{"email":"doctor@mediq.local","password":"mediq-demo"})
    T = tok["access_token"]
    body={"name":"WS Probe","age":75,"sex":"M","admission_date":"2026-08-23T08:00:00Z",
          "ward":"ICU-W","bed_number":"01",
          "conditions":[{"name":"Sepsis","icd_code":"A41.9","type":"critical"}],
          "comorbidities":[]}
    _,np_ = call("POST","/api/patients",b=body,t=T)
    pid=np_["patient_id"]

    df = pd.read_csv(SAMPLE, sep="|").tail(12).reset_index(drop=True)

    async with websockets.connect(f"ws://localhost:8000/ws/alerts?token={T}") as ws:
        try:
            async with websockets.connect("ws://localhost:8000/ws/alerts?token=garbage") as bad:
                await bad.recv()
            check("invalid ws token rejected", False)
        except Exception:
            check("invalid ws token rejected (handshake closed)", True)

        loop = asyncio.get_event_loop()
        def posts():
            from datetime import datetime, timedelta, timezone
            end = datetime.now(timezone.utc)
            for i, row in df.iterrows():
                call("POST", f"/api/patients/{pid}/vitals", b={
                    "timestamp": (end - timedelta(hours=len(df)-1-i)).isoformat(),
                    "heart_rate": int(_num(row,"HR")) if _num(row,"HR") is not None else None,
                    "bp_systolic": int(_num(row,"SBP")) if _num(row,"SBP") is not None else None,
                    "bp_diastolic": int(_num(row,"DBP")) if _num(row,"DBP") is not None else None,
                    "temperature": _num(row,"Temp"),
                    "respiratory_rate": int(_num(row,"Resp")) if _num(row,"Resp") is not None else None,
                    "spo2": _num(row,"O2Sat"),
                }, t=T)
        await loop.run_in_executor(None, posts)

        evt=json.loads(await asyncio.wait_for(ws.recv(), timeout=40))
        check("live event delivered", evt["event"] in ("window_opened","escalated")
              and evt["data"]["patient_id"]==pid
              and evt["data"]["urgency"] in ("HIGH","CRITICAL")
              and evt["data"]["hours_remaining"]>0,
              json.dumps(evt)[:200])

    _,pred = call("GET",f"/api/patients/{pid}/predictions/sepsis",t=T)
    check("snapshot: trained model flags real septic case",
          pred["window_open"] is True and pred["risk_score"]>=60,
          f"risk={pred.get('risk_score')} urgency={pred.get('urgency')}")
    _,cl = call("GET","/api/clinicians",t=T)
    print(f"\n===== WEBSOCKET PROBE: {PASS} passed / {FAIL} failed =====")

asyncio.run(main())
