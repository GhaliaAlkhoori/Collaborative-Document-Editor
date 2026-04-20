from app.ai_prompts import build_instructions, build_generation_plan, prepare_input_text
from app.ai_provider import build_mock_text
from app.models import AIGenerateRequest, AIOptions


def test_rewrite_instructions_include_tone_guidance_and_response_rules():
    """Verify rewrite prompts preserve the configured tone and the no-extra-commentary guardrails."""
    payload = AIGenerateRequest(
        document_id="doc-123",
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
        document_id="doc-123",
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
        document_id="doc-123",
        selected_text="Hello world.",
        action="translate",
        options=AIOptions(tone="friendly", target_language="French"),
    )

    instructions = build_instructions(payload)

    assert "Translate the user's text into French" in instructions


def test_mock_rewrite_text_contains_both_context_and_rewritten_closing():
    """Verify the built-in mock generator returns deterministic rewrite content for test-time AI flows."""
    payload = AIGenerateRequest(
        document_id="doc-123",
        selected_text="This draft needs better structure.",
        action="rewrite",
        options=AIOptions(tone="formal"),
    )

    mock_text = build_mock_text(payload)

    assert "This revised version presents the same ideas with a more polished tone." in mock_text
    assert "The revised draft keeps the original meaning while sounding more polished." in mock_text


def test_long_inputs_are_chunked_and_excerpted_before_generation():
    """Verify large AI inputs are chunked by paragraph and reduced to a bounded excerpt instead of being sent blindly in full."""
    long_text = "\n\n".join([f"Paragraph {index} " + "word " * 180 for index in range(1, 7)])

    prepared = prepare_input_text(long_text, max_input_words=700, chunk_word_count=200)

    assert prepared.was_truncated is True
    assert prepared.total_chunks >= 4
    assert prepared.included_chunks < prepared.total_chunks
    assert "[... omitted middle sections from a longer document ...]" in prepared.text


def test_generation_plan_marks_excerpted_context_in_the_prompt():
    """Verify the generation plan adds excerpt-handling instructions when the selected text had to be truncated from a longer input."""
    long_text = "\n\n".join([f"Paragraph {index} " + "word " * 180 for index in range(1, 7)])
    payload = AIGenerateRequest(
        document_id="doc-123",
        selected_text=long_text,
        action="rewrite",
        options=AIOptions(tone="formal"),
    )

    plan = build_generation_plan(payload)

    assert plan.prepared_input.was_truncated is True
    assert "excerpt assembled from chunked sections of a longer document" in plan.instructions
