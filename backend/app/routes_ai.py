
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import time

from app.auth import get_current_user

router = APIRouter(prefix="/api/v1/ai", tags=["AI"])


class AIRewriteRequest(BaseModel):
    text: str


def fake_stream(text: str):
    for char in text:
        yield char
        time.sleep(0.02)


@router.post("/rewrite")
def rewrite(payload: AIRewriteRequest, current_user=Depends(get_current_user)):
    improved = (
        " This is a more polished and professional version of your writing."
    )

    return StreamingResponse(
        fake_stream(improved),
        media_type="text/plain",
    )