/**
 * Legacy route — redirects to the Reliability Intelligence Workspace.
 * Classic ThreatDetailPage was removed; workspace is the single source of truth.
 */
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function ThreatDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (id) {
      navigate(`/threats/${id}/workspace`, { replace: true });
    } else {
      navigate("/threats", { replace: true });
    }
  }, [id, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[40vh] text-slate-500">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      Opening workspace…
    </div>
  );
}
