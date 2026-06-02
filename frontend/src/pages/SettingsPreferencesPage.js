import { useState, useEffect, useCallback } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { updateCachedPreferences } from "../lib/dateUtils";
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
  ArrowLeft,
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

import { preferencesAPI } from "../lib/api";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [detectedTimezone] = useState(detectTimezone);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  
  const isMobile = useIsMobile();

  // Fetch preferences
  const { data: preferences, isLoading: prefsLoading } = useQuery({
    queryKey: ["user-preferences"],
    queryFn: preferencesAPI.getPreferences,
    onSuccess: (data) => {
      // Cache preferences for date formatting across the app
      updateCachedPreferences(data);
    },
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["user-preferences"] });
      // Update cached preferences for date formatting across the app
      updateCachedPreferences(data);
      toast.success(t("settings.preferences.savedSuccess"));
    },
    onError: () => {
      toast.error(t("settings.preferences.saveFailed"));
    },
  });

  const updatePreferences = useCallback(
    (payload) => updateMutation.mutate(payload),
    [updateMutation]
  );

  // Auto-save detected timezone if auto-detect is enabled and timezone differs
  useEffect(() => {
    if (!prefsLoading && preferences) {
      const autoDetectEnabled = preferences.timezone_auto_detect !== false; // default to true
      const currentSavedTimezone = preferences.timezone;
      
      // If auto-detect is enabled and detected timezone differs from saved, update it
      if (autoDetectEnabled && detectedTimezone && detectedTimezone !== currentSavedTimezone) {
        console.log(`Auto-updating timezone from ${currentSavedTimezone} to ${detectedTimezone}`);
        updatePreferences({
          timezone: detectedTimezone,
          timezone_auto_detect: true,
        });
      }
    }
  }, [prefsLoading, preferences, detectedTimezone, updatePreferences]);

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
    t("settings.preferences.selectTimezone");

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
        {/* Mobile Header with Back Button */}
        {isMobile && (
          <div className="flex items-center gap-3 mb-4">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-bold text-slate-900">{t("settings.preferences.title")}</h1>
          </div>
        )}
        
        {/* Desktop Header */}
        {!isMobile && (
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">
              {t("settings.preferences.title")}
            </h1>
            <p className="text-slate-500">
              {t("settings.preferences.subtitle")}
            </p>
          </div>
        )}

        {/* Current Time Display */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 mb-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-1">{t("settings.preferences.currentTime")}</p>
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
                  {t("settings.preferences.timezone")}
                </h2>
                <p className="text-sm text-slate-500">
                  {t("settings.preferences.timezoneDesc")}
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
                  {t("settings.preferences.autoDetectTimezone")}
                </Label>
                <p className="text-xs text-slate-500 mt-1">
                  {t("settings.preferences.detected").replace("{timezone}", detectedTimezone)}
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
                {t("settings.preferences.selectTimezoneManually")}
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
                      placeholder={t("settings.preferences.searchTimezone")}
                      value={timezoneSearch}
                      onValueChange={setTimezoneSearch}
                    />
                    <CommandList>
                      <CommandEmpty>{t("settings.preferences.noTimezoneFound")}</CommandEmpty>
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
                  {t("settings.preferences.disableAutoDetectHint")}
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
                  {t("settings.preferences.dateTimeFormat")}
                </h2>
                <p className="text-sm text-slate-500">
                  {t("settings.preferences.dateTimeFormatDesc")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Time Format */}
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-2 block">
                  {t("settings.preferences.timeFormat")}
                </Label>
                <Select
                  value={preferences?.time_format || "24h"}
                  onValueChange={handleTimeFormatChange}
                >
                  <SelectTrigger data-testid="time-format-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">{t("settings.preferences.timeFormat24h")}</SelectItem>
                    <SelectItem value="12h">{t("settings.preferences.timeFormat12h")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Format */}
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-2 block">
                  {t("settings.preferences.dateFormat")}
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
                  {t("settings.preferences.language")}
                </h2>
                <p className="text-sm text-slate-500">
                  {t("settings.preferences.languageDesc")}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-400">
              {t("settings.preferences.languageHint")}
            </p>
          </div>
        </div>

        {/* Save Indicator */}
        {updateMutation.isPending && (
          <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            {t("common.saving")}
          </div>
        )}
      </motion.div>
    </div>
  );
}
