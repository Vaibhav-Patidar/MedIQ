"""docs/09-testing-strategy.md Section 2 — PSV conversion: exact column order,
pipe delimiter, missing-value handling, UTC Z timestamps."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from datetime import datetime, timedelta, timezone

import pandas as pd

from app.ml.inference import dataframe_to_psv


def test_header_column_order_exact():
    df = pd.DataFrame([
        {"time_idx": 0, "HR": 118.0, "O2Sat": None, "Temp": 38.9,
         "SBP": 96.0, "MAP": None, "DBP": None, "Resp": 24.0,
         "Lactate": 4.2, "WBC": 15.2, "Creatinine": 1.6}
    ])
    header = dataframe_to_psv(df).splitlines()[0]
    assert header == "|".join(["time_idx"] + [
        "HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp",
        "Lactate", "WBC", "Creatinine",
    ])


def test_pipe_delimited_rows_and_missing_values_empty():
    row = {"time_idx": 3, "HR": 118, "O2Sat": None, "Temp": 38.9,
           "SBP": 96, "MAP": None, "DBP": 60, "Resp": 24,
           "Lactate": 4.2, "WBC": 15.2, "Creatinine": 1.6}
    lines = dataframe_to_psv(pd.DataFrame([row])).splitlines()
    assert len(lines) == 2
    fields = lines[1].split("|")
    assert len(fields) == 11
    assert fields[1] == "118"
    assert fields[2] == ""                                # O2Sat missing -> empty
    assert fields[PSV_TEMP_INDEX()] == "38.9"


def PSV_TEMP_INDEX():
    return ["time_idx", "HR", "O2Sat", "Temp"].index("Temp")


def test_rows_sorted_by_time_idx():
    rows = [{"time_idx": h, "HR": float(100 - h)} |
            {c: 0.0 for c in ("O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp",
                              "Lactate", "WBC", "Creatinine")}
            for h in (2, 0, 1)]
    body = dataframe_to_psv(pd.DataFrame(rows)).splitlines()[1:]
    idx = [int(line.split("|")[0]) for line in body]
    assert idx == sorted(idx)
