import React from "react";

export function FormsPageHeader(props) {
  return (
    <>
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Form Designer</h1>
              <p className="text-sm text-slate-500">Create and manage data collection forms</p>
            </div>
          </div>
          <Button 
            onClick={() => {
              resetNewTemplate();
              setShowCreateDialog(true);
            }}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            data-testid="create-form-btn"
          >
            <Plus className="w-4 h-4 mr-2" /> New Form Template
          </Button>
        </div>
      )}

      {/* Embedded Header with Create Button */}
      {embedded && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-500">Create and manage data collection forms for your tasks</p>
          <Button 
            onClick={() => {
              resetNewTemplate();
              setShowCreateDialog(true);
            }}
            size="sm"
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            data-testid="create-form-btn"
          >
            <Plus className="w-4 h-4 mr-1" /> New Form
          </Button>
        </div>
      )}

      {/* Stats Cards */}
      <div className={`grid ${embedded ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'} gap-3 ${embedded ? 'mb-4' : 'mb-6'}`}>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Templates</p>
                <p className="text-xl font-bold text-slate-900">{stats.totalTemplates}</p>
              </div>
              <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Layers className="h-4 w-4 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        {!embedded && (
          <>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Submissions</p>
                    <p className="text-xl font-bold text-slate-900">{stats.totalSubmissions}</p>
                  </div>
                  <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Warnings</p>
                    <p className="text-xl font-bold text-amber-600">{stats.warningCount}</p>
                  </div>
                  <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Critical</p>
                    <p className="text-xl font-bold text-red-600">{stats.criticalCount}</p>
                  </div>
                  <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList>
    </>
  );
}
