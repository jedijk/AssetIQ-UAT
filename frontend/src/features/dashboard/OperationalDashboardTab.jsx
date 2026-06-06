import React from "react";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";

export function OperationalDashboardTab(props) {
  return (
    <>
          {activeTab === "operational" && (
            <div className="animate-fade-in">
      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t("dashboard.totalObservations") || "Total Observations"}
          value={observations.length}
          icon={AlertTriangle}
          color="text-amber-600"
          bg="bg-amber-50"
          subtitle={`${openObservations} ${t("common.open") || "open"}`}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
        />
        <StatCard
          label={t("dashboard.totalActions") || "Total Actions"}
          value={actions.length}
          icon={CheckCircle2}
          color="text-blue-600"
          bg="bg-blue-50"
          subtitle={`${completedActions} ${t("actionsPage.completed") || "completed"}`}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
        />
        <StatCard
          label={t("dashboard.investigations") || "Investigations"}
          value={investigations.length}
          icon={GitBranch}
          color="text-purple-600"
          bg="bg-purple-50"
          subtitle={`${completedInvestigations} ${t("actionsPage.completed") || "completed"}`}
          clickable={true}
          onClick={() => navigate("/causal-engine", { state: navState })}
        />
        <StatCard
          label={t("dashboard.equipment") || "Equipment"}
          value={equipment.length}
          icon={Layers}
          color="text-green-600"
          bg="bg-green-50"
          subtitle={t("dashboard.totalAssets") || "total assets"}
          clickable={true}
          onClick={() => {
            if (window.innerWidth < 1024) {
              window.dispatchEvent(new CustomEvent("open-hierarchy"));
            } else {
              navigate("/equipment-manager", { state: navState });
            }
          }}
        />
      </div>

      {/* Progress Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <ProgressCard
          title={t("dashboard.observationResolution") || "Observation Resolution"}
          completed={closedObservations}
          total={observations.length}
          icon={Shield}
          color="bg-amber-500"
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
        />
        <ProgressCard
          title={t("dashboard.actionCompletion") || "Action Completion"}
          completed={completedActions}
          total={actions.length}
          icon={Target}
          color="bg-blue-500"
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
        />
        <ProgressCard
          title={t("dashboard.investigationProgress") || "Investigation Progress"}
          completed={completedInvestigations}
          total={investigations.length}
          icon={GitBranch}
          color="bg-purple-500"
          clickable={true}
          onClick={() => navigate("/causal-engine", { state: navState })}
        />
      </div>

      {/* Top 10 Highest Scoring Observations */}
      {topObservations.length > 0 && (
        <div className="mb-6">
          <div className="themed-card rounded-xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-medium text-secondary">
                  {t("dashboard.topRiskObservations") || "Top 10 Highest Risk Observations"}
                </h3>
              </div>
              <button 
                onClick={() => navigate("/threats", { state: navState })}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View All <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {topObservations.map((obs, index) => (
                <div 
                  key={obs.id} 
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/threats/${obs.id}`, { state: navState })}
                  data-testid={`top-obs-${obs.id}`}
                >
                  {/* Rank Badge */}
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold flex-shrink-0 bg-slate-200 text-slate-600">
                    {index + 1}
                  </span>
                  
                  {/* User Avatar - Show owner if assigned, else creator */}
                  <UserAvatar 
                    name={obs.owner_name || obs.creator_name}
                    photo={obs.creator_photo}
                    initials={(obs.owner_name || obs.creator_name || "U").charAt(0)}
                    size="sm"
                    position={obs.creator_position}
                    showPopover={true}
                  />
                  
                  {/* Risk Level Dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    obs.risk_level === "Critical" ? "bg-red-500" :
                    obs.risk_level === "High" ? "bg-orange-500" :
                    obs.risk_level === "Medium" ? "bg-yellow-500" : "bg-green-500"
                  }`} />
                  
                  {/* Title and Asset */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-slate-700 truncate">
                        {obs.title?.includes(" - ") ? obs.title.split(" - ")[0] : obs.title}
                      </p>
                      <span className="sm:hidden text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold tabular-nums flex-shrink-0" title="Risk Score">
                        {typeof obs.risk_score === 'number' ? Math.round(obs.risk_score) : obs.risk_score || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {obs.title?.includes(" - ") && (
                        <span className="text-[10px] text-slate-500 truncate">{obs.title.split(" - ").slice(1).join(" - ")}</span>
                      )}
                      {obs.equipment_tag && (
                        <span className="text-[9px] font-mono text-slate-400">{obs.equipment_tag}</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Risk Score - desktop only */}
                  <div className="w-8 flex-shrink-0 text-right hidden sm:block">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold tabular-nums inline-block" title="Risk Score">
                      {typeof obs.risk_score === 'number' ? Math.round(obs.risk_score) : obs.risk_score || 0}
                    </span>
                  </div>

                  {/* RPN Badge */}
                  <div className="w-16 flex-shrink-0 text-right hidden sm:block">
                    {obs.fmea_rpn ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium inline-block" title="Risk Priority Number">
                        RPN: {obs.fmea_rpn}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300">—</span>
                    )}
                  </div>
                  
                  {/* Status Badge - Fixed width for alignment */}
                  <div className="w-16 flex-shrink-0 text-right">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded inline-block ${
                      obs.status === "Open" ? "bg-blue-100 text-blue-700" :
                      obs.status === "Mitigated" ? "bg-green-100 text-green-700" :
                      obs.status === "In Progress" ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-700"
                    }`}>{obs.status || "Open"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DistributionCard
          title={t("dashboard.observationsByStatus") || "Threats by Status"}
          data={observationsByStatus}
          colors={["bg-blue-400", "bg-amber-400", "bg-green-400", "bg-slate-400"]}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
        />
        <DistributionCard
          title={t("dashboard.observationsByRisk") || "Threats by Risk Level"}
          data={observationsByRisk}
          colors={["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-400"]}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
        />
        <DistributionCard
          title={t("dashboard.actionsByStatus") || "Actions by Status"}
          data={actionsByStatus}
          colors={["bg-blue-400", "bg-amber-400", "bg-green-400"]}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
        />
        <DistributionCard
          title={t("dashboard.actionsByPriority") || "Actions by Priority"}
          data={actionsByPriority}
          colors={["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-400"]}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <RecentItemCard
          title={t("dashboard.recentObservations") || "Recent Observations"}
          icon={AlertTriangle}
          items={observations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
          emptyMessage={t("dashboard.noObservations") || "No observations recorded"}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
          renderItem={(item, idx) => (
            <div 
              key={item.id || `observation-${idx}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={(e) => { e.stopPropagation(); navigate(`/threats/${item.id}`, { state: navState }); }}
              data-testid={`observation-item-${item.id}`}
            >
              <UserAvatar 
                name={item.creator_name}
                photo={item.creator_photo}
                initials={item.creator_initials}
                position={item.creator_position}
                size="sm"
                showPopover={true}
              />
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.risk_level === "Critical" ? "bg-red-500" :
                item.risk_level === "High" ? "bg-orange-500" :
                item.risk_level === "Medium" ? "bg-yellow-500" : "bg-green-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                <p className="text-[10px] text-slate-400">{item.asset}</p>
              </div>
              {/* Compact Risk Score & RPN */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-medium tabular-nums" title="Risk Score">
                  {typeof item.risk_score === 'number' ? Math.round(item.risk_score) : item.risk_score || 0}
                </span>
                {item.fmea_rpn && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-600 font-medium tabular-nums" title="RPN">
                    {item.fmea_rpn}
                  </span>
                )}
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                item.status === "Open" ? "bg-blue-100 text-blue-700" :
                item.status === "Mitigated" ? "bg-green-100 text-green-700" :
                "bg-slate-100 text-slate-700"
              }`}>{item.status}</span>
            </div>
          )}
        />

        <RecentItemCard
          title={t("dashboard.recentFormSubmissions") || "Recent Form Submissions"}
          icon={FileText}
          items={recentSubmissions.sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at))}
          emptyMessage={t("dashboard.noFormSubmissions") || "No form submissions yet"}
          clickable={true}
          onClick={() => navigate("/form-submissions", { state: navState })}
          renderItem={(item, idx) => (
            <div 
              key={item.id || `submission-${idx}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/form-submissions", { state: { ...navState, submissionId: item.id } });
              }}
              data-testid={`form-submission-item-${item.id}`}
            >
              <UserAvatar 
                name={item.submitted_by_name || item.submitter_name || "User"}
                photo={item.submitted_by_photo}
                initials={(item.submitted_by_name || item.submitter_name || "U").charAt(0)}
                size="sm"
                showPopover={true}
              />
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.status === "completed" || item.status === "approved" ? "bg-green-500" :
                item.status === "pending" ? "bg-amber-500" :
                item.status === "rejected" ? "bg-red-500" : "bg-blue-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.form_template_name || item.template_name || item.form_name || "Form"}</p>
                <p className="text-[10px] text-slate-400">
                  {formatDateTime(item.submitted_at || item.created_at)}
                </p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                item.status === "completed" || item.status === "approved" ? "bg-green-100 text-green-700" :
                item.status === "pending" ? "bg-amber-100 text-amber-700" :
                item.status === "rejected" ? "bg-red-100 text-red-700" :
                "bg-blue-100 text-blue-700"
              }`}>{item.status || "submitted"}</span>
            </div>
          )}
        />

        <RecentItemCard
          title={t("dashboard.recentActions") || "Recent Actions"}
          icon={CheckCircle2}
          items={actions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
          emptyMessage={t("dashboard.noActions") || "No actions recorded"}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
          renderItem={(item, idx) => (
            <div 
              key={item.id || `action-${idx}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={(e) => { e.stopPropagation(); navigate(`/actions/${item.id}`, { state: navState }); }}
              data-testid={`action-item-${item.id}`}
            >
              <UserAvatar 
                name={item.creator_name}
                photo={item.creator_photo}
                initials={item.creator_initials}
                position={item.creator_position}
                size="sm"
                showPopover={true}
              />
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.priority === "critical" ? "bg-red-500" :
                item.priority === "high" ? "bg-orange-500" :
                item.priority === "medium" ? "bg-yellow-500" : "bg-green-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-slate-400">{item.source_name || "Manual"}</p>
                  {item.attachments?.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                      <Paperclip className="w-2.5 h-2.5" />
                      {item.attachments.length}
                    </span>
                  )}
                </div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                item.status === "completed" ? "bg-green-100 text-green-700" :
                item.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                "bg-blue-100 text-blue-700"
              }`}>{item.status?.replace("_", " ")}</span>
            </div>
          )}
        />

        <RecentItemCard
          title={t("dashboard.recentInvestigations") || "Recent Investigations"}
          icon={GitBranch}
          items={investigations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
          emptyMessage={t("dashboard.noInvestigations") || "No investigations started"}
          clickable={true}
          onClick={() => navigate("/causal-engine", { state: navState })}
          renderItem={(item, idx) => (
            <div 
              key={item.id || `investigation-${idx}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={(e) => { e.stopPropagation(); navigate(`/causal-engine?inv=${item.id}`, { state: navState }); }}
              data-testid={`investigation-item-${item.id}`}
            >
              {/* Lead Picture with Popover - FIRST */}
              <UserAvatar 
                name={item.lead_name || item.investigation_leader}
                photo={item.lead_picture}
                position={item.lead_position || "Investigation Lead"}
                size="sm"
                showPopover={true}
              />
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.status === "completed" ? "bg-green-500" :
                item.status === "in_progress" ? "bg-amber-500" : "bg-blue-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                <p className="text-[10px] text-slate-400">{item.asset_name || "No asset"}</p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize flex-shrink-0 ${
                item.status === "completed" ? "bg-green-100 text-green-700" :
                item.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                "bg-blue-100 text-blue-700"
              }`}>{item.status?.replace("_", " ")}</span>
            </div>
          )}
        />
      </div>

      {/* Equipment by Type */}
      {Object.keys(observationsByType).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 themed-card rounded-xl border p-4 hover:shadow-md cursor-pointer transition-all"
          onClick={() => navigate("/threats", { state: navState })}
        >
          <h3 className="text-sm font-medium text-secondary mb-4 flex items-center gap-1">
            {t("dashboard.observationsByEquipment") || "Observations by Equipment Type"}
            <ExternalLink className="w-3 h-3 opacity-50" />
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Object.entries(observationsByType).map(([type, count], idx) => (
              <div key={type} className="themed-card rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-secondary">{count}</p>
                <p className="text-xs text-muted truncate" title={type}>{type}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
            </div>
    </>
  );
}
