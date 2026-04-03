import React from "react";
import { Monitor } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "./ui/button";
import { useNavigate } from "react-router-dom";

const DesktopOnlyMessage = ({ title = "Desktop Only", icon: Icon = Monitor, description }) => {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-sm bg-white rounded-2xl shadow-lg border border-slate-200 p-8"
      >
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 border border-blue-200 flex items-center justify-center">
          <Icon className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-3">
          {title}
        </h2>
        <p className="text-slate-500 mb-6 text-sm leading-relaxed">
          {description || "This feature is optimized for desktop. Please use a larger screen for the best experience."}
        </p>
        <Button
          onClick={() => navigate(-1)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          Go Back
        </Button>
      </motion.div>
    </div>
  );
};

export default DesktopOnlyMessage;
