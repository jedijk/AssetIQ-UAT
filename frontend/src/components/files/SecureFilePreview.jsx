import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getPreviewUrl } from "../../lib/apis/files";

/**
 * Controlled preview for images and PDF first-page thumbnails.
 * PDF previews are rendered in a sandboxed iframe (preview is always PNG).
 */
export function SecureFilePreview({ fileId, open, onClose, filename }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !fileId) {
      setPreviewUrl(null);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getPreviewUrl(fileId)
      .then((data) => {
        if (!cancelled) setPreviewUrl(data.preview_url);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.detail || err.message || "Preview unavailable");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, fileId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={filename ? `Preview: ${filename}` : "File preview"}
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-3xl overflow-hidden rounded-lg border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <p className="truncate text-sm font-medium">{filename || "Preview"}</p>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="flex min-h-[200px] items-center justify-center p-4">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading preview…
            </div>
          )}
          {!loading && error && (
            <p className="text-sm text-destructive" role="alert">
              {typeof error === "string" ? error : "Preview unavailable"}
            </p>
          )}
          {!loading && previewUrl && (
            <img
              src={previewUrl}
              alt={filename ? `Preview of ${filename}` : "File preview"}
              className="max-h-[70vh] max-w-full object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default SecureFilePreview;
