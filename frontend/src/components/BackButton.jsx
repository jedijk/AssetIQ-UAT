import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";

/**
 * BackButton - A navigation back button that appears when user has navigation history
 * Shows contextual text based on where the user came from
 */
const BackButton = ({ className = "" }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if we have a referrer in the state (set when navigating from Reliability Dashboard)
  const fromReliability = location.state?.from === "reliability";
  const fromPage = location.state?.fromPage;
  
  const handleBack = () => {
    if (fromReliability) {
      // Navigate back to reliability performance dashboard
      navigate("/dashboard", { state: { activeTab: "reliability" } });
    } else {
      // Use browser back
      navigate(-1);
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
