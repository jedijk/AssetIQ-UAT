import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  Download, 
  ExternalLink, 
  FileText, 
  Image as ImageIcon,
  File,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
} from "lucide-react";
import { Button } from "./ui/button";

/**
 * In-app Document Viewer with back button
 * Supports: PDF (iframe), Images (native), Others (download link)
 */
export const DocumentViewer = ({ 
  document, 
  onClose, 
  onBack,
  showBackButton = true 
}) => {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  
  if (!document) return null;

  const { name, url, type } = document;
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(type?.toLowerCase());
  const isPdf = type?.toLowerCase() === "pdf";
  const isPreviewable = isImage || isPdf;

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-900/95 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center gap-3">
            {showBackButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack || onClose}
                className="text-white hover:bg-slate-700"
                data-testid="doc-viewer-back"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </Button>
            )}
            <div className="flex items-center gap-2 text-white">
              {isImage ? (
                <ImageIcon className="w-5 h-5 text-blue-400" />
              ) : isPdf ? (
                <FileText className="w-5 h-5 text-red-400" />
              ) : (
                <File className="w-5 h-5 text-slate-400" />
              )}
              <span className="font-medium truncate max-w-[300px]">{name}</span>
              <span className="text-xs text-slate-400 uppercase">{type}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom controls for images */}
            {isImage && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomOut}
                  className="text-white hover:bg-slate-700"
                  disabled={zoom <= 50}
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-white text-sm w-12 text-center">{zoom}%</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomIn}
                  className="text-white hover:bg-slate-700"
                  disabled={zoom >= 200}
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRotate}
                  className="text-white hover:bg-slate-700"
                >
                  <RotateCw className="w-4 h-4" />
                </Button>
                <div className="w-px h-6 bg-slate-600 mx-2" />
              </>
            )}

            {/* Download button */}
            <a href={url} download={name} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="text-white hover:bg-slate-700">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </a>

            {/* Open in new tab */}
            <a href={url} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="text-white hover:bg-slate-700">
                <ExternalLink className="w-4 h-4 mr-2" />
                Open
              </Button>
            </a>

            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-slate-700"
              data-testid="doc-viewer-close"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
          {isImage && (
            <motion.img
              src={url}
              alt={name}
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transition: "transform 0.2s ease"
              }}
              draggable={false}
            />
          )}

          {isPdf && (
            <iframe
              src={`${url}#toolbar=1&navpanes=0`}
              title={name}
              className="w-full h-full rounded-lg shadow-2xl bg-white"
              style={{ minHeight: "80vh" }}
            />
          )}

          {!isPreviewable && (
            <div className="text-center p-8 bg-slate-800 rounded-xl max-w-md">
              <File className="w-16 h-16 text-slate-500 mx-auto mb-4" />
              <h3 className="text-white text-lg font-medium mb-2">{name}</h3>
              <p className="text-slate-400 text-sm mb-6">
                Preview not available for .{type} files
              </p>
              <div className="flex gap-3 justify-center">
                <a href={url} download={name}>
                  <Button className="bg-indigo-600 hover:bg-indigo-700">
                    <Download className="w-4 h-4 mr-2" />
                    Download File
                  </Button>
                </a>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="border-slate-600 text-white hover:bg-slate-700">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open in Browser
                  </Button>
                </a>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DocumentViewer;
