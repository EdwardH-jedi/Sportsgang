"""
V1 deterministic content-moderation safety layer.

Used by chat/message send and event/battle title+description to block the
worst categories of user-generated text (sexual, profanity, harassment,
threat, scam, fraud, spam) before persistence and before any downstream
notification.

This is intentionally *not* an AI moderator. It is a small wordlist +
phrase matcher with word-boundary protection so common sport/venue terms
("hit the gym", "Annandale", "pass class") are not falsely flagged. The
detection is deliberately conservative — better to miss a borderline
case than to silence a legitimate user. A future stream can replace or
augment this with server-side AI moderation; the public interface
(:func:`ensure_text_allowed`, :func:`moderate_text`) is the contract
callers code against.

Safety properties
-----------------
* **Whole-word matching.** All patterns use ``\\b...\\b`` so substrings
  inside legitimate words ("ass" in "Annandale", "class", "pass") never
  trigger. Multi-word phrases use ``\\s+`` between tokens.
* **No raw-text logging.** The matched fragment is recorded in the
  :class:`ModerationResult` for unit-test surface only — it is never
  returned to the API caller, and callers MUST NOT log it. The public
  error message is a generic "rephrase it" string.
* **English only in V1.** Korean/CJK word-boundary semantics differ
  from ASCII ``\\b`` and require a tokenizer; flagged as a follow-up
  in the docstring of the chat/event integration sites.
* **No URL/regex banning.** Booking URLs (``https://...``) are shared
  routinely; banning the ``http`` substring would false-positive every
  venue with a ``booking_url``. The scam bucket targets money-transfer
  *phrases*, not URLs.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from fastapi import HTTPException, status

# ---------------------------------------------------------------------------
# Wordlists (private — keep small + conservative; do not enumerate variants)
# ---------------------------------------------------------------------------
#
# Each entry is a regex token. ``\b`` boundaries are added at match time.
# Multi-token phrases use ``\s+`` so "kill   you" still matches "kill you".
# Sentinel fixtures (``BANNED_*_FIXTURE``) exist so tests and ops can
# verify each category fires without enumerating real slurs in source.

_PROFANITY: tuple[str, ...] = (
    "banned\s+profanity\s+fixture",
    "fuck",
    "shit",
    "asshole",
    "bastard",
    "bitch",
)

_SEXUAL: tuple[str, ...] = (
    "banned\s+sexual\s+fixture",
    "porn",
    "nude",
    "horny",
)

_HARASSMENT: tuple[str, ...] = (
    "banned\s+harassment\s+fixture",
    # Common mild-harassment shorthand. Real bullying needs a richer
    # signal than wordlists; this is the floor, not the ceiling.
    #
    # Standalone "loser" is intentionally NOT in this list — it appears
    # constantly in benign sports talk ("loser buys coffee", "winner
    # stays on, loser rotates off"). Phrase-level harassment patterns
    # below cover the directly-abusive use.
    "kys",
    r"you\s+are\s+a\s+loser",
    r"you\s+re\s+a\s+loser",
    r"such\s+a\s+loser",
)

_THREAT: tuple[str, ...] = (
    "banned\s+threat\s+fixture",
    # Multi-word phrases only — bare "kill" / "die" generate constant
    # false positives on phrases like "killing it at the gym".
    r"kill yourself",
    r"i\s+will\s+kill\s+you",
    r"i\s+ll\s+kill\s+you",
    r"going\s+to\s+kill\s+you",
)

_SCAM: tuple[str, ...] = (
    "banned\s+scam\s+fixture",
    r"send\s+me\s+bitcoin",
    r"wire\s+transfer",
    r"claim\s+your\s+prize",
)

_FRAUD: tuple[str, ...] = (
    "banned\s+fraud\s+fixture",
    r"western\s+union",
    r"gift\s+card",
    r"send\s+money\s+to",
)

_SPAM: tuple[str, ...] = (
    "banned\s+spam\s+fixture",
    r"click\s+here\s+to\s+claim",
    r"free\s+trial\s+today",
)


_CATEGORIES: dict[str, tuple[str, ...]] = {
    "profanity": _PROFANITY,
    "sexual": _SEXUAL,
    "harassment": _HARASSMENT,
    "threat": _THREAT,
    "scam": _SCAM,
    "fraud": _FRAUD,
    "spam": _SPAM,
}


def _compile(entries: tuple[str, ...]) -> re.Pattern[str]:
    # Word-boundary wrap. Entries that already contain ``\s+`` are
    # multi-token phrases; ``\b`` still anchors them at start/end.
    joined = "|".join(entries)
    return re.compile(rf"\b(?:{joined})\b", re.IGNORECASE)


_COMPILED: dict[str, re.Pattern[str]] = {cat: _compile(entries) for cat, entries in _CATEGORIES.items()}


# Generic copy shown to clients. Do NOT include the matched fragment or
# the firing category in this string — see "Safety properties" above.
SAFE_USER_MESSAGE = "This message may violate our community guidelines. Please rephrase it."


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ModerationResult:
    allowed: bool
    categories: list[str] = field(default_factory=list)
    # Internal reason for unit-test/log surface ONLY. Never returned to
    # the API caller. May contain a normalized matched fragment.
    reason: str | None = None
    # The public, user-safe message. Callers should pass this through
    # to clients verbatim.
    safe_user_message: str = SAFE_USER_MESSAGE


def _normalize(text: str) -> str:
    # Lowercase, replace common punctuation with whitespace so
    # "send,money to" still matches "send money to", and collapse
    # runs of whitespace to a single space. We do not strip Unicode
    # combining marks (V1) — a future stream can add NFKC.
    lowered = text.lower()
    spaced = re.sub(r"[._,;:!?\"'`/\\-]+", " ", lowered)
    return re.sub(r"\s+", " ", spaced).strip()


def moderate_text(text: str, context: str | None = None) -> ModerationResult:
    """
    Inspect ``text`` against every category and return the result.

    ``context`` is a free-form label (e.g. ``"chat"``, ``"event-title"``)
    used only for internal logging by callers if they so choose; this
    function never logs.
    """
    if not text:
        return ModerationResult(allowed=True)

    normalized = _normalize(text)
    fired: list[str] = []
    first_match: str | None = None
    for cat, pattern in _COMPILED.items():
        m = pattern.search(normalized)
        if m is not None:
            fired.append(cat)
            if first_match is None:
                first_match = m.group(0)

    if not fired:
        return ModerationResult(allowed=True)

    return ModerationResult(
        allowed=False,
        categories=fired,
        reason=(f"context={context or '-'} categories={','.join(fired)} matched={first_match!r}"),
    )


def ensure_text_allowed(text: str, context: str | None = None) -> None:
    """
    Raise ``HTTPException(422)`` with the safe user message when ``text``
    is disallowed. No-op when ``text`` is allowed (or empty). Callers
    should invoke this BEFORE any DB write and BEFORE any side effect
    (notification, broadcast).
    """
    result = moderate_text(text, context=context)
    if result.allowed:
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=result.safe_user_message,
    )
