import React, { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { authFetch, getApiUrl } from "../../lib/apiConfig";
import { formatApiErrorDetail } from "../../lib/apiErrors";

const STATUS_LABELS = {
  initiated: { label: "Ready to upload", variant: "secondary" },
  uploading: { label: "Uploading…", variant: "secondary" },
  uploaded: { label: "Uploaded", variant: "secondary" },
  pending_scan: { label: "Security scan pending…", variant: "secondary" },
  scanning: { label: "Scanning file…", variant: "secondary" },
  processing: { label: "Processing…", variant: "secondary" },
  available: { label: "Available", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  quarantined: { label: "Quarantined", variant: "destructive" },
  deleted: { label: "Deleted", variant: "outline" },
};

const TERMINAL_STATUSES = new Set(["available", "rejected", "quarantined", "deleted"]);

function userFriendlyRejection(record) {
  if (record?.user_message) return record.user_message;
  const reason = record?.rejection_reason;
  if (!reason) {
    return "This file could not be accepted because it failed security validation.";
  }
  const lower = reason.toLowerCase();
  if (lower.includes("extension") || lower.includes("not allowed") || lower.includes("not supported")) {
    return "This file type is not allowed. Please upload a supported document or image format.";
  }
  if (lower.includes("size") || lower.includes("mb")) {
    return "This file is too large. Please choose a smaller file.";
  }
  if (lower.includes("does not match") || lower.includes("spoof")) {
    return "The file content does not match its extension. Please verify the file and try again.";
  }
  return reason;
}

/**
 * Secure file uploader — Phase 1 pipeline.
 *
 * @param {object} props
 * @param {string} props.linkedEntityType - observation | investigation | equipment | …
 * @param {string} [props.linkedEntityId] - required for most entity types
 * @param {function} [props.onUploadComplete] - called with file record when status=available
 * @param {function} [props.onError] - called on failure
 * @param {string} [props.accept] - input accept attribute
 * @param {boolean} [props.disabled]
 * @param {string} [props.className]
 */
export function SecureFileUploader({
  linkedEntityType,
  linkedEntityId,
  onUploadComplete,
  onError,
  accept,
  disabled = false,
  className = "",
}) {
  const [status, setStatus] = useState(null);
  const [fileRecord, setFileRecord] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const pollCountRef = useRef(0);
  const pollTimerRef = useRef(null);

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const pollStatus = useCallback(
    async (fileId) => {
      try {
        const res = await authFetch(`${getApiUrl()}/files/${fileId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(formatApiErrorDetail(body.detail, "Failed to check upload status"));
        }
        const data = await res.json();
        setFileRecord(data);
        setStatus(data.status);

        if (data.status === "available") {
          clearPoll();
          setBusy(false);
          onUploadComplete?.(data);
          return;
        }
        if (TERMINAL_STATUSES.has(data.status) && data.status !== "available") {
          clearPoll();
          setBusy(false);
          const msg = userFriendlyRejection(data);
          setError(msg);
          onError?.(msg, data);
          return;
        }

        pollCountRef.current += 1;
        const delay = pollCountRef.current <= 5 ? 2000 : 10000;
        pollTimerRef.current = setTimeout(() => pollStatus(fileId), delay);
      } catch (err) {
        clearPoll();
        setBusy(false);
        const msg = err.message || "Upload status check failed";
        setError(msg);
        onError?.(msg);
      }
    },
    [clearPoll, onUploadComplete, onError],
  );

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled) return;

    setError(null);
    setBusy(true);
    setStatus("uploading");
    pollCountRef.current = 0;

    try {
      const initiateRes = await authFetch(`${getApiUrl()}/files/initiate-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || undefined,
          size_bytes: file.size,
          linked_entity_type: linkedEntityType,
          linked_entity_id: linkedEntityId || undefined,
        }),
      });

      if (!initiateRes.ok) {
        const body = await initiateRes.json().catch(() => ({}));
        throw new Error(formatApiErrorDetail(body.detail, "Could not start upload"));
      }

      const initiate = await initiateRes.json();
      const uploadId = initiate.upload_id;

      if (initiate.upload_method === "presigned_put" && initiate.presigned_upload_url) {
        const putRes = await fetch(initiate.presigned_upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error("Direct storage upload failed");
        }
      } else {
        const uploadRes = await authFetch(`${getApiUrl()}/files/${uploadId}/upload`, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!uploadRes.ok) {
          const body = await uploadRes.json().catch(() => ({}));
          throw new Error(formatApiErrorDetail(body.detail, "Upload failed"));
        }
      }

      const completeRes = await authFetch(`${getApiUrl()}/files/${uploadId}/complete`, {
        method: "POST",
      });
      if (!completeRes.ok) {
        const body = await completeRes.json().catch(() => ({}));
        throw new Error(formatApiErrorDetail(body.detail, "Could not finalize upload"));
      }

      const complete = await completeRes.json();
      setStatus(complete.status);
      pollStatus(uploadId);
    } catch (err) {
      setBusy(false);
      setStatus("rejected");
      const msg = err.message || "Upload failed";
      setError(msg);
      onError?.(msg);
    }
  };

  const badge = status ? STATUS_LABELS[status] || { label: status, variant: "outline" } : null;

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={disabled || busy} asChild>
          <label className="cursor-pointer">
            {busy ? "Uploading…" : "Choose file"}
            <input
              type="file"
              className="sr-only"
              accept={accept}
              disabled={disabled || busy}
              onChange={handleFileChange}
            />
          </label>
        </Button>
        {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
      </div>

      {fileRecord?.original_filename && (
        <p className="text-sm text-muted-foreground">{fileRecord.original_filename}</p>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {status === "available" && fileRecord?.sanitized && (
        <p className="text-xs text-muted-foreground">
          File was sanitized during upload (metadata stripped or formulas neutralized).
        </p>
      )}

      {status === "scanning" && (
        <p className="text-xs text-muted-foreground">
          Your file is being validated. This usually takes a few seconds.
        </p>
      )}
    </div>
  );
}

export default SecureFileUploader;
