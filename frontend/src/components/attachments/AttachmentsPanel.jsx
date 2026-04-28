import { useMemo, useRef, useState } from "react";
import { Paperclip, Upload, X, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import DocumentViewer from "../DocumentViewer";

const DEFAULT_ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";

function getExtFromName(name = "") {
  const parts = String(name).split(".");
  if (parts.length < 2) return "";
  return parts.pop().toLowerCase();
}

function isLikelyImage(item) {
  const ct = (item?.contentType || item?.mime || item?.type || "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  const ext = (item?.ext || getExtFromName(item?.name || item?.filename || "") || "").toLowerCase();
  return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
}

export default function AttachmentsPanel({
  title = "Attachments",
  items = [],
  editable = false,
  accept = DEFAULT_ACCEPT,
  isUploading = false,
  onAddFiles,
  onRemove,
  getKey,
  getName,
  getUrl,
  getContentType,
}) {
  const inputRef = useRef(null);
  const [viewerDoc, setViewerDoc] = useState(null);

  const normalized = useMemo(() => {
    const arr = Array.isArray(items) ? items : [];
    return arr.map((it, idx) => {
      const id = (getKey ? getKey(it) : it?.id) ?? idx;
      const name = (getName ? getName(it) : it?.name || it?.filename) || "Attachment";
      const url = (getUrl ? getUrl(it) : it?.url || it?.data) || null;
      const contentType = (getContentType ? getContentType(it) : it?.content_type || it?.contentType || it?.mime || it?.type) || "";
      const ext = it?.ext || getExtFromName(name);
      return { raw: it, id, name, url, contentType, ext };
    });
  }, [items, getKey, getName, getUrl, getContentType]);

  const openItem = (it) => {
    if (!it?.url) return;
    setViewerDoc({ name: it.name, url: it.url, type: it.ext || "bin" });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Paperclip className="w-5 h-5 text-slate-500" />
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {normalized.length}
          </span>
        </div>

        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={accept}
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                try {
                  await onAddFiles?.(files);
                } finally {
                  e.target.value = "";
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span className="hidden sm:inline">Add Files</span>
            </Button>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
        {normalized.map((it) => {
          const image = isLikelyImage(it);
          return (
            <div
              key={String(it.id)}
              className="relative group cursor-pointer rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 transition-colors"
              onClick={() => openItem(it)}
            >
              {image && it.url ? (
                <img
                  src={it.url}
                  alt={it.name}
                  className="w-full h-20 sm:h-24 md:h-32 object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-20 sm:h-24 md:h-32 bg-slate-50 flex flex-col items-center justify-center gap-1 px-2">
                  {image ? (
                    <ImageIcon className="w-7 h-7 text-slate-300" />
                  ) : (
                    <FileText className="w-7 h-7 text-slate-300" />
                  )}
                  <div className="text-[10px] text-slate-500 text-center line-clamp-2">
                    {it.name}
                  </div>
                </div>
              )}

              {editable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove?.(it.raw, it.id);
                  }}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        {editable && normalized.length === 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="col-span-2 sm:col-span-3 md:col-span-4 w-full border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors py-8"
          >
            {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
            <span className="text-xs">Add files (images, PDFs, docs)</span>
          </button>
        )}
      </div>

      {viewerDoc && (
        <DocumentViewer
          document={viewerDoc}
          onClose={() => setViewerDoc(null)}
          onBack={() => setViewerDoc(null)}
          showBackButton={true}
        />
      )}
    </>
  );
}

