import json
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("mediq.request")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """docs/11-observability-spec.md Section 1: structured request logs
    (method, path, status, latency) to stdout."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                json.dumps({
                    "method": request.method,
                    "path": request.url.path,
                    "status": 500,
                    "latency_ms": round((time.perf_counter() - start) * 1000, 2),
                })
            )
            raise
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.info(json.dumps({
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "latency_ms": latency_ms,
        }))
        return response
