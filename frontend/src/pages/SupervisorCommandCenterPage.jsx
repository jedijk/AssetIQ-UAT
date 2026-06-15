/**
 * Supervisor Command Center — /supervisor
 * Daily shift-start screen with prioritized operational queue and drill-down links.
 */
import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Clock,
  GitBranch,
  Loader2,
  RefreshCw,
  Shield,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { rilDashboardAPI } from "../lib/apis/rilAPI";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

const TYPE_META = {
  threat: { label: "Threat", variant: "destructive", icon: AlertTriangle },
  overdue_pm: { label: "Overdue PM", variant: "secondary", icon: Wrench },
  action: { label: "Action", variant: "outline", icon: ClipboardList },
  investigation: { label: "Investigation", variant: "secondary", icon: GitBranch },
};

function SummaryTile({ label, value, icon: Icon, to }) {
  const content = (
    <div className="flex items-center gap-3 rounded-lg border bg-white p-4 shadow-sm">
      <div className="rounded-md bg-slate-100 p-2 text-slate-600">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value ?? "—"}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
  if (to) {
    return (
      <Link to={to} className="block transition hover:opacity-90">
        {content}
      </Link>
    );
  }
  return content;
}

function QueueItem({ item }) {
  const meta = TYPE_META[item.type] || TYPE_META.action;
  const Icon = meta.icon;
  return (
    <Link
      to={item.drill_down}
      className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5 transition hover:border-slate-200 hover:bg-white"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{item.title}</p>
        {item.subtitle && (
          <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant={meta.variant} className="text-[10px]">
          {meta.label}
        </Badge>
        {item.priority_score != null && (
          <span className="text-xs font-semibold text-orange-600">
            {item.priority_score}
          </span>
        )}
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
    </Link>
  );
}

function SectionCard({ title, description, count, items, emptyText, viewAllTo, icon: Icon }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {Icon && <Icon className="h-4 w-4 text-slate-500" />}
              {title}
              <Badge variant="secondary">{count ?? 0}</Badge>
            </CardTitle>
            {description && (
              <CardDescription className="mt-1">{description}</CardDescription>
            )}
          </div>
          {viewAllTo && (
            <Button asChild variant="ghost" size="sm" className="shrink-0">
              <Link to={viewAllTo}>
                View all
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!items?.length ? (
          <p className="py-4 text-center text-sm text-slate-400">{emptyText}</p>
        ) : (
          items.map((item) => (
            <QueueItem key={`${item.type}-${item.id}`} item={item} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function CrewRow({ member }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
      <div>
        <p className="font-medium text-slate-900">{member.name}</p>
        <p className="text-xs text-slate-500">
          {member.open_tasks} open · {member.overdue_tasks} overdue
        </p>
      </div>
      <Badge variant={member.utilization_pct >= 80 ? "destructive" : "secondary"}>
        {member.utilization_pct}% load
      </Badge>
    </div>
  );
}

export default function SupervisorCommandCenterPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["supervisor-dashboard"],
    queryFn: () => rilDashboardAPI.getSupervisor(),
    staleTime: 60_000,
  });

  const summary = data?.summary || {};

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <div className="container mx-auto max-w-6xl px-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Supervisor Command Center
              </h1>
              <p className="text-sm text-slate-500">
                Prioritized operational queue for your shift
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            Loading command center…
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-10 text-center text-red-600">
              Failed to load supervisor dashboard. Try refreshing.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryTile
                label="Overdue PM"
                value={summary.overdue_pm_count}
                icon={Clock}
                to="/tasks"
              />
              <SummaryTile
                label="Open Threats"
                value={summary.open_threats_count}
                icon={AlertTriangle}
                to="/threats"
              />
              <SummaryTile
                label="Blocked Investigations"
                value={summary.blocked_investigations_count}
                icon={GitBranch}
                to="/causal-engine"
              />
              <SummaryTile
                label="Open Actions"
                value={summary.open_actions_count}
                icon={ClipboardList}
                to="/actions"
              />
            </div>

            <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-orange-500" />
                  AI Prioritized Queue
                  <Badge>{data?.prioritized_queue?.count ?? 0}</Badge>
                </CardTitle>
                <CardDescription>
                  Ranked by exposure, criticality, threat score, and graph risk
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!data?.prioritized_queue?.items?.length ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    No prioritized items — fleet is clear
                  </p>
                ) : (
                  data.prioritized_queue.items.map((item) => (
                    <QueueItem key={`queue-${item.type}-${item.id}`} item={item} />
                  ))
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard
                title="Overdue PM"
                description="Preventive maintenance past due date"
                count={data?.overdue_pm?.count}
                items={data?.overdue_pm?.items}
                emptyText="No overdue PM tasks"
                viewAllTo="/tasks"
                icon={Clock}
              />
              <SectionCard
                title="Open Threats"
                description="Active observations requiring attention"
                count={data?.open_threats?.count}
                items={data?.open_threats?.items}
                emptyText="No open threats"
                viewAllTo="/threats"
                icon={AlertTriangle}
              />
              <SectionCard
                title="Escalating Risks"
                description="High or critical risk observations"
                count={data?.escalating_risks?.count}
                items={data?.escalating_risks?.items}
                emptyText="No escalating risks"
                viewAllTo="/threats"
                icon={Shield}
              />
              <SectionCard
                title="Blocked Investigations"
                description="Stalled investigations (7+ days without progress)"
                count={data?.blocked_investigations?.count}
                items={data?.blocked_investigations?.items}
                emptyText="No blocked investigations"
                viewAllTo="/causal-engine"
                icon={GitBranch}
              />
              <SectionCard
                title="Open Actions"
                description="Fleet actions awaiting completion"
                count={data?.open_actions?.count}
                items={data?.open_actions?.items}
                emptyText="No open actions"
                viewAllTo="/actions"
                icon={ClipboardList}
              />
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4 text-slate-500" />
                    Crew Workload
                    <Badge variant="secondary">{data?.crew_workload?.count ?? 0}</Badge>
                  </CardTitle>
                  <CardDescription>Open tasks by assigned technician</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {!data?.crew_workload?.items?.length ? (
                    <p className="py-4 text-center text-sm text-slate-400">
                      No crew assignments
                    </p>
                  ) : (
                    data.crew_workload.items.map((member) => (
                      <CrewRow key={member.technician_id} member={member} />
                    ))
                  )}
                  <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
                    <Link to="/tasks">
                      Open Task Scheduler
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
