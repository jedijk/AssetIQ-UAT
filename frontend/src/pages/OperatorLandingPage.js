import { useNavigate } from "react-router-dom";
import { Building2, ClipboardCheck, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { getBackendUrl } from "../lib/apiConfig";
import { publicAssetUrl } from "../lib/assetUrl";

const haptic = () => {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(25);
    } else if (window.navigator && 'haptics' in window.navigator) {
      window.navigator.haptics.play('click');
    }
  } catch {}
};

function tasksFromMyTasksPayload(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.tasks ?? [];
}

const fetchTaskCounts = async () => {
  const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer"; // "bearer" | "cookie"
  const token = AUTH_MODE === "bearer" ? localStorage.getItem("token") : null;
  const headers = {
    ...(AUTH_MODE === "bearer" && token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const base = `${getBackendUrl()}/api/my-tasks`;
  const [openRes, overdueRes] = await Promise.all([
    fetch(`${base}?filter=open`, {
      headers,
      credentials: AUTH_MODE === "cookie" ? "include" : "omit",
    }),
    fetch(`${base}?filter=overdue`, {
      headers,
      credentials: AUTH_MODE === "cookie" ? "include" : "omit",
    }),
  ]);
  const openData = await openRes.json();
  const overdueData = await overdueRes.json();
  const openTasks = tasksFromMyTasksPayload(openData);
  const overdueTasks = tasksFromMyTasksPayload(overdueData);
  // open + overdue double-counts: e.g. pending tasks with past due_date appear in both lists (see my_tasks.py filters).
  const seenIds = new Set();
  for (const t of [...openTasks, ...overdueTasks]) {
    if (t?.id != null && t.id !== "") seenIds.add(String(t.id));
  }
  return {
    open: openTasks.length,
    overdue: overdueTasks.length,
    total: seenIds.size,
  };
};

export default function OperatorLandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: taskCounts } = useQuery({
    queryKey: ["operatorTaskCounts"],
    queryFn: fetchTaskCounts,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const badge = taskCounts?.total || 0;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const handleClick = (fn) => () => { haptic(); fn(); };

  return (
    <div
      className="operator-landing-surface flex flex-col min-h-[calc(100vh-52px)] w-full"
      data-testid="operator-landing"
    >
      {/* Hero: transparent shield mark + greeting; buttons live below */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 pt-2 pb-4 min-h-0 w-full">
        <div className="flex w-full max-w-sm flex-col items-center text-center">
          <img
            src={publicAssetUrl("/logo-operator.png")}
            alt=""
            className="mx-auto h-36 w-36 max-h-[min(42vw,240px)] max-w-[min(42vw,240px)] select-none object-contain drop-shadow-sm sm:h-44 sm:w-44"
            width={176}
            height={176}
            decoding="async"
          />
          <h1 className="operator-landing-title mt-8 text-xl font-semibold">
            {getGreeting()}
            {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="operator-landing-subtitle mt-1 text-sm">What would you like to do?</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-4 px-6 pb-8 pt-2 w-full max-w-xs mx-auto">
        <button
          onClick={handleClick(() => navigate("/my-tasks"))}
          className="relative flex items-center justify-center gap-3 rounded-2xl p-6 bg-orange-400 text-white w-full shadow-lg shadow-orange-400/20 active:scale-[0.97] active:shadow-sm transition-all duration-150"
          data-testid="operator-btn-my-tasks"
        >
          <ClipboardCheck className="w-8 h-8" strokeWidth={2} />
          <span className="text-sm font-semibold tracking-wide">My Tasks</span>
          <span
            className={`absolute -top-2 -right-2 text-xs font-bold rounded-full min-w-[24px] h-6 flex items-center justify-center px-1.5 shadow-md ${
              badge > 0
                ? "bg-red-500 text-white"
                : "bg-white/90 text-orange-700 border border-orange-200/80"
            }`}
            data-testid="tasks-badge"
            aria-label={`Open tasks: ${badge}`}
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
            <span className="text-sm font-semibold tracking-wide">Equipment</span>
          </button>

          <button
            onClick={handleClick(() => navigate("/production"))}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl p-6 bg-violet-600 text-white shadow-lg shadow-violet-600/20 active:scale-[0.97] active:shadow-sm transition-all duration-150"
            data-testid="operator-btn-production"
          >
            <Activity className="w-8 h-8" strokeWidth={2} />
            <span className="text-sm font-semibold tracking-wide">Production</span>
          </button>
        </div>
      </div>
    </div>
  );
}
