import {
  FileText, Layers, Signature, Monitor, Smartphone, Loader2, Search, ExternalLink,
} from "lucide-react";
import PhotoDataCaptureField from "../../../components/forms/PhotoDataCaptureField";
import { formAPI, FieldPreview } from "../../../components/forms";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../../components/ui/dialog";

export function FormsViewTemplateDialog({
  selectedTemplate,
  onClose,
  viewingDocument,
  previewMode,
  setPreviewMode,
  viewTab,
  setViewTab,
  docSearchQuery,
  setDocSearchQuery,
  docSearchResult,
  setDocSearchResult,
  isSearchingDocs,
  setIsSearchingDocs,
  setViewingDocument,
  t,
}) {
  if (!selectedTemplate) return null;
  return (
      <Dialog open={!!selectedTemplate} onOpenChange={(open) => { 
        // Don't close if document viewer is open
        if (!open && viewingDocument) return;
        if (!open) onClose();
      }}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  {selectedTemplate?.name}
                </DialogTitle>
                <DialogDescription>
                  {selectedTemplate?.description || "No description"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline">Version {selectedTemplate?.version}</Badge>
              {selectedTemplate?.discipline && (
                <Badge className="bg-blue-50 text-blue-700 border-blue-200">{selectedTemplate.discipline}</Badge>
              )}
              {selectedTemplate?.require_signature && (
                <Badge className="bg-purple-50 text-purple-700 border-purple-200">
                  <Signature className="w-3 h-3 mr-1" /> Signature Required
                </Badge>
              )}
              {selectedTemplate?.documents?.length > 0 && (
                <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                  <FileText className="w-3 h-3 mr-1" /> {selectedTemplate.documents.length} {t("forms.documents")}
                </Badge>
              )}
            </div>

            {/* View Tabs with Preview Mode Toggle */}
            <div className="flex items-center justify-between mb-4 border-b">
              <div className="flex gap-2">
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    viewTab === "fields" 
                      ? "border-indigo-600 text-indigo-600" 
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                  onClick={() => setViewTab("fields")}
                >
                  <Layers className="w-4 h-4 inline mr-1" /> {t("forms.formFields")} ({selectedTemplate?.fields?.length || 0})
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    viewTab === "documents" 
                      ? "border-indigo-600 text-indigo-600" 
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                  onClick={() => setViewTab("documents")}
                >
                  <FileText className="w-4 h-4 inline mr-1" /> {t("forms.documents")} ({selectedTemplate?.documents?.length || 0})
                </button>
              </div>
              
              {/* Preview Mode Toggle - Always visible on Fields tab */}
              {viewTab === "fields" && (
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                  <Button
                    variant={previewMode === "desktop" ? "default" : "ghost"}
                    size="sm"
                    className={`h-8 px-3 ${previewMode === "desktop" ? "bg-white shadow-sm text-slate-900" : "text-slate-600"}`}
                    onClick={() => setPreviewMode("desktop")}
                    data-testid="preview-desktop-btn"
                  >
                    <Monitor className="w-4 h-4 mr-1.5" /> {t("common.desktop")}
                  </Button>
                  <Button
                    variant={previewMode === "mobile" ? "default" : "ghost"}
                    size="sm"
                    className={`h-8 px-3 ${previewMode === "mobile" ? "bg-white shadow-sm text-slate-900" : "text-slate-600"}`}
                    onClick={() => setPreviewMode("mobile")}
                    data-testid="preview-mobile-btn"
                  >
                    <Smartphone className="w-4 h-4 mr-1.5" /> {t("common.mobile")}
                  </Button>
                </div>
              )}
            </div>

            {/* Fields Tab */}
            {viewTab === "fields" && (
              <>
                {/* Desktop Preview */}
                {previewMode === "desktop" && (
                  <div className="flex justify-center">
                    {/* Desktop Browser Frame */}
                    <div className="w-full max-w-3xl">
                      {/* Browser Chrome */}
                      <div className="bg-slate-200 rounded-t-lg px-4 py-2 flex items-center gap-2">
                        <div className="flex gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-red-400" />
                          <div className="w-3 h-3 rounded-full bg-yellow-400" />
                          <div className="w-3 h-3 rounded-full bg-green-400" />
                        </div>
                        <div className="flex-1 ml-4">
                          <div className="bg-white rounded px-3 py-1 text-xs text-slate-500 truncate">
                            forms.assetiq.com/{selectedTemplate?.name?.toLowerCase().replace(/\s+/g, '-')}
                          </div>
                        </div>
                      </div>
                      
                      {/* Browser Content */}
                      <div className="bg-white border-x border-b border-slate-200 rounded-b-lg shadow-lg overflow-hidden">
                        {/* Form Header */}
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
                          <h3 className="text-white font-semibold text-lg">{selectedTemplate?.name}</h3>
                          <p className="text-white/70 text-sm">{selectedTemplate?.description || "Fill out the form below"}</p>
                        </div>
                        
                        {/* Form Fields */}
                        <div className="p-6 space-y-5 max-h-[50vh] overflow-y-auto">
                          {/* Photo AI Extraction */}
                          {selectedTemplate?.photo_extraction_config?.enabled && (
                            <PhotoDataCaptureField
                              config={selectedTemplate.photo_extraction_config}
                              formData={{}}
                              onAutoFill={() => toast.info("Photo extraction is available during task execution")}
                            />
                          )}
                          {selectedTemplate?.fields?.map((field, idx) => (
                            <div key={idx} className="space-y-2">
                              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                                {field.label}
                                {field.required && <span className="text-red-500">*</span>}
                              </label>
                              {/* Linked Equipment Display */}
                              {field.linked_equipment && (
                                <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md w-fit">
                                  <Building2 className="w-3 h-3" />
                                  <span>{field.linked_equipment.name}</span>
                                </div>
                              )}
                              {field.description && (
                                <p className="text-xs text-slate-400">{field.description}</p>
                              )}
                              
                              {/* Render realistic field inputs */}
                              {field.field_type === "text" && (
                                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center">
                                  <span className="text-sm text-slate-400">{field.placeholder || "Enter text..."}</span>
                                </div>
                              )}
                              {field.field_type === "textarea" && (
                                <div className="h-24 bg-slate-50 rounded-lg border border-slate-200 p-3">
                                  <span className="text-sm text-slate-400">{field.placeholder || "Enter description..."}</span>
                                </div>
                              )}
                              {field.field_type === "numeric" && (
                                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                  <span className="text-sm text-slate-400">0</span>
                                  {field.unit && <span className="text-sm text-slate-500 font-medium">{field.unit}</span>}
                                </div>
                              )}
                              {field.field_type === "boolean" && (
                                <div className="flex items-center gap-3">
                                  <div className="w-12 h-6 bg-slate-200 rounded-full relative cursor-pointer">
                                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform" />
                                  </div>
                                  <span className="text-sm text-slate-500">No</span>
                                </div>
                              )}
                              {field.field_type === "dropdown" && (
                                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center justify-between cursor-pointer hover:border-slate-300">
                                  <span className="text-sm text-slate-400">Select an option...</span>
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              {field.field_type === "multi_select" && (
                                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center justify-between cursor-pointer hover:border-slate-300">
                                  <span className="text-sm text-slate-400">Select options...</span>
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              {field.field_type === "date" && (
                                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center justify-between cursor-pointer hover:border-slate-300">
                                  <span className="text-sm text-slate-400">Select date...</span>
                                  <Calendar className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              {field.field_type === "datetime" && (
                                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center justify-between cursor-pointer hover:border-slate-300">
                                  <span className="text-sm text-slate-400">Select date & time...</span>
                                  <Calendar className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              {field.field_type === "file" && (
                                <div className="h-20 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors">
                                  <Upload className="w-5 h-5 text-slate-400" />
                                  <span className="text-xs text-slate-400 mt-1">Click to upload or drag and drop</span>
                                </div>
                              )}
                              {field.field_type === "image" && (
                                <div className="h-28 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors">
                                  <Upload className="w-6 h-6 text-slate-400" />
                                  <span className="text-xs text-slate-400 mt-1">Click to upload image</span>
                                  <span className="text-xs text-slate-300">PNG, JPG up to 10MB</span>
                                </div>
                              )}
                              {field.field_type === "signature" && (
                                <div className="h-32 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400">
                                  <Signature className="w-6 h-6 text-slate-400" />
                                  <span className="text-xs text-slate-400 mt-1">Click to sign</span>
                                </div>
                              )}
                              {field.field_type === "range" && (
                                <div className="space-y-2 pt-1">
                                  <div className="h-2 bg-slate-200 rounded-full relative">
                                    <div className="absolute left-0 top-0 h-full w-1/2 bg-indigo-500 rounded-full" />
                                    <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-white border-2 border-indigo-500 rounded-full shadow cursor-grab" />
                                  </div>
                                  <div className="flex justify-between text-xs text-slate-400">
                                    <span>{field.range_min || 0}</span>
                                    <span>{field.range_max || 100}</span>
                                  </div>
                                </div>
                              )}
                              {field.field_type === "equipment" && (
                                <div className="flex items-center gap-2 p-2.5 border border-slate-200 rounded-lg bg-slate-50">
                                  <Building2 className="w-4 h-4 text-slate-400" />
                                  <span className="text-sm text-slate-500">Search equipment...</span>
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Submit Button */}
                          <div className="pt-4">
                            <div className="h-11 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity">
                              <span className="text-white font-medium">Submit Form</span>
                            </div>
                            {selectedTemplate?.label_print_config?.enabled && (
                              <div className="mt-2 h-10 bg-white border border-violet-300 text-violet-700 rounded-lg flex items-center justify-center gap-2 cursor-default">
                                <Printer className="w-4 h-4" />
                                <span className="text-sm font-medium">
                                  {selectedTemplate.label_print_config.button_label || "Print Label"}
                                </span>
                                <span className="text-[10px] text-violet-400 ml-1">
                                  ({selectedTemplate.label_print_config.trigger})
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

            {/* Mobile Preview */}
            {previewMode === "mobile" && (
              <div className="flex justify-center">
                {/* iPhone-style Device Frame */}
                <div className="relative">
                  {/* Phone Outer Frame */}
                  <div className="w-[320px] h-[640px] bg-slate-900 rounded-[40px] p-3 shadow-2xl">
                    {/* Phone Inner Frame */}
                    <div className="w-full h-full bg-white rounded-[32px] overflow-hidden relative">
                      {/* Status Bar */}
                      <div className="h-11 bg-slate-50 flex items-center justify-between px-6 border-b">
                        <span className="text-xs font-medium">9:41</span>
                        <div className="absolute left-1/2 -translate-x-1/2 w-20 h-6 bg-slate-900 rounded-full" />
                        <div className="flex items-center gap-1">
                          <div className="w-4 h-2 border border-slate-400 rounded-sm">
                            <div className="w-2/3 h-full bg-slate-400 rounded-sm" />
                          </div>
                        </div>
                      </div>
                      
                      {/* App Header */}
                      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3">
                        <h3 className="text-white font-semibold text-sm truncate">{selectedTemplate?.name}</h3>
                        <p className="text-white/70 text-xs">Fill out the form below</p>
                      </div>

                      {/* Form Content */}
                      <div className="p-4 space-y-4 overflow-y-auto h-[480px]">
                        {/* Photo AI Extraction */}
                        {selectedTemplate?.photo_extraction_config?.enabled && (
                          <PhotoDataCaptureField
                            config={selectedTemplate.photo_extraction_config}
                            formData={{}}
                            onAutoFill={() => toast.info("Photo extraction is available during task execution")}
                          />
                        )}
                        {selectedTemplate?.fields?.map((field, idx) => (
                          <div key={idx} className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                              {field.label}
                              {field.required && <span className="text-red-500">*</span>}
                            </label>
                            {field.description && (
                              <p className="text-[10px] text-slate-400">{field.description}</p>
                            )}
                            {/* Render field based on type */}
                            {field.field_type === "text" && (
                              <div className="h-9 bg-slate-100 rounded-lg border border-slate-200 px-3 flex items-center">
                                <span className="text-xs text-slate-400">Enter text...</span>
                              </div>
                            )}
                            {field.field_type === "textarea" && (
                              <div className="h-20 bg-slate-100 rounded-lg border border-slate-200 p-2">
                                <span className="text-xs text-slate-400">Enter description...</span>
                              </div>
                            )}
                            {field.field_type === "numeric" && (
                              <div className="h-9 bg-slate-100 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                <span className="text-xs text-slate-400">0</span>
                                {field.unit && <span className="text-xs text-slate-500">{field.unit}</span>}
                              </div>
                            )}
                            {field.field_type === "boolean" && (
                              <div className="flex items-center gap-2">
                                <div className="w-10 h-5 bg-slate-200 rounded-full relative">
                                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow" />
                                </div>
                                <span className="text-xs text-slate-500">No</span>
                              </div>
                            )}
                            {field.field_type === "dropdown" && (
                              <div className="h-9 bg-slate-100 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                <span className="text-xs text-slate-400">Select option...</span>
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                              </div>
                            )}
                            {field.field_type === "multi_select" && (
                              <div className="h-9 bg-slate-100 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                <span className="text-xs text-slate-400">Select options...</span>
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                              </div>
                            )}
                            {field.field_type === "date" && (
                              <div className="h-9 bg-slate-100 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                <span className="text-xs text-slate-400">Select date...</span>
                                <Calendar className="w-3 h-3 text-slate-400" />
                              </div>
                            )}
                            {field.field_type === "datetime" && (
                              <div className="h-9 bg-slate-100 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                <span className="text-xs text-slate-400">Select date & time...</span>
                                <Calendar className="w-3 h-3 text-slate-400" />
                              </div>
                            )}
                            {field.field_type === "file" && (
                              <div className="h-16 bg-slate-100 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center">
                                <Upload className="w-4 h-4 text-slate-400" />
                                <span className="text-[10px] text-slate-400 mt-1">Tap to upload</span>
                              </div>
                            )}
                            {field.field_type === "image" && (
                              <div className="h-20 bg-slate-100 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center">
                                <Upload className="w-4 h-4 text-slate-400" />
                                <span className="text-[10px] text-slate-400 mt-1">Tap to add image</span>
                              </div>
                            )}
                            {field.field_type === "signature" && (
                              <div className="h-24 bg-slate-50 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center">
                                <Signature className="w-5 h-5 text-slate-400" />
                                <span className="text-[10px] text-slate-400 mt-1">Tap to sign</span>
                              </div>
                            )}
                            {field.field_type === "range" && (
                              <div className="space-y-1">
                                <div className="h-2 bg-slate-200 rounded-full relative">
                                  <div className="absolute left-0 top-0 h-full w-1/3 bg-indigo-500 rounded-full" />
                                  <div className="absolute left-1/3 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-full shadow" />
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-400">
                                  <span>Min</span>
                                  <span>Max</span>
                                </div>
                              </div>
                            )}
                            {field.field_type === "equipment" && (
                              <div className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg bg-slate-50">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-xs text-slate-500">Search equipment...</span>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Submit Button */}
                        <div className="pt-4 pb-2">
                          <div className="h-10 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
                            <span className="text-white text-sm font-medium">Submit</span>
                          </div>
                          {selectedTemplate?.label_print_config?.enabled && (
                            <div className="mt-1.5 h-9 bg-white border border-violet-300 text-violet-700 rounded-lg flex items-center justify-center gap-1.5">
                              <Printer className="w-3.5 h-3.5" />
                              <span className="text-xs font-medium">
                                {selectedTemplate.label_print_config.button_label || "Print Label"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Home Indicator */}
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-300 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            )}
              </>
            )}

            {/* Documents Tab */}
            {viewTab === "documents" && (
              <div className="space-y-4" data-testid="documents-tab-content">
                {/* Check if selectedTemplate exists and is valid */}
                {!selectedTemplate ? (
                  <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                    <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-700 mb-2">Template data unavailable</h3>
                    <p className="text-sm text-slate-500">Please close and reopen the template to view documents.</p>
                  </div>
                ) : (
                  <>
                    {/* AI Search Section */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-5 h-5 text-indigo-600" />
                        <h4 className="font-medium text-sm text-indigo-900">{t("forms.aiDocumentSearch")}</h4>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={docSearchQuery}
                          onChange={(e) => setDocSearchQuery(e.target.value)}
                          placeholder={t("forms.searchDocumentsPlaceholder")}
                          className="flex-1"
                          data-testid="doc-search-input"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && docSearchQuery.trim() && selectedTemplate?.id) {
                              setIsSearchingDocs(true);
                              formAPI.searchDocuments(selectedTemplate.id, docSearchQuery.trim())
                                .then(setDocSearchResult)
                                .catch((err) => {
                                  console.error("Document search failed:", err);
                                  toast.error("Search failed: " + (err.message || "Unknown error"));
                                })
                                .finally(() => setIsSearchingDocs(false));
                            }
                          }}
                        />
                        <Button
                          onClick={() => {
                            if (docSearchQuery.trim() && selectedTemplate?.id) {
                              setIsSearchingDocs(true);
                              formAPI.searchDocuments(selectedTemplate.id, docSearchQuery.trim())
                                .then(setDocSearchResult)
                                .catch((err) => {
                                  console.error("Document search failed:", err);
                                  toast.error("Search failed: " + (err.message || "Unknown error"));
                                })
                                .finally(() => setIsSearchingDocs(false));
                            }
                          }}
                          disabled={isSearchingDocs || !docSearchQuery.trim()}
                          className="bg-indigo-600 hover:bg-indigo-700"
                          data-testid="doc-search-btn"
                        >
                          {isSearchingDocs ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <><Search className="w-4 h-4 mr-1" /> {t("forms.askAI")}</>
                          )}
                        </Button>
                      </div>

                      {/* AI Search Result */}
                      {docSearchResult && (
                        <div className="mt-4 bg-white rounded-lg p-4 border" data-testid="doc-search-result">
                          <div className="flex items-start gap-3">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                              <Sparkles className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{docSearchResult.answer}</p>
                              {docSearchResult.relevant_documents?.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {docSearchResult.relevant_documents.map((doc) => (
                                    <button
                                      key={doc.id}
                                      onClick={() => setViewingDocument(doc)}
                                      className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-600 hover:bg-slate-200 transition-colors"
                                      data-testid={`view-doc-${doc.id}`}
                                    >
                                      <FileText className="w-3 h-3" />
                                      {doc.name}
                                      <Eye className="w-3 h-3" />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Document List */}
                    <div data-testid="document-list-section">
                      <h4 className="font-medium text-sm text-slate-700 mb-2">{t("forms.attachedDocuments")}</h4>
                      {selectedTemplate?.documents?.length > 0 ? (
                        <div className="space-y-2">
                          {selectedTemplate.documents.map((doc) => (
                            <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border hover:bg-slate-100 transition-colors" data-testid={`document-row-${doc.id}`}>
                              <div className="h-10 w-10 rounded bg-white border flex items-center justify-center">
                                <FileText className="w-5 h-5 text-slate-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{doc.name || "Unnamed document"}</div>
                                <div className="text-xs text-slate-500">
                                  {doc.type?.toUpperCase() || "FILE"} 
                                  {doc.description && ` • ${doc.description}`}
                                </div>
                              </div>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setViewingDocument(doc)}
                                className="text-indigo-600 hover:text-indigo-700"
                                data-testid={`view-doc-btn-${doc.id}`}
                              >
                                <Eye className="w-4 h-4 mr-1" /> {t("common.view")}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-300" data-testid="no-documents-message">
                          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-500">{t("forms.noDocumentsAttached")}</p>
                          <p className="text-xs text-slate-400 mt-1">Upload documents in the Edit mode to attach reference materials</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

  );
}
