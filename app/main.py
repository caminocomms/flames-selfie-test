import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.config import Settings
from app.routes import api, pages
from app.services.cleanup import cleanup_loop
from app.services.results_repo import ResultsRepository
from app.services.ratelimit import InProcessRateLimiter
from app.services.storage import S3Storage


def _add_security_headers(response) -> None:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; "
        "font-src https://fonts.gstatic.com; "
        "img-src 'self' data: blob: https:; "
        "media-src 'self' blob:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'"
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = None
    try:
        settings = app.state.settings
        repo = ResultsRepository(settings.db_path)
        repo.init_db()
        app.state.repo = repo
        app.state.storage = None
        app.state.gen_semaphore = asyncio.Semaphore(settings.gen_max_concurrency)
        app.state.gen_inflight = 0
        app.state.gen_inflight_lock = asyncio.Lock()
        app.state.rate_limiter = InProcessRateLimiter(settings.rate_limit_per_min, settings.rate_limit_per_day)

        if settings.s3_bucket and settings.s3_endpoint_url and settings.s3_public_base_url:
            storage = S3Storage(
                endpoint_url=settings.s3_endpoint_url,
                bucket=settings.s3_bucket,
                region=settings.s3_region,
                access_key=settings.s3_access_key_id,
                secret_key=settings.s3_secret_access_key,
                public_base_url=settings.s3_public_base_url,
            )
            app.state.storage = storage
            cleanup_task = asyncio.create_task(cleanup_loop(repo, storage))
        yield
    finally:
        if cleanup_task:
            cleanup_task.cancel()
            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass


def create_app(validate_env: bool = True) -> FastAPI:
    logging.basicConfig(level=logging.INFO)
    settings = Settings.load(validate=validate_env)

    app = FastAPI(title="EI FLAMES Selfie Generator", lifespan=lifespan)
    app.state.settings = settings

    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.allowed_hosts))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o for o in settings.allowed_origins],
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
        max_age=600,
    )

    @app.middleware("http")
    async def security_headers_middleware(request, call_next):
        response = await call_next(request)
        _add_security_headers(response)
        return response

    app.mount("/static", StaticFiles(directory="app/static"), name="static")

    app.include_router(api.router, prefix="/api")
    app.include_router(pages.router)

    return app
