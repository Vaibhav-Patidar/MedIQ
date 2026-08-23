# Drop your trained model here

`SepsisPredictor` (backend/app/ml/inference.py) starts **without any checkpoint** —
it falls back to a deterministic, clinically-motivated surrogate scorer so the whole
demo (risk score → window → SHAP → countdown) works end to end. This is intentional:
the backend must boot cleanly before the TFT training pipeline lands.

To use the real model:

1. Train via the sepsis TFT notebook (PhysioNet/CinC 2019), export a bundle to this
   directory, e.g. `sepsis_tft.pt` (+ optional LightGBM surrogate `surrogate.lgbm`).
2. Set `SEPSIS_CHECKPOINT_PATH=/app/checkpoints/sepsis_tft.pt` in `.env`.
3. Uncomment `torch`, `pytorch-forecasting`, `shap` in `requirements.txt` and rebuild.
4. Restart the backend — startup logs will say which predictor backend loaded.

If the checkpoint file is missing or the heavy libs aren't installed, the app logs a
warning and uses the surrogate. It never crashes on startup because of a missing model.
