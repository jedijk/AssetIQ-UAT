import { useNavigate } from "react-router-dom";
import { CheckCircle2, Download, Calendar, Rocket } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { toast } from "sonner";

export function GoLiveCompletion({ readiness, validation }) {
  const navigate = useNavigate();
  const ready = validation?.status === "passed";

  return (
    <div className="max-w-3xl mx-auto text-center space-y-8 py-8">
      <div className="space-y-2">
        <CheckCircle2 className={`w-16 h-16 mx-auto ${ready ? "text-emerald-500" : "text-amber-500"}`} />
        <h1 className="text-3xl font-bold text-slate-900">
          {ready ? "Congratulations!" : "Almost there"}
        </h1>
        <p className="text-slate-600">
          {ready
            ? "Your AssetIQ environment is ready for production."
            : "Resolve the remaining actions below before go-live."}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-left">
        {[
          ["Go-Live Readiness", readiness?.go_live],
          ["Reliability Readiness", readiness?.reliability],
          ["Maintenance Readiness", readiness?.maintenance],
          ["Data Quality", readiness?.data_quality],
          ["AI Readiness", readiness?.ai_readiness],
          ["Overall Progress", readiness?.overall],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">{value ?? 0}%</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Button
          variant="outline"
          onClick={() => toast.info("Go-Live report download coming in phase 2")}
        >
          <Download className="w-4 h-4 mr-2" />
          Download Go-Live Report
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.info("Schedule health check — contact your AssetIQ owner")}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Schedule Health Check
        </Button>
        <Button onClick={() => navigate("/dashboard")}>
          <Rocket className="w-4 h-4 mr-2" />
          Start Using AssetIQ
        </Button>
      </div>
    </div>
  );
}
