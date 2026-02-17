from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(request, "index.html", {})


@router.get("/r/{result_id}", response_class=HTMLResponse)
def shared_result(request: Request, result_id: str):
    return templates.TemplateResponse(
        request,
        "share.html",
        {"result_id": result_id},
    )
