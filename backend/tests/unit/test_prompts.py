from app.models import AIGenerateRequest, AIOptions
from app.routes_ai import build_instructions, build_mock_text


def test_rewrite_instructions_include_tone_guidance_and_response_rules():
    """Verify rewrite prompts preserve the configured tone and the no-extra-commentary guardrails."""
    payload = AIGenerateRequest(
        selected_text="Original draft.",
        action="rewrite",
        options=AIOptions(tone="formal"),
    )

    instructions = build_instructions(payload)

    assert "formal tone" in instructions
    assert "Return only the transformed text" in instructions


def test_summarize_instructions_focus_on_compression():
    """Verify summarize prompts ask the model to compress content instead of simply rephrasing it."""
    payload = AIGenerateRequest(
        selected_text="Sentence one. Sentence two.",
        action="summarize",
        options=AIOptions(tone="concise"),
    )

    instructions = build_instructions(payload)

    assert "Summarize the user's text" in instructions
    assert "remove repetition" in instructions


def test_translate_instructions_include_the_target_language():
    """Verify translation prompts mention the requested language so provider swaps keep consistent behavior."""
    payload = AIGenerateRequest(
        selected_text="Hello world.",
        action="translate",
        options=AIOptions(tone="friendly", target_language="French"),
    )

    instructions = build_instructions(payload)

    assert "Translate the user's text into French" in instructions


def test_mock_rewrite_text_contains_both_context_and_rewritten_closing():
    """Verify the built-in mock generator returns deterministic rewrite content for test-time AI flows."""
    payload = AIGenerateRequest(
        selected_text="This draft needs better structure.",
        action="rewrite",
        options=AIOptions(tone="formal"),
    )

    mock_text = build_mock_text(payload)

    assert "This revised version presents the same ideas with a more polished tone." in mock_text
    assert "The revised draft keeps the original meaning while sounding more polished." in mock_text
