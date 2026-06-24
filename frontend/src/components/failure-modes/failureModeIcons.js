import {
  AlertTriangle,
  Anchor,
  Ban,
  Battery,
  Bell,
  Cable,
  CircleDot,
  Cloud,
  Cpu,
  Cog,
  Droplet,
  Droplets,
  Fan,
  Filter,
  Flame,
  FlaskConical,
  Gauge,
  Leaf,
  Lock,
  Minimize2,
  MoveHorizontal,
  Package,
  Pipette,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Snowflake,
  Sun,
  Thermometer,
  TrendingDown,
  Unlink,
  UserRoundX,
  Volume2,
  Waves,
  Wifi,
  Wind,
  Workflow,
  Zap,
} from "lucide-react";
import { disciplineIcons } from "./disciplineStyles";

/** Failure-mode library category (API `category`, legacy `discipline`). */
export function getFailureModeCategory(fm) {
  return fm?.category || fm?.discipline || "";
}

function buildSearchText(fm) {
  const parts = [
    fm?.failure_mode,
    fm?.equipment,
    fm?.mechanism,
    fm?.mechanism_description,
    fm?.description,
    fm?.process,
    Array.isArray(fm?.keywords) ? fm.keywords.join(" ") : fm?.keywords,
    Array.isArray(fm?.potential_effects) ? fm.potential_effects.join(" ") : fm?.potential_effects,
    Array.isArray(fm?.potential_causes) ? fm.potential_causes.join(" ") : fm?.potential_causes,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * Ordered rules: first match wins. Patterns target failure mechanism / symptom language.
 * @type {{ icon: import("lucide-react").LucideIcon, test: RegExp }[]}
 */
const FAILURE_MODE_ICON_RULES = [
  { test: /\b(arc flash|electrical fire)\b/, icon: Flame },
  { test: /\b(fire|explosion|thermal runaway|burner malfunction)\b/, icon: Flame },
  { test: /\b(toxic release|gas leak|emission exceedance|chemical release)\b/, icon: Cloud },
  { test: /\b(oil spill|spill|spillage)\b/, icon: Droplets },
  { test: /\b(seal failure|packing leak|gasket|flange leak|stem leak|seat leak|mechanical seal|o-ring|leakage|leak|drip)\b/, icon: Droplets },
  { test: /\b(water hammer|pressure surge|overpressure|back pressure|surge)\b/, icon: Gauge },
  { test: /\b(cavitation|bubble)\b/, icon: Waves },
  { test: /\b(bearing|babbitt|thrust pad|trunnion bearing|roller bearing|spindle bearing)\b/, icon: CircleDot },
  { test: /\b(misalignment|imbalance|vibration|runout|deflection|hunting|oscillation|structural vibration)\b/, icon: Waves },
  { test: /\b(blade damage|impeller|fan blade|fin damage|blower|rotor rub)\b/, icon: Fan },
  { test: /\b(lubrication|lubricant|oil film|grease|low oil|oil contamination)\b/, icon: Droplet },
  { test: /\b(corrosion|cui|mic\b|rust|oxidation|stress corrosion|scc\b|external corrosion|internal corrosion)\b/, icon: ShieldOff },
  { test: /\b(extruder|screw wear|barrel wear|die wear|die block|hopper|feed throat|screen pack|clearance increase|mooney|tga test|tensile)\b/, icon: Minimize2 },
  { test: /\b(erosion|abrasive|scoring|pitting|wear ring|face wear|disc wear|seat wear)\b/, icon: TrendingDown },
  { test: /\b(fouling|blockage|clog|plugging|scaling|deposit|buildup|bridging|jam|screen pack|strainer|sieve)\b/, icon: Filter },
  { test: /\b(crack|rupture|fracture|breakage|fatigue crack|rotor crack|weld failure)\b/, icon: Unlink },
  { test: /\b(freeze|icing|cold spot)\b/, icon: Snowflake },
  { test: /\b(thermocouple|heater band|overheat|temperature controller|thermal fatigue|thermal expansion|high temperature|cooling failure)\b/, icon: Thermometer },
  { test: /\b(stuck|sticking|chattering|hard to operate|stuck open|stuck closed)\b/, icon: Lock },
  { test: /\b(actuator|solenoid|positioner|i\/p converter)\b/, icon: Cog },
  { test: /\b(sensor drift|calibration|detector drift|gauge drift|rtd drift|tc drift|instrumentation drift)\b/, icon: Gauge },
  { test: /\b(plc|controller|logic solver|firmware|software|hmi|database|configuration|cybersecurity)\b/, icon: Cpu },
  { test: /\b(communication|comm failure|network|signal loss|wifi|emi\/rfi)\b/, icon: Wifi },
  { test: /\b(alarm flooding|alarm failure|false alarm|spurious trip)\b/, icon: Bell },
  { test: /\b(short circuit|ground fault|harmonics|voltage spike|phase imbalance|motor burnout|motor failure|transformer|switchgear|relay|contactor|breaker|igbt|inverter|vfd|generator|exciter|winding|commutator|stator|armature)\b/, icon: Zap },
  { test: /\b(battery|ups\b|charger)\b/, icon: Battery },
  { test: /\b(cable|wiring|termination|loose connection|insulation failure)\b/, icon: Cable },
  { test: /\b(dry run|dry running|no fluid)\b/, icon: Sun },
  { test: /\b(psv|pressure release|relief valve|safety valve|protection failure|barrier failure|proof test|sil degradation)\b/, icon: ShieldCheck },
  { test: /\b(human error|operator error|incorrect operation|maintenance error|procedure|documentation|wrong label|wrong material|forgot)\b/, icon: UserRoundX },
  { test: /\b(evacuation|emergency system)\b/, icon: ShieldAlert },
  { test: /\b(belt|conveyor|chain|sprocket|drive chain)\b/, icon: MoveHorizontal },
  { test: /\b(grinding wheel|knife wear|wheel wear)\b/, icon: Wind },
  { test: /\b(anchor failure|support failure|structural fatigue|structure integrity)\b/, icon: Anchor },
  { test: /\b(pigging)\b/, icon: Pipette },
  { test: /\b(water contamination|thermal pollution|water leak)\b/, icon: Droplets },
  { test: /\b(noise violation|noise)\b/, icon: Volume2 },
  { test: /\b(dust emission|dust extraction)\b/, icon: Cloud },
  { test: /\b(regulatory|compliance|audit)\b/, icon: Scale },
  { test: /\b(waste handling|waste system)\b/, icon: Package },
  { test: /\b(cooling fan|coolant|draft system|ventilation)\b/, icon: Fan },
  { test: /\b(vacuum)\b/, icon: Gauge },
  { test: /\b(overload|underdesign|poor design|poor planning|material failure)\b/, icon: Workflow },
  { test: /\b(soil contamination|environment|emission)\b/, icon: Leaf },
  { test: /\b(detection failure|detector poisoning|gas detector)\b/, icon: Shield },
];

/**
 * Resolve a lucide icon component for a failure mode record.
 * Falls back to discipline/category icon, then AlertTriangle.
 */
export function getFailureModeIcon(fm) {
  if (!fm) return AlertTriangle;

  const searchText = buildSearchText(fm);
  if (searchText) {
    for (const rule of FAILURE_MODE_ICON_RULES) {
      if (rule.test.test(searchText)) {
        return rule.icon;
      }
    }
  }

  const category = getFailureModeCategory(fm);
  return disciplineIcons[category] || AlertTriangle;
}
