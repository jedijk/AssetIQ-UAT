import React from "react";
import { Monitor } from "lucide-react";

const DesktopOnlyMessage = ({ title = "Desktop Only", icon: Icon = Monitor }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-slate-400" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">{title}</h2>
      <p className="text-slate-500 max-w-sm">
        This feature requires a larger screen for the best experience. Please use a tablet or desktop device.
      </p>
    </div>
  );
};

export default DesktopOnlyMessage;
