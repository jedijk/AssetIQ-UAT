import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { qrCodeAPI } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import {
  QrCode,
  Eye,
  MessageSquare,
  Loader2,
  AlertTriangle,
  ArrowRight,
  LogIn
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

// Action icon mapping
const ACTION_ICONS = {
  view_asset: Eye,
  report_observation: MessageSquare,
};

export default function QRScanPage() {
  const { qrId } = useParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [selectedAction, setSelectedAction] = useState(null);

  // Fetch QR resolution data
  const { data, isLoading, error } = useQuery({
    queryKey: ["qr-resolve", qrId],
    queryFn: () => qrCodeAPI.resolve(qrId),
    enabled: !!user && !!qrId,
    retry: false,
  });

  const handleAction = useCallback((actionType) => {
    if (!data?.hierarchy_item) return;

    const equipmentId = data.hierarchy_item.id;
    const equipmentName = data.hierarchy_item.name;

    switch (actionType) {
      case "view_asset":
        // Navigate to equipment detail page
        navigate(`/equipment-manager?selected=${equipmentId}`);
        break;
      case "report_observation":
        // Navigate to chat with equipment pre-selected
        navigate(`/?openChat=true&equipmentId=${equipmentId}&equipmentName=${encodeURIComponent(equipmentName)}`);
        break;
      default:
        break;
    }
  }, [data, navigate]);

  // Auto-redirect if single action or default action
  useEffect(() => {
    if (data && !data.has_multiple_actions && data.default_action) {
      handleAction(data.default_action);
    }
  }, [data, handleAction]);

  // Show login prompt if not authenticated
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-8 h-8 text-blue-600" />
            </div>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>
              Please log in to access this equipment
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button 
              onClick={() => navigate(`/login?redirect=/qr/${qrId}`)}
              className="w-full"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Log In to Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading equipment information...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-red-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-red-900">QR Code Not Found</CardTitle>
            <CardDescription className="text-red-600">
              {error.response?.status === 410 
                ? "This QR code is no longer active"
                : "The QR code you scanned could not be found"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button 
              variant="outline"
              onClick={() => navigate("/")}
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show action menu if multiple actions available
  if (data?.has_multiple_actions) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-8 h-8 text-blue-600" />
            </div>
            <CardTitle>{data.label || "Equipment"}</CardTitle>
            {data.hierarchy_item && (
              <CardDescription>
                {data.hierarchy_item.name}
                {data.hierarchy_item.level && (
                  <span className="text-xs ml-1">({data.hierarchy_item.level})</span>
                )}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 text-center mb-4">
              What would you like to do?
            </p>
            <div className="space-y-3">
              {data.actions.map((action) => {
                const Icon = ACTION_ICONS[action.action_type] || Eye;
                return (
                  <button
                    key={action.action_type}
                    onClick={() => handleAction(action.action_type)}
                    className="w-full flex items-center gap-4 p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-slate-900">{action.label}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback loading/redirecting state
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
        <p className="text-slate-600">Redirecting...</p>
      </div>
    </div>
  );
}
