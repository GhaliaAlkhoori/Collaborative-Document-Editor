
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes_auth import router as auth_router
from app.routes_documents import router as documents_router
from app.routes_ai import router as ai_router
from app.routes_share_links import router as share_links_router
from app.routes_ws import router as ws_router


app = FastAPI(
    title="Collaborative Document Editor API",
    version="0.1.0",
    description="Backend for Assignment 2",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 👇 routers MUST come AFTER app is created
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(ai_router)
app.include_router(share_links_router)
app.include_router(ws_router)


@app.get("/")
def root():
    return {"message": "Backend is running"}


@app.get("/health")
def health():
    return {"status": "ok"}
