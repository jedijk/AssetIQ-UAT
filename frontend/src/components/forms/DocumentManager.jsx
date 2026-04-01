/**
 * DocumentManager Component
 * Handles document upload, viewing, and AI search for form templates
 */
import { useState } from "react";
import { 
  Upload, 
  FileText, 
  Trash2, 
  Search, 
  Loader2, 
  ExternalLink,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import { formAPI } from "./formAPI";
import { useLanguage } from "../../contexts/LanguageContext";

export const DocumentManager = ({ 
  templateId,
  documents = [],
  pendingDocuments = [],
  onDocumentsChange,
  onPendingDocumentsChange,
  isViewOnly = false,
}) => {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (templateId) {
      // Template exists - upload directly
      const docId = `uploading_${Date.now()}`;
      setUploadingDocId(docId);
      
      try {
        const result = await formAPI.uploadDocument(templateId, file, "");
        toast.success("Document uploaded successfully");
        if (onDocumentsChange) {
          onDocumentsChange([...documents, result]);
        }
      } catch (error) {
        toast.error(error.message || "Failed to upload document");
      } finally {
        setUploadingDocId(null);
      }
    } else {
      // Template doesn't exist yet - add to pending
      const pendingDoc = {
        id: `pending_${Date.now()}`,
        name: file.name,
        file: file,
        status: "pending",
      };
      if (onPendingDocumentsChange) {
        onPendingDocumentsChange([...pendingDocuments, pendingDoc]);
      }
    }
    
    // Reset file input
    e.target.value = "";
  };

  const handleDeleteDocument = async (docId) => {
    if (!templateId) {
      // Remove from pending
      if (onPendingDocumentsChange) {
        onPendingDocumentsChange(pendingDocuments.filter(d => d.id !== docId));
      }
      return;
    }

    try {
      await formAPI.deleteDocument(templateId, docId);
      toast.success("Document deleted");
      if (onDocumentsChange) {
        onDocumentsChange(documents.filter(d => d.id !== docId));
      }
    } catch (error) {
      toast.error("Failed to delete document");
    }
  };

  const handleAISearch = async () => {
    if (!templateId || !searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchResult(null);
    
    try {
      const result = await formAPI.searchDocuments(templateId, searchQuery);
      setSearchResult(result);
    } catch (error) {
      toast.error("Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const allDocuments = [
    ...documents.map(d => ({ ...d, isPending: false })),
    ...pendingDocuments.map(d => ({ ...d, isPending: true })),
  ];

  return (
    <div className="space-y-4" data-testid="document-manager">
      {/* Upload Section */}
      {!isViewOnly && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {t("forms.documents")}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept=".pdf,.doc,.docx,.txt,.xlsx,.xls"
              onChange={handleFileUpload}
              className="flex-1"
              data-testid="document-upload-input"
            />
          </div>
          <p className="text-xs text-slate-500">
            {t("forms.documentHint") || "Upload reference documents, manuals, or procedures"}
          </p>
        </div>
      )}

      {/* Document List */}
      {allDocuments.length > 0 && (
        <div className="space-y-2">
          {allDocuments.map((doc) => (
            <div 
              key={doc.id} 
              className="flex items-center justify-between p-2 bg-slate-50 rounded-lg"
              data-testid={`document-${doc.id}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm truncate">{doc.name || doc.filename}</span>
                {doc.isPending && (
                  <Badge variant="secondary" className="text-xs">
                    {doc.status === "uploading" ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Uploading</>
                    ) : doc.status === "success" ? (
                      <><CheckCircle2 className="w-3 h-3 mr-1" /> Uploaded</>
                    ) : doc.status === "error" ? (
                      <><AlertCircle className="w-3 h-3 mr-1" /> Failed</>
                    ) : (
                      "Pending"
                    )}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {doc.url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => window.open(doc.url, "_blank")}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                )}
                {!isViewOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500"
                    onClick={() => handleDeleteDocument(doc.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {allDocuments.length === 0 && (
        <div className="text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">{t("forms.noDocuments")}</p>
          <p className="text-xs text-slate-400">{t("forms.noDocumentsHint")}</p>
        </div>
      )}

      {/* AI Document Search (only for existing templates with documents) */}
      {templateId && documents.length > 0 && (
        <div className="space-y-2 pt-4 border-t">
          <Label className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            AI Document Search
          </Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search within documents..."
                className="pl-9"
                onKeyDown={(e) => e.key === "Enter" && handleAISearch()}
                data-testid="ai-search-input"
              />
            </div>
            <Button 
              onClick={handleAISearch} 
              disabled={isSearching || !searchQuery.trim()}
              data-testid="ai-search-btn"
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Search Results */}
          {searchResult && (
            <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-purple-900">AI Response</p>
                  <p className="text-sm text-purple-700 mt-1">{searchResult.answer || searchResult.response}</p>
                  {searchResult.sources && searchResult.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {searchResult.sources.map((src, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {src.document_name || `Source ${idx + 1}`}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setSearchResult(null)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentManager;
