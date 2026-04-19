
from fastapi import APIRouter, HTTPException

from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from app.models import (
    RegisterRequest,
    RegisterResponse,
    LoginRequest,
    LoginResponse,
)
from app.storage import USERS_BY_EMAIL, create_user

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


@router.post("/register", response_model=RegisterResponse)
def register(payload: RegisterRequest):
    email = payload.email.lower()

    if email in USERS_BY_EMAIL:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = create_user(
        name=payload.name,
        email=email,
        password_hash=hash_password(payload.password),
    )

    return RegisterResponse(
        user_id=user["user_id"],
        name=user["name"],
        email=user["email"],
        created_at=user["created_at"],
    )


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    email = payload.email.lower()
    user = USERS_BY_EMAIL.get(email)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user["user_id"])

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user["user_id"],
        name=user["name"],
    )