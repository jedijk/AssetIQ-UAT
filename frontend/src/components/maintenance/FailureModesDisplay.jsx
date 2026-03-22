/**
 * FailureModesDisplay - Clickable badges linking to FMEA library
 */
import { useNavigate } from "react-router-dom";
import { Link2 } from "lucide-react";
import { Button } from "../ui/button";

const FailureModeLink = ({ mode, onClick }) => (
  <Button
    variant="ghost"
    size="sm"
    className="h-auto px-1.5 py-0.5 text-[10px] bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
    onClick={() => onClick(mode)}
  >
    <Link2 className="w-2.5 h-2.5 mr-1" />
    {mode}
  </Button>
);

const FailureModesDisplay = ({ modes, onModeClick, label = "Failure Modes" }) => {
  const navigate = useNavigate();
  
  const handleClick = (mode) => {
    if (onModeClick) {
      onModeClick(mode);
    } else {
      // Default: navigate to failure modes library with search
      navigate(`/library?tab=failure-modes&search=${encodeURIComponent(mode)}`);
    }
  };
  
  if (!modes || modes.length === 0) return null;
  
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      <span className="text-[10px] text-slate-500">{label}:</span>
      {modes.map((mode, idx) => (
        <FailureModeLink key={idx} mode={mode} onClick={handleClick} />
      ))}
    </div>
  );
};

export default FailureModesDisplay;
export { FailureModeLink };
