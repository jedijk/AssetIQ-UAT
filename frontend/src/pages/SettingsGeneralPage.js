import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authAPI } from "../lib/api";
import { toast } from "sonner";
import {
  Globe,
  Clock,
  Palette,
  Bell,
  Save,
  Loader2
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SettingsSection, SettingsCard, SettingsRow } from "./SettingsPage";

// Timezone options
const TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

// Language options
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "nl", label: "Nederlands (Dutch)" },
  { value: "de", label: "Deutsch (German)" },
  { value: "fr", label: "Français (French)" },
];

export default function SettingsGeneralPage() {
  const { user, setUser } = useAuth();
  const { language, setLanguage } = useLanguage();
  const queryClient = useQueryClient();
  
  const [preferences, setPreferences] = useState({
    timezone: user?.preferences?.timezone || "UTC",
    language: language || "en",
    dateFormat: user?.preferences?.dateFormat || "DD/MM/YYYY",
    timeFormat: user?.preferences?.timeFormat || "24h",
    theme: user?.preferences?.theme || "light",
    notifications: {
      email: user?.preferences?.notifications?.email ?? true,
      push: user?.preferences?.notifications?.push ?? true,
      observationAlerts: user?.preferences?.notifications?.observationAlerts ?? true,
      taskReminders: user?.preferences?.notifications?.taskReminders ?? true,
    }
  });
  
  const [hasChanges, setHasChanges] = useState(false);

  const updatePreference = (key, value) => {
    setPreferences(prev => {
      const newPrefs = { ...prev };
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        newPrefs[parent] = { ...newPrefs[parent], [child]: value };
      } else {
        newPrefs[key] = value;
      }
      return newPrefs;
    });
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await authAPI.updateProfile({
        preferences: {
          timezone: preferences.timezone,
          dateFormat: preferences.dateFormat,
          timeFormat: preferences.timeFormat,
          theme: preferences.theme,
          notifications: preferences.notifications
        }
      });
      return response;
    },
    onSuccess: (data) => {
      setUser(prev => ({ ...prev, preferences: data.preferences || preferences }));
      setLanguage(preferences.language);
      setHasChanges(false);
      toast.success("Preferences saved successfully!");
      queryClient.invalidateQueries(["user"]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to save preferences");
    }
  });

  return (
    <SettingsSection
      title="General Settings"
      description="Customize your app experience and preferences"
    >
      {/* Language & Region */}
      <SettingsCard title="Language & Region" description="Set your preferred language and timezone">
        <div className="space-y-4">
          <SettingsRow 
            label="Language" 
            description="Select your preferred display language"
          >
            <Select 
              value={preferences.language} 
              onValueChange={(v) => updatePreference("language", v)}
            >
              <SelectTrigger className="w-48">
                <Globe className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map(lang => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
          
          <SettingsRow 
            label="Timezone" 
            description="Used for displaying dates and scheduling"
          >
            <Select 
              value={preferences.timezone} 
              onValueChange={(v) => updatePreference("timezone", v)}
            >
              <SelectTrigger className="w-64">
                <Clock className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
          
          <SettingsRow 
            label="Date Format" 
            description="How dates are displayed throughout the app"
          >
            <Select 
              value={preferences.dateFormat} 
              onValueChange={(v) => updatePreference("dateFormat", v)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          
          <SettingsRow 
            label="Time Format" 
            description="12-hour or 24-hour clock"
          >
            <Select 
              value={preferences.timeFormat} 
              onValueChange={(v) => updatePreference("timeFormat", v)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24-hour</SelectItem>
                <SelectItem value="12h">12-hour</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </div>
      </SettingsCard>

      {/* Appearance */}
      <SettingsCard title="Appearance" description="Customize how the app looks">
        <div className="space-y-4">
          <SettingsRow 
            label="Theme" 
            description="Choose light or dark mode"
          >
            <Select 
              value={preferences.theme} 
              onValueChange={(v) => updatePreference("theme", v)}
            >
              <SelectTrigger className="w-32">
                <Palette className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </div>
      </SettingsCard>

      {/* Notifications */}
      <SettingsCard title="Notifications" description="Configure how you receive alerts">
        <div className="space-y-4">
          <SettingsRow 
            label="Email Notifications" 
            description="Receive important updates via email"
          >
            <Switch 
              checked={preferences.notifications.email}
              onCheckedChange={(v) => updatePreference("notifications.email", v)}
            />
          </SettingsRow>
          
          <SettingsRow 
            label="Push Notifications" 
            description="Browser notifications for real-time alerts"
          >
            <Switch 
              checked={preferences.notifications.push}
              onCheckedChange={(v) => updatePreference("notifications.push", v)}
            />
          </SettingsRow>
          
          <SettingsRow 
            label="Observation Alerts" 
            description="Get notified about new high-risk observations"
          >
            <Switch 
              checked={preferences.notifications.observationAlerts}
              onCheckedChange={(v) => updatePreference("notifications.observationAlerts", v)}
            />
          </SettingsRow>
          
          <SettingsRow 
            label="Task Reminders" 
            description="Reminders for upcoming and overdue tasks"
          >
            <Switch 
              checked={preferences.notifications.taskReminders}
              onCheckedChange={(v) => updatePreference("notifications.taskReminders", v)}
            />
          </SettingsRow>
        </div>
      </SettingsCard>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end sticky bottom-0 bg-slate-50 py-4 -mx-6 px-6 border-t border-slate-200">
          <Button 
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="min-w-32"
          >
            {saveMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> Save Changes</>
            )}
          </Button>
        </div>
      )}
    </SettingsSection>
  );
}
