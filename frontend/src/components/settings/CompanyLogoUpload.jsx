import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { SettingsCard } from "../../pages/SettingsPage";
import { onboardingAPI } from "../../lib/apis/onboarding";

export default function CompanyLogoUpload() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [logoPreview, setLogoPreview] = useState(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["company-profile"],
    queryFn: onboardingAPI.getCompanyProfile,
  });

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
      <SettingsCard title="Company logo" description="Organization branding for reports and customer-facing views">
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard title="Company logo" description="Organization branding for reports and customer-facing views">
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
          <p className="text-sm text-slate-600">
            {profile?.name ? (
              <>
                Logo for <span className="font-medium text-slate-800">{profile.name}</span>
              </>
            ) : (
              "Upload your organization logo"
            )}
          </p>
          <p className="text-xs text-slate-500">PNG, JPEG, WebP, or GIF · max 5 MB</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={logoMutation.isPending}
          >
            {logoMutation.isPending ? "Uploading…" : logoPreview ? "Replace logo" : "Upload logo"}
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
  );
}
