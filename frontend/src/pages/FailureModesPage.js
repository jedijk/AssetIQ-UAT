import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
  Search, 
  Filter, 
  AlertTriangle,
  Cog,
  Zap,
  Thermometer,
  Activity,
  Shield,
  Leaf,
  ChevronDown,
  ChevronUp,
  Info
} from "lucide-react";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../components/ui/collapsible";
import { Badge } from "../components/ui/badge";
import api from "../lib/api";

const categoryIcons = {
  Rotating: Cog,
  Static: Thermometer,
  Piping: Activity,
  Instrumentation: Zap,
  Electrical: Zap,
  Process: Activity,
  Safety: Shield,
  Environment: Leaf,
  Extruder: Cog,
};

const categoryColors = {
  Rotating: "bg-blue-100 text-blue-700 border-blue-200",
  Static: "bg-purple-100 text-purple-700 border-purple-200",
  Piping: "bg-orange-100 text-orange-700 border-orange-200",
  Instrumentation: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Electrical: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Process: "bg-slate-100 text-slate-700 border-slate-200",
  Safety: "bg-red-100 text-red-700 border-red-200",
  Environment: "bg-green-100 text-green-700 border-green-200",
  Extruder: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

const getRpnColor = (rpn) => {
  if (rpn >= 300) return "bg-red-500";
  if (rpn >= 200) return "bg-orange-500";
  if (rpn >= 150) return "bg-yellow-500";
  return "bg-green-500";
};

const FailureModesPage = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ["failureModeCategories"],
    queryFn: async () => {
      const response = await api.get("/failure-modes/categories");
      return response.data;
    },
  });

  // Fetch failure modes
  const { data: modesData, isLoading } = useQuery({
    queryKey: ["failureModes", categoryFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter && categoryFilter !== "all") {
        params.append("category", categoryFilter);
      }
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      const response = await api.get(`/failure-modes?${params.toString()}`);
      return response.data;
    },
  });

  const categories = categoriesData?.categories || [];
  const failureModes = modesData?.failure_modes || [];
  
  // Calculate dynamic stats
  const totalModes = failureModes.length;
  const totalCategories = categories.length;

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl" data-testid="failure-modes-page">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Failure Mode Library</h1>
        <p className="text-slate-500">
          FMEA-based reference library with {totalModes} failure modes across industrial equipment
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-2xl font-bold text-slate-900">{totalModes}</div>
          <div className="text-sm text-slate-500">Failure Modes</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-slate-900">{totalCategories}</div>
          <div className="text-sm text-slate-500">Categories</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-red-600">
            {failureModes.filter(fm => fm.rpn >= 300).length}
          </div>
          <div className="text-sm text-slate-500">High Risk (RPN≥300)</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-orange-600">
            {failureModes.filter(fm => fm.rpn >= 200 && fm.rpn < 300).length}
          </div>
          <div className="text-sm text-slate-500">Medium Risk</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6" data-testid="filters">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Search by keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11"
            data-testid="search-input"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-48 h-11" data-testid="category-filter">
            <Filter className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category Legend */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Object.entries(categoryColors).map(([cat, colors]) => {
          const Icon = categoryIcons[cat] || AlertTriangle;
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? "all" : cat)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-medium transition-all ${
                categoryFilter === cat 
                  ? colors + " ring-2 ring-offset-2 ring-blue-500" 
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
              data-testid={`category-badge-${cat.toLowerCase()}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {cat}
            </button>
          );
        })}
      </div>

      {/* Failure Modes List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      ) : failureModes.length === 0 ? (
        <div className="text-center py-16">
          <Info className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">No matches found</h3>
          <p className="text-slate-500">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="failure-modes-list">
          {failureModes.map((fm, idx) => {
            const Icon = categoryIcons[fm.category] || AlertTriangle;
            const isExpanded = expandedId === fm.id;
            
            return (
              <motion.div
                key={fm.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02 }}
              >
                <Collapsible open={isExpanded} onOpenChange={() => setExpandedId(isExpanded ? null : fm.id)}>
                  <div className="card overflow-hidden" data-testid={`failure-mode-${fm.id}`}>
                    <CollapsibleTrigger className="w-full">
                      <div className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                        {/* RPN Indicator */}
                        <div className="flex-shrink-0 relative">
                          <div className={`w-12 h-12 rounded-lg ${getRpnColor(fm.rpn)} bg-opacity-10 flex items-center justify-center`}>
                            <span className="text-lg font-bold">{fm.rpn}</span>
                          </div>
                          <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full ${getRpnColor(fm.rpn)}`} />
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-slate-900 truncate">
                              {fm.failure_mode}
                            </h3>
                            <Badge variant="outline" className={categoryColors[fm.category]}>
                              <Icon className="w-3 h-3 mr-1" />
                              {fm.category}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-500">
                            {fm.equipment} • Keywords: {fm.keywords.slice(0, 3).join(", ")}
                          </p>
                        </div>

                        {/* FMEA Scores */}
                        <div className="hidden md:flex items-center gap-4 text-sm">
                          <div className="text-center">
                            <div className="font-semibold text-slate-700">{fm.severity}</div>
                            <div className="text-xs text-slate-400">SEV</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-slate-700">{fm.occurrence}</div>
                            <div className="text-xs text-slate-400">OCC</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-slate-700">{fm.detectability}</div>
                            <div className="text-xs text-slate-400">DET</div>
                          </div>
                        </div>

                        {/* Expand Icon */}
                        <div className="flex-shrink-0 text-slate-400">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-0 border-t border-slate-100">
                        <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* FMEA Details */}
                          <div className="bg-slate-50 rounded-lg p-4">
                            <h4 className="font-medium text-slate-700 mb-3">FMEA Scores</h4>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <div className="text-2xl font-bold text-slate-900">{fm.severity}</div>
                                <div className="text-xs text-slate-500">Severity</div>
                              </div>
                              <div>
                                <div className="text-2xl font-bold text-slate-900">{fm.occurrence}</div>
                                <div className="text-xs text-slate-500">Occurrence</div>
                              </div>
                              <div>
                                <div className="text-2xl font-bold text-slate-900">{fm.detectability}</div>
                                <div className="text-xs text-slate-500">Detectability</div>
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <div className="text-xs text-slate-500">
                                RPN = {fm.severity} × {fm.occurrence} × {fm.detectability} = <strong className="text-slate-700">{fm.rpn}</strong>
                              </div>
                            </div>
                          </div>

                          {/* Recommended Actions */}
                          <div>
                            <h4 className="font-medium text-slate-700 mb-3">Recommended Actions</h4>
                            <ul className="space-y-2">
                              {fm.recommended_actions.map((action, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
                                    {i + 1}
                                  </span>
                                  {action}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {/* Keywords */}
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <h4 className="text-xs font-medium text-slate-500 mb-2">Detection Keywords</h4>
                          <div className="flex flex-wrap gap-2">
                            {fm.keywords.map((kw, i) => (
                              <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FailureModesPage;
