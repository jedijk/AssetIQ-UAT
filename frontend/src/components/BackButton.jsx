import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";
import { useBreadcrumb } from "../contexts/BreadcrumbContext";

/**
 * BackButton - navigates to the previous breadcrumb step when available.
 */
const BackButton = ({
  className = "",
  variant = "ghost",
  size = "sm",
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { goBack } = useBreadcrumb();
  
  // Check if we have a referrer in the state (set when navigating from specific pages)
  const fromReliability = location.state?.from === "reliability";
  const fromPage = location.state?.fromPage;
  
  const handleBack = () => {
    if (fromReliability) {
      navigate("/dashboard");
      return;
    }
    goBack();
  };
  
  const getBackText = () => {
    if (fromReliability || fromPage === "Reliability Performance") {
      return "Back to Dashboard";
    }
    return "Back";
  };

  return (
    <Button
      variant={variant}
      size={size}
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
