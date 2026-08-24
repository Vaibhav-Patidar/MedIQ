import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.errors import ApiError, envelope
from app.core.logging_config import configure_logging
from app.core.logging_middleware import RequestLoggingMiddleware

logger = logging.getLogger("mediq.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    configure_logging()
    settings = get_settings()
    from app.core.websocket import manager
    manager.set_main_loop(asyncio.get_running_loop())
    # Postgres engine warms lazily; Neo4j connects + creates uniqueness
    # constraints (docs/06-database-spec.md Section 4). Neither blocks startup
    # on failure — /api/health reports the actual status instead.
    try:
        from app.db import get_engine
        get_engine()
        logger.info("postgres engine ready")
    except Exception as exc:
        logger.warning("postgres not reachable at startup: %s", exc)
    if settings.use_neo4j:
        neo4j_connect()
    # ML load at startup (SepsisPredictor falls back to surrogate without a
    # checkpoint — see backend/checkpoints/README.md).
    from app.ml.sepsis_route import init_predictor
    from app.services.prediction import get_predictor
    init_predictor()  # populate the provided route skeleton's module globals
    predictor = get_predictor()
    logger.info("sepsis predictor ready (mode=%s)", predictor.mode)
    yield
    neo4j_close()


def neo4j_connect() -> None:
    from app.ontology.neo4j_client import client as neo4j
    neo4j.connect()


def neo4j_close() -> None:
    from app.ontology.neo4j_client import client as neo4j
    neo4j.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="MedIQ API",
        description=("Ontology-driven sepsis early-warning system — "
                     "Smart India Hackathon 2026, Team ByteSlay"),
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://.*\.vercel\.app$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # docs/11-observability-spec.md §1: structured request logs to stdout
    app.add_middleware(RequestLoggingMiddleware)

    # --- routers ---
    from app.api.analytics import router as analytics_router
    from app.api.alerts import router as alerts_router
    from app.api.auth import router as auth_router
    from app.api.clinicians import router as clinicians_router
    from app.api.health import router as health_router
    from app.api.interventions import router as interventions_router
    from app.api.patients import router as patients_router
    from app.api.predictions import router as predictions_router
    from app.api.scans import router as scans_router
    from app.api.vitals import router as vitals_router
    from app.api.ws import router as ws_router

    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(patients_router)
    app.include_router(vitals_router)
    app.include_router(predictions_router)  # includes ml/sepsis_route.py's sepsis endpoint
    app.include_router(alerts_router)
    app.include_router(interventions_router)
    app.include_router(clinicians_router)
    app.include_router(scans_router)
    app.include_router(analytics_router)
    app.include_router(ws_router)

    # --- error handling: every failure returns the docs/05-api-spec.md §11
    # envelope; tracebacks are logged server-side only, never in responses ---

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError):
        body = envelope(exc.code, exc.message, exc.details)
        if isinstance(exc.details, dict):
            body.update(exc.details)  # e.g. flat keys alongside the envelope
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        # Provided sepsis_route.py raises HTTPException(409, detail={envelope});
        # render such dict-details as the response body verbatim instead of
        # FastAPI's default {"detail": ...} wrapper.
        if isinstance(exc.detail, dict) and "error" in exc.detail:
            body = dict(exc.detail)
            details = body.get("details")
            if isinstance(details, dict):
                body.update(details)  # flat hours_available/hours_required per spec §4
            return JSONResponse(status_code=exc.status_code, content=body)
        code_map = {401: "unauthorized", 403: "forbidden", 404: "not_found",
                    405: "method_not_allowed", 409: "conflict", 429: "rate_limited"}
        return JSONResponse(
            status_code=exc.status_code,
            content=envelope(code_map.get(exc.status_code, "error"),
                             str(exc.detail), {}),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        details = [
            {"loc": [str(l) for l in err.get("loc", [])],
             "msg": err.get("msg"), "type": err.get("type")}
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=envelope("validation_error", "Request payload failed schema validation.", details),
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        # full traceback server-side only (docs/11-observability-spec.md §1)
        logger.exception("unhandled exception on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content=envelope("internal_error", "An unexpected error occurred."),
        )

    return app


app = create_app()
