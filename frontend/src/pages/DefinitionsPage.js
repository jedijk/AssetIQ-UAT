import { useState } from "react";
import { Sliders, AlertTriangle, BarChart2, Eye, Info } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { ScrollArea } from "../components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";

// FMEA Severity Definitions
const SEVERITY_DEFINITIONS = [
  { rank: 10, effect: "Hazardous", customerEffect: "Very high severity ranking when a potential failure mode affects safe operation and/or involves noncompliance with government regulation without warning.", manufacturingEffect: "May endanger operator/machine or assembly without warning.", color: "bg-red-600" },
  { rank: 9, effect: "Hazardous", customerEffect: "Very high severity ranking when a potential failure mode affects safe operation and/or involves noncompliance with government regulation with warning. Includes: impurity of metal, stones, wood, plastic, textile, foreign material; undispersible inhomogeneity (agglomerates, gel).", manufacturingEffect: "May endanger operator/machine or assembly with warning.", color: "bg-red-500" },
  { rank: 8, effect: "Very High", customerEffect: "Product/item inoperable (loss of primary function). Severe deviation of specified parameters (incl. 'in-lot' variation), material mix up (wrong material or wrong table).", manufacturingEffect: "100% of product may have to be scrapped, or product/item repaired in repair department with a repair time greater than one hour.", color: "bg-orange-500" },
  { rank: 7, effect: "High", customerEffect: "Product/item operable but at reduced level of performance. Customer very dissatisfied. Examples: white spots, volatiles.", manufacturingEffect: "Product may have to be sorted and a portion (less than 100%) scrapped, or product/item repaired in repair department with a repair time between half an hour and an hour.", color: "bg-orange-400" },
  { rank: 6, effect: "Moderate", customerEffect: "Product/item operable, but Comfort/Convenience item(s) inoperable. Customer dissatisfied.", manufacturingEffect: "A portion (less than 100%) of the product may have to be scrapped with no sorting, or product/item repaired in repair department with a repair time less than half an hour.", color: "bg-yellow-500" },
  { rank: 5, effect: "Low", customerEffect: "Product/item operable, but Comfort/Convenience item(s) operable at a reduced level of performance. Customer somewhat dissatisfied.", manufacturingEffect: "100% of product may have to be reworked, or product/item repaired off-line but does not go to repair department.", color: "bg-yellow-400" },
  { rank: 4, effect: "Very Low", customerEffect: "Fit & Finish/Squeak & Rattle items does not conform. Defect noticed by most customers (greater than 75%).", manufacturingEffect: "The product may have to be sorted, with no scrap, and a portion (less than 100%) reworked.", color: "bg-green-400" },
  { rank: 3, effect: "Minor", customerEffect: "Fit & Finish/Squeak & Rattle items does not conform. Defect noticed by most customers (greater than 75%).", manufacturingEffect: "A portion (less than 100%) of the product may have to be reworked, with no scrap, online but out-of-station.", color: "bg-green-500" },
  { rank: 2, effect: "Very Minor", customerEffect: "Fit & Finish/Squeak & Rattle items does not conform. Defect noticed by discriminating customers (less than 25%).", manufacturingEffect: "A portion (less than 100%) of the product may have to be reworked, with no scrap, online but in-station.", color: "bg-green-600" },
  { rank: 1, effect: "None", customerEffect: "No discernible effect.", manufacturingEffect: "Slight inconvenience to operation or operator, or no effect.", color: "bg-green-700" },
];

// FMEA Occurrence Definitions
const OCCURRENCE_DEFINITIONS = [
  { rank: 10, probability: "Very High", description: "Persistent failures", failureRate: "≥ 100 per thousand units", color: "bg-red-600" },
  { rank: 9, probability: "Very High", description: "Persistent failures", failureRate: "50 per thousand units", color: "bg-red-500" },
  { rank: 8, probability: "High", description: "Frequent failures", failureRate: "20 per thousand units", color: "bg-orange-500" },
  { rank: 7, probability: "High", description: "Frequent failures", failureRate: "10 per thousand units", color: "bg-orange-400" },
  { rank: 6, probability: "Moderate", description: "Occasional failures", failureRate: "2 per thousand units", color: "bg-yellow-500" },
  { rank: 5, probability: "Moderate", description: "Occasional failures", failureRate: "0.5 per thousand units", color: "bg-yellow-400" },
  { rank: 4, probability: "Moderate", description: "Occasional failures", failureRate: "0.1 per thousand units", color: "bg-yellow-300" },
  { rank: 3, probability: "Low", description: "Relatively few failures", failureRate: "0.01 per thousand units", color: "bg-green-400" },
  { rank: 2, probability: "Low", description: "Relatively few failures", failureRate: "≤ 0.001 per thousand units", color: "bg-green-500" },
  { rank: 1, probability: "Remote", description: "Failure is unlikely", failureRate: "Failure eliminated through preventive control", color: "bg-green-600" },
];

// FMEA Detection Definitions
const DETECTION_DEFINITIONS = [
  { rank: 10, detection: "Almost Impossible", criteria: "Absolute certainty of non-detection", likelihood: "< 90%", method: "Cannot detect or is not checked", color: "bg-red-600" },
  { rank: 9, detection: "Very Remote", criteria: "Controls will probably not detect", likelihood: "90%", method: "Control is achieved with indirect or random checks only", color: "bg-red-500" },
  { rank: 8, detection: "Remote", criteria: "Controls have poor chance of detection", likelihood: "98%", method: "Control is achieved with visual inspection only", color: "bg-orange-500" },
  { rank: 7, detection: "Very Low", criteria: "Controls have poor chance of detection", likelihood: "98%", method: "Control is achieved with double visual inspection only", color: "bg-orange-400" },
  { rank: 6, detection: "Low", criteria: "Controls may detect", likelihood: "99.7%", method: "Control is achieved with charting methods, such as SPC (statistical process control)", color: "bg-yellow-500" },
  { rank: 5, detection: "Moderate", criteria: "Controls may detect", likelihood: "99.7%", method: "Control is based on variable gauging after parts have left the station, or Go/No Go gauging performed on 100% of the parts after parts have left the station", color: "bg-yellow-400" },
  { rank: 4, detection: "Moderately High", criteria: "Controls have a good chance to detect", likelihood: "99.7%", method: "Error Detection in subsequent operations, or gauging performed on setup and first-piece check (for set-up causes only)", color: "bg-green-400" },
  { rank: 3, detection: "High", criteria: "Controls have a good chance to detect", likelihood: "99.9%", method: "Error Detection in-station, or Error Detection in subsequent operations by multiple layers of acceptance: supply, select, install, verify. Cannot accept discrepant part.", color: "bg-green-500" },
  { rank: 2, detection: "Very High", criteria: "Controls almost certain to detect", likelihood: "99.9%", method: "Error Detection in-station (automatic gauging with automatic stop feature). Cannot pass discrepant part.", color: "bg-green-600" },
  { rank: 1, detection: "Very High", criteria: "Controls certain to detect", likelihood: "99.99%", method: "Discrepant parts cannot be made because item has been error proofed by process/product design", color: "bg-green-700" },
];

export default function DefinitionsPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("severity");

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Sliders className="w-6 h-6 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">
            {t("settings.criticalityDefinitions") || "Definitions"}
          </h1>
        </div>
        <p className="text-slate-500">
          {t("definitions.pageDescription") || "FMEA Rating Scales for Severity, Occurrence, and Detection (SOD)"}
        </p>
      </div>

      {/* Info Card */}
      <Card className="mb-6 border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">{t("definitions.rpnInfo") || "Risk Priority Number (RPN)"}</p>
              <p>{t("definitions.rpnFormula") || "RPN = Severity × Occurrence × Detection. Use these tables to assign consistent ratings during FMEA analysis. The final customer should always be considered first. If both effects occur, use the higher of two Severities."}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="severity" className="flex items-center gap-2" data-testid="severity-tab">
            <AlertTriangle className="w-4 h-4" />
            {t("definitions.severity") || "Severity"}
          </TabsTrigger>
          <TabsTrigger value="occurrence" className="flex items-center gap-2" data-testid="occurrence-tab">
            <BarChart2 className="w-4 h-4" />
            {t("definitions.occurrence") || "Occurrence"}
          </TabsTrigger>
          <TabsTrigger value="detection" className="flex items-center gap-2" data-testid="detection-tab">
            <Eye className="w-4 h-4" />
            {t("definitions.detection") || "Detection"}
          </TabsTrigger>
        </TabsList>

        {/* Severity Tab */}
        <TabsContent value="severity">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                {t("definitions.severityTitle") || "Severity Evaluation Criteria"}
              </CardTitle>
              <CardDescription>
                {t("definitions.severityDesc") || "Severity is the ranking associated with the most serious effect for a given failure mode."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700 w-16">{t("definitions.ranking") || "Rank"}</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700 w-28">{t("definitions.effect") || "Effect"}</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700">{t("definitions.customerEffect") || "Customer Effect (End User)"}</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700">{t("definitions.manufacturingEffect") || "Manufacturing / Assembly Effect"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SEVERITY_DEFINITIONS.map((item) => (
                      <tr key={item.rank} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white font-bold ${item.color}`}>
                            {item.rank}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-800">{item.effect}</td>
                        <td className="px-3 py-3 text-slate-600">{item.customerEffect}</td>
                        <td className="px-3 py-3 text-slate-600">{item.manufacturingEffect}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Occurrence Tab */}
        <TabsContent value="occurrence">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart2 className="w-5 h-5 text-orange-500" />
                {t("definitions.occurrenceTitle") || "Occurrence Evaluation Criteria"}
              </CardTitle>
              <CardDescription>
                {t("definitions.occurrenceDesc") || "Occurrence is the likelihood that a specific cause/mechanism will occur, based on failure rates."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700 w-16">{t("definitions.ranking") || "Rank"}</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700 w-28">{t("definitions.probability") || "Probability"}</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700">{t("definitions.description") || "Description"}</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700">{t("definitions.failureRate") || "Possible Failure Rate"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {OCCURRENCE_DEFINITIONS.map((item) => (
                      <tr key={item.rank} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white font-bold ${item.color}`}>
                            {item.rank}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-800">{item.probability}</td>
                        <td className="px-3 py-3 text-slate-600">{item.description}</td>
                        <td className="px-3 py-3 text-slate-600">{item.failureRate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detection Tab */}
        <TabsContent value="detection">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Eye className="w-5 h-5 text-blue-500" />
                {t("definitions.detectionTitle") || "Detection Evaluation Criteria"}
              </CardTitle>
              <CardDescription>
                {t("definitions.detectionDesc") || "Detection is a ranking of the ability of current controls to detect the cause/mechanism or failure mode before product reaches the customer."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700 w-16">{t("definitions.ranking") || "Rank"}</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700 w-32">{t("definitions.detection") || "Detection"}</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700">{t("definitions.criteria") || "Criteria"}</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700 w-24">{t("definitions.likelihood") || "Likelihood"}</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700">{t("definitions.detectionMethod") || "Suggested Detection Method"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DETECTION_DEFINITIONS.map((item) => (
                      <tr key={item.rank} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white font-bold ${item.color}`}>
                            {item.rank}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-800">{item.detection}</td>
                        <td className="px-3 py-3 text-slate-600">{item.criteria}</td>
                        <td className="px-3 py-3 text-slate-600">{item.likelihood}</td>
                        <td className="px-3 py-3 text-slate-600 text-xs">{item.method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
