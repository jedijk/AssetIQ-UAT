"""Unit tests for Visual Management board tokens."""
from services.visual_board_token import (
    generate_board_token,
    generate_token,
    hash_board_token,
    hash_token,
    validate_token_format,
)


def test_generate_board_token_format():
    raw = generate_board_token()
    assert raw.startswith("vmb_")
    assert validate_token_format(raw)


def test_hash_token_deterministic():
    raw = "vmb_" + "a" * 64
    assert hash_board_token(raw) == hash_token(raw)


def test_generate_token_returns_hashable_pair():
    raw, token_hash = generate_token()
    assert validate_token_format(raw)
    assert token_hash == hash_board_token(raw)


def test_validate_token_format_rejects_bad_tokens():
    assert not validate_token_format("")
    assert not validate_token_format("vmb_short")
    assert not validate_token_format("not_a_vmb_token")
