/**
 * TranslationGeneratorModal
 * Modal for batch generating translations for failure modes and equipment types
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "../../contexts/LanguageContext";
import { Globe, Loader2, Check, AlertCircle, Sparkles, Languages } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Progress } from "../ui/progress";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import translationsAPI from "../../lib/apis/translations";

// Entity types that can be translated
const TRANSLATABLE_ENTITIES = [
  { type: "failure_mode", label: "Failure Modes", labelDe: "Fehlermodi", labelNl: "Faalmodi" },
  { type: "equipment_type", label: "Equipment Types", labelDe: "Anlagentypen", labelNl: "Apparaattypen" },
  { type: "maintenance_task_template", label: "Maintenance Tasks", labelDe: "Wartungsaufgaben", labelNl: "Onderhoudstaken" },
];

// Target languages (excluding English as source)
const TARGET_LANGUAGES = [
  { code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "🇳🇱" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
];

export default function TranslationGeneratorModal({ 
  open, 
  onOpenChange,
  failureModes = [],
  equipmentTypes = [],
}) {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  
  const [selectedEntities, setSelectedEntities] = useState(["failure_mode"]);
  const [selectedLanguages, setSelectedLanguages] = useState(["nl", "de"]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentItem: "" });
  const [results, setResults] = useState(null);

  // Get counts for each entity type
  const entityCounts = {
    failure_mode: failureModes.length,
    equipment_type: equipmentTypes.length,
    maintenance_task_template: 0, // Would need to fetch from strategies
  };

  const totalItems = selectedEntities.reduce((sum, type) => sum + (entityCounts[type] || 0), 0);
  const totalTranslations = totalItems * selectedLanguages.length;

  const toggleEntity = (type) => {
    setSelectedEntities(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const toggleLanguage = (code) => {
    setSelectedLanguages(prev =>
      prev.includes(code)
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  const handleGenerate = async () => {
    if (selectedEntities.length === 0 || selectedLanguages.length === 0) {
      toast.error("Please select at least one entity type and one language");
      return;
    }

    setIsGenerating(true);
    setProgress({ current: 0, total: totalTranslations, currentItem: "" });
    setResults(null);

    const allResults = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    try {
      // Process each selected entity type
      for (const entityType of selectedEntities) {
        let entities = [];
        
        if (entityType === "failure_mode") {
          entities = failureModes;
        } else if (entityType === "equipment_type") {
          entities = equipmentTypes;
        }

        // Process in batches of 5 to avoid overwhelming the API
        const batchSize = 5;
        for (let i = 0; i < entities.length; i += batchSize) {
          const batch = entities.slice(i, i + batchSize);
          const entityIds = batch.map(e => e.id);

          setProgress(prev => ({
            ...prev,
            currentItem: `Translating ${entityType.replace("_", " ")}s (${i + 1}-${Math.min(i + batchSize, entities.length)} of ${entities.length})...`
          }));

          try {
            const response = await translationsAPI.generateTranslations({
              entity_type: entityType,
              entity_ids: entityIds,
              target_languages: selectedLanguages,
              fields: ["name", "description", "effects", "causes", "recommended_actions"],
              use_dictionary: true,
            });

            if (response.success) {
              allResults.success += response.job?.translations_created || batch.length * selectedLanguages.length;
            } else {
              allResults.failed += batch.length * selectedLanguages.length;
            }
          } catch (error) {
            console.error("Translation batch failed:", error);
            allResults.failed += batch.length * selectedLanguages.length;
            allResults.errors.push(`${entityType}: ${error.message}`);
          }

          setProgress(prev => ({
            ...prev,
            current: prev.current + (batch.length * selectedLanguages.length),
          }));

          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setResults(allResults);
      
      if (allResults.success > 0) {
        toast.success(`Generated ${allResults.success} translations successfully!`);
        // Invalidate translation queries
        queryClient.invalidateQueries({ queryKey: ["entity-translation"] });
      }
      
      if (allResults.failed > 0) {
        toast.error(`${allResults.failed} translations failed`);
      }

    } catch (error) {
      console.error("Translation generation failed:", error);
      toast.error("Translation generation failed: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    if (!isGenerating) {
      setResults(null);
      setProgress({ current: 0, total: 0, currentItem: "" });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="w-5 h-5 text-blue-600" />
            {language === "de" ? "Übersetzungen generieren" : 
             language === "nl" ? "Vertalingen genereren" : 
             "Generate Translations"}
          </DialogTitle>
          <DialogDescription>
            {language === "de" 
              ? "KI-Übersetzungen für Bibliotheksinhalte in mehrere Sprachen generieren"
              : language === "nl"
              ? "Genereer AI-vertalingen voor bibliotheekinhoud naar meerdere talen"
              : "Generate AI translations for library content into multiple languages"}
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-6 py-4">
            {/* Entity Type Selection */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                {language === "de" ? "Zu übersetzende Inhalte" : 
                 language === "nl" ? "Te vertalen inhoud" : 
                 "Content to Translate"}
              </label>
              <div className="space-y-2">
                {TRANSLATABLE_ENTITIES.map((entity) => (
                  <button
                    key={entity.type}
                    onClick={() => toggleEntity(entity.type)}
                    disabled={entityCounts[entity.type] === 0 || isGenerating}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      selectedEntities.includes(entity.type)
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    } ${entityCounts[entity.type] === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      {selectedEntities.includes(entity.type) ? (
                        <Check className="w-4 h-4 text-blue-600" />
                      ) : (
                        <div className="w-4 h-4 border rounded" />
                      )}
                      <span>
                        {language === "de" ? entity.labelDe : 
                         language === "nl" ? entity.labelNl : 
                         entity.label}
                      </span>
                    </span>
                    <Badge variant="secondary">{entityCounts[entity.type]}</Badge>
                  </button>
                ))}
              </div>
            </div>

            {/* Language Selection */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                {language === "de" ? "Zielsprachen" : 
                 language === "nl" ? "Doeltalen" : 
                 "Target Languages"}
              </label>
              <div className="flex gap-2">
                {TARGET_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => toggleLanguage(lang.code)}
                    disabled={isGenerating}
                    className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                      selectedLanguages.includes(lang.code)
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-xl">{lang.flag}</span>
                    <span>{lang.nativeName}</span>
                    {selectedLanguages.includes(lang.code) && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm text-slate-600">
                {language === "de" ? "Zu generierende Übersetzungen:" : 
                 language === "nl" ? "Te genereren vertalingen:" : 
                 "Translations to generate:"}
                <span className="font-semibold text-slate-900 ml-2">{totalTranslations}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {totalItems} {language === "de" ? "Elemente" : language === "nl" ? "items" : "items"} × {selectedLanguages.length} {language === "de" ? "Sprachen" : language === "nl" ? "talen" : "languages"}
              </div>
            </div>

            {/* Progress */}
            {isGenerating && (
              <div className="space-y-2">
                <Progress value={(progress.current / progress.total) * 100} />
                <div className="text-sm text-slate-600 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {progress.currentItem || "Starting..."}
                </div>
                <div className="text-xs text-slate-500">
                  {progress.current} / {progress.total}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Results */
          <div className="space-y-4 py-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 font-medium">
                <Check className="w-5 h-5" />
                {language === "de" ? "Übersetzung abgeschlossen!" : 
                 language === "nl" ? "Vertaling voltooid!" : 
                 "Translation Complete!"}
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-700">{results.success}</div>
                <div className="text-xs text-green-600">
                  {language === "de" ? "Erfolgreich" : language === "nl" ? "Geslaagd" : "Success"}
                </div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-700">{results.failed}</div>
                <div className="text-xs text-red-600">
                  {language === "de" ? "Fehlgeschlagen" : language === "nl" ? "Mislukt" : "Failed"}
                </div>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <div className="text-2xl font-bold text-slate-700">{results.skipped}</div>
                <div className="text-xs text-slate-600">
                  {language === "de" ? "Übersprungen" : language === "nl" ? "Overgeslagen" : "Skipped"}
                </div>
              </div>
            </div>

            {results.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="text-sm text-red-700 font-medium mb-1">Errors:</div>
                <ul className="text-xs text-red-600 space-y-1">
                  {results.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!results ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isGenerating}>
                {language === "de" ? "Abbrechen" : language === "nl" ? "Annuleren" : "Cancel"}
              </Button>
              <Button 
                onClick={handleGenerate} 
                disabled={isGenerating || totalTranslations === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {language === "de" ? "Generieren..." : language === "nl" ? "Genereren..." : "Generating..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    {language === "de" ? "Übersetzungen generieren" : 
                     language === "nl" ? "Vertalingen genereren" : 
                     "Generate Translations"}
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>
              {language === "de" ? "Schließen" : language === "nl" ? "Sluiten" : "Close"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
