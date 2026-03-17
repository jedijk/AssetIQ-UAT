import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { threatsAPI } from "../lib/api";
import { 
  ChevronRight, 
  ChevronDown,
  Building2,
  Layers,
  Cog,
  Droplets,
  Wind,
  Thermometer,
  Box,
  Gauge,
  Zap,
  CircleDot,
  Pipette,
  AlertTriangle,
  X
} from "lucide-react";
import { Button } from "./ui/button";

// Equipment type icons
const equipmentIcons = {
  "Pump": Droplets,
  "Centrifugal Pump": Droplets,
  "Compressor": Wind,
  "Heat Exchanger": Thermometer,
  "Vessel": Box,
  "Tank": Box,
  "Valve": CircleDot,
  "Pipe": Pipette,
  "Sensor": Gauge,
  "Motor": Zap,
  "Electrical": Zap,
  "default": Cog
};

const getEquipmentIcon = (type) => {
  for (const [key, Icon] of Object.entries(equipmentIcons)) {
    if (type?.toLowerCase().includes(key.toLowerCase())) {
      return Icon;
    }
  }
  return equipmentIcons.default;
};

// Tree node component
const TreeNode = ({ label, icon: Icon, children, count, isOpen, onToggle, onClick, isActive, level = 0 }) => {
  const hasChildren = children && children.length > 0;
  
  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isActive ? "bg-blue-50 text-blue-700" : "hover:bg-slate-100 text-slate-700"
        }`}
        style={{ paddingLeft: `${8 + level * 12}px` }}
        onClick={() => {
          if (hasChildren) onToggle?.();
          onClick?.();
        }}
      >
        {hasChildren ? (
          <button className="p-0.5 hover:bg-slate-200 rounded" onClick={(e) => { e.stopPropagation(); onToggle?.(); }}>
            {isOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        ) : (
          <span className="w-4.5" />
        )}
        {Icon && <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />}
        <span className="text-sm font-medium truncate flex-1">{label}</span>
        {count !== undefined && (
          <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      {hasChildren && isOpen && (
        <div>
          {children}
        </div>
      )}
    </div>
  );
};

const EquipmentHierarchy = ({ isOpen, onClose, isMobile = false }) => {
  const navigate = useNavigate();
  const [expandedNodes, setExpandedNodes] = useState(new Set(["all"]));
  const [selectedAsset, setSelectedAsset] = useState(null);

  // Fetch threats to build hierarchy
  const { data: threats = [] } = useQuery({
    queryKey: ["threats"],
    queryFn: () => threatsAPI.getAll(),
  });

  // Build hierarchy from threats
  const hierarchy = useMemo(() => {
    const locationMap = new Map();

    threats.forEach((threat) => {
      const location = threat.location || "Unknown Location";
      const equipmentType = threat.equipment_type || "Other";
      const asset = threat.asset;

      if (!locationMap.has(location)) {
        locationMap.set(location, { name: location, equipmentTypes: new Map(), count: 0 });
      }
      const loc = locationMap.get(location);
      loc.count++;

      if (!loc.equipmentTypes.has(equipmentType)) {
        loc.equipmentTypes.set(equipmentType, { name: equipmentType, assets: new Map(), count: 0 });
      }
      const eqType = loc.equipmentTypes.get(equipmentType);
      eqType.count++;

      if (!eqType.assets.has(asset)) {
        eqType.assets.set(asset, { 
          name: asset, 
          threats: [], 
          riskLevel: threat.risk_level,
          equipmentType: equipmentType 
        });
      }
      eqType.assets.get(asset).threats.push(threat);
    });

    return { locations: locationMap, total: threats.length };
  }, [threats]);

  const toggleNode = (nodeId) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleAssetClick = (asset, assetData) => {
    setSelectedAsset(asset);
    if (assetData.threats.length === 1) {
      navigate(`/threats/${assetData.threats[0].id}`);
      if (isMobile) onClose?.();
    }
  };

  // Content component
  const Content = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-900">Equipment</h2>
        </div>
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-slate-400"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        <TreeNode
          label="All Equipment"
          icon={Building2}
          count={hierarchy.total}
          isOpen={expandedNodes.has("all")}
          onToggle={() => toggleNode("all")}
          onClick={() => navigate("/")}
          level={0}
        >
          {Array.from(hierarchy.locations.entries()).map(([locationName, locationData]) => (
            <TreeNode
              key={locationName}
              label={locationName}
              icon={Building2}
              count={locationData.count}
              isOpen={expandedNodes.has(`loc-${locationName}`)}
              onToggle={() => toggleNode(`loc-${locationName}`)}
              level={1}
            >
              {Array.from(locationData.equipmentTypes.entries()).map(([typeName, typeData]) => {
                const TypeIcon = getEquipmentIcon(typeName);
                return (
                  <TreeNode
                    key={`${locationName}-${typeName}`}
                    label={typeName}
                    icon={TypeIcon}
                    count={typeData.count}
                    isOpen={expandedNodes.has(`type-${locationName}-${typeName}`)}
                    onToggle={() => toggleNode(`type-${locationName}-${typeName}`)}
                    level={2}
                  >
                    {Array.from(typeData.assets.entries()).map(([assetName, assetData]) => {
                      const AssetIcon = getEquipmentIcon(assetData.equipmentType);
                      const riskColor = 
                        assetData.riskLevel === "Critical" ? "text-red-500" :
                        assetData.riskLevel === "High" ? "text-orange-500" :
                        assetData.riskLevel === "Medium" ? "text-yellow-500" :
                        "text-green-500";
                      
                      return (
                        <div
                          key={assetName}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                            selectedAsset === assetName ? "bg-blue-50 text-blue-700" : "hover:bg-slate-100 text-slate-700"
                          }`}
                          style={{ paddingLeft: "56px" }}
                          onClick={() => handleAssetClick(assetName, assetData)}
                        >
                          <AssetIcon className={`w-4 h-4 ${riskColor} flex-shrink-0`} />
                          <span className="text-sm truncate flex-1">{assetName}</span>
                          {assetData.threats.length > 1 && (
                            <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
                              {assetData.threats.length}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </TreeNode>
                );
              })}
            </TreeNode>
          ))}
        </TreeNode>

        {hierarchy.total === 0 && (
          <div className="text-center py-8 text-slate-500">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">No equipment data</p>
            <p className="text-xs">Report a threat to see equipment here</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-200 bg-slate-50">
        <div className="text-xs text-slate-500">
          <span className="font-medium">{hierarchy.total}</span> threats across{" "}
          <span className="font-medium">{hierarchy.locations.size}</span> locations
        </div>
      </div>
    </>
  );

  // Mobile: render with overlay
  if (isMobile) {
    if (!isOpen) return null;
    return (
      <>
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
        />
        <div className="fixed left-0 top-16 h-[calc(100vh-64px)] w-72 bg-white border-r border-slate-200 z-40 flex flex-col shadow-lg">
          <Content />
        </div>
      </>
    );
  }

  // Desktop: render inline
  return (
    <div className="h-full flex flex-col">
      <Content />
    </div>
  );
};

export default EquipmentHierarchy;
