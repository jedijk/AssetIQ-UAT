import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Camera, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SettingsSection, SettingsCard, SettingsRow } from "./SettingsPage";
import { onboardingAPI } from "../lib/apis/onboarding";

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "nl", label: "Nederlands (Dutch)" },
  { value: "de", label: "Deutsch (German)" },
];

export default function SettingsCompanyProfilePage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    name: "",
    default_language: "en",
    default_timezone: "UTC",
  });
  const [logoPreview, setLogoPreview] = useState(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["company-profile"],
    queryFn: onboardingAPI.getCompanyProfile,
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name || "",
      default_language: profile.default_language || "en",
      default_timezone: profile.default_timezone || "UTC",
    });
  }, [profile]);

  useEffect(() => {
    let objectUrl;
    if (!profile?.has_logo) {
      setLogoPreview(null);
      return undefined;
    }
    onboardingAPI
      .getCompanyLogoBlob()
      .then((blob) => {
        if (blob?.size) {
          objectUrl = URL.createObjectURL(blob);
          setLogoPreview(objectUrl);
        } else {
          setLogoPreview(null);
        }
      })
      .catch(() => setLogoPreview(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [profile?.has_logo, profile?.logo_updated_at]);

  const saveMutation = useMutation({
    mutationFn: () => onboardingAPI.updateCompanyProfile(form),
    onSuccess: () => {
      toast.success("Company profile saved");
      queryClient.invalidateQueries({ queryKey: ["company-profile"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to save company profile");
    },
  });

  const logoMutation = useMutation({
    mutationFn: (file) => onboardingAPI.uploadCompanyLogo(file),
    onSuccess: () => {
      toast.success("Company logo uploaded");
      queryClient.invalidateQueries({ queryKey: ["company-profile"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to upload logo");
    },
  });

  const onLogoSelected = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    logoMutation.mutate(file);
    event.target.value = "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <SettingsSection
      title="Company Profile"
      description="Your organization name, branding, language, and timezone used across AssetIQ"
    >
      <SettingsCard title="Branding" description="Logo appears on reports and customer-facing views (optional)">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative group">
            <div className="w-28 h-28 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
              {logoPreview ? (
                <img src={logoPreview} alt="Company logo" className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-10 h-10 text-slate-300" />
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={logoMutation.isPending}
              className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Upload company logo"
            >
              {logoMutation.isPending ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-white" />
              )}
            </button>
          </div>
          <div className="space-y-2 text-center sm:text-left">
            <p className="text-sm text-slate-600">Upload PNG, JPEG, WebP, or GIF (max 5 MB)</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={logoMutation.isPending}
            >
              {logoMutation.isPending ? "Uploading…" : "Upload logo"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={onLogoSelected}
            />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Organization" description="Tenant-wide defaults for your company">
        <div className="space-y-4">
          <SettingsRow label="Company name" description="Legal or operating name shown across the platform">
            <Input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full sm:w-72"
              placeholder="Your company name"
            />
          </SettingsRow>
          <SettingsRow label="Default language" description="Default language for new users and system copy">
            <Select
              value={form.default_language}
              onValueChange={(value) => setForm((prev) => ({ ...prev, default_language: value }))}
            >
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow label="Timezone" description="Used for scheduling and timestamps">
            <Select
              value={form.default_timezone}
              onValueChange={(value) => setForm((prev) => ({ ...prev, default_timezone: value }))}
            >
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim()}>
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save company profile
          </Button>
        </div>
      </SettingsCard>
    </SettingsSection>
  );
}
