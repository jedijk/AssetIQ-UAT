import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "../../../components/ui/switch";
import { Label } from "../../../components/ui/label";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";

export default function SuccessReadinessConfigurationPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["success-readiness", "configuration"],
    queryFn: successReadinessAPI.getConfiguration,
  });

  const updateMutation = useMutation({
    mutationFn: successReadinessAPI.updateConfiguration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["success-readiness", "configuration"] });
      queryClient.invalidateQueries({ queryKey: ["success-readiness", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["success-readiness", "kpis"] });
      toast.success("Configuration saved");
    },
    onError: () => toast.error("Failed to save configuration"),
  });

  if (isLoading) return <SuccessReadinessLoading />;
  if (error) return <div className="p-6 text-red-600">Failed to load configuration.</div>;

  const integrationsEnabled = data?.integrations_enabled !== false;

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Configuration</h2>
        <p className="text-sm text-slate-500 mt-1">
          Pillar weights, targets, and scope settings (owner only).
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="space-y-1">
            <Label htmlFor="integrations-enabled" className="text-sm font-medium text-slate-900">
              Integrations in scope
            </Label>
            <p className="text-xs text-slate-500">
              Turn off when external API connectors are not part of your rollout. Integration Health
              is excluded from scores when disabled.
            </p>
          </div>
          <Switch
            id="integrations-enabled"
            checked={integrationsEnabled}
            disabled={updateMutation.isPending}
            onCheckedChange={(checked) =>
              updateMutation.mutate({ integrations_enabled: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between gap-4 p-4 text-sm">
          <span className="text-slate-600">Notifications</span>
          <span className="font-medium text-slate-900">
            {data?.notification_enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 p-4 text-sm">
          <span className="text-slate-600">Targets locked</span>
          <span className="font-medium text-slate-900">
            {data?.targets_locked ? "Yes" : "No"}
          </span>
        </div>
      </div>

      {updateMutation.isPending && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Saving…
        </p>
      )}
    </div>
  );
}
