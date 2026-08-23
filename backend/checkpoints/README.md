# Trained model bundle

This directory holds the trained sepsis model loaded at backend startup.

## Current bundle (committed)

- `sepsis_xgboost.pkl` — XGBClassifier (sklearn API) trained on PhysioNet-derived
  windowed statistics. AUROC ≈ 0.70.
- `model_config.json` — feature list (`{HR,O2Sat,Temp,SBP,MAP,DBP,Resp}_mean/_std`),
  base `feature_cols`, decision threshold (0.599), trajectory horizon (6).

**Loading path:** `SepsisPredictor` (backend/app/ml/inference.py) detects the `.pkl`
via `SEPSIS_CHECKPOINT_PATH`, reads the sibling `model_config.json`, and runs in
mode='xgboost': risk_score = P(sepsis)·100, SHAP explanations come from native
TreeSHAP (`pred_contribs`), and the 6-hour trajectory projects the recent risk
trend forward. If the files are missing, the predictor silently falls back to the
deterministic clinical surrogate — startup never fails on a missing model.

## Swapping in a TFT later

Export the Temporal Fusion Transformer checkpoint here, point
`SEPSIS_CHECKPOINT_PATH` at it, uncomment `torch` / `pytorch-forecasting` /
`shap` / `lightgbm` in `backend/requirements.txt`, and rebuild — the provided
TFT branch takes over automatically.
