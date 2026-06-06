import React from "react";

export function InvestigationToolbar(props) {
  return (
    <>
          {/* Tabs - same style as other pages */}
          <div className="flex items-center gap-1 px-4 py-2 bg-white border-b border-slate-200">
            {tabs.map(tab => {
              const TabIcon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`} data-testid={`tab-${tab.id}`}>
                  <TabIcon className="w-4 h-4" />
                  {tab.label}
                  {tab.count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === tab.id ? "bg-blue-200" : "bg-slate-200"}`}>{tab.count}</span>}
                </button>
              );
            })}
          </div>
          
    </>
  );
}
