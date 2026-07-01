import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { SUCCESS_READINESS_BASE } from "../config/nav";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";
import { usePermissions } from "../../../contexts/PermissionsContext";

const RECIPIENT_OPTIONS = [
  { value: "all_users", label: "All users" },
  { value: "roles", label: "Specific roles" },
  { value: "users", label: "Specific user IDs" },
];

const ROLE_OPTIONS = ["admin", "reliability_engineer", "maintenance", "operations", "viewer"];

export default function PulseSurveyCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("success_readiness", "write");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["success-readiness", "pulse-surveys", "templates"],
    queryFn: successReadinessAPI.getPulseTemplates,
    enabled: canWrite,
  });

  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [commentPrompt, setCommentPrompt] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [recipientType, setRecipientType] = useState("all_users");
  const [recipientRoles, setRecipientRoles] = useState([]);
  const [recipientUserIds, setRecipientUserIds] = useState("");

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.template_id === templateId),
    [templates, templateId]
  );

  const applyTemplate = (id) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.template_id === id);
    if (!tpl) return;
    setTitle(tpl.title || "");
    setDescription(tpl.description || "");
    setCommentPrompt(tpl.comment_prompt || "");
  };

  const buildRecipientRules = () => {
    if (recipientType === "roles") {
      return { type: "roles", roles: recipientRoles };
    }
    if (recipientType === "users") {
      return {
        type: "users",
        user_ids: recipientUserIds.split(",").map((s) => s.trim()).filter(Boolean),
      };
    }
    return { type: "all_users" };
  };

  const createMutation = useMutation({
    mutationFn: (payload) => successReadinessAPI.createPulseSurvey(payload),
    onSuccess: (survey) => {
      toast.success("Survey created");
      queryClient.invalidateQueries({ queryKey: ["success-readiness", "pulse-surveys"] });
      navigate(`${SUCCESS_READINESS_BASE}/pulse-surveys/${survey.id}`);
    },
    onError: (err) => toast.error(err?.response?.data?.detail || "Failed to create survey"),
  });

  const publishMutation = useMutation({
    mutationFn: async (payload) => {
      const survey = await successReadinessAPI.createPulseSurvey(payload);
      return successReadinessAPI.publishPulseSurvey(survey.id);
    },
    onSuccess: () => {
      toast.success("Survey published");
      queryClient.invalidateQueries({ queryKey: ["success-readiness", "pulse-surveys"] });
      navigate(`${SUCCESS_READINESS_BASE}/pulse-surveys`);
    },
    onError: (err) => toast.error(err?.response?.data?.detail || "Failed to publish survey"),
  });

  if (!canWrite) {
    return (
      <div className="p-6 text-center text-slate-500">
        You do not have permission to create pulse surveys.
      </div>
    );
  }

  if (isLoading) return <SuccessReadinessLoading />;

  const payload = {
    template_id: templateId || undefined,
    title: title || selectedTemplate?.title,
    description,
    comment_prompt: commentPrompt || selectedTemplate?.comment_prompt,
    due_date: dueDate || undefined,
    anonymous,
    recipient_rules: buildRecipientRules(),
    questions: selectedTemplate?.questions?.slice(0, 3),
  };

  const toggleRole = (role) => {
    setRecipientRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to={`${SUCCESS_READINESS_BASE}/pulse-surveys`}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Link>
        </Button>
        <h2 className="text-base font-semibold text-slate-900">New pulse survey</h2>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
        <div>
          <Label className="text-xs">Template</Label>
          <Select value={templateId} onValueChange={applyTemplate}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Choose a template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((tpl) => (
                <SelectItem key={tpl.template_id} value={tpl.template_id}>
                  {tpl.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-9" />
        </div>

        <div>
          <Label className="text-xs">Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
        </div>

        {selectedTemplate?.questions?.length > 0 && (
          <div>
            <Label className="text-xs">Questions (max 3)</Label>
            <ul className="mt-2 space-y-1 text-sm text-slate-600 list-disc pl-5">
              {selectedTemplate.questions.slice(0, 3).map((q) => (
                <li key={q.id}>{q.label}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <Label className="text-xs">Comment prompt</Label>
          <Input
            value={commentPrompt}
            onChange={(e) => setCommentPrompt(e.target.value)}
            className="mt-1 h-9"
            placeholder="What should we improve?"
          />
        </div>

        <div>
          <Label className="text-xs">Due date</Label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 h-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="anonymous"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="anonymous" className="text-sm">Anonymous responses</Label>
        </div>

        <div>
          <Label className="text-xs">Recipients</Label>
          <Select value={recipientType} onValueChange={setRecipientType}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECIPIENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {recipientType === "roles" && (
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                className={`px-2 py-1 rounded text-xs border ${
                  recipientRoles.includes(role)
                    ? "bg-indigo-50 border-indigo-200 text-indigo-800"
                    : "bg-white border-slate-200 text-slate-600"
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        )}

        {recipientType === "users" && (
          <div>
            <Label className="text-xs">User IDs (comma-separated)</Label>
            <Input
              value={recipientUserIds}
              onChange={(e) => setRecipientUserIds(e.target.value)}
              className="mt-1 h-9"
              placeholder="user-id-1, user-id-2"
            />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => createMutation.mutate(payload)}
            disabled={createMutation.isPending || publishMutation.isPending}
          >
            Save draft
          </Button>
          <Button
            onClick={() => publishMutation.mutate(payload)}
            disabled={createMutation.isPending || publishMutation.isPending}
          >
            <Send className="w-4 h-4 mr-1" />
            Publish now
          </Button>
        </div>
      </div>
    </div>
  );
}
