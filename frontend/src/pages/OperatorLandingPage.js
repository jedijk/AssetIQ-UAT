import { useNavigate } from "react-router-dom";
import { Building2, ClipboardCheck, Activity } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function OperatorLandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[calc(100vh-52px)] px-6 pb-8 bg-slate-50"
      data-testid="operator-landing"
    >
      <div className="mb-10 text-center">
        <img src="/logo.png" alt="AssetIQ" className="w-14 h-14 rounded-xl mx-auto mb-3" />
        <h1 className="text-xl font-semibold text-slate-900">
          {getGreeting()}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-slate-500 mt-1">What would you like to do?</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => navigate("/my-tasks")}
          className="flex items-center justify-center gap-3 rounded-2xl p-6 bg-emerald-600 shadow-lg shadow-emerald-200 text-white active:scale-95 transition-transform w-full"
          data-testid="operator-btn-my-tasks"
        >
          <ClipboardCheck className="w-8 h-8" strokeWidth={2} />
          <span className="text-sm font-semibold tracking-wide">My Tasks</span>
        </button>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-hierarchy"))}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl p-6 bg-blue-600 shadow-lg shadow-blue-200 text-white active:scale-95 transition-transform"
            data-testid="operator-btn-equipment"
          >
            <Building2 className="w-8 h-8" strokeWidth={2} />
            <span className="text-sm font-semibold tracking-wide">Equipment</span>
          </button>

          <button
            onClick={() => navigate("/production")}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl p-6 bg-violet-600 shadow-lg shadow-violet-200 text-white active:scale-95 transition-transform"
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
