import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LayoutTemplate, Loader2, Plus, Trash2 } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { VisualManagementNav } from "../../components/visual-boards/VisualManagementNav";
import { VisualManagementPageLayout } from "../../components/visual-boards/VisualManagementPageLayout";
import { VMB_PAGE_TITLE_CLASS } from "../../components/visual-boards/visualManagementLayout";

const VisualBoardTemplatesPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["visual-board-templates"],
    queryFn: () => visualBoardAPI.listTemplates(),
  });

  const createBoardMutation = useMutation({
    mutationFn: (template) =>
      visualBoardAPI.createBoardFromTemplate({
        template_id: template.id,
        name: `${template.name} Copy`,
      }),
    onSuccess: (board) => {
      toast.success("Board created from template");
      navigate(`/visual-management/boards/${board.id}/edit`);
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Failed to create board"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => visualBoardAPI.deleteTemplate(id),
    onSuccess: () => {
      toast.success("Template deleted");
      queryClient.invalidateQueries({ queryKey: ["visual-board-templates"] });
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Failed to delete template"),
  });

  const templates = data?.items || [];

  return (
    <VisualManagementPageLayout>
      <VisualManagementNav />

      <div className="min-w-0">
        <h1 className={VMB_PAGE_TITLE_CLASS}>
          <LayoutTemplate className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 shrink-0" />
          Templates
        </h1>
        <p className="text-sm text-slate-500 mt-1 break-words">Start new boards from reusable layouts.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((tpl) => (
            <Card key={tpl.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{tpl.name}</CardTitle>
                  <Badge variant="secondary" className="capitalize">{tpl.board_type}</Badge>
                </div>
                <p className="text-xs text-slate-500">{tpl.description || `${(tpl.widgets || []).length} widgets`}</p>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button size="sm" onClick={() => createBoardMutation.mutate(tpl)} disabled={createBoardMutation.isPending}>
                  <Plus className="w-4 h-4 mr-1" />
                  Use Template
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(tpl.id)}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </VisualManagementPageLayout>
  );
};

export default VisualBoardTemplatesPage;
