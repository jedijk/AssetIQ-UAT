import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBackendUrl } from "../lib/apiConfig";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Globe,
  Clock,
  Calendar,
  Check,
  RefreshCw,
  MapPin,
  ChevronDown,
  Search,
  Languages,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";

const API_URL = getBackendUrl();

// API functions
const preferencesAPI = {
  getPreferences: async () => {
    const response = await fetch(`${API_URL}/api/users/me/preferences`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) throw new Error("Failed to fetch preferences");
    return response.json();
  },
  updatePreferences: async (data) => {
    const response = await fetch(`${API_URL}/api/users/me/preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to update preferences");
    return response.json();
  },
  getTimezones: async () => {
    const response = await fetch(`${API_URL}/api/timezones`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) throw new Error("Failed to fetch timezones");
    return response.json();
  },
};

// Detect browser timezone
const detectTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
};

// Get current time in a timezone
const getCurrentTimeInTimezone = (timezone) => {
  try {
    return new Date().toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "--:--";
  }
};

export default function SettingsPreferencesPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [detectedTimezone] = useState(detectTimezone);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const [currentTime, setCurrentTime] = useState("");

  // Fetch preferences
  const { data: preferences, isLoading: prefsLoading } = useQuery({
    queryKey: ["user-preferences"],
    queryFn: preferencesAPI.getPreferences,
  });

  // Fetch available timezones
  const { data: timezonesData } = useQuery({
    queryKey: ["timezones"],
    queryFn: preferencesAPI.getTimezones,
  });

  const timezones = timezonesData?.timezones || [];

  // Update preferences mutation
  const updateMutation = useMutation({
    mutationFn: preferencesAPI.updatePreferences,
    onSuccess: () => {
      queryClient.invalidateQueries(["user-preferences"]);
      toast.success("Preferences saved successfully");
    },
    onError: () => {
      toast.error("Failed to save preferences");
    },
  });

  // Update current time display
  useEffect(() => {
    const updateTime = () => {
      const tz = preferences?.timezone || detectedTimezone;
      setCurrentTime(getCurrentTimeInTimezone(tz));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [preferences?.timezone, detectedTimezone]);

  // Handle auto-detect toggle
  const handleAutoDetectToggle = (enabled) => {
    if (enabled) {
      // Enable auto-detect and set to detected timezone
      updateMutation.mutate({
        timezone_auto_detect: true,
        timezone: detectedTimezone,
      });
    } else {
      // Disable auto-detect
      updateMutation.mutate({
        timezone_auto_detect: false,
      });
    }
  };

  // Handle manual timezone selection
  const handleTimezoneChange = (value) => {
    updateMutation.mutate({
      timezone: value,
      timezone_auto_detect: false,
    });
    setTimezoneOpen(false);
  };

  // Handle time format change
  const handleTimeFormatChange = (value) => {
    updateMutation.mutate({ time_format: value });
  };

  // Handle date format change
  const handleDateFormatChange = (value) => {
    updateMutation.mutate({ date_format: value });
  };

  // Filter timezones based on search
  const filteredTimezones = timezones.filter(
    (tz) =>
      tz.label.toLowerCase().includes(timezoneSearch.toLowerCase()) ||
      tz.value.toLowerCase().includes(timezoneSearch.toLowerCase())
  );

  // Get selected timezone label
  const selectedTimezoneLabel =
    timezones.find((tz) => tz.value === preferences?.timezone)?.label ||
    preferences?.timezone ||
    "Select timezone";

  if (prefsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">
            Preferences
          </h1>
          <p className="text-slate-500">
            Customize your time zone and display settings
          </p>
        </div>

        {/* Current Time Display */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 mb-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-1">Current Time</p>
              <p className="text-4xl font-bold font-mono">{currentTime}</p>
              <p className="text-blue-200 text-sm mt-2 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {preferences?.timezone || detectedTimezone}
              </p>
            </div>
            <Clock className="w-16 h-16 text-blue-300 opacity-50" />
          </div>
        </div>

        {/* Settings Cards */}
        <div className="space-y-6">
          {/* Timezone Settings */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Globe className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  Time Zone
                </h2>
                <p className="text-sm text-slate-500">
                  Set your preferred time zone for displaying dates and times
                </p>
              </div>
            </div>

            {/* Auto-detect Toggle */}
            <div className="flex items-center justify-between py-4 border-b border-slate-100">
              <div>
                <Label
                  htmlFor="auto-detect"
                  className="text-sm font-medium text-slate-700"
                >
                  Auto-detect time zone
                </Label>
                <p className="text-xs text-slate-500 mt-1">
                  Detected: {detectedTimezone}
                </p>
              </div>
              <Switch
                id="auto-detect"
                checked={preferences?.timezone_auto_detect ?? true}
                onCheckedChange={handleAutoDetectToggle}
                data-testid="timezone-auto-detect-switch"
              />
            </div>

            {/* Manual Timezone Selection */}
            <div className="py-4">
              <Label className="text-sm font-medium text-slate-700 mb-2 block">
                Select time zone manually
              </Label>
              <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={timezoneOpen}
                    className="w-full justify-between text-left font-normal"
                    disabled={preferences?.timezone_auto_detect}
                    data-testid="timezone-select-trigger"
                  >
                    <span className="truncate">{selectedTimezoneLabel}</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search timezone..."
                      value={timezoneSearch}
                      onValueChange={setTimezoneSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No timezone found.</CommandEmpty>
                      <CommandGroup className="max-h-64 overflow-auto">
                        {filteredTimezones.map((tz) => (
                          <CommandItem
                            key={tz.value}
                            value={tz.value}
                            onSelect={() => handleTimezoneChange(tz.value)}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              {preferences?.timezone === tz.value && (
                                <Check className="w-4 h-4 text-blue-600" />
                              )}
                              <span>{tz.label}</span>
                            </div>
                            <span className="text-xs text-slate-400">
                              {tz.offset}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {preferences?.timezone_auto_detect && (
                <p className="text-xs text-slate-400 mt-2">
                  Disable auto-detect to select manually
                </p>
              )}
            </div>
          </div>

          {/* Date & Time Format */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  Date & Time Format
                </h2>
                <p className="text-sm text-slate-500">
                  Choose how dates and times are displayed
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Time Format */}
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-2 block">
                  Time format
                </Label>
                <Select
                  value={preferences?.time_format || "24h"}
                  onValueChange={handleTimeFormatChange}
                >
                  <SelectTrigger data-testid="time-format-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24-hour (14:30)</SelectItem>
                    <SelectItem value="12h">12-hour (2:30 PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Format */}
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-2 block">
                  Date format
                </Label>
                <Select
                  value={preferences?.date_format || "YYYY-MM-DD"}
                  onValueChange={handleDateFormatChange}
                >
                  <SelectTrigger data-testid="date-format-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YYYY-MM-DD">2026-04-08</SelectItem>
                    <SelectItem value="DD/MM/YYYY">08/04/2026</SelectItem>
                    <SelectItem value="MM/DD/YYYY">04/08/2026</SelectItem>
                    <SelectItem value="DD-MM-YYYY">08-04-2026</SelectItem>
                    <SelectItem value="DD MMM YYYY">08 Apr 2026</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Language (Future) */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm opacity-60">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Languages className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  Language
                </h2>
                <p className="text-sm text-slate-500">
                  Language is controlled via the main menu
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-400">
              Use the language selector in the navigation menu to change the
              interface language.
            </p>
          </div>
        </div>

        {/* Save Indicator */}
        {updateMutation.isPending && (
          <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Saving...
          </div>
        )}
      </motion.div>
    </div>
  );
}
