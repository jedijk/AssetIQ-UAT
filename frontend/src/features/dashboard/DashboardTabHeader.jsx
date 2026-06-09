import React from "react";
import { motion } from "framer-motion";

export function DashboardTabHeader(props) {
  return (
    <>
      {/* Fixed Header with Tabs - Condensed */}
      <div className="flex-shrink-0 px-6 pt-4 pb-2 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t("dashboard.title") || "Dashboard"}</h1>
            <p className="text-sm text-slate-500">{t("dashboard.subtitle") || "Overview of your risk management status"}</p>
          </div>
          {isMobileViewport && (
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              data-testid="dashboard-close-btn"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        
        {/* Dashboard Tab Buttons - Mobile Optimized */}
        <div className="flex items-center justify-between gap-4">
          <div className="max-w-full overflow-x-auto">
            <div className="inline-flex h-10 items-center rounded-lg bg-slate-100 p-1 gap-1 min-w-max">
            <button 
              onClick={() => setActiveTab("operational")}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === "operational" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"}`}
              data-testid="operational-tab"
            >
              <Activity className="w-4 h-4 flex-shrink-0" />
              <span className="hidden xs:inline">{t("dashboard.operational") || "Operational"}</span>
              <span className="xs:hidden">Ops</span>
            </button>
            <button 
              onClick={() => setActiveTab("production")}
              className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === "production" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"}`}
              data-testid="production-tab"
            >
              <Gauge className="w-4 h-4 flex-shrink-0" />
              <span className="hidden xs:inline">Production</span>
              <span className="xs:hidden">Prod</span>
            </button>
            {canShowBuilder && (
              <button
                onClick={() => setActiveTab("builder")}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                  activeTab === "builder" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"
                }`}
                data-testid="builder-tab"
              >
                <Sparkles className="w-4 h-4 flex-shrink-0" />
                <span className="hidden xs:inline">Builder</span>
                <span className="xs:hidden">Build</span>
              </button>
            )}
          </div>
          </div>
          
          {/* Filter Button - Next to tabs, only on operational */}
          {activeTab === "operational" && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={refreshDashboard}
                title="Refresh"
                data-testid="dashboard-refresh-btn"
              >
                <RefreshCw className={`w-4 h-4 ${isFetchingAny ? "animate-spin" : ""}`} />
              </Button>
              {/* Active Filter Badges */}
              {hasActiveFilters && (
                <div className="hidden sm:flex items-center gap-2">
                  {disciplineFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1 bg-slate-100">
                      <Wrench className="w-3 h-3" />
                      {DISCIPLINES.find(d => d.value === disciplineFilter)?.label || disciplineFilter}
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setDisciplineFilter("all")} />
                    </Badge>
                  )}
                  {ownerFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1 bg-slate-100">
                      <User className="w-3 h-3" />
                      {usersList.find(u => u.id === ownerFilter)?.name || "Unknown"}
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setOwnerFilter("all")} />
                    </Badge>
                  )}
                  {plantUnitFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1 bg-slate-100">
                      <Building2 className="w-3 h-3" />
                      {plantUnits.find(pu => pu.id === plantUnitFilter)?.name || plantUnitFilter}
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setPlantUnitFilter("all")} />
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-slate-500 hover:text-red-500 h-7 px-2">
                    Clear
                  </Button>
                </div>
              )}
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-1.5 h-9"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700 px-1.5 py-0 text-xs">
                    {[disciplineFilter !== "all", ownerFilter !== "all", plantUnitFilter !== "all"].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </div>
          )}
        </div>
        
        {/* Expanded Filter Panel - Below tabs when open */}
        {activeTab === "operational" && showFilters && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Discipline Filter */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <Wrench className="w-3 h-3" /> Discipline
                </label>
                <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue placeholder="All Disciplines" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Disciplines</SelectItem>
                    {DISCIPLINES.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Owner Filter */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <User className="w-3 h-3" /> Owner / Assignee
                </label>
                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {usersList.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Plant/Unit Filter */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Plant / Unit
                </label>
                <Select value={plantUnitFilter} onValueChange={setPlantUnitFilter}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue placeholder="All Plants/Units" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Plants/Units</SelectItem>
                    {plantUnits.map(pu => (
                      <SelectItem key={pu.id} value={pu.id}>{pu.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </>
  );
}
