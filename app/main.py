import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import Settings
from app.routes import api, pages
from app.services.cleanup import cleanup_loop
from app.services.results_repo import ResultsRepository
from app.services.storage import S3Storage


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = None
    try:
        settings = app.state.settings
        repo = ResultsRepository(settings.db_path)
        repo.init_db()
        app.state.repo = repo
        app.state.storage = None

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

    app.mount("/static", StaticFiles(directory="app/static"), name="static")

    app.include_router(api.router, prefix="/api")
    app.include_router(pages.router)

    return app
