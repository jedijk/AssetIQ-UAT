import { useNavigate } from "react-router-dom";
import { Plus, Building2, ClipboardCheck, Activity } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function OperatorLandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const actions = [
    {
      id: "report",
      label: "Report",
      icon: Plus,
      color: "bg-amber-500",
      shadow: "shadow-amber-200",
      onClick: () => window.dispatchEvent(new CustomEvent("open-chat")),
    },
    {
      id: "equipment",
      label: "Equipment",
      icon: Building2,
      color: "bg-blue-600",
      shadow: "shadow-blue-200",
      onClick: () => window.dispatchEvent(new CustomEvent("open-hierarchy")),
    },
    {
      id: "my-tasks",
      label: "My Tasks",
      icon: ClipboardCheck,
      color: "bg-emerald-600",
      shadow: "shadow-emerald-200",
      onClick: () => navigate("/my-tasks"),
    },
    {
      id: "production",
      label: "Production",
      icon: Activity,
      color: "bg-violet-600",
      shadow: "shadow-violet-200",
      onClick: () => navigate("/production"),
    },
  ];

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[calc(100vh-52px)] px-6 pb-8 bg-slate-50"
      data-testid="operator-landing"
    >
      <div className="mb-10 text-center">
        <img src="/logo.png" alt="AssetIQ" className="w-14 h-14 rounded-xl mx-auto mb-3" />
        <h1 className="text-xl font-semibold text-slate-900">
          Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-slate-500 mt-1">What would you like to do?</p>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={action.onClick}
              className={`flex flex-col items-center justify-center gap-3 rounded-2xl p-6 ${action.color} ${action.shadow} shadow-lg text-white active:scale-95 transition-transform`}
              data-testid={`operator-btn-${action.id}`}
            >
              <Icon className="w-8 h-8" strokeWidth={2} />
              <span className="text-sm font-semibold tracking-wide">{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
