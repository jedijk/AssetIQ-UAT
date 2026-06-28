import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useIsMobile } from "../hooks/useIsMobile";
import DesktopOnlyMessage from "../components/DesktopOnlyMessage";
import BackButton from "../components/BackButton";
import {
  Plug,
  Loader2,
  RefreshCw,
  Plus,
  Key,
  Copy,
  Ban,
  RotateCw,
  Activity,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { toast } from "sonner";
import { formatDate } from "../lib/dateUtils";
import {
  listExternalApiKeys,
  createExternalApiKey,
  updateExternalApiKey,
  revokeExternalApiKey,
  rotateExternalApiKey,
  getExternalApiKeyUsage,
} from "../lib/apis/externalApi";

function statusBadge(status) {
  const variants = {
    active: "default",
    disabled: "secondary",
    revoked: "destructive",
    unused: "outline",
    healthy: "default",
    degraded: "destructive",
  };
  return variants[status] || "outline";
}

export default function SettingsExternalApiPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyDescription, setNewKeyDescription] = useState("");
  const [createdKeyValue, setCreatedKeyValue] = useState(null);
  const [selectedKeyId, setSelectedKeyId] = useState(null);
  const [usageOpen, setUsageOpen] = useState(false);

  const isAdmin = user?.role === "owner" || user?.role === "admin";

  const keysQuery = useQuery({
    queryKey: ["external-api-keys"],
    queryFn: listExternalApiKeys,
    enabled: isAdmin,
  });

  const usageQuery = useQuery({
    queryKey: ["external-api-usage", selectedKeyId],
    queryFn: () => getExternalApiKeyUsage(selectedKeyId),
    enabled: isAdmin && Boolean(selectedKeyId) && usageOpen,
  });

  const createMutation = useMutation({
    mutationFn: createExternalApiKey,
    onSuccess: (data) => {
      setCreatedKeyValue(data.api_key);
      setNewKeyName("");
      setNewKeyDescription("");
      queryClient.invalidateQueries({ queryKey: ["external-api-keys"] });
      toast.success(t("settings.externalApi.createSuccess") || "API key created");
    },
    onError: (err) => {
      const detail = err.response?.data?.detail;
      toast.error(
        typeof detail === "string"
          ? detail
          : t("settings.externalApi.createFailed") || "Failed to create API key"
      );
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ keyId, enabled }) => updateExternalApiKey(keyId, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-api-keys"] });
      toast.success(t("settings.externalApi.updated") || "API key updated");
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || t("settings.externalApi.updateFailed"));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeExternalApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-api-keys"] });
      toast.success(t("settings.externalApi.revoked") || "API key revoked");
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || t("settings.externalApi.revokeFailed"));
    },
  });

  const rotateMutation = useMutation({
    mutationFn: (keyId) => rotateExternalApiKey(keyId),
    onSuccess: (data) => {
      setCreatedKeyValue(data.api_key);
      setCreateOpen(true);
      queryClient.invalidateQueries({ queryKey: ["external-api-keys"] });
      toast.success(t("settings.externalApi.rotated") || "API key rotated");
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || t("settings.externalApi.rotateFailed"));
    },
  });

  const copyKey = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("settings.externalApi.copied") || "Copied to clipboard");
    } catch {
      toast.error(t("settings.externalApi.copyFailed") || "Copy failed");
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          {t("settings.externalApi.accessRestricted") || "Admin or owner access required."}
        </p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <DesktopOnlyMessage
        title={t("settings.externalApi.desktopOnly") || "External API Access"}
      />
    );
  }

  const keys = keysQuery.data || [];

  return (
    <div className="space-y-6 p-6" data-testid="external-api-page">
      <div className="flex flex-wrap items-center gap-3">
        <BackButton fallbackPath="/settings" />
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Plug className="h-6 w-6" />
            {t("settings.externalApi.title") || "External API Access"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("settings.externalApi.subtitle") ||
              "Manage API keys for third-party observation ingestion"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => keysQuery.refetch()}
          disabled={keysQuery.isFetching}
        >
          {keysQuery.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">{t("settings.externalApi.refresh") || "Refresh"}</span>
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setCreatedKeyValue(null);
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("settings.externalApi.createKey") || "Create API Key"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.externalApi.endpointTitle") || "External endpoint"}</CardTitle>
          <CardDescription>
            {t("settings.externalApi.endpointDesc") ||
              "POST /api/v1/external/observations — authenticate with Bearer or X-API-Key header."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="text-sm bg-muted px-2 py-1 rounded">
            POST /api/v1/external/observations
          </code>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.externalApi.keysTitle") || "API keys"}</CardTitle>
          <CardDescription>
            {t("settings.externalApi.keysDesc") ||
              "Keys are shown once on create or rotate. Stored as SHA-256 hashes only."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keysQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("settings.externalApi.loading") || "Loading keys…"}
            </div>
          ) : keys.length === 0 ? (
            <p className="text-muted-foreground">
              {t("settings.externalApi.noKeys") || "No API keys yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.externalApi.name") || "Name"}</TableHead>
                  <TableHead>{t("settings.externalApi.prefix") || "Prefix"}</TableHead>
                  <TableHead>{t("settings.externalApi.status") || "Status"}</TableHead>
                  <TableHead>{t("settings.externalApi.lastUsed") || "Last used"}</TableHead>
                  <TableHead className="text-right">
                    {t("settings.externalApi.actions") || "Actions"}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{key.key_prefix}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadge(key.status)}>{key.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {key.last_used_at ? formatDate(key.last_used_at) : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedKeyId(key.id);
                          setUsageOpen(true);
                        }}
                      >
                        <Activity className="h-4 w-4" />
                      </Button>
                      {key.status !== "revoked" && (
                        <>
                          <Switch
                            checked={key.enabled}
                            onCheckedChange={(enabled) =>
                              toggleMutation.mutate({ keyId: key.id, enabled })
                            }
                            aria-label="Enable key"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => rotateMutation.mutate(key.id)}
                            disabled={rotateMutation.isPending}
                          >
                            <RotateCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeMutation.mutate(key.id)}
                            disabled={revokeMutation.isPending}
                          >
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreatedKeyValue(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {createdKeyValue
                ? t("settings.externalApi.keyCreated") || "API key created"
                : t("settings.externalApi.createKey") || "Create API key"}
            </DialogTitle>
            <DialogDescription>
              {createdKeyValue
                ? t("settings.externalApi.keyCreatedDesc") ||
                  "Copy this key now — it will not be shown again."
                : t("settings.externalApi.createKeyDesc") ||
                  "Create a tenant-scoped key with observations:create scope."}
            </DialogDescription>
          </DialogHeader>

          {createdKeyValue ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded border bg-muted p-3 font-mono text-sm break-all">
                <Key className="h-4 w-4 shrink-0" />
                {createdKeyValue}
              </div>
              <Button type="button" variant="outline" onClick={() => copyKey(createdKeyValue)}>
                <Copy className="h-4 w-4 mr-2" />
                {t("settings.externalApi.copyKey") || "Copy key"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="key-name">{t("settings.externalApi.name") || "Name"}</Label>
                <Input
                  id="key-name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="CMMS Integration"
                />
              </div>
              <div>
                <Label htmlFor="key-desc">
                  {t("settings.externalApi.description") || "Description"}
                </Label>
                <Input
                  id="key-desc"
                  value={newKeyDescription}
                  onChange={(e) => setNewKeyDescription(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {createdKeyValue ? (
              <Button onClick={() => setCreateOpen(false)}>
                {t("settings.externalApi.done") || "Done"}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  {t("common.cancel") || "Cancel"}
                </Button>
                <Button
                  onClick={() =>
                    createMutation.mutate({
                      name: newKeyName.trim(),
                      description: newKeyDescription.trim() || undefined,
                    })
                  }
                  disabled={!newKeyName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  {t("settings.externalApi.create") || "Create"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={usageOpen} onOpenChange={setUsageOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("settings.externalApi.usageTitle") || "Key usage"}</DialogTitle>
            <DialogDescription>
              {t("settings.externalApi.usageDesc") ||
                "Request counts, errors, and recent activity for this key."}
            </DialogDescription>
          </DialogHeader>
          {usageQuery.isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : usageQuery.data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Requests</p>
                  <p className="text-xl font-semibold">{usageQuery.data.total_requests}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Errors</p>
                  <p className="text-xl font-semibold">{usageQuery.data.total_errors}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Observations</p>
                  <p className="text-xl font-semibold">
                    {usageQuery.data.observations_created}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Health</p>
                  <Badge variant={statusBadge(usageQuery.data.health_status)}>
                    {usageQuery.data.health_status}
                  </Badge>
                </div>
              </div>
              {(usageQuery.data.recent_requests || []).length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>ms</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageQuery.data.recent_requests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell>{formatDate(req.created_at)}</TableCell>
                        <TableCell>{req.status_code}</TableCell>
                        <TableCell>{req.response_ms}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {req.external_reference || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
