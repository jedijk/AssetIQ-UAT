import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authAPI } from "../lib/api";
import { toast } from "sonner";
import {
  Bell,
  Mail,
  MessageSquare,
  AlertTriangle,
  ClipboardCheck,
  Calendar,
  Activity,
  Save,
  Loader2,
  Smartphone
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SettingsSection, SettingsCard, SettingsRow } from "./SettingsPage";

// Notification frequency options
const FREQUENCY_OPTIONS = [
  { value: "instant", label: "Instant" },
  { value: "hourly", label: "Hourly digest" },
  { value: "daily", label: "Daily digest" },
  { value: "weekly", label: "Weekly digest" },
];

export default function SettingsNotificationsPage() {
  const { user, setUser } = useAuth();
  const queryClient = useQueryClient();
  
  const [settings, setSettings] = useState({
    // Email notifications
    emailEnabled: user?.preferences?.notifications?.email ?? true,
    emailFrequency: user?.preferences?.notifications?.emailFrequency || "instant",
    
    // Push notifications
    pushEnabled: user?.preferences?.notifications?.push ?? true,
    
    // Notification types
    observationAlerts: user?.preferences?.notifications?.observationAlerts ?? true,
    highRiskAlerts: user?.preferences?.notifications?.highRiskAlerts ?? true,
    taskReminders: user?.preferences?.notifications?.taskReminders ?? true,
    taskAssignments: user?.preferences?.notifications?.taskAssignments ?? true,
    taskOverdue: user?.preferences?.notifications?.taskOverdue ?? true,
    formSubmissions: user?.preferences?.notifications?.formSubmissions ?? false,
    systemUpdates: user?.preferences?.notifications?.systemUpdates ?? true,
    weeklyReports: user?.preferences?.notifications?.weeklyReports ?? true,
  });
  
  const [hasChanges, setHasChanges] = useState(false);

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await authAPI.updateProfile({
        preferences: {
          ...user?.preferences,
          notifications: {
            email: settings.emailEnabled,
            emailFrequency: settings.emailFrequency,
            push: settings.pushEnabled,
            observationAlerts: settings.observationAlerts,
            highRiskAlerts: settings.highRiskAlerts,
            taskReminders: settings.taskReminders,
            taskAssignments: settings.taskAssignments,
            taskOverdue: settings.taskOverdue,
            formSubmissions: settings.formSubmissions,
            systemUpdates: settings.systemUpdates,
            weeklyReports: settings.weeklyReports,
          }
        }
      });
      return response;
    },
    onSuccess: (data) => {
      setUser(prev => ({ 
        ...prev, 
        preferences: {
          ...prev?.preferences,
          notifications: data.preferences?.notifications || settings
        }
      }));
      setHasChanges(false);
      toast.success("Notification settings saved!");
      queryClient.invalidateQueries(["user"]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to save settings");
    }
  });

  return (
    <SettingsSection
      title="Notifications"
      description="Configure how and when you receive alerts and updates"
    >
      {/* Notification Channels */}
      <SettingsCard 
        title="Notification Channels" 
        description="Choose how you want to receive notifications"
      >
        <div className="space-y-4">
          <SettingsRow 
            label="Email Notifications" 
            description="Receive notifications via email"
          >
            <div className="flex items-center gap-3">
              <Select 
                value={settings.emailFrequency} 
                onValueChange={(v) => updateSetting("emailFrequency", v)}
                disabled={!settings.emailEnabled}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch 
                checked={settings.emailEnabled}
                onCheckedChange={(v) => updateSetting("emailEnabled", v)}
              />
            </div>
          </SettingsRow>
          
          <SettingsRow 
            label="Push Notifications" 
            description="Browser and mobile push notifications"
          >
            <Switch 
              checked={settings.pushEnabled}
              onCheckedChange={(v) => updateSetting("pushEnabled", v)}
            />
          </SettingsRow>
        </div>
      </SettingsCard>

      {/* Observation Alerts */}
      <SettingsCard 
        title="Observation Alerts" 
        description="Notifications about equipment observations and issues"
      >
        <div className="space-y-4">
          <SettingsRow 
            label="New Observations" 
            description="Get notified when new observations are reported"
          >
            <Switch 
              checked={settings.observationAlerts}
              onCheckedChange={(v) => updateSetting("observationAlerts", v)}
            />
          </SettingsRow>
          
          <SettingsRow 
            label="High-Risk Alerts" 
            description="Immediate alerts for high-risk or critical observations"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">Priority</span>
              <Switch 
                checked={settings.highRiskAlerts}
                onCheckedChange={(v) => updateSetting("highRiskAlerts", v)}
              />
            </div>
          </SettingsRow>
        </div>
      </SettingsCard>

      {/* Task Notifications */}
      <SettingsCard 
        title="Task Notifications" 
        description="Stay updated on your tasks and assignments"
      >
        <div className="space-y-4">
          <SettingsRow 
            label="Task Assignments" 
            description="When a task is assigned to you"
          >
            <Switch 
              checked={settings.taskAssignments}
              onCheckedChange={(v) => updateSetting("taskAssignments", v)}
            />
          </SettingsRow>
          
          <SettingsRow 
            label="Task Reminders" 
            description="Reminders for upcoming task deadlines"
          >
            <Switch 
              checked={settings.taskReminders}
              onCheckedChange={(v) => updateSetting("taskReminders", v)}
            />
          </SettingsRow>
          
          <SettingsRow 
            label="Overdue Tasks" 
            description="Alerts when tasks become overdue"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Important</span>
              <Switch 
                checked={settings.taskOverdue}
                onCheckedChange={(v) => updateSetting("taskOverdue", v)}
              />
            </div>
          </SettingsRow>
        </div>
      </SettingsCard>

      {/* Other Notifications */}
      <SettingsCard 
        title="Other Notifications" 
        description="Additional notification preferences"
      >
        <div className="space-y-4">
          <SettingsRow 
            label="Form Submissions" 
            description="When forms are submitted for your equipment"
          >
            <Switch 
              checked={settings.formSubmissions}
              onCheckedChange={(v) => updateSetting("formSubmissions", v)}
            />
          </SettingsRow>
          
          <SettingsRow 
            label="System Updates" 
            description="Important system announcements and updates"
          >
            <Switch 
              checked={settings.systemUpdates}
              onCheckedChange={(v) => updateSetting("systemUpdates", v)}
            />
          </SettingsRow>
          
          <SettingsRow 
            label="Weekly Reports" 
            description="Weekly summary of activity and metrics"
          >
            <Switch 
              checked={settings.weeklyReports}
              onCheckedChange={(v) => updateSetting("weeklyReports", v)}
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
