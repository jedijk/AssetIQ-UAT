import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ClipboardCheck, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { myTasksAPI } from "../lib/api";
import { publicAssetUrl } from "../lib/assetUrl";
import {
  filterActiveWorkItems,
  getApiDisciplineParam,
  getDefaultDisciplinesForUser,
} from "../lib/myTasksFilterUtils";

const haptic = () => {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(25);
    } else if (window.navigator && "haptics" in window.navigator) {
      window.navigator.haptics.play("click");
    }
  } catch {}
};

const fetchOpenTaskBadgeCount = async (user, disciplines) => {
  const data = await myTasksAPI.getTasks({
    filter: "open",
    discipline: getApiDisciplineParam(disciplines),
  });
  return filterActiveWorkItems(data.tasks, disciplines).length;
};

export default function OperatorLandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const defaultDisciplines = useMemo(
    () => getDefaultDisciplinesForUser(user),
    [user?.id, user?.discipline, user?.department, user?.position]
  );

  const { data: badge = 0 } = useQuery({
    queryKey: ["operatorTaskCounts", user?.id, defaultDisciplines],
    queryFn: () => fetchOpenTaskBadgeCount(user, defaultDisciplines),
    enabled: !!user,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("simpleMode.greetingMorning");
    if (hour < 18) return t("simpleMode.greetingAfternoon");
    return t("simpleMode.greetingEvening");
  };

  const handleClick = (fn) => () => { haptic(); fn(); };

  return (
    <div
      className="operator-landing-surface flex flex-col items-center justify-center min-h-[calc(100vh-52px)] w-full"
      data-testid="operator-landing"
    >
      {/* Hero: app mark + greeting; buttons live below */}
      <div className="flex flex-col items-center px-6 pt-2 pb-1 w-full">
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

      <div className="flex shrink-0 flex-col gap-4 px-6 pb-8 pt-1 w-full max-w-xs mx-auto">
        <button
          onClick={handleClick(() => navigate("/my-tasks"))}
          className="relative flex items-center justify-center gap-3 rounded-2xl p-6 bg-orange-400 text-white w-full shadow-lg shadow-orange-400/20 active:scale-[0.97] active:shadow-sm transition-all duration-150"
          data-testid="operator-btn-my-tasks"
        >
          <ClipboardCheck className="w-8 h-8" strokeWidth={2} />
          <span className="text-sm font-semibold tracking-wide">{t("nav.myTasks")}</span>
          <span
            className={`absolute -top-2 -right-2 text-xs font-bold rounded-full min-w-[24px] h-6 flex items-center justify-center px-1.5 shadow-md ${
              badge > 0
                ? "bg-red-500 text-white"
                : "bg-white/90 text-orange-700 border border-orange-200/80"
            }`}
            data-testid="tasks-badge"
            aria-label={t("simpleMode.openTasksAria").replace("{count}", badge)}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        </button>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={handleClick(() => window.dispatchEvent(new CustomEvent("open-hierarchy")))}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl p-6 bg-blue-600 text-white shadow-lg shadow-blue-600/20 active:scale-[0.97] active:shadow-sm transition-all duration-150"
            data-testid="operator-btn-equipment"
          >
            <Building2 className="w-8 h-8" strokeWidth={2} />
            <span className="text-sm font-semibold tracking-wide">{t("simpleMode.equipment")}</span>
          </button>

          <button
            onClick={handleClick(() => navigate("/production"))}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl p-6 bg-violet-600 text-white shadow-lg shadow-violet-600/20 active:scale-[0.97] active:shadow-sm transition-all duration-150"
            data-testid="operator-btn-production"
          >
            <Activity className="w-8 h-8" strokeWidth={2} />
            <span className="text-sm font-semibold tracking-wide">{t("simpleMode.production")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
