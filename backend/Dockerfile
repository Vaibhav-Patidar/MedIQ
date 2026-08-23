FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# curl used by the compose healthcheck (docs/11-observability-spec.md Section 3)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Where the MRI-upload stub writes files and where a trained TFT checkpoint
# would be dropped (see checkpoints/README.md). Neither blocks startup.
RUN mkdir -p /data/uploads /app/checkpoints

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
