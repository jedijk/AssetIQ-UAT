/**
 * FormStats Component
 * Displays statistics cards for form templates
 */
import { Layers, FileText, AlertTriangle, AlertCircle } from "lucide-react";
import { Card, CardContent } from "../ui/card";

export const FormStats = ({ stats }) => {
  const statItems = [
    {
      label: "Templates",
      value: stats.totalTemplates,
      icon: Layers,
      iconBg: "bg-indigo-100",
      iconColor: "text-indigo-600",
    },
    {
      label: "Submissions",
      value: stats.totalSubmissions,
      icon: FileText,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      label: "Warnings",
      value: stats.warningCount,
      icon: AlertTriangle,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      valueColor: "text-amber-600",
    },
    {
      label: "Critical",
      value: stats.criticalCount,
      icon: AlertCircle,
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      valueColor: "text-red-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="form-stats">
      {statItems.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{item.label}</p>
                <p className={`text-2xl font-bold ${item.valueColor || "text-slate-900"}`}>
                  {item.value}
                </p>
              </div>
              <div className={`h-10 w-10 rounded-lg ${item.iconBg} flex items-center justify-center`}>
                <item.icon className={`h-5 w-5 ${item.iconColor}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default FormStats;
