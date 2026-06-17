"""QR code generation for Visual Management Board display URLs."""
from __future__ import annotations

import base64
import io
from typing import Optional

import qrcode


def generate_qr_data_url(url: str, *, base_url: Optional[str] = None) -> str:
    """Return a PNG data URL for the full display URL."""
    full_url = url
    if base_url and url.startswith("/"):
        full_url = f"{base_url.rstrip('/')}{url}"
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(full_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"
