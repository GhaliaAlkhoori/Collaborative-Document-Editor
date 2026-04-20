from __future__ import annotations

import os
from typing import Protocol

from fastapi import HTTPException

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - handled at runtime when AI is invoked
    OpenAI = None

from app.ai_prompts import GenerationPlan
from app.models import AIGenerateRequest


class AIProvider(Protocol):
    model_name: str

    def create_stream(self, payload: AIGenerateRequest, plan: GenerationPlan):
        """Create a streaming provider response for the prepared AI generation plan."""

    def iter_text(self, stream):
        """Yield provider text deltas from the underlying stream object."""


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


class MockAIProvider:
    def __init__(self, mock_text_builder=build_mock_text):
        self.model_name = "mock-ai-provider"
        self._mock_text_builder = mock_text_builder

    def create_stream(self, payload: AIGenerateRequest, _plan: GenerationPlan):
        text = self._mock_text_builder(payload)
        chunk_size = 24
        for index in range(0, len(text), chunk_size):
            yield text[index:index + chunk_size]

    def iter_text(self, stream):
        yield from stream


class OpenAIResponsesProvider:
    def __init__(self, *, model_name: str):
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

        self.model_name = model_name
        self.client = OpenAI(api_key=api_key)

    def create_stream(self, _payload: AIGenerateRequest, plan: GenerationPlan):
        return self.client.responses.create(
            model=self.model_name,
            reasoning={"effort": plan.reasoning_effort},
            instructions=plan.instructions,
            input=plan.input_text,
            text=plan.text_options,
            max_output_tokens=plan.max_output_tokens,
            stream=True,
        )

    def iter_text(self, stream):
        for event in stream:
            if getattr(event, "type", "") == "response.output_text.delta":
                delta = getattr(event, "delta", "")
                if delta:
                    yield delta


def get_ai_provider(*, mock_mode: bool, model_name: str, mock_text_builder=build_mock_text) -> AIProvider:
    if mock_mode:
        return MockAIProvider(mock_text_builder=mock_text_builder)

    return OpenAIResponsesProvider(model_name=model_name)
