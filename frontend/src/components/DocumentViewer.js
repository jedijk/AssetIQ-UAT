import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "./ui/button";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

// Get the API base URL for document proxying
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || window.location.origin;

/**
 * Mobile-friendly PDF viewer using canvas rendering
 * Uses pdfjs-dist directly for reliable rendering
 * Supports page navigation, zoom, and scrolling
 */
const MobilePdfViewer = ({ blobUrl, isMobile }) => {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState(null);
  const [zoom, setZoom] = useState(100);
  const canvasRef = React.useRef(null);
  const renderTaskRef = React.useRef(null);
  const containerRef = React.useRef(null);
  
  // Load PDF document
  useEffect(() => {
    if (!blobUrl) return;
    
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    
    const loadPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(blobUrl);
        const doc = await loadingTask.promise;
        if (!cancelled) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setPageNumber(1);
          setZoom(100);
        }
      } catch (err) {
        console.error("PDF loading error:", err);
        if (!cancelled) {
          setPdfError("Failed to load PDF");
        }
      } finally {
        if (!cancelled) {
          setPdfLoading(false);
        }
      }
    };
    
    loadPdf();
    
    return () => {
      cancelled = true;
    };
  }, [blobUrl]);
  
  // Render current page with zoom
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    
    const renderPage = async () => {
      // Cancel any ongoing render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        
        // Calculate scale based on zoom level
        const baseWidth = isMobile ? 350 : 700;
        const viewport = page.getViewport({ scale: 1 });
        const baseScale = baseWidth / viewport.width;
        const scale = baseScale * (zoom / 100);
        const scaledViewport = page.getViewport({ scale });
        
        // Set canvas dimensions
        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;
        
        // Render the page
        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport,
        };
        
        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;
      } catch (err) {
        if (err.name !== "RenderingCancelledException") {
          console.error("Page render error:", err);
        }
      }
    };
    
    renderPage();
    
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, pageNumber, isMobile, zoom]);
  
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleZoomReset = () => setZoom(100);
  
  if (pdfLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
        <p className="text-slate-500 mt-2">Loading PDF...</p>
      </div>
    );
  }
  
  if (pdfError) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-8 h-8 mx-auto text-red-400" />
        <p className="text-slate-500 mt-2">{pdfError}</p>
      </div>
    );
  }
  
  return (
    <div className="w-full h-full flex flex-col items-center">
      {/* PDF Controls - Page Navigation + Zoom */}
      <div className="flex items-center gap-2 mb-4 bg-slate-700 rounded-lg px-3 py-2 flex-wrap justify-center">
        {/* Page Navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPageNumber(prev => Math.max(1, prev - 1))}
            disabled={pageNumber <= 1}
            className="text-white hover:bg-slate-600 h-8 w-8"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="text-white text-sm min-w-[80px] text-center">
            {pageNumber} / {numPages || '?'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPageNumber(prev => Math.min(numPages || prev, prev + 1))}
            disabled={pageNumber >= (numPages || 1)}
            className="text-white hover:bg-slate-600 h-8 w-8"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
        
        {/* Divider */}
        <div className="w-px h-6 bg-slate-500 mx-1" />
        
        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            className="text-white hover:bg-slate-600 h-8 w-8"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <button
            onClick={handleZoomReset}
            className="text-white text-xs min-w-[45px] text-center hover:bg-slate-600 px-1 py-1 rounded"
          >
            {zoom}%
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            disabled={zoom >= 200}
            className="text-white hover:bg-slate-600 h-8 w-8"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* PDF Canvas - Scrollable container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto bg-white rounded-lg shadow-2xl w-full"
        style={{ 
          maxHeight: 'calc(100vh - 200px)',
          touchAction: 'pan-x pan-y pinch-zoom'
        }}
      >
        <div className="p-4 min-w-fit">
          <canvas ref={canvasRef} className="block mx-auto" />
        </div>
      </div>
    </div>
  );
};

/**
 * In-app Document Viewer with back button
 * Supports: PDF (iframe), Images (native), DOCX (mammoth), XLS/XLSX (sheetjs), Others (download link)
 */
export const DocumentViewer = ({ 
  document, 
  onClose, 
  onBack,
  showBackButton = true 
}) => {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // DOCX state
  const [docxHtml, setDocxHtml] = useState(null);
  
  // Excel state
  const [excelData, setExcelData] = useState(null);
  const [activeSheet, setActiveSheet] = useState(0);
  
  // Blob URL for PDF/Image (needed for authenticated fetching)
  const [blobUrl, setBlobUrl] = useState(null);
  const blobUrlRef = React.useRef(null);
  
  // Detect mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  
  const { name, url: rawUrl, type } = document || {};
  
  // Construct proper URL - if it's a storage path (not full URL), proxy through API
  const url = useMemo(() => {
    console.log("[DocumentViewer] rawUrl:", rawUrl);
    if (!rawUrl) return null;
    // If already a full URL, use as-is
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      console.log("[DocumentViewer] Using rawUrl as full URL");
      return rawUrl;
    }
    // Otherwise, proxy through the form-documents endpoint
    const constructedUrl = `${API_BASE_URL}/api/form-documents/${rawUrl}`;
    console.log("[DocumentViewer] Constructed URL:", constructedUrl);
    return constructedUrl;
  }, [rawUrl]);
  
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(type?.toLowerCase());
  const isPdf = type?.toLowerCase() === "pdf";
  const isDocx = ["docx", "doc"].includes(type?.toLowerCase());
  const isExcel = ["xls", "xlsx", "csv"].includes(type?.toLowerCase());
  const isPreviewable = isImage || isPdf || isDocx || isExcel;

  // Fetch and parse DOCX files
  const loadDocx = useCallback(async () => {
    if (!url || !isDocx) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem("token");
      console.log("[DocumentViewer] Loading DOCX, token present:", !!token);
      
      const response = await fetch(url, { 
        headers: token ? { Authorization: `Bearer ${token}` } : {} 
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[DocumentViewer] DOCX fetch failed:", response.status, errorText);
        throw new Error(errorText || `Failed to fetch document (${response.status})`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setDocxHtml(result.value);
    } catch (err) {
      console.error("Error loading DOCX:", err);
      setError(err.message || "Failed to load document. Try downloading instead.");
    } finally {
      setLoading(false);
    }
  }, [url, isDocx]);

  // Fetch and parse Excel files
  const loadExcel = useCallback(async () => {
    if (!url || !isExcel) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem("token");
      console.log("[DocumentViewer] Loading Excel, token present:", !!token);
      
      const response = await fetch(url, { 
        headers: token ? { Authorization: `Bearer ${token}` } : {} 
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[DocumentViewer] Excel fetch failed:", response.status, errorText);
        throw new Error(errorText || `Failed to fetch spreadsheet (${response.status})`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      
      // Parse all sheets
      const sheets = workbook.SheetNames.map(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        return {
          name: sheetName,
          data: jsonData,
        };
      });
      
      setExcelData(sheets);
      setActiveSheet(0);
    } catch (err) {
      console.error("Error loading Excel:", err);
      setError(err.message || "Failed to load spreadsheet. Try downloading instead.");
    } finally {
      setLoading(false);
    }
  }, [url, isExcel]);

  // Load document on mount
  useEffect(() => {
    // Cleanup previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    
    // Reset states on document change
    setBlobUrl(null);
    setError(null);
    setDocxHtml(null);
    setExcelData(null);
    
    if (isDocx) {
      loadDocx();
    } else if (isExcel) {
      loadExcel();
    } else if ((isPdf || isImage) && url) {
      // Load PDF/Image as blob for authenticated access
      setLoading(true);
      const token = localStorage.getItem("token");
      console.log("[DocumentViewer] Loading PDF/Image, token present:", !!token, "URL:", url);
      
      fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(async response => {
          if (!response.ok) {
            const errorText = await response.text();
            console.error("[DocumentViewer] PDF/Image fetch failed:", response.status, errorText);
            throw new Error(errorText || `Failed to fetch file (${response.status})`);
          }
          return response.blob();
        })
        .then(blob => {
          const objectUrl = URL.createObjectURL(blob);
          blobUrlRef.current = objectUrl;
          setBlobUrl(objectUrl);
        })
        .catch(err => {
          console.error("Error loading file:", err);
          setError(err.message || "Failed to load file. Try downloading instead.");
        })
        .finally(() => setLoading(false));
    }
    
    // Cleanup on unmount
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [isDocx, isExcel, isPdf, isImage, loadDocx, loadExcel, url]);

  if (!document) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-slate-900/95 flex flex-col items-center justify-center"
        data-testid="document-viewer-error"
      >
        <div className="bg-slate-800 rounded-lg p-8 text-center max-w-md mx-auto border border-slate-700">
          <AlertCircle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Document Unavailable</h3>
          <p className="text-slate-400 mb-6">
            The document could not be loaded. It may have been deleted or is temporarily unavailable.
          </p>
          <Button
            onClick={onClose || onBack}
            variant="outline"
            className="text-white border-slate-600 hover:bg-slate-700"
            data-testid="doc-viewer-close-error"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </motion.div>
    );
  }

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  // Get icon based on file type
  const getFileIcon = () => {
    if (isImage) return <ImageIcon className="w-5 h-5 text-blue-400" />;
    if (isPdf) return <FileText className="w-5 h-5 text-red-400" />;
    if (isDocx) return <FileText className="w-5 h-5 text-blue-500" />;
    if (isExcel) return <FileSpreadsheet className="w-5 h-5 text-green-500" />;
    return <File className="w-5 h-5 text-slate-400" />;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-slate-900/95 flex flex-col"
        style={{ pointerEvents: 'auto' }}
        data-testid="document-viewer"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center gap-3">
            {showBackButton && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onBack) onBack();
                  else if (onClose) onClose();
                }}
                className="text-white hover:bg-slate-700"
                data-testid="doc-viewer-back"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </Button>
            )}
            <div className="flex items-center gap-2 text-white">
              {getFileIcon()}
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

            {/* Sheet selector for Excel */}
            {isExcel && excelData && excelData.length > 1 && (
              <>
                <div className="flex items-center gap-1 bg-slate-700 rounded-lg px-2 py-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setActiveSheet(prev => Math.max(0, prev - 1))}
                    className="text-white hover:bg-slate-600 h-6 w-6"
                    disabled={activeSheet === 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-white text-sm px-2">
                    {excelData[activeSheet]?.name} ({activeSheet + 1}/{excelData.length})
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setActiveSheet(prev => Math.min(excelData.length - 1, prev + 1))}
                    className="text-white hover:bg-slate-600 h-6 w-6"
                    disabled={activeSheet === excelData.length - 1}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <div className="w-px h-6 bg-slate-600 mx-2" />
              </>
            )}

            {/* Download button */}
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-white hover:bg-slate-700"
              onClick={async () => {
                try {
                  const token = localStorage.getItem("token");
                  const response = await fetch(url, { 
                    headers: token ? { Authorization: `Bearer ${token}` } : {} 
                  });
                  if (!response.ok) throw new Error("Download failed");
                  const blob = await response.blob();
                  const downloadUrl = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = downloadUrl;
                  a.download = name || "document";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(downloadUrl);
                } catch (err) {
                  console.error("Download error:", err);
                }
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>

            {/* Open in new tab - use blob URL if available, otherwise direct link */}
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-white hover:bg-slate-700"
              onClick={() => {
                if (blobUrl) {
                  window.open(blobUrl, "_blank");
                } else {
                  // For non-blob content, open the raw URL (works for public files)
                  window.open(url, "_blank");
                }
              }}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open
            </Button>

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
          {/* Loading State */}
          {loading && (
            <div className="text-center p-8">
              <Loader2 className="w-12 h-12 text-indigo-400 mx-auto mb-4 animate-spin" />
              <p className="text-white">Loading document...</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="text-center p-8 bg-slate-800 rounded-xl max-w-md">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-white text-lg font-medium mb-2">Error Loading File</h3>
              <p className="text-slate-400 text-sm mb-6">{error}</p>
              <div className="flex gap-3 justify-center">
                <a href={url} download={name}>
                  <Button className="bg-indigo-600 hover:bg-indigo-700">
                    <Download className="w-4 h-4 mr-2" />
                    Download File
                  </Button>
                </a>
              </div>
            </div>
          )}

          {/* Image Viewer */}
          {isImage && !loading && !error && blobUrl && (
            <motion.img
              src={blobUrl}
              alt={name}
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transition: "transform 0.2s ease"
              }}
              draggable={false}
            />
          )}

          {/* PDF Viewer - Mobile friendly with page navigation */}
          {isPdf && !loading && !error && blobUrl && (
            <MobilePdfViewer 
              blobUrl={blobUrl}
              isMobile={isMobile}
            />
          )}

          {/* DOCX Viewer */}
          {isDocx && !loading && !error && docxHtml && (
            <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-2xl overflow-hidden">
              <div 
                className="p-8 prose prose-slate max-w-none docx-content"
                style={{ minHeight: "70vh" }}
                dangerouslySetInnerHTML={{ __html: docxHtml }}
              />
            </div>
          )}

          {/* Excel Viewer */}
          {isExcel && !loading && !error && excelData && (
            <div className="w-full h-full overflow-auto">
              <div className="bg-white rounded-lg shadow-2xl overflow-hidden min-w-fit">
                <table className="w-full border-collapse">
                  <tbody>
                    {excelData[activeSheet]?.data.map((row, rowIndex) => (
                      <tr 
                        key={rowIndex} 
                        className={rowIndex === 0 ? "bg-slate-100 font-semibold" : "hover:bg-slate-50"}
                      >
                        {/* Row number */}
                        <td className="px-2 py-1 text-xs text-slate-400 bg-slate-50 border border-slate-200 text-center min-w-[40px]">
                          {rowIndex + 1}
                        </td>
                        {row.map((cell, cellIndex) => (
                          <td 
                            key={cellIndex}
                            className="px-3 py-2 border border-slate-200 text-sm text-slate-700 whitespace-nowrap"
                          >
                            {cell !== null && cell !== undefined ? String(cell) : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {excelData[activeSheet]?.data.length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    This sheet is empty
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Unsupported File Type */}
          {!isPreviewable && !loading && (
            <div className="text-center p-8 bg-slate-800 rounded-xl max-w-md">
              <File className="w-16 h-16 text-slate-500 mx-auto mb-4" />
              <h3 className="text-white text-lg font-medium mb-2">{name}</h3>
              <p className="text-slate-400 text-sm mb-6">
                Preview not available for .{type} files
              </p>
              <div className="flex gap-3 justify-center">
                <Button 
                  className="bg-indigo-600 hover:bg-indigo-700"
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem("token");
                      const response = await fetch(url, { 
                        headers: token ? { Authorization: `Bearer ${token}` } : {} 
                      });
                      if (!response.ok) throw new Error("Download failed");
                      const blob = await response.blob();
                      const downloadUrl = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = downloadUrl;
                      a.download = name || "document";
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(downloadUrl);
                    } catch (err) {
                      console.error("Download error:", err);
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download File
                </Button>
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

        {/* Footer info for Excel */}
        {isExcel && excelData && (
          <div className="px-4 py-2 bg-slate-800 border-t border-slate-700 text-slate-400 text-xs">
            {excelData[activeSheet]?.data.length || 0} rows • Sheet: {excelData[activeSheet]?.name}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default DocumentViewer;
