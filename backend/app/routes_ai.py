
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - handled at runtime when AI is invoked
    OpenAI = None

from app.auth import get_current_user
from app.models import AIGenerateRequest, AIRewriteRequest
from app.storage import DOCUMENTS_BY_ID, DOCUMENT_PERMISSIONS

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


def get_openai_client() -> OpenAI:
    if AI_MOCK_MODE:
        return None

    if OpenAI is None:
        raise HTTPException(
            status_code=503,
            detail="AI dependencies are not installed yet. Run pip install -r backend/requirements.txt and restart the backend.",
        )

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI is not configured yet. Add OPENAI_API_KEY to backend/.env and restart the backend.",
        )

    return OpenAI(api_key=api_key)


def build_instructions(payload: AIGenerateRequest) -> str:
    tone = (payload.options.tone or "clear").strip()
    action = payload.action

    shared_rules = (
        "Return only the transformed text with no prefacing, labels, quotation marks, "
        "or extra commentary. Preserve important factual details and keep formatting natural. "
        "Do not introduce new facts. Avoid generic filler, empty intensifiers, repeated ideas, "
        "or broad concluding sentences that were not supported by the source text."
    )

    tone_rules = {
        "formal": (
            "Use polished, professional, precise wording and smooth transitions. "
            "Sound composed and authoritative rather than casual."
        ),
        "friendly": (
            "Use warm, natural, approachable language that sounds human and engaging. "
            "Keep it lively and readable without becoming slangy."
        ),
        "concise": (
            "Compress the content meaningfully by removing redundancy, tightening phrasing, "
            "and reducing length by roughly 20 to 35 percent when possible."
        ),
    }
    tone_guidance = tone_rules.get(
        tone.lower(),
        f"Adopt a clearly {tone} tone in the wording, rhythm, and sentence style.",
    )

    if action == "rewrite":
        return (
            f"You are an expert writing assistant. Rewrite the user's text in a {tone} tone. "
            "Create a clearly rephrased version, not a near-copy with minor synonym swaps. "
            "Restructure sentences where helpful, vary sentence openings, and change diction enough "
            "that the rewrite feels noticeably different while preserving the same facts and intent. "
            "If the source is already polished, still produce a distinct rewrite with a stronger tone shift. "
            "Avoid line-by-line paraphrasing and avoid repeating the same descriptors or claims with only tiny wording changes. "
            f"{tone_guidance} "
            f"{shared_rules}"
        )

    if action == "summarize":
        return (
            f"You are an expert writing assistant. Summarize the user's text in a {tone} tone. "
            "Keep the summary concise, readable, and faithful to the source. Focus on the most "
            "important ideas only, and remove repetition instead of restating points. "
            f"{tone_guidance} "
            f"{shared_rules}"
        )

    target_language = (payload.options.target_language or "Arabic").strip()
    return (
        f"You are an expert translator and editor. Translate the user's text into {target_language}. "
        f"Keep the output natural, accurate, and {tone} in tone when possible. Preserve meaning, "
        "details, and structure without padding the translation or adding explanatory phrases. "
        f"{tone_guidance} "
        f"{shared_rules}"
    )


def get_reasoning_effort(payload: AIGenerateRequest) -> str:
    configured = OPENAI_REASONING_EFFORT
    if payload.action == "rewrite" and configured == "low":
        return "medium"
    return configured


def get_text_options(payload: AIGenerateRequest) -> dict:
    if payload.action == "summarize":
        return {"verbosity": "low"}
    return {"verbosity": OPENAI_VERBOSITY}


def get_max_output_tokens(payload: AIGenerateRequest) -> int:
    word_count = max(1, len(payload.selected_text.split()))

    if payload.action == "summarize":
        return min(280, max(80, int(word_count * 0.8)))

    if payload.action == "translate":
        return min(900, max(120, int(word_count * 2.1)))

    return min(900, max(120, int(word_count * 2.0)))


def create_generation_stream(client: OpenAI, payload: AIGenerateRequest):
    if AI_MOCK_MODE or client is None:
        return create_mock_generation_stream(payload)

    return client.responses.create(
        model=OPENAI_MODEL,
        reasoning={"effort": get_reasoning_effort(payload)},
        instructions=build_instructions(payload),
        input=payload.selected_text,
        text=get_text_options(payload),
        max_output_tokens=get_max_output_tokens(payload),
        stream=True,
    )


def build_mock_text(payload: AIGenerateRequest) -> str:
    source = payload.selected_text.strip()
    tone = (payload.options.tone or "clear").strip().lower()

    if payload.action == "summarize":
        sentences = [segment.strip() for segment in source.replace("\n", " ").split(".") if segment.strip()]
        summary = ". ".join(sentences[:2]).strip()
        return summary if summary.endswith(".") else f"{summary}."

    if payload.action == "translate":
        language = (payload.options.target_language or "Arabic").strip()
        return f"[{language} translation preview] {source}"

    lead_in = {
        "formal": "This revised version presents the same ideas with a more polished tone.",
        "friendly": "Here is a warmer, more conversational rewrite of the same idea.",
        "concise": "Here is a tighter version that keeps the key meaning intact.",
    }.get(tone, "Here is a rewritten version of the text.")

    closing = "The revised draft keeps the original meaning while sounding more polished."
    return f"{lead_in}\n\n{source}\n\n{closing}"


def create_mock_generation_stream(payload: AIGenerateRequest):
    text = build_mock_text(payload)
    chunk_size = 24
    for index in range(0, len(text), chunk_size):
        yield text[index:index + chunk_size]


def stream_generated_text(stream):
    if AI_MOCK_MODE:
        yield from stream
        return

    for event in stream:
        if getattr(event, "type", "") == "response.output_text.delta":
            delta = getattr(event, "delta", "")
            if delta:
                yield delta


@router.post("/generate")
def generate(payload: AIGenerateRequest, current_user=Depends(get_current_user)):
    require_ai_access(payload.document_id, current_user["user_id"])
    client = get_openai_client()
    try:
        stream = create_generation_stream(client, payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI request failed: {exc}") from exc

    return StreamingResponse(
        stream_generated_text(stream),
        media_type="text/plain",
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
