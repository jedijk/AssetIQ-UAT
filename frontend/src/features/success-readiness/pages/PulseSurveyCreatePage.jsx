import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Send, X } from "lucide-react";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../../components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Badge } from "../../../components/ui/badge";
import { usersAPI } from "../../../lib/api";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { SUCCESS_READINESS_BASE } from "../config/nav";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";
import { usePermissions } from "../../../contexts/PermissionsContext";
import { cn } from "../../../lib/utils";

const RECIPIENT_OPTIONS = [
  { value: "all_users", label: "All users" },
  { value: "roles", label: "Specific roles" },
  { value: "users", label: "Specific users" },
];

const ROLE_OPTIONS = ["admin", "reliability_engineer", "maintenance", "operations", "viewer"];

function PulseSurveyUserSelect({ users, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);

  const selectedUsers = users.filter((user) => selectedIds.includes(user.id));
  const label =
    selectedUsers.length === 0
      ? "Select users…"
      : selectedUsers.length === 1
        ? selectedUsers[0].name || selectedUsers[0].email
        : `${selectedUsers.length} users selected`;

  const toggleUser = (userId) => {
    onChange(
      selectedIds.includes(userId)
        ? selectedIds.filter((id) => id !== userId)
        : [...selectedIds, userId]
    );
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-9 w-full justify-between font-normal"
            data-testid="pulse-survey-user-select-trigger"
          >
            <span className="truncate">{label}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command
            filter={(value, search) => {
              const lc = (value || "").toLowerCase();
              return lc.includes((search || "").toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput placeholder="Search users…" data-testid="pulse-survey-user-select-search" />
            <CommandList>
              <CommandEmpty>No users found.</CommandEmpty>
              <CommandGroup>
                {users.map((user) => {
                  const selected = selectedIds.includes(user.id);
                  return (
                    <CommandItem
                      key={user.id}
                      value={`${user.name || ""}|${user.email || ""}|${user.role || ""}`}
                      onSelect={() => toggleUser(user.id)}
                      data-testid={`pulse-survey-user-option-${user.id}`}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{user.name || user.email}</span>
                        {(user.email || user.role) && (
                          <span className="truncate text-xs text-slate-500">
                            {[user.email, user.role].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedUsers.map((user) => (
            <Badge key={user.id} variant="secondary" className="gap-1 pr-1">
              {user.name || user.email}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-slate-300/60"
                onClick={() => toggleUser(user.id)}
                aria-label={`Remove ${user.name || user.email}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

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

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["users", "all"],
    queryFn: usersAPI.getAll,
    enabled: canWrite,
    staleTime: 5 * 60 * 1000,
  });

  const users = useMemo(() => {
    const rows = usersData?.users || [];
    return rows
      .filter((user) => user.is_active !== false)
      .sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));
  }, [usersData]);

  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [commentPrompt, setCommentPrompt] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [recipientType, setRecipientType] = useState("all_users");
  const [recipientRoles, setRecipientRoles] = useState([]);
  const [recipientUserIds, setRecipientUserIds] = useState([]);

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
        user_ids: recipientUserIds,
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

  if (isLoading || usersLoading) return <SuccessReadinessLoading />;

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

  const validateRecipients = () => {
    if (recipientType === "roles" && recipientRoles.length === 0) {
      toast.error("Select at least one role.");
      return false;
    }
    if (recipientType === "users" && recipientUserIds.length === 0) {
      toast.error("Select at least one user.");
      return false;
    }
    return true;
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
            <Label className="text-xs">Users</Label>
            <div className="mt-1">
              <PulseSurveyUserSelect
                users={users}
                selectedIds={recipientUserIds}
                onChange={setRecipientUserIds}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => {
              if (!validateRecipients()) return;
              createMutation.mutate(payload);
            }}
            disabled={createMutation.isPending || publishMutation.isPending}
          >
            Save draft
          </Button>
          <Button
            onClick={() => {
              if (!validateRecipients()) return;
              publishMutation.mutate(payload);
            }}
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
