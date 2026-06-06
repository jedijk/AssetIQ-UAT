import React from "react";

export function FormsTemplatesTab(props) {
  return (
    <>
              <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : templatesError ? (
            <Card className="py-12 border-red-200 bg-red-50">
              <CardContent className="text-center">
                <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-red-700 mb-2">Failed to load form templates</h3>
                <p className="text-sm text-red-500 mb-4">
                  {templatesErrorDetail?.message || "Please check your connection and try again"}
                </p>
                <Button 
                  variant="outline"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["form-templates"] })}
                  data-testid="retry-templates-btn"
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Retry
                </Button>
              </CardContent>
            </Card>
          ) : templates.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-700 mb-2">No form templates yet</h3>
                <p className="text-sm text-slate-500 mb-4">Create your first form template to start collecting data</p>
                <Button onClick={() => {
                  resetNewTemplate();
                  setShowCreateDialog(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" /> Create Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onView={setSelectedTemplate}
                  onEdit={(t) => {
                    setNewTemplate(t);
                    setShowCreateDialog(true);
                  }}
                  onDelete={(t) => setShowDeleteConfirm(t)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Submissions Tab - Only shown when not embedded */}
        {!embedded && (
          <TabsContent value="submissions" className="mt-4">
    </>
  );
}
