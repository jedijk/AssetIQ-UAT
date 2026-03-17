# Failure Mode Library for ThreatBase
# FMEA-based failure modes with RPN calculations

FAILURE_MODES_LIBRARY = [
  {"id":1,"category":"Rotating","equipment":"Pump","failure_mode":"Seal Failure","keywords":["leak","seal","drip","pump leak"],"severity":8,"occurrence":7,"detectability":5,"rpn":280,"recommended_actions":["Inspect seal","Check alignment","Adjust maintenance"]},
  {"id":2,"category":"Rotating","equipment":"Pump","failure_mode":"Bearing Failure","keywords":["bearing","noise","vibration","heat"],"severity":9,"occurrence":6,"detectability":4,"rpn":216,"recommended_actions":["Improve lubrication","Monitor vibration","Replace bearings"]},
  {"id":3,"category":"Rotating","equipment":"Pump","failure_mode":"Cavitation","keywords":["cavitation","bubbles","noise"],"severity":7,"occurrence":6,"detectability":6,"rpn":252,"recommended_actions":["Increase suction pressure","Check NPSH","Adjust operation"]},
  {"id":4,"category":"Rotating","equipment":"Pump","failure_mode":"Misalignment","keywords":["misalignment","shaft","vibration"],"severity":6,"occurrence":7,"detectability":3,"rpn":126,"recommended_actions":["Align shaft","Check base","Use tools"]},
  {"id":5,"category":"Rotating","equipment":"Pump","failure_mode":"Imbalance","keywords":["imbalance","rotor","vibration"],"severity":6,"occurrence":6,"detectability":4,"rpn":144,"recommended_actions":["Balance rotor","Clean deposits","Inspect"]},
  {"id":6,"category":"Rotating","equipment":"Compressor","failure_mode":"Surge","keywords":["surge","unstable","flow"],"severity":9,"occurrence":5,"detectability":5,"rpn":225,"recommended_actions":["Install anti-surge","Monitor flow","Operate correctly"]},
  {"id":7,"category":"Rotating","equipment":"Compressor","failure_mode":"Blade Damage","keywords":["blade","damage","debris"],"severity":8,"occurrence":4,"detectability":6,"rpn":192,"recommended_actions":["Install filters","Inspect blades","Remove debris"]},
  {"id":8,"category":"Rotating","equipment":"Compressor","failure_mode":"Lubrication Failure","keywords":["oil","lubrication","overheat"],"severity":8,"occurrence":6,"detectability":5,"rpn":240,"recommended_actions":["Improve oil quality","Monitor temp","Replace oil"]},
  {"id":9,"category":"Rotating","equipment":"Turbine","failure_mode":"Rotor Crack","keywords":["crack","fatigue","rotor"],"severity":10,"occurrence":3,"detectability":7,"rpn":210,"recommended_actions":["Inspect regularly","Upgrade material","Monitor stress"]},
  {"id":10,"category":"Rotating","equipment":"General","failure_mode":"Dry Running","keywords":["dry","no fluid"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Install interlock","Monitor flow","Train operators"]},

  {"id":11,"category":"Static","equipment":"Vessel","failure_mode":"Internal Corrosion","keywords":["corrosion","internal","rust"],"severity":9,"occurrence":6,"detectability":6,"rpn":324,"recommended_actions":["Apply coating","Monitor thickness","Use inhibitor"]},
  {"id":12,"category":"Static","equipment":"Vessel","failure_mode":"External Corrosion","keywords":["corrosion","external","weather"],"severity":8,"occurrence":7,"detectability":5,"rpn":280,"recommended_actions":["Inspect coating","Maintain insulation","Paint"]},
  {"id":13,"category":"Static","equipment":"Heat Exchanger","failure_mode":"Fouling","keywords":["fouling","scaling","dirty"],"severity":6,"occurrence":8,"detectability":4,"rpn":192,"recommended_actions":["Clean regularly","Monitor efficiency","Treat chemicals"]},
  {"id":14,"category":"Static","equipment":"Heat Exchanger","failure_mode":"Tube Leak","keywords":["tube leak","contamination"],"severity":8,"occurrence":5,"detectability":6,"rpn":240,"recommended_actions":["Inspect tubes","Replace","Pressure test"]},
  {"id":15,"category":"Static","equipment":"Heat Exchanger","failure_mode":"Tube Rupture","keywords":["rupture","tube"],"severity":10,"occurrence":3,"detectability":7,"rpn":210,"recommended_actions":["Monitor pressure","Inspect","Shutdown protocol"]},
  {"id":16,"category":"Static","equipment":"Vessel","failure_mode":"Overpressure","keywords":["overpressure","pressure high"],"severity":10,"occurrence":3,"detectability":5,"rpn":150,"recommended_actions":["Install relief valve","Monitor pressure","Test PSV"]},
  {"id":17,"category":"Static","equipment":"Vessel","failure_mode":"Stress Corrosion Cracking","keywords":["scc","crack","stress"],"severity":9,"occurrence":4,"detectability":8,"rpn":288,"recommended_actions":["Material upgrade","Inspect","Reduce stress"]},
  {"id":18,"category":"Static","equipment":"Vessel","failure_mode":"Thermal Fatigue","keywords":["thermal","fatigue","cycling"],"severity":8,"occurrence":5,"detectability":7,"rpn":280,"recommended_actions":["Control temp","Inspect cracks","Reduce cycles"]},
  {"id":19,"category":"Static","equipment":"Vessel","failure_mode":"Weld Failure","keywords":["weld","crack"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Improve QA","Inspect weld","Repair"]},
  {"id":20,"category":"Static","equipment":"Vessel","failure_mode":"CUI","keywords":["corrosion under insulation","cui"],"severity":8,"occurrence":6,"detectability":8,"rpn":384,"recommended_actions":["Inspect insulation","Remove lagging","Repair coating"]},

  {"id":21,"category":"Piping","equipment":"Pipe","failure_mode":"Corrosion Leak","keywords":["leak","corrosion","pipe"],"severity":9,"occurrence":7,"detectability":6,"rpn":378,"recommended_actions":["Coating","Inspection","Replacement"]},
  {"id":22,"category":"Piping","equipment":"Pipe","failure_mode":"Erosion","keywords":["erosion","wear"],"severity":8,"occurrence":6,"detectability":5,"rpn":240,"recommended_actions":["Reduce velocity","Inspect","Material upgrade"]},
  {"id":23,"category":"Piping","equipment":"Valve","failure_mode":"Seat Leakage","keywords":["valve leak","seat"],"severity":6,"occurrence":7,"detectability":4,"rpn":168,"recommended_actions":["Replace seat","Inspect","Maintain"]},
  {"id":24,"category":"Piping","equipment":"Valve","failure_mode":"Valve Stuck","keywords":["stuck","valve"],"severity":8,"occurrence":5,"detectability":5,"rpn":200,"recommended_actions":["Service valve","Lubricate","Replace"]},
  {"id":25,"category":"Piping","equipment":"Pipe","failure_mode":"Gasket Failure","keywords":["gasket","flange leak"],"severity":7,"occurrence":7,"detectability":4,"rpn":196,"recommended_actions":["Replace gasket","Torque correctly","Inspect"]},
  {"id":26,"category":"Piping","equipment":"Pipe","failure_mode":"Flange Leak","keywords":["flange","leak"],"severity":7,"occurrence":5,"detectability":5,"rpn":175,"recommended_actions":["Align flange","Tighten bolts","Inspect"]},
  {"id":27,"category":"Piping","equipment":"Pipe","failure_mode":"Fatigue Crack","keywords":["fatigue","crack"],"severity":9,"occurrence":4,"detectability":7,"rpn":252,"recommended_actions":["Reduce stress","Inspect","Repair"]},
  {"id":28,"category":"Piping","equipment":"Pipe","failure_mode":"Thermal Expansion Failure","keywords":["thermal","expansion"],"severity":8,"occurrence":5,"detectability":6,"rpn":240,"recommended_actions":["Expansion loops","Design check","Inspect"]},
  {"id":29,"category":"Piping","equipment":"Pipe","failure_mode":"Water Hammer","keywords":["hammer","pressure surge"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Install dampener","Control valves","Monitor"]},
  {"id":30,"category":"Piping","equipment":"Pipe","failure_mode":"Blockage","keywords":["block","plug"],"severity":7,"occurrence":6,"detectability":5,"rpn":210,"recommended_actions":["Clean line","Monitor flow","Flush system"]},

  {"id":31,"category":"Piping","equipment":"Pipe","failure_mode":"MIC","keywords":["bacteria","mic"],"severity":8,"occurrence":5,"detectability":7,"rpn":280,"recommended_actions":["Biocide","Monitor","Inspect"]},
  {"id":32,"category":"Piping","equipment":"Valve","failure_mode":"Actuator Failure","keywords":["actuator","fail"],"severity":8,"occurrence":5,"detectability":5,"rpn":200,"recommended_actions":["Service actuator","Replace","Test"]},
  {"id":33,"category":"Piping","equipment":"Valve","failure_mode":"Stem Leak","keywords":["stem leak"],"severity":7,"occurrence":6,"detectability":5,"rpn":210,"recommended_actions":["Replace packing","Tighten","Inspect"]},
  {"id":34,"category":"Piping","equipment":"Pipe","failure_mode":"Scaling","keywords":["scale","deposit"],"severity":6,"occurrence":7,"detectability":5,"rpn":210,"recommended_actions":["Descale","Chemical clean","Monitor"]},
  {"id":35,"category":"Piping","equipment":"Pipe","failure_mode":"Support Failure","keywords":["support","pipe support"],"severity":8,"occurrence":4,"detectability":6,"rpn":192,"recommended_actions":["Repair support","Inspect","Reinforce"]},
  {"id":36,"category":"Piping","equipment":"Pipe","failure_mode":"Freeze Rupture","keywords":["freeze","cold"],"severity":8,"occurrence":3,"detectability":6,"rpn":144,"recommended_actions":["Insulate","Heat trace","Drain"]},
  {"id":37,"category":"Piping","equipment":"Pipe","failure_mode":"Sand Erosion","keywords":["sand","erosion"],"severity":8,"occurrence":6,"detectability":5,"rpn":240,"recommended_actions":["Filter solids","Inspect","Upgrade material"]},
  {"id":38,"category":"Piping","equipment":"Pipe","failure_mode":"Dead Leg Corrosion","keywords":["dead leg"],"severity":7,"occurrence":6,"detectability":7,"rpn":294,"recommended_actions":["Remove dead legs","Inspect","Flush"]},
  {"id":39,"category":"Piping","equipment":"Pipe","failure_mode":"Anchor Failure","keywords":["anchor","movement"],"severity":7,"occurrence":4,"detectability":6,"rpn":168,"recommended_actions":["Fix anchor","Inspect","Reinforce"]},
  {"id":40,"category":"Piping","equipment":"Pipe","failure_mode":"Pigging Damage","keywords":["pigging","damage"],"severity":7,"occurrence":3,"detectability":6,"rpn":126,"recommended_actions":["Improve procedure","Inspect","Train"]},

  {"id":41,"category":"Instrumentation","equipment":"Sensor","failure_mode":"Sensor Drift","keywords":["drift","calibration"],"severity":8,"occurrence":6,"detectability":7,"rpn":336,"recommended_actions":["Calibrate","Replace","Verify"]},
  {"id":42,"category":"Instrumentation","equipment":"Sensor","failure_mode":"Sensor Failure","keywords":["sensor fail"],"severity":7,"occurrence":5,"detectability":5,"rpn":175,"recommended_actions":["Replace sensor","Test","Maintain"]},
  {"id":43,"category":"Instrumentation","equipment":"Control Valve","failure_mode":"Valve Sticking","keywords":["valve stuck"],"severity":8,"occurrence":6,"detectability":5,"rpn":240,"recommended_actions":["Lubricate","Repair","Replace"]},
  {"id":44,"category":"Instrumentation","equipment":"Control","failure_mode":"Loop Instability","keywords":["loop unstable"],"severity":7,"occurrence":5,"detectability":6,"rpn":210,"recommended_actions":["Tune loop","Adjust PID","Test"]},
  {"id":45,"category":"Instrumentation","equipment":"PLC","failure_mode":"PLC Failure","keywords":["plc"],"severity":9,"occurrence":3,"detectability":4,"rpn":108,"recommended_actions":["Redundancy","Backup","Test"]},
  {"id":46,"category":"Instrumentation","equipment":"Signal","failure_mode":"Signal Loss","keywords":["signal loss"],"severity":7,"occurrence":5,"detectability":5,"rpn":175,"recommended_actions":["Repair wiring","Test signal","Replace cable"]},
  {"id":47,"category":"Instrumentation","equipment":"Sensor","failure_mode":"Calibration Error","keywords":["calibration error"],"severity":7,"occurrence":6,"detectability":6,"rpn":252,"recommended_actions":["Improve procedures","Train","Audit"]},
  {"id":48,"category":"Instrumentation","equipment":"Power","failure_mode":"Power Failure","keywords":["instrument power"],"severity":8,"occurrence":4,"detectability":5,"rpn":160,"recommended_actions":["Backup power","Test","Inspect"]},
  {"id":49,"category":"Instrumentation","equipment":"Communication","failure_mode":"Comm Failure","keywords":["communication"],"severity":7,"occurrence":5,"detectability":6,"rpn":210,"recommended_actions":["Improve network","Redundancy","Monitor"]},
  {"id":50,"category":"Instrumentation","equipment":"Alarm","failure_mode":"Alarm Flooding","keywords":["alarm","too many"],"severity":6,"occurrence":7,"detectability":7,"rpn":294,"recommended_actions":["Rationalize alarms","Filter","Prioritize"]},

  {"id":51,"category":"Electrical","equipment":"Motor","failure_mode":"Motor Burnout","keywords":["motor burn"],"severity":8,"occurrence":6,"detectability":5,"rpn":240,"recommended_actions":["Monitor load","Inspect","Protect"]},
  {"id":52,"category":"Electrical","equipment":"Transformer","failure_mode":"Transformer Failure","keywords":["transformer"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Test oil","Inspect","Maintain"]},
  {"id":53,"category":"Electrical","equipment":"System","failure_mode":"Short Circuit","keywords":["short circuit"],"severity":10,"occurrence":4,"detectability":5,"rpn":200,"recommended_actions":["Install protection","Inspect","Maintain"]},
  {"id":54,"category":"Electrical","equipment":"Cable","failure_mode":"Insulation Failure","keywords":["cable","insulation"],"severity":8,"occurrence":5,"detectability":6,"rpn":240,"recommended_actions":["Replace cable","Inspect","Test"]},
  {"id":55,"category":"Electrical","equipment":"System","failure_mode":"Power Loss","keywords":["outage"],"severity":10,"occurrence":4,"detectability":3,"rpn":120,"recommended_actions":["Backup power","Test","Maintain"]},
  {"id":56,"category":"Electrical","equipment":"Protection","failure_mode":"Relay Failure","keywords":["relay"],"severity":7,"occurrence":5,"detectability":5,"rpn":175,"recommended_actions":["Test relay","Replace","Maintain"]},
  {"id":57,"category":"Electrical","equipment":"System","failure_mode":"Ground Fault","keywords":["ground fault"],"severity":8,"occurrence":5,"detectability":5,"rpn":200,"recommended_actions":["Improve grounding","Inspect","Monitor"]},
  {"id":58,"category":"Electrical","equipment":"Switchgear","failure_mode":"Switchgear Failure","keywords":["switchgear"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Maintain","Inspect","Replace"]},
  {"id":59,"category":"Electrical","equipment":"UPS","failure_mode":"UPS Failure","keywords":["ups"],"severity":7,"occurrence":5,"detectability":4,"rpn":140,"recommended_actions":["Replace battery","Test","Maintain"]},
  {"id":60,"category":"Electrical","equipment":"System","failure_mode":"Harmonics Damage","keywords":["harmonics"],"severity":6,"occurrence":4,"detectability":6,"rpn":144,"recommended_actions":["Install filters","Monitor","Adjust"]},

  {"id":61,"category":"Electrical","equipment":"System","failure_mode":"Voltage Spike","keywords":["voltage spike"],"severity":7,"occurrence":4,"detectability":5,"rpn":140,"recommended_actions":["Install surge protection","Monitor","Ground"]},
  {"id":62,"category":"Electrical","equipment":"Generator","failure_mode":"Generator Failure","keywords":["generator"],"severity":9,"occurrence":4,"detectability":5,"rpn":180,"recommended_actions":["Test regularly","Maintain","Inspect"]},
  {"id":63,"category":"Electrical","equipment":"Battery","failure_mode":"Battery Degradation","keywords":["battery"],"severity":6,"occurrence":6,"detectability":5,"rpn":180,"recommended_actions":["Replace battery","Test","Monitor"]},
  {"id":64,"category":"Electrical","equipment":"System","failure_mode":"Phase Imbalance","keywords":["phase"],"severity":7,"occurrence":5,"detectability":6,"rpn":210,"recommended_actions":["Balance load","Monitor","Adjust"]},
  {"id":65,"category":"Electrical","equipment":"System","failure_mode":"Arc Flash","keywords":["arc flash"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Improve protection","Train","Inspect"]},
  {"id":66,"category":"Electrical","equipment":"Cable","failure_mode":"Loose Connection","keywords":["loose","connection"],"severity":7,"occurrence":6,"detectability":4,"rpn":168,"recommended_actions":["Tighten","Inspect","Maintain"]},
  {"id":67,"category":"Electrical","equipment":"Cooling","failure_mode":"Cooling Failure","keywords":["cooling"],"severity":8,"occurrence":4,"detectability":5,"rpn":160,"recommended_actions":["Inspect cooling","Repair","Monitor"]},
  {"id":68,"category":"Electrical","equipment":"System","failure_mode":"Frequency Instability","keywords":["frequency"],"severity":8,"occurrence":3,"detectability":6,"rpn":144,"recommended_actions":["Stabilize supply","Monitor","Adjust"]},
  {"id":69,"category":"Electrical","equipment":"Relay","failure_mode":"Protection Failure","keywords":["protection"],"severity":9,"occurrence":3,"detectability":6,"rpn":162,"recommended_actions":["Test system","Upgrade","Inspect"]},
  {"id":70,"category":"Electrical","equipment":"Panel","failure_mode":"Electrical Fire","keywords":["fire","panel"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Inspect wiring","Install protection","Maintain"]},

  {"id":71,"category":"Process","equipment":"Operations","failure_mode":"Incorrect Operation","keywords":["operator error"],"severity":8,"occurrence":6,"detectability":6,"rpn":288,"recommended_actions":["Train operators","Improve procedures","Audit"]},
  {"id":72,"category":"Process","equipment":"Maintenance","failure_mode":"Maintenance Error","keywords":["maintenance error"],"severity":8,"occurrence":5,"detectability":6,"rpn":240,"recommended_actions":["Improve QA","Train staff","Review work"]},
  {"id":73,"category":"Process","equipment":"Operations","failure_mode":"Procedure Not Followed","keywords":["procedure"],"severity":8,"occurrence":6,"detectability":7,"rpn":336,"recommended_actions":["Train","Audit","Simplify procedures"]},
  {"id":74,"category":"Process","equipment":"System","failure_mode":"Poor Design","keywords":["design"],"severity":9,"occurrence":4,"detectability":8,"rpn":288,"recommended_actions":["Redesign","Review","Upgrade"]},
  {"id":75,"category":"Process","equipment":"Planning","failure_mode":"Poor Planning","keywords":["planning"],"severity":7,"occurrence":6,"detectability":6,"rpn":252,"recommended_actions":["Improve planning","Review","Optimize"]},
  {"id":76,"category":"Process","equipment":"System","failure_mode":"Overload","keywords":["overload"],"severity":9,"occurrence":5,"detectability":5,"rpn":225,"recommended_actions":["Reduce load","Monitor","Upgrade"]},
  {"id":77,"category":"Process","equipment":"System","failure_mode":"Underdesign","keywords":["underdesign"],"severity":9,"occurrence":4,"detectability":7,"rpn":252,"recommended_actions":["Upgrade design","Review capacity","Improve"]},
  {"id":78,"category":"Process","equipment":"System","failure_mode":"Material Failure","keywords":["material"],"severity":9,"occurrence":4,"detectability":7,"rpn":252,"recommended_actions":["Upgrade material","Inspect","Test"]},
  {"id":79,"category":"Process","equipment":"System","failure_mode":"Human Error","keywords":["error"],"severity":8,"occurrence":7,"detectability":6,"rpn":336,"recommended_actions":["Training","Automation","Review"]},
  {"id":80,"category":"Process","equipment":"System","failure_mode":"Communication Failure","keywords":["communication"],"severity":7,"occurrence":6,"detectability":6,"rpn":252,"recommended_actions":["Improve communication","Standardize","Train"]},

  {"id":81,"category":"Safety","equipment":"System","failure_mode":"Gas Leak","keywords":["gas leak"],"severity":10,"occurrence":4,"detectability":5,"rpn":200,"recommended_actions":["Install detectors","Inspect","Repair"]},
  {"id":82,"category":"Safety","equipment":"System","failure_mode":"Explosion Risk","keywords":["explosion"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Control ignition","Monitor","Train"]},
  {"id":83,"category":"Safety","equipment":"System","failure_mode":"Fire","keywords":["fire"],"severity":10,"occurrence":4,"detectability":5,"rpn":200,"recommended_actions":["Install fire system","Inspect","Train"]},
  {"id":84,"category":"Safety","equipment":"System","failure_mode":"Toxic Release","keywords":["toxic"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Containment","Detection","Evacuation"]},
  {"id":85,"category":"Safety","equipment":"System","failure_mode":"Pressure Release Failure","keywords":["psv"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Test PSV","Maintain","Inspect"]},
  {"id":86,"category":"Safety","equipment":"System","failure_mode":"Emergency System Failure","keywords":["emergency"],"severity":10,"occurrence":3,"detectability":5,"rpn":150,"recommended_actions":["Test systems","Maintain","Train"]},
  {"id":87,"category":"Safety","equipment":"System","failure_mode":"Detection Failure","keywords":["detector"],"severity":9,"occurrence":4,"detectability":7,"rpn":252,"recommended_actions":["Test detectors","Replace","Inspect"]},
  {"id":88,"category":"Safety","equipment":"System","failure_mode":"Evacuation Failure","keywords":["evacuation"],"severity":9,"occurrence":3,"detectability":7,"rpn":189,"recommended_actions":["Train","Drill","Improve routes"]},
  {"id":89,"category":"Safety","equipment":"System","failure_mode":"Alarm Failure","keywords":["alarm"],"severity":8,"occurrence":4,"detectability":6,"rpn":192,"recommended_actions":["Test alarms","Maintain","Replace"]},
  {"id":90,"category":"Safety","equipment":"System","failure_mode":"Barrier Failure","keywords":["barrier"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Inspect barriers","Repair","Test"]},

  {"id":91,"category":"Environment","equipment":"System","failure_mode":"Oil Spill","keywords":["spill"],"severity":10,"occurrence":4,"detectability":5,"rpn":200,"recommended_actions":["Containment","Inspect","Train"]},
  {"id":92,"category":"Environment","equipment":"System","failure_mode":"Emission Exceedance","keywords":["emission"],"severity":9,"occurrence":5,"detectability":6,"rpn":270,"recommended_actions":["Monitor","Control","Adjust"]},
  {"id":93,"category":"Environment","equipment":"System","failure_mode":"Water Contamination","keywords":["water"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Treat water","Monitor","Contain"]},
  {"id":94,"category":"Environment","equipment":"System","failure_mode":"Waste Handling Failure","keywords":["waste"],"severity":8,"occurrence":5,"detectability":6,"rpn":240,"recommended_actions":["Improve handling","Train","Audit"]},
  {"id":95,"category":"Environment","equipment":"System","failure_mode":"Chemical Release","keywords":["chemical"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Containment","Monitor","Emergency plan"]},
  {"id":96,"category":"Environment","equipment":"System","failure_mode":"Soil Contamination","keywords":["soil"],"severity":9,"occurrence":4,"detectability":7,"rpn":252,"recommended_actions":["Monitor soil","Contain","Clean"]},
  {"id":97,"category":"Environment","equipment":"System","failure_mode":"Noise Violation","keywords":["noise"],"severity":6,"occurrence":6,"detectability":6,"rpn":216,"recommended_actions":["Reduce noise","Monitor","Maintain"]},
  {"id":98,"category":"Environment","equipment":"System","failure_mode":"Thermal Pollution","keywords":["thermal"],"severity":7,"occurrence":4,"detectability":6,"rpn":168,"recommended_actions":["Cool discharge","Monitor","Control"]},
  {"id":99,"category":"Environment","equipment":"System","failure_mode":"Dust Emission","keywords":["dust"],"severity":6,"occurrence":5,"detectability":6,"rpn":180,"recommended_actions":["Install filters","Monitor","Maintain"]},
  {"id":100,"category":"Environment","equipment":"System","failure_mode":"Regulatory Non-Compliance","keywords":["compliance"],"severity":9,"occurrence":4,"detectability":7,"rpn":252,"recommended_actions":["Audit","Train","Improve procedures"]}
]

def find_matching_failure_modes(text: str, limit: int = 5) -> list:
    """Find failure modes that match keywords in the input text."""
    text_lower = text.lower()
    matches = []
    
    for fm in FAILURE_MODES_LIBRARY:
        score = 0
        for keyword in fm["keywords"]:
            if keyword.lower() in text_lower:
                score += 1
        if score > 0:
            matches.append((score, fm))
    
    # Sort by score descending, then by RPN descending
    matches.sort(key=lambda x: (-x[0], -x[1]["rpn"]))
    return [m[1] for m in matches[:limit]]

def get_failure_modes_by_category(category: str) -> list:
    """Get all failure modes for a specific category."""
    return [fm for fm in FAILURE_MODES_LIBRARY if fm["category"].lower() == category.lower()]

def get_failure_modes_by_equipment(equipment: str) -> list:
    """Get all failure modes for a specific equipment type."""
    return [fm for fm in FAILURE_MODES_LIBRARY if fm["equipment"].lower() == equipment.lower()]

def get_high_rpn_failure_modes(threshold: int = 250) -> list:
    """Get failure modes with RPN above threshold."""
    return sorted([fm for fm in FAILURE_MODES_LIBRARY if fm["rpn"] >= threshold], 
                  key=lambda x: -x["rpn"])

def get_all_categories() -> list:
    """Get unique categories."""
    return list(set(fm["category"] for fm in FAILURE_MODES_LIBRARY))

def get_all_equipment_types() -> list:
    """Get unique equipment types."""
    return list(set(fm["equipment"] for fm in FAILURE_MODES_LIBRARY))
