import logging

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.routes import api, pages

def create_app() -> FastAPI:
    logging.basicConfig(level=logging.INFO)
    app = FastAPI(title="AIP AI Photo Quiz")

    app.mount("/static", StaticFiles(directory="app/static"), name="static")

    app.include_router(api.router, prefix="/api")
    app.include_router(pages.router)

    return app
