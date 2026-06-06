import { User, Camera, Briefcase, Loader2, Save, Gauge } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "../ui/avatar";
import { Switch } from "../ui/switch";
import ImageEditor from "../ImageEditor";
import { useLanguage } from "../../contexts/LanguageContext";

export default function ProfileEditDialog({
  open,
  onOpenChange,
  user,
  avatarUrl,
  profileForm,
  setProfileForm,
  profileLiteModeForced,
  onLiteModeChange,
  isSavingProfile,
  isUploadingAvatar,
  onSaveProfile,
  profileFileInputRef,
  onProfileAvatarSelect,
  imageEditorOpen,
  onImageEditorClose,
  selectedImageSrc,
  onEditedImageSave,
}) {
  const { t } = useLanguage();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {t("profile.editProfile") || "Edit Profile"}
            </DialogTitle>
            <DialogDescription>
              {t("profile.editDescription") || "Update your profile information and photo"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center gap-4">
              <div className="relative group">
                <Avatar className="h-24 w-24 border-4 border-white shadow-lg">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={user?.name} className="object-cover" />}
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-2xl font-bold">
                    {user?.name?.split(" ").map((n) => n.charAt(0)).join("").toUpperCase().slice(0, 2) || "U"}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => profileFileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
                  title={t("profile.changePhoto") || "Change Photo"}
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </button>
              </div>
              <input
                ref={profileFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onProfileAvatarSelect}
                data-testid="profile-avatar-input"
              />
              <button
                onClick={() => profileFileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-slate-400"
              >
                {isUploadingAvatar
                  ? t("profile.uploading") || "Uploading..."
                  : t("profile.changePhoto") || "Change Photo"}
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name" className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-400" />
                  {t("userManagement.name") || "Name"}
                </Label>
                <Input
                  id="profile-name"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={t("userManagement.enterName") || "Enter your name"}
                  data-testid="profile-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-position" className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-slate-400" />
                  {t("userManagement.position") || "Position"}
                </Label>
                <Input
                  id="profile-position"
                  value={profileForm.position}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, position: e.target.value }))}
                  placeholder={t("userManagement.enterPosition") || "Enter your position"}
                  data-testid="profile-position-input"
                />
              </div>
            </div>

            {user?.role === "owner" && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 pr-2">
                    <Label htmlFor="profile-lite-mode" className="flex items-center gap-2 text-slate-900 cursor-pointer">
                      <Gauge className="w-4 h-4 text-slate-500 shrink-0" aria-hidden />
                      {t("profile.liteMode") || "Lite performance mode"}
                    </Label>
                    <p id="profile-lite-mode-desc" className="text-xs text-slate-500 leading-snug">
                      {t("profile.liteModeHelp") ||
                        "Applies on this browser only. Turning off forces full mode on this device."}
                    </p>
                  </div>
                  <Switch
                    id="profile-lite-mode"
                    checked={profileLiteModeForced}
                    onCheckedChange={onLiteModeChange}
                    aria-describedby="profile-lite-mode-desc"
                    data-testid="profile-lite-mode-switch"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSavingProfile}>
              {t("common.cancel") || "Cancel"}
            </Button>
            <Button
              onClick={onSaveProfile}
              disabled={isSavingProfile}
              className="gap-2"
              data-testid="save-profile-button"
            >
              {isSavingProfile ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("common.saving") || "Saving..."}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {t("common.save") || "Save Changes"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageEditor
        open={imageEditorOpen}
        onClose={onImageEditorClose}
        imageSrc={selectedImageSrc}
        onSave={onEditedImageSave}
        aspectRatio={1}
        title={t("profile.editPhoto") || "Edit Photo"}
      />
    </>
  );
}
