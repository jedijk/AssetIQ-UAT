import { useNavigate } from "react-router-dom";
import { Building2, ClipboardCheck, Activity } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const haptic = () => {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(25);
    } else if (window.navigator && 'haptics' in window.navigator) {
      window.navigator.haptics.play('click');
    }
  } catch {}
};

export default function OperatorLandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const handleClick = (fn) => () => { haptic(); fn(); };

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
          onClick={handleClick(() => navigate("/my-tasks"))}
          className="flex items-center justify-center gap-3 rounded-2xl p-6 bg-green-700 text-white w-full shadow-lg shadow-green-700/20 active:scale-[0.97] active:shadow-sm transition-all duration-150"
          data-testid="operator-btn-my-tasks"
        >
          <ClipboardCheck className="w-8 h-8" strokeWidth={2} />
          <span className="text-sm font-semibold tracking-wide">My Tasks</span>
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
            className="flex flex-col items-center justify-center gap-3 rounded-2xl p-6 bg-purple-600 text-white shadow-lg shadow-purple-600/20 active:scale-[0.97] active:shadow-sm transition-all duration-150"
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
