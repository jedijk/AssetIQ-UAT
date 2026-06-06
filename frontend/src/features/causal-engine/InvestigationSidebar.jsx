import React from "react";

export function InvestigationSidebar(props) {
  return (
    <>
      {/* Sidebar - Investigation List */}
      <div className="w-80 flex-shrink-0 h-full flex flex-col bg-slate-50 border-r border-slate-200">
        <div className="p-4 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("causal.investigations")}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{filteredInvestigations.length} investigation{filteredInvestigations.length !== 1 ? 's' : ''}</p>
            </div>
            <Button size="sm" onClick={() => setShowNewInvDialog(true)} className="h-9 bg-blue-600 hover:bg-blue-700" data-testid="new-investigation-btn"><Plus className="w-4 h-4 mr-1" />{t("common.add")}</Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder={t("causal.searchInvestigations")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-11 bg-slate-50 border-slate-200 focus:bg-white" data-testid="search-investigations" />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loadingInvestigations ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : filteredInvestigations.length === 0 ? (
            <div className="empty-state py-12 px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3 mx-auto">
                <FileText className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 text-center">{t("causal.noInvestigations")}</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {filteredInvestigations.map((inv) => {
                const statusColors = {
                  draft: "bg-slate-100 text-slate-600",
                  in_progress: "bg-amber-100 text-amber-700",
                  completed: "bg-green-100 text-green-700",
                  closed: "bg-blue-100 text-blue-700",
                };
                const statusColor = statusColors[inv.status] || statusColors.draft;
                
                return (
                  <button 
                    key={inv.id} 
                    onClick={() => setSelectedInvId(inv.id)} 
                    className={`w-full text-left p-4 rounded-xl transition-all duration-200 border ${
                      selectedInvId === inv.id 
                        ? "bg-blue-50 border-blue-300 shadow-sm ring-1 ring-blue-200" 
                        : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                    }`} 
                    data-testid={`investigation-item-${inv.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded">{inv.case_number}</span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusColor}`}>
                        {inv.status?.replace('_', ' ')}
                      </span>
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm line-clamp-2 mb-2 leading-snug">{inv.title}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {inv.asset_name && (
                        <div className="flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate max-w-[120px]">
                            {translateAssetName(inv.asset_name)}
                            {inv.equipment_tag && <span className="text-slate-400 ml-1">({inv.equipment_tag})</span>}
                          </span>
                        </div>
                      )}
                      {inv.incident_date && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDate(inv.incident_date)}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      
    </>
  );
}
