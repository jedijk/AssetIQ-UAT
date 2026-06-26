"""Image compression helpers for chat attachments."""
import base64
import io
import logging

logger = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 100_000  # ~100KB base64 target


def fix_orientation(img):
    """Apply EXIF orientation so the image displays correctly after stripping metadata."""
    try:
        from PIL import ImageOps
        return ImageOps.exif_transpose(img)
    except Exception:
        return img


def compress_image(b64_data: str) -> str:
    """Fix orientation and optionally compress a base64 image for chat storage."""
    try:
        from PIL import Image
        raw = base64.b64decode(b64_data)
        img = Image.open(io.BytesIO(raw))
        img = fix_orientation(img)

        needs_compress = len(b64_data) > MAX_IMAGE_BYTES or max(img.size) > 800

        if not needs_compress:
            buf = io.BytesIO()
            rgb = img.convert("RGB") if img.mode != "RGB" else img
            rgb.save(buf, format="JPEG", quality=85, optimize=True)
            return base64.b64encode(buf.getvalue()).decode("utf-8")

        if max(img.size) > 800:
            img.thumbnail((800, 800), Image.LANCZOS)
        buf = io.BytesIO()
        rgb = img.convert("RGB") if img.mode != "RGB" else img
        quality = 70
        rgb.save(buf, format="JPEG", quality=quality, optimize=True)
        while buf.tell() > MAX_IMAGE_BYTES * 0.75 and quality > 20:
            quality -= 15
            buf = io.BytesIO()
            rgb.save(buf, format="JPEG", quality=quality, optimize=True)
        result = base64.b64encode(buf.getvalue()).decode("utf-8")
        logger.info(f"Image processed: {len(b64_data)//1024}KB -> {len(result)//1024}KB (q={quality})")
        return result
    except Exception as e:
        logger.warning(f"Image processing failed: {e}")
        return b64_data
