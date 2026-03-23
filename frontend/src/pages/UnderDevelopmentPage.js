import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Construction, Users, BarChart3, Sliders } from "lucide-react";
import { Button } from "../components/ui/button";
import { useLanguage } from "../contexts/LanguageContext";

export default function UnderDevelopmentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  // Determine which page based on path
  const getPageInfo = () => {
    if (location.pathname.includes("user-management")) {
      return {
        icon: Users,
        title: t("settings.userManagement"),
        description: t("settings.userManagementDesc"),
        color: "text-blue-600",
        bgColor: "bg-blue-100",
      };
    }
    if (location.pathname.includes("statistics")) {
      return {
        icon: BarChart3,
        title: t("settings.statistics"),
        description: t("settings.statisticsDesc"),
        color: "text-green-600",
        bgColor: "bg-green-100",
      };
    }
    if (location.pathname.includes("criticality-definitions")) {
      return {
        icon: Sliders,
        title: t("settings.criticalityDefinitions"),
        description: t("settings.criticalityDefinitionsDesc"),
        color: "text-purple-600",
        bgColor: "bg-purple-100",
      };
    }
    return {
      icon: Construction,
      title: t("settings.underDevelopment"),
      description: "",
      color: "text-slate-600",
      bgColor: "bg-slate-100",
    };
  };

  const pageInfo = getPageInfo();
  const Icon = pageInfo.icon;

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${pageInfo.bgColor} mb-6`}>
          <Icon className={`w-10 h-10 ${pageInfo.color}`} />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-slate-800 mb-2">
          {pageInfo.title}
        </h1>

        {/* Description */}
        {pageInfo.description && (
          <p className="text-slate-500 mb-4">
            {pageInfo.description}
          </p>
        )}

        {/* Under Development Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-full mb-8">
          <Construction className="w-5 h-5 text-amber-600" />
          <span className="text-amber-700 font-medium">{t("settings.underDevelopment")}</span>
        </div>

        {/* Coming Soon Message */}
        <p className="text-slate-400 text-sm mb-8">
          {t("settings.comingSoon")}
        </p>

        {/* Back Button */}
        <Button
          variant="outline"
          onClick={() => navigate(-1)}
          className="gap-2"
          data-testid="back-button"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.goBack")}
        </Button>
      </div>
    </div>
  );
}
