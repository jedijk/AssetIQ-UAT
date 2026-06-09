import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { format } from "date-fns";
import { Building2, ClipboardCheck, Activity, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { useEffectiveRole } from "../contexts/RolePreviewContext";
import { useLanguage } from "../contexts/LanguageContext";
import { isMaintenanceSimpleMode } from "../lib/simpleModeProfile";
import { myTasksAPI, preferencesAPI } from "../lib/api";
import { publicAssetUrl } from "../lib/assetUrl";
import {
  filterActiveWorkItems,
  getApiDisciplineParam,
  resolveMyTasksDisciplines,
} from "../lib/myTasksFilterUtils";
import { queryKeys } from "../lib/queryKeys";

const haptic = () => {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(25);
    } else if (window.navigator && "haptics" in window.navigator) {
      window.navigator.haptics.play("click");
    }
  } catch {}
};

const fetchOpenTaskCount = async (selectedDisciplines) => {
  const data = await myTasksAPI.getTasks({
    filter: "open",
    date: format(new Date(), "yyyy-MM-dd"),
    discipline: getApiDisciplineParam(selectedDisciplines),
  });
  return filterActiveWorkItems(data.tasks, selectedDisciplines).length;
};

export default function OperatorLandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { effectiveRole } = useEffectiveRole();
  const { t } = useLanguage();
  const maintenanceProfile = isMaintenanceSimpleMode(effectiveRole || user?.role);
  
  // Fetch user preferences to get discipline filter
  const { data: preferences } = useQuery({
    queryKey: queryKeys.users.preferences(),
    queryFn: preferencesAPI.getPreferences,
    staleTime: 60000,
  });
  
  const selectedDisciplines = useMemo(
    () => resolveMyTasksDisciplines(effectiveRole || user?.role, preferences?.discipline),
    [effectiveRole, user?.role, preferences?.discipline],
  );

  const { data: openCount } = useQuery({
    queryKey: queryKeys.myTasks.operatorCounts(selectedDisciplines, user?.id),
    queryFn: () => fetchOpenTaskCount(selectedDisciplines),
    enabled: !!user,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const badge = openCount ?? 0;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("simpleMode.greetingMorning");
    if (hour < 18) return t("simpleMode.greetingAfternoon");
    return t("simpleMode.greetingEvening");
  };

  const handleClick = (fn) => () => { haptic(); fn(); };

  return (
    <div
      className="operator-landing-surface operator-landing-layout flex flex-col items-center w-full"
      data-testid="operator-landing"
    >
      {/* Hero stays pinned below the app header; only the action buttons scroll */}
      <div className="operator-landing-hero flex flex-col items-center px-6 pt-2 pb-2 w-full">
        <div className="flex w-full max-w-sm flex-col items-center text-center">
          <img
            src={publicAssetUrl("/logo.png")}
            alt=""
            className="mx-auto h-36 w-36 max-h-[min(42vw,240px)] max-w-[min(42vw,240px)] select-none object-contain drop-shadow-sm sm:h-44 sm:w-44 rounded-2xl"
            width={176}
            height={176}
            decoding="async"
          />
          <h1 className="operator-landing-title mt-4 text-xl font-semibold">
            {getGreeting()}
            {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="operator-landing-subtitle mt-1 text-sm">{t("simpleMode.prompt")}</p>
        </div>
      </div>

      <div className="operator-landing-actions px-6 pb-8 w-full max-w-xs mx-auto">
        <div className="grid grid-cols-2 gap-4 w-full pt-2">
          <div className="operator-landing-my-tasks-slot col-span-2">
            <button
              onClick={handleClick(() => navigate("/my-tasks"))}
              className="flex items-center justify-center gap-3 rounded-2xl p-6 bg-orange-400 text-white w-full shadow-lg shadow-orange-400/20 active:scale-[0.97] active:shadow-sm transition-all duration-150"
              data-testid="operator-btn-my-tasks"
            >
              <ClipboardCheck className="w-8 h-8" strokeWidth={2} />
              <span className="text-sm font-semibold tracking-wide">{t("nav.myTasks")}</span>
            </button>
            <span
              className={`operator-landing-tasks-badge text-xs font-bold rounded-full min-w-[24px] h-6 flex items-center justify-center px-1.5 shadow-md ${
                badge > 0
                  ? "bg-red-500 text-white"
                  : "bg-white/90 text-orange-700 border border-orange-200/80"
              }`}
              data-testid="tasks-badge"
              aria-label={t("simpleMode.openTasksAria").replace("{count}", badge)}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          </div>

          <button
            onClick={handleClick(() => window.dispatchEvent(new CustomEvent("open-hierarchy")))}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl p-6 bg-blue-600 text-white shadow-lg shadow-blue-600/20 active:scale-[0.97] active:shadow-sm transition-all duration-150"
            data-testid="operator-btn-equipment"
          >
            <Building2 className="w-8 h-8" strokeWidth={2} />
            <span className="text-sm font-semibold tracking-wide">{t("simpleMode.equipment")}</span>
          </button>

          {maintenanceProfile ? (
            <button
              onClick={handleClick(() => navigate("/threats"))}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl p-6 bg-purple-600 text-white shadow-lg shadow-purple-600/20 active:scale-[0.97] active:shadow-sm transition-all duration-150"
              data-testid="operator-btn-observations"
            >
              <AlertTriangle className="w-8 h-8" strokeWidth={2} />
              <span className="text-sm font-semibold tracking-wide">{t("nav.observations")}</span>
            </button>
          ) : (
            <button
              onClick={handleClick(() => navigate("/production"))}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl p-6 bg-violet-600 text-white shadow-lg shadow-violet-600/20 active:scale-[0.97] active:shadow-sm transition-all duration-150"
              data-testid="operator-btn-production"
            >
              <Activity className="w-8 h-8" strokeWidth={2} />
              <span className="text-sm font-semibold tracking-wide">{t("simpleMode.production")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
