import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Settings,
  Calculator,
  RefreshCw,
  Save,
  AlertTriangle,
  CheckCircle,
  Info,
  Building2,
  Percent,
  RotateCcw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const SettingsRiskCalculationPage = () => {
  const navigate = useNavigate();
  const [installations, setInstallations] = useState([]);
  const [selectedInstallation, setSelectedInstallation] = useState(null);
  const [settings, setSettings] = useState(null);
  const [originalSettings, setOriginalSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    fetchRiskSettings();
  }, []);

  const fetchRiskSettings = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/api/risk-settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInstallations(data);
        if (data.length > 0) {
          setSelectedInstallation(data[0]);
          setSettings({
            criticality_weight: data[0].criticality_weight,
            fmea_weight: data[0].fmea_weight,
            critical_threshold: data[0].critical_threshold,
            high_threshold: data[0].high_threshold,
            medium_threshold: data[0].medium_threshold
          });
          setOriginalSettings({
            criticality_weight: data[0].criticality_weight,
            fmea_weight: data[0].fmea_weight,
            critical_threshold: data[0].critical_threshold,
            high_threshold: data[0].high_threshold,
            medium_threshold: data[0].medium_threshold
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch risk settings:", error);
      toast.error("Failed to load risk settings");
    } finally {
      setLoading(false);
    }
  };

  const handleInstallationSelect = (inst) => {
    setSelectedInstallation(inst);
    setSettings({
      criticality_weight: inst.criticality_weight,
      fmea_weight: inst.fmea_weight,
      critical_threshold: inst.critical_threshold,
      high_threshold: inst.high_threshold,
      medium_threshold: inst.medium_threshold
    });
    setOriginalSettings({
      criticality_weight: inst.criticality_weight,
      fmea_weight: inst.fmea_weight,
      critical_threshold: inst.critical_threshold,
      high_threshold: inst.high_threshold,
      medium_threshold: inst.medium_threshold
    });
  };

  const handleWeightChange = (value) => {
    const criticalityWeight = value[0] / 100;
    const fmeaWeight = 1 - criticalityWeight;
    setSettings(prev => ({
      ...prev,
      criticality_weight: Math.round(criticalityWeight * 100) / 100,
      fmea_weight: Math.round(fmeaWeight * 100) / 100
    }));
  };

  const handleSave = async () => {
    if (!selectedInstallation) return;
    
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_URL}/api/risk-settings/${selectedInstallation.installation_id}?recalculate=true`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(settings)
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        toast.success(`Settings saved! ${data.recalculation?.threats_updated || 0} observations recalculated.`);
        setOriginalSettings({ ...settings });
        fetchRiskSettings(); // Refresh the list
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to save settings");
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedInstallation) return;
    
    if (!window.confirm("Reset risk settings to defaults? All observations will be recalculated.")) {
      return;
    }
    
    setRecalculating(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_URL}/api/risk-settings/${selectedInstallation.installation_id}?recalculate=true`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        toast.success("Settings reset to defaults");
        fetchRiskSettings(); // Refresh
      } else {
        toast.error("Failed to reset settings");
      }
    } catch (error) {
      toast.error("Failed to reset settings");
    } finally {
      setRecalculating(false);
    }
  };

  const handleRecalculate = async () => {
    if (!selectedInstallation) return;
    
    setRecalculating(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_URL}/api/risk-settings/${selectedInstallation.installation_id}/recalculate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        toast.success(`Recalculated ${data.threats_updated} observations, ${data.actions_updated} actions`);
      } else {
        toast.error("Failed to recalculate");
      }
    } catch (error) {
      toast.error("Failed to recalculate");
    } finally {
      setRecalculating(false);
    }
  };

  const hasChanges = settings && originalSettings && (
    settings.criticality_weight !== originalSettings.criticality_weight ||
    settings.fmea_weight !== originalSettings.fmea_weight ||
    settings.critical_threshold !== originalSettings.critical_threshold ||
    settings.high_threshold !== originalSettings.high_threshold ||
    settings.medium_threshold !== originalSettings.medium_threshold
  );

  // Preview risk calculation with current settings
  const previewRiskScore = (criticality, fmea) => {
    if (!settings) return 0;
    return Math.round((criticality * settings.criticality_weight) + (fmea * settings.fmea_weight));
  };

  const getRiskLevel = (score) => {
    if (!settings) return "Low";
    if (score >= settings.critical_threshold) return "Critical";
    if (score >= settings.high_threshold) return "High";
    if (score >= settings.medium_threshold) return "Medium";
    return "Low";
  };

  const getRiskColor = (level) => {
    switch (level) {
      case "Critical": return "bg-red-100 text-red-700 border-red-200";
      case "High": return "bg-orange-100 text-orange-700 border-orange-200";
      case "Medium": return "bg-yellow-100 text-yellow-700 border-yellow-200";
      default: return "bg-green-100 text-green-700 border-green-200";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/settings")}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back</span>
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-indigo-600" />
                  Risk Calculation Settings
                </h1>
                <p className="text-sm text-slate-500">Configure how risk scores are calculated per installation</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  Unsaved changes
                </Badge>
              )}
              <Button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save & Recalculate
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Installation Selector */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Installations
                </CardTitle>
                <CardDescription>Select an installation to configure</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {installations.map((inst) => (
                  <button
                    key={inst.installation_id}
                    onClick={() => handleInstallationSelect(inst)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedInstallation?.installation_id === inst.installation_id
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-medium text-slate-900">{inst.installation_name}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Weights: {Math.round(inst.criticality_weight * 100)}% / {Math.round(inst.fmea_weight * 100)}%
                    </div>
                  </button>
                ))}
                {installations.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No installations found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Settings Panel */}
          <div className="lg:col-span-2 space-y-6">
            {selectedInstallation && settings ? (
              <>
                {/* Weight Configuration */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Percent className="w-4 h-4" />
                      Risk Score Weightage
                    </CardTitle>
                    <CardDescription>
                      Adjust the balance between Equipment Criticality and FMEA/Business Risk
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-indigo-600">
                            {Math.round(settings.criticality_weight * 100)}%
                          </div>
                          <div className="text-sm text-slate-600">Criticality</div>
                        </div>
                        <div className="flex-1 px-6">
                          <Slider
                            value={[settings.criticality_weight * 100]}
                            onValueChange={handleWeightChange}
                            max={100}
                            min={0}
                            step={5}
                            className="w-full"
                          />
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-600">
                            {Math.round(settings.fmea_weight * 100)}%
                          </div>
                          <div className="text-sm text-slate-600">FMEA Risk</div>
                        </div>
                      </div>
                      
                      <div className="text-center text-sm text-slate-500 border-t pt-3 mt-3">
                        <strong>Formula:</strong> Risk Score = (Criticality × {settings.criticality_weight}) + (FMEA × {settings.fmea_weight})
                      </div>
                    </div>

                    {/* Info Box */}
                    <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
                      <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <strong>Criticality</strong> is based on equipment impact ratings (safety, production, environmental, reputation).
                        <br />
                        <strong>FMEA Risk</strong> is based on failure mode analysis (Severity × Occurrence × Detection).
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Preview Calculator */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Risk Score Preview</CardTitle>
                    <CardDescription>See how different values would calculate</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div className="font-medium text-slate-600">Criticality</div>
                      <div className="font-medium text-slate-600">FMEA</div>
                      <div className="font-medium text-slate-600">Score</div>
                      <div className="font-medium text-slate-600">Level</div>
                      
                      {[
                        { crit: 90, fmea: 80 },
                        { crit: 70, fmea: 60 },
                        { crit: 50, fmea: 40 },
                        { crit: 30, fmea: 20 },
                      ].map((example, idx) => {
                        const score = previewRiskScore(example.crit, example.fmea);
                        const level = getRiskLevel(score);
                        return (
                          <React.Fragment key={idx}>
                            <div className="py-2">{example.crit}</div>
                            <div className="py-2">{example.fmea}</div>
                            <div className="py-2 font-semibold">{score}</div>
                            <div className="py-2">
                              <Badge className={getRiskColor(level)}>{level}</Badge>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={handleRecalculate}
                      disabled={recalculating}
                      className="gap-2"
                    >
                      {recalculating ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Recalculate All
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      disabled={recalculating}
                      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Reset to Defaults
                    </Button>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="py-12">
                <CardContent className="text-center">
                  <Settings className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-700 mb-2">Select an Installation</h3>
                  <p className="text-sm text-slate-500">Choose an installation from the left to configure its risk calculation settings</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsRiskCalculationPage;
