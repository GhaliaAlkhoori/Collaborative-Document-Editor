
from fastapi import APIRouter, HTTPException

from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from app.models import (
    RegisterRequest,
    RegisterResponse,
    LoginRequest,
    LoginResponse,
    RefreshTokenRequest,
    RefreshResponse,
)
from app.storage import (
    USERS_BY_EMAIL,
    USERS_BY_ID,
    create_refresh_token,
    create_user,
    get_active_refresh_token,
    revoke_refresh_token,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


def build_session_response(user: dict, *, response_model):
    access_token = create_access_token(user["user_id"])
    refresh_token = create_refresh_token(user["user_id"], REFRESH_TOKEN_EXPIRE_DAYS)

    return response_model(
        access_token=access_token,
        refresh_token=refresh_token["token"],
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_expires_in=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        user_id=user["user_id"],
        name=user["name"],
        email=user["email"],
    )


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

    return build_session_response(user, response_model=LoginResponse)


@router.post("/refresh", response_model=RefreshResponse)
def refresh(payload: RefreshTokenRequest):
    refresh_token = get_active_refresh_token(payload.refresh_token)
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = USERS_BY_ID.get(refresh_token["user_id"])
    if not user:
        revoke_refresh_token(payload.refresh_token)
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    revoke_refresh_token(payload.refresh_token)
    return build_session_response(user, response_model=RefreshResponse)
