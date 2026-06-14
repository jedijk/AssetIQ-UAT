import { FileText, Plus, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { TabsContent } from "../../../components/ui/tabs";
import { TemplateRow } from "../../../components/forms";

export function FormsTemplatesTabPanel({
  loadingTemplates,
  templatesError,
  templatesErrorDetail,
  queryClient,
  templates,
  onCreateTemplate,
  onViewTemplate,
  onEditTemplate,
  onDeleteTemplate,
}) {
  return (
    <TabsContent value="templates" className="mt-4">
      {loadingTemplates ? (
        <div className="flex items-center justify-center h-64">
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
            <Button onClick={onCreateTemplate}>
              <Plus className="w-4 h-4 mr-2" /> Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              onView={onViewTemplate}
              onEdit={onEditTemplate}
              onDelete={onDeleteTemplate}
            />
          ))}
        </div>
      )}
    </TabsContent>
  );
}
