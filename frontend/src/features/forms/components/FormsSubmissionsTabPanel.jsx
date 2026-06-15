import { FileText, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { TabsContent } from "../../../components/ui/tabs";
import { SubmissionRow } from "../../../components/forms";

export function FormsSubmissionsTabPanel({
  loadingSubmissions,
  submissionsError,
  queryClient,
  submissions,
  templates,
}) {
  return (
    <TabsContent value="submissions" className="mt-4">
      {loadingSubmissions ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      ) : submissionsError ? (
        <Card className="py-12 border-red-200 bg-red-50">
          <CardContent className="text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-red-700 mb-2">Failed to load submissions</h3>
            <p className="text-sm text-red-500 mb-4">Please check your connection and try again</p>
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["form-submissions"] })}
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : submissions.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-2">No submissions yet</h3>
            <p className="text-sm text-slate-500">Submissions will appear here when forms are filled</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {submissions.map((submission) => {
            const tpl = templates.find(
              (t) => t.id === (submission.template_id || submission.form_template_id)
            );
            return (
              <SubmissionRow
                key={submission.id}
                submission={submission}
                labelConfig={tpl?.label_print_config || null}
              />
            );
          })}
        </div>
      )}
    </TabsContent>
  );
}
