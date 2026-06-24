import React from "react";

export function DashboardQuickViewModal(props) {
  return (
    <>
      {/* Quick View Modal for Form Submissions */}
      <Dialog open={!!quickViewSubmission || loadingQuickView} onOpenChange={() => { setQuickViewSubmission(null); setLoadingQuickView(false); }}>
        <DialogContent
          showCloseButton={false}
          className={`${dialogSizeClass.md} max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl`}
        >
          {/* Header */}
          <div className="flex items-center border-b border-slate-100 px-3 py-2.5 sm:px-4 sm:py-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => setQuickViewSubmission(null)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100"
              aria-label="Close"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>
          
          {/* Loading state */}
          {loadingQuickView && !quickViewSubmission && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}
          
          {/* Scrollable content */}
          {quickViewSubmission && (
          <>
          <div className="app-page-scroll flex-1 min-h-0 px-5 py-5">
            <div className="space-y-5">
              {/* Form Title and Status */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 leading-tight">
                      {quickViewSubmission?.form_template_name || quickViewSubmission?.template_name || quickViewSubmission?.form_name || "Form Submission"}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <UserAvatar 
                        name={quickViewSubmission?.submitted_by_name || "User"}
                        photo={quickViewSubmission?.submitted_by_photo}
                        initials={(quickViewSubmission?.submitted_by_name || "U").charAt(0)}
                        size="xs"
                        showPopover={false}
                      />
                      <span className="text-sm text-slate-500">
                        {quickViewSubmission?.submitted_by_name || "Unknown"}
                        <span className="mx-1.5">•</span>
                        {quickViewSubmission?.submitted_at ? formatDateTime(quickViewSubmission.submitted_at) : "Unknown"}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                  quickViewSubmission?.status === "completed" || quickViewSubmission?.status === "approved" 
                    ? "bg-green-100 text-green-700 border-green-200" 
                    : quickViewSubmission?.status === "pending" 
                      ? "bg-amber-100 text-amber-700 border-amber-200"
                      : quickViewSubmission?.status === "rejected"
                        ? "bg-red-100 text-red-700 border-red-200"
                        : "bg-blue-100 text-blue-700 border-blue-200"
                }`}>
                  {quickViewSubmission?.status === "completed" ? "Completed" : 
                   quickViewSubmission?.status === "approved" ? "Approved" :
                   quickViewSubmission?.status === "pending" ? "Pending" :
                   quickViewSubmission?.status === "rejected" ? "Rejected" : "Submitted"}
                </Badge>
              </div>
              
              {/* Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-slate-100">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Submitted by</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <UserAvatar 
                        name={quickViewSubmission?.submitted_by_name || "User"}
                        photo={quickViewSubmission?.submitted_by_photo}
                        initials={(quickViewSubmission?.submitted_by_name || "U").charAt(0)}
                        size="xs"
                        showPopover={false}
                      />
                      <span className="text-sm font-medium text-slate-700">{quickViewSubmission?.submitted_by_name || "Unknown"}</span>
                    </div>
                  </div>
                </div>
                {quickViewSubmission?.equipment_name && (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Equipment</p>
                      <p className="text-sm font-medium text-slate-700 mt-0.5">
                        {quickViewSubmission.equipment_name}
                      </p>
                    </div>
                  </div>
                )}
                {quickViewSubmission?.task_template_name && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Task</p>
                      <p className="text-sm font-medium text-slate-700 mt-0.5">
                        {quickViewSubmission.task_template_name}
                      </p>
                    </div>
                  </div>
                )}
                {quickViewSubmission?.discipline && (
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 flex items-center justify-center">
                      <span className={`w-2.5 h-2.5 rounded-full bg-blue-500`} />
                    </span>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Discipline</p>
                      <p className="text-sm font-medium text-slate-700 mt-0.5">
                        {quickViewSubmission.discipline}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* AI Vision Photo - shown when submission contains __ai_scan_photo */}
              {(() => {
                const allResponses = quickViewSubmission?.values || quickViewSubmission?.responses || [];
                const aiPhotoEntry = allResponses.find(r => r.field_id === "__ai_scan_photo" && r.value);
                const aiPhotoPath = aiPhotoEntry?.value
                  || quickViewSubmission?.ai_extraction?.extracted_fields?.__ai_scan_photo?.value;
                if (!aiPhotoPath || typeof aiPhotoPath !== "string") return null;
                const apiPath = aiPhotoPath.startsWith("http") || aiPhotoPath.startsWith("data:")
                  ? aiPhotoPath
                  : `/api/storage/${aiPhotoPath}`;
                return (
                  <div data-testid="quickview-ai-vision-photo">
                    <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-blue-500" />
                      AI Vision Photo
                    </h3>
                    <button
                      type="button"
                      onClick={() => setViewingImage({ url: apiPath, name: "AI Vision Photo" })}
                      className="group relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 hover:border-blue-300 hover:shadow-md transition-all"
                      data-testid="quickview-ai-vision-photo-thumbnail"
                    >
                      <AuthenticatedImage
                        src={apiPath}
                        alt="AI Vision Source Photo"
                        className="w-full max-h-72 object-contain bg-slate-100"
                        fallback={
                          <div className="w-full h-40 flex flex-col items-center justify-center text-slate-400 gap-2">
                            <AlertTriangle className="w-8 h-8" />
                            <span className="text-xs">Photo unavailable</span>
                          </div>
                        }
                      />
                    </button>
                    <p className="text-xs text-slate-400 mt-2">
                      Source image used by AI to auto-fill the fields below. Tap to enlarge.
                    </p>
                  </div>
                );
              })()}

              {/* Checklist Section */}
              {(() => {
                const responsesAll = quickViewSubmission?.values || quickViewSubmission?.responses || [];
                const responses = responsesAll.filter(r => r.field_id !== "__ai_scan_photo");
                if (responses.length === 0) return null;
                
                return (
                  <div>
                    <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <CheckSquare className="w-5 h-5 text-slate-600" />
                      Checklist
                    </h3>
                    <div className="space-y-2">
                      {responses.map((response, idx) => {
                        const isWarning = response.threshold_status === "warning";
                        const isCritical = response.threshold_status === "critical";
                        const isBoolean = typeof response.value === "boolean";
                        const isPass = isBoolean ? response.value : !isCritical && !isWarning;
                        const isSignature = response.field_type === "signature" || 
                          (typeof response.value === "string" && response.value?.startsWith("data:image/png;base64,"));
                        const hasAttachment = response.attachment_url || response.file_url;
                        const attachmentRawUrl = response.attachment_url || response.file_url || "";
                        const isImage = hasAttachment && /\.(jpg|jpeg|png|gif|webp)$/i.test(attachmentRawUrl);
                        // Build clean API path for AuthenticatedLightbox (no token query param)
                        const attachmentApiPath = attachmentRawUrl && !attachmentRawUrl.startsWith('data:') && !attachmentRawUrl.startsWith('http')
                          ? `/api/storage/${attachmentRawUrl}`
                          : attachmentRawUrl;
                        // Build full URL with token for non-image downloads (fallback)
                        const authToken = localStorage.getItem('token');
                        const attachmentFullUrl = attachmentRawUrl && !attachmentRawUrl.startsWith('data:') && !attachmentRawUrl.startsWith('http')
                          ? `${getBackendUrl()}/api/storage/${attachmentRawUrl}${authToken ? `?token=${authToken}` : ''}`
                          : attachmentRawUrl;
                        
                        return (
                          <div 
                            key={response.field_id || `response-${idx}`}
                            className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${
                              isCritical 
                                ? "bg-red-50 border-l-red-500" 
                                : isWarning 
                                  ? "bg-amber-50 border-l-amber-500" 
                                  : "bg-white border-l-green-500"
                            } border border-l-4 border-slate-100`}
                          >
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              isCritical ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-green-500"
                            }`}>
                              {isCritical ? (
                                <X className="w-3 h-3 text-white" />
                              ) : isWarning ? (
                                <AlertTriangle className="w-3 h-3 text-white" />
                              ) : (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 pr-2">
                              <p className="font-medium text-slate-800 text-sm break-words">
                                {(response.field_label || response.field_id || "").replace(/_/g, ' ')}
                              </p>
                              <p className="text-sm text-slate-500 mt-0.5">
                                {isSignature && response.value ? (
                                  <button
                                    onClick={() => setViewingImage({ url: response.value, name: (response.field_label || "Signature").replace(/_/g, ' ') })}
                                    className="text-blue-600 hover:underline"
                                  >
                                    View Signature
                                  </button>
                                ) : isBoolean ? (
                                  response.value ? "Yes" : "No"
                                ) : Array.isArray(response.value) ? (
                                  response.value.join(", ")
                                ) : hasAttachment ? (
                                  <button
                                    onClick={() => {
                                      if (isImage) {
                                        // Use clean API path - AuthenticatedLightbox handles auth
                                        setViewingImage({ url: attachmentApiPath, name: (response.field_label || "Image").replace(/_/g, ' ') });
                                      } else {
                                        window.open(attachmentFullUrl, '_blank');
                                      }
                                    }}
                                    className="text-blue-600 hover:underline flex items-center gap-1"
                                  >
                                    <Paperclip className="w-3 h-3" /> View Attachment
                                  </button>
                                ) : (
                                  <>
                                    {String(response.value || "—")}
                                    {response.unit && <span className="text-slate-400 ml-1">{response.unit}</span>}
                                  </>
                                )}
                              </p>
                            </div>
                            <Badge className={`shrink-0 text-xs font-medium ${
                              isCritical 
                                ? "bg-red-100 text-red-700 border-red-200" 
                                : isWarning 
                                  ? "bg-amber-100 text-amber-700 border-amber-200" 
                                  : "bg-green-100 text-green-700 border-green-200"
                            }`}>
                              {isCritical ? "FAIL" : isWarning ? "WARNING" : "PASS"}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              
              {/* Insights Section - Generated summary */}
              {quickViewSubmission?.values?.length > 0 && (
                <div>
                  <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-slate-600" />
                    Insights
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                    {(() => {
                      const responses = (quickViewSubmission?.values || []).filter(r => r.field_id !== "__ai_scan_photo");
                      const totalItems = responses.length;
                      const passedItems = responses.filter(r => {
                        const isBoolean = typeof r.value === "boolean";
                        return isBoolean ? r.value : r.threshold_status !== "critical" && r.threshold_status !== "warning";
                      }).length;
                      const warningItems = responses.filter(r => r.threshold_status === "warning").length;
                      const criticalItems = responses.filter(r => r.threshold_status === "critical").length;
                      
                      return (
                        <>
                          {criticalItems === 0 && warningItems === 0 && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-sm text-slate-700">No deviations detected in this round</span>
                            </div>
                          )}
                          {passedItems === totalItems && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-sm text-slate-700">Equipment performing within expected parameters</span>
                            </div>
                          )}
                          {criticalItems > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-red-500" />
                              <span className="text-sm text-slate-700">{criticalItems} critical issue{criticalItems > 1 ? 's' : ''} requiring immediate attention</span>
                            </div>
                          )}
                          {warningItems > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span className="text-sm text-slate-700">{warningItems} warning{warningItems > 1 ? 's' : ''} detected - monitor closely</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-sm text-slate-700">{passedItems} of {totalItems} checks passed</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  
                  {/* Recommendation */}
                  <div className="bg-blue-50 rounded-lg p-4 mt-3 border border-blue-100">
                    <h4 className="font-semibold text-slate-800 flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      Recommendation:
                    </h4>
                    <p className="text-sm text-slate-600">
                      {(() => {
                        const responses = (quickViewSubmission?.values || []).filter(r => r.field_id !== "__ai_scan_photo");
                        const criticalItems = responses.filter(r => r.threshold_status === "critical").length;
                        const warningItems = responses.filter(r => r.threshold_status === "warning").length;
                        
                        if (criticalItems > 0) {
                          return "Immediate corrective action required. Create observation and action items for critical issues.";
                        } else if (warningItems > 0) {
                          return "Schedule follow-up inspection to monitor warning conditions. Consider preventive maintenance.";
                        } else {
                          return "Continue current maintenance schedule. Equipment is operating normally.";
                        }
                      })()}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Attachments */}
              {quickViewSubmission?.attachments?.length > 0 && (
                <div>
                  <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Paperclip className="w-5 h-5 text-slate-600" />
                    Attachments ({quickViewSubmission.attachments.length})
                  </h3>
                  <div className="space-y-3">
                    {quickViewSubmission.attachments.map((att, idx) => {
                      const isImage = att.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name || att.filename || "");
                      const rawUrl = att.url || att.data;
                      // Clean API path for AuthenticatedImage/Lightbox (handles auth via headers)
                      const apiPath = rawUrl && !rawUrl.startsWith('data:') && !rawUrl.startsWith('http') 
                        ? `/api/storage/${rawUrl}` 
                        : rawUrl;
                      // Full URL with token for non-image downloads (fallback)
                      const authToken = localStorage.getItem('token');
                      const downloadUrl = rawUrl && !rawUrl.startsWith('data:') && !rawUrl.startsWith('http') 
                        ? `${getBackendUrl()}/api/storage/${rawUrl}${authToken ? `?token=${authToken}` : ''}` 
                        : rawUrl;
                      const fileName = att.name || att.filename || "Attachment";
                      const hasError = att.error || att.needs_migration;
                      
                      return (
                        <div 
                          key={att.url || att.id || `attachment-${idx}`}
                          className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"
                        >
                          {/* Thumbnail - Use AuthenticatedImage for proper mobile auth */}
                          <div className="w-20 h-16 bg-slate-200 rounded-lg overflow-hidden flex-shrink-0">
                            {hasError ? (
                              <div className="w-full h-full flex items-center justify-center bg-amber-50">
                                <AlertTriangle className="w-6 h-6 text-amber-500" />
                              </div>
                            ) : isImage && apiPath ? (
                              <AuthenticatedImage 
                                src={apiPath} 
                                alt={fileName}
                                className="w-full h-full object-cover"
                                fallback={
                                  <div className="w-full h-full flex items-center justify-center">
                                    <FileText className="w-6 h-6 text-slate-400" />
                                  </div>
                                }
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <FileText className="w-6 h-6 text-slate-400" />
                              </div>
                            )}
                          </div>
                          
                          {/* Info and actions */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{fileName}</p>
                            {att.failure_mode && (
                              <p className="text-xs text-slate-500 mt-0.5">Failure Mode: {att.failure_mode}</p>
                            )}
                            {att.equipment && (
                              <p className="text-xs text-slate-500">Equipment: {att.equipment}</p>
                            )}
                            <div className="flex gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  if (!hasError && apiPath) {
                                    if (isImage) {
                                      // Use clean API path - AuthenticatedLightbox handles auth
                                      setViewingImage({ url: apiPath, name: fileName });
                                    } else {
                                      window.open(downloadUrl, '_blank');
                                    }
                                  }
                                }}
                                disabled={hasError}
                              >
                                View Full
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  if (!hasError && downloadUrl) {
                                    const link = document.createElement('a');
                                    link.href = downloadUrl;
                                    link.download = fileName;
                                    link.click();
                                  }
                                }}
                                disabled={hasError}
                              >
                                Download
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Notes */}
              {quickViewSubmission?.notes && (
                <div>
                  <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-600" />
                    {t("common.notes")}
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{quickViewSubmission.notes}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Fixed footer with actions - Hidden on mobile */}
          <div className="hidden sm:flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setQuickViewSubmission(null)}
                className="px-4"
              >
                Close
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  // Export functionality
                  toast.info("Export feature coming soon");
                }}
                className="px-4"
              >
                Export
              </Button>
            </div>
            <Button 
              onClick={() => {
                setQuickViewSubmission(null);
                navigate("/form-submissions");
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4"
            >
              View All Submissions
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          </>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Lightbox - Using Portal to render above all dialogs */}
      {viewingImage && createPortal(
        <AuthenticatedLightbox
          url={viewingImage.url}
          name={viewingImage.name}
          onClose={() => setViewingImage(null)}
        />,
        document.body
      )}
    </div>
  );
}
    </>
  );
}
