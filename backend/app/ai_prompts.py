from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.models import AIGenerateRequest

DEFAULT_SHARED_RULES = (
    "Return only the transformed text with no prefacing, labels, quotation marks, "
    "or extra commentary. Preserve important factual details and keep formatting natural. "
    "Do not introduce new facts. Avoid generic filler, empty intensifiers, repeated ideas, "
    "or broad concluding sentences that were not supported by the source text."
)

TONE_RULES = {
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

ACTION_TEMPLATES = {
    "rewrite": (
        "You are an expert writing assistant. Rewrite the user's text in a {tone} tone. "
        "Create a clearly rephrased version, not a near-copy with minor synonym swaps. "
        "Restructure sentences where helpful, vary sentence openings, and change diction enough "
        "that the rewrite feels noticeably different while preserving the same facts and intent. "
        "If the source is already polished, still produce a distinct rewrite with a stronger tone shift. "
        "Avoid line-by-line paraphrasing and avoid repeating the same descriptors or claims with only tiny wording changes. "
        "{tone_guidance} "
        "{context_notice} "
        "{shared_rules}"
    ),
    "summarize": (
        "You are an expert writing assistant. Summarize the user's text in a {tone} tone. "
        "Keep the summary concise, readable, and faithful to the source. Focus on the most "
        "important ideas only, and remove repetition instead of restating points. "
        "{tone_guidance} "
        "{context_notice} "
        "{shared_rules}"
    ),
    "translate": (
        "You are an expert translator and editor. Translate the user's text into {target_language}. "
        "Keep the output natural, accurate, and {tone} in tone when possible. Preserve meaning, "
        "details, and structure without padding the translation or adding explanatory phrases. "
        "{tone_guidance} "
        "{context_notice} "
        "{shared_rules}"
    ),
}


@dataclass(frozen=True)
class PreparedAIInput:
    text: str
    total_words: int
    included_words: int
    total_chunks: int
    included_chunks: int
    was_truncated: bool
    strategy: str


@dataclass(frozen=True)
class GenerationPlan:
    input_text: str
    instructions: str
    reasoning_effort: str
    text_options: dict
    max_output_tokens: int
    prepared_input: PreparedAIInput


def count_words(text: str) -> int:
    return len((text or "").split())


def chunk_text_by_paragraphs(text: str, target_word_count: int = 260) -> list[str]:
    paragraphs = [paragraph.strip() for paragraph in (text or "").split("\n\n") if paragraph.strip()]
    if not paragraphs:
        return [text.strip()] if text.strip() else [""]

    chunks = []
    current_lines = []
    current_words = 0

    for paragraph in paragraphs:
        paragraph_words = count_words(paragraph)
        if current_lines and current_words + paragraph_words > target_word_count:
            chunks.append("\n\n".join(current_lines))
            current_lines = [paragraph]
            current_words = paragraph_words
            continue

        current_lines.append(paragraph)
        current_words += paragraph_words

    if current_lines:
        chunks.append("\n\n".join(current_lines))

    return chunks


def prepare_input_text(
    text: str,
    *,
    max_input_words: int = 700,
    chunk_word_count: int = 260,
    keep_head_chunks: int = 2,
    keep_tail_chunks: int = 1,
) -> PreparedAIInput:
    normalized_text = (text or "").strip()
    total_words = count_words(normalized_text)

    if total_words <= max_input_words:
        chunks = chunk_text_by_paragraphs(normalized_text, chunk_word_count)
        return PreparedAIInput(
            text=normalized_text,
            total_words=total_words,
            included_words=total_words,
            total_chunks=len(chunks),
            included_chunks=len(chunks),
            was_truncated=False,
            strategy="full_text",
        )

    chunks = chunk_text_by_paragraphs(normalized_text, chunk_word_count)
    if len(chunks) <= keep_head_chunks + keep_tail_chunks:
        excerpt_text = normalized_text
        included_chunks = len(chunks)
        strategy = "full_chunk_window"
    else:
        excerpt_chunks = chunks[:keep_head_chunks] + chunks[-keep_tail_chunks:]
        excerpt_text = "\n\n[... omitted middle sections from a longer document ...]\n\n".join(
            excerpt_chunks
        )
        included_chunks = len(excerpt_chunks)
        strategy = "head_tail_chunk_excerpt"

    included_words = count_words(excerpt_text)
    return PreparedAIInput(
        text=excerpt_text,
        total_words=total_words,
        included_words=included_words,
        total_chunks=len(chunks),
        included_chunks=included_chunks,
        was_truncated=True,
        strategy=strategy,
    )


def build_instructions(
    payload: AIGenerateRequest,
    prepared_input: Optional[PreparedAIInput] = None,
) -> str:
    tone = (payload.options.tone or "clear").strip()
    tone_guidance = TONE_RULES.get(
        tone.lower(),
        f"Adopt a clearly {tone} tone in the wording, rhythm, and sentence style.",
    )
    target_language = (payload.options.target_language or "Arabic").strip()
    context_notice = ""

    if prepared_input and prepared_input.was_truncated:
        context_notice = (
            "The source text may be an excerpt assembled from chunked sections of a longer document. "
            "Keep the output grounded in the provided text only, preserve continuity, and do not mention omitted content."
        )

    template = ACTION_TEMPLATES[payload.action]
    return template.format(
        tone=tone,
        tone_guidance=tone_guidance,
        target_language=target_language,
        context_notice=context_notice,
        shared_rules=DEFAULT_SHARED_RULES,
    ).strip()


def get_reasoning_effort(payload: AIGenerateRequest, configured_effort: str = "low") -> str:
    if payload.action == "rewrite" and configured_effort == "low":
        return "medium"
    return configured_effort


def get_text_options(payload: AIGenerateRequest, configured_verbosity: str = "low") -> dict:
    if payload.action == "summarize":
        return {"verbosity": "low"}
    return {"verbosity": configured_verbosity}


def get_max_output_tokens(
    payload: AIGenerateRequest,
    input_word_count: Optional[int] = None,
) -> int:
    word_count = max(1, input_word_count or count_words(payload.selected_text))

    if payload.action == "summarize":
        return min(320, max(80, int(word_count * 0.8)))

    if payload.action == "translate":
        return min(1000, max(120, int(word_count * 2.1)))

    return min(1000, max(120, int(word_count * 2.0)))


def build_generation_plan(
    payload: AIGenerateRequest,
    *,
    configured_effort: str = "low",
    configured_verbosity: str = "low",
) -> GenerationPlan:
    prepared_input = prepare_input_text(payload.selected_text)
    return GenerationPlan(
        input_text=prepared_input.text,
        instructions=build_instructions(payload, prepared_input),
        reasoning_effort=get_reasoning_effort(payload, configured_effort),
        text_options=get_text_options(payload, configured_verbosity),
        max_output_tokens=get_max_output_tokens(payload, prepared_input.included_words),
        prepared_input=prepared_input,
    )
