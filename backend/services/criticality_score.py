"""Shared criticality score calculation (aligned with observation / threat UI)."""


def compute_criticality_score(
    safety: int = 0,
    production: int = 0,
    environmental: int = 0,
    reputation: int = 0,
) -> int:
    """
    Normalized 0–100 score from four 1–5 dimension ratings.
    Same formula as observation page: weighted sum / 3.5.
    """
    raw = (safety * 25) + (production * 20) + (environmental * 15) + (reputation * 10)
    return min(100, round(raw / 3.5))
