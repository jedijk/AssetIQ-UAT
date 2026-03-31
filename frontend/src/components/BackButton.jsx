import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";

/**
 * BackButton - A navigation back button that uses browser history
 * Falls back to dashboard if no history exists
 */
const BackButton = ({ className = "", fallbackPath = "/dashboard" }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if we have a referrer in the state (set when navigating from specific pages)
  const fromReliability = location.state?.from === "reliability";
  const fromPage = location.state?.fromPage;
  
  const handleBack = () => {
    if (fromReliability) {
      // Navigate back to reliability performance dashboard
      navigate("/dashboard", { state: { activeTab: "reliability" } });
    } else if (window.history.length > 2) {
      // Use browser history if we have previous pages
      // window.history.length includes current page, so >2 means we have at least one previous page
      navigate(-1);
    } else {
      // Fallback to dashboard if no history
      navigate(fallbackPath);
    }
  };
  
  const getBackText = () => {
    if (fromReliability || fromPage === "Reliability Performance") {
      return "Back to Dashboard";
    }
    return "Back";
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className={`text-slate-600 hover:text-slate-900 hover:bg-slate-100 gap-1.5 ${className}`}
      data-testid="back-button"
    >
      <ArrowLeft className="w-4 h-4" />
      <span className="hidden sm:inline">{getBackText()}</span>
    </Button>
  );
};

export default BackButton;
