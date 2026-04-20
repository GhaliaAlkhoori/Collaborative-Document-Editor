import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.ai_prompts import build_generation_plan, build_instructions
from app.ai_provider import build_mock_text, get_ai_provider
from app.auth import get_current_user
from app.models import (
    AIGenerateRequest,
    AIInteractionEntry,
    AIRewriteRequest,
    ListAIInteractionsResponse,
    UpdateAIInteractionStatusRequest,
)
from app.storage import (
    DOCUMENTS_BY_ID,
    DOCUMENT_PERMISSIONS,
    create_ai_interaction,
    finalize_ai_interaction,
    list_ai_interactions,
    update_ai_interaction_status,
)

router = APIRouter(prefix="/api/v1/ai", tags=["AI"])

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")
OPENAI_REASONING_EFFORT = os.getenv("OPENAI_REASONING_EFFORT", "low")
OPENAI_VERBOSITY = os.getenv("OPENAI_VERBOSITY", "low")
AI_MOCK_MODE = os.getenv("AI_MOCK_MODE", "").lower() in {"1", "true", "yes", "on"}


def require_ai_access(document_id: str, user_id: str) -> str:
    document = DOCUMENTS_BY_ID.get(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    role = DOCUMENT_PERMISSIONS.get(document_id, {}).get(user_id)
    if not role:
        raise HTTPException(status_code=403, detail="Access denied")

    if role not in {"owner", "editor"}:
        raise HTTPException(status_code=403, detail="You do not have AI access for this document")

    return role


def require_document_access(document_id: str, user_id: str) -> str:
    document = DOCUMENTS_BY_ID.get(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    role = DOCUMENT_PERMISSIONS.get(document_id, {}).get(user_id)
    if not role:
        raise HTTPException(status_code=403, detail="Access denied")

    return role


def serialize_ai_interaction(interaction: dict) -> AIInteractionEntry:
    return AIInteractionEntry(**interaction)


def stream_and_record_text(provider, stream, document_id: str, interaction_id: str):
    collected_chunks = []

    try:
        for chunk in provider.iter_text(stream):
            collected_chunks.append(chunk)
            yield chunk
    except Exception as exc:
        finalize_ai_interaction(
            document_id,
            interaction_id,
            response_text="".join(collected_chunks),
            status="error",
            error_message=str(exc),
        )
        raise
    else:
        finalize_ai_interaction(
            document_id,
            interaction_id,
            response_text="".join(collected_chunks),
        )


@router.post("/generate")
def generate(payload: AIGenerateRequest, current_user=Depends(get_current_user)):
    require_ai_access(payload.document_id, current_user["user_id"])
    generation_plan = build_generation_plan(
        payload,
        configured_effort=OPENAI_REASONING_EFFORT,
        configured_verbosity=OPENAI_VERBOSITY,
    )
    provider = get_ai_provider(
        mock_mode=AI_MOCK_MODE,
        model_name=OPENAI_MODEL,
        mock_text_builder=build_mock_text,
    )
    interaction = create_ai_interaction(
        payload.document_id,
        current_user["user_id"],
        payload.action,
        payload.selected_text,
        generation_plan.instructions,
        provider.model_name,
        tone=payload.options.tone,
        target_language=payload.options.target_language,
    )

    try:
        stream = provider.create_stream(payload, generation_plan)
    except HTTPException as exc:
        finalize_ai_interaction(
            payload.document_id,
            interaction["interaction_id"],
            response_text="",
            status="error",
            error_message=exc.detail,
        )
        raise
    except Exception as exc:
        finalize_ai_interaction(
            payload.document_id,
            interaction["interaction_id"],
            response_text="",
            status="error",
            error_message=str(exc),
        )
        raise HTTPException(status_code=502, detail=f"AI request failed: {exc}") from exc

    return StreamingResponse(
        stream_and_record_text(provider, stream, payload.document_id, interaction["interaction_id"]),
        media_type="text/plain",
        headers={
            "X-AI-Interaction-Id": interaction["interaction_id"],
        },
    )


@router.post("/rewrite")
def rewrite(payload: AIRewriteRequest, current_user=Depends(get_current_user)):
    return generate(
        AIGenerateRequest(
            document_id=payload.document_id,
            selected_text=payload.text,
            action="rewrite",
        ),
        current_user=current_user,
    )


@router.get("/documents/{document_id}/history", response_model=ListAIInteractionsResponse)
def list_document_ai_history(document_id: str, current_user=Depends(get_current_user)):
    require_document_access(document_id, current_user["user_id"])
    interactions = [
        serialize_ai_interaction(interaction)
        for interaction in reversed(list_ai_interactions(document_id))
    ]
    return ListAIInteractionsResponse(interactions=interactions)


@router.patch("/history/{interaction_id}", response_model=AIInteractionEntry)
def update_document_ai_history(
    interaction_id: str,
    payload: UpdateAIInteractionStatusRequest,
    current_user=Depends(get_current_user),
):
    require_ai_access(payload.document_id, current_user["user_id"])
    existing_interaction = next(
        (
            interaction
            for interaction in list_ai_interactions(payload.document_id)
            if interaction["interaction_id"] == interaction_id
        ),
        None,
    )
    if not existing_interaction:
        raise HTTPException(status_code=404, detail="AI interaction not found")

    if existing_interaction["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="You cannot update another user's AI interaction")

    interaction = update_ai_interaction_status(
        payload.document_id,
        interaction_id,
        status=payload.status,
        reviewed_text=payload.reviewed_text,
    )

    return serialize_ai_interaction(interaction)
