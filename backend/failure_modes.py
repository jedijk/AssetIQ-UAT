# Failure Mode Library for ThreatBase
# FMEA-based failure modes with RPN calculations

FAILURE_MODES_LIBRARY = [
  # Rotating - Pumps (IDs 1-5)
  {"id":1,"category":"Rotating","equipment":"Pump","failure_mode":"Seal Failure","keywords":["leak","seal","drip","pump leak"],"severity":8,"occurrence":7,"detectability":5,"rpn":280,"recommended_actions":["Inspect seal","Check alignment","Adjust maintenance"],"equipment_type_ids":["pump_centrifugal","pump_reciprocating"]},
  {"id":2,"category":"Rotating","equipment":"Pump","failure_mode":"Bearing Failure","keywords":["bearing","noise","vibration","heat"],"severity":9,"occurrence":6,"detectability":4,"rpn":216,"recommended_actions":["Improve lubrication","Monitor vibration","Replace bearings"],"equipment_type_ids":["pump_centrifugal","pump_reciprocating"]},
  {"id":3,"category":"Rotating","equipment":"Pump","failure_mode":"Cavitation","keywords":["cavitation","bubbles","noise"],"severity":7,"occurrence":6,"detectability":6,"rpn":252,"recommended_actions":["Increase suction pressure","Check NPSH","Adjust operation"],"equipment_type_ids":["pump_centrifugal"]},
  {"id":4,"category":"Rotating","equipment":"Pump","failure_mode":"Misalignment","keywords":["misalignment","shaft","vibration"],"severity":6,"occurrence":7,"detectability":3,"rpn":126,"recommended_actions":["Align shaft","Check base","Use tools"],"equipment_type_ids":["pump_centrifugal","pump_reciprocating"]},
  {"id":5,"category":"Rotating","equipment":"Pump","failure_mode":"Imbalance","keywords":["imbalance","rotor","vibration"],"severity":6,"occurrence":6,"detectability":4,"rpn":144,"recommended_actions":["Balance rotor","Clean deposits","Inspect"],"equipment_type_ids":["pump_centrifugal"]},
  
  # Rotating - Compressors (IDs 6-8)
  {"id":6,"category":"Rotating","equipment":"Compressor","failure_mode":"Surge","keywords":["surge","unstable","flow"],"severity":9,"occurrence":5,"detectability":5,"rpn":225,"recommended_actions":["Install anti-surge","Monitor flow","Operate correctly"],"equipment_type_ids":["compressor_centrifugal"]},
  {"id":7,"category":"Rotating","equipment":"Compressor","failure_mode":"Blade Damage","keywords":["blade","damage","debris"],"severity":8,"occurrence":4,"detectability":6,"rpn":192,"recommended_actions":["Install filters","Inspect blades","Remove debris"],"equipment_type_ids":["compressor_centrifugal"]},
  {"id":8,"category":"Rotating","equipment":"Compressor","failure_mode":"Lubrication Failure","keywords":["oil","lubrication","overheat"],"severity":8,"occurrence":6,"detectability":5,"rpn":240,"recommended_actions":["Improve oil quality","Monitor temp","Replace oil"],"equipment_type_ids":["compressor_centrifugal","compressor_reciprocating"]},
  
  # Rotating - Turbines (ID 9)
  {"id":9,"category":"Rotating","equipment":"Turbine","failure_mode":"Rotor Crack","keywords":["crack","fatigue","rotor"],"severity":10,"occurrence":3,"detectability":7,"rpn":210,"recommended_actions":["Inspect regularly","Upgrade material","Monitor stress"],"equipment_type_ids":["turbine_gas","turbine_steam"]},
  
  # Rotating - General (ID 10)
  {"id":10,"category":"Rotating","equipment":"General","failure_mode":"Dry Running","keywords":["dry","no fluid"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Install interlock","Monitor flow","Train operators"],"equipment_type_ids":["pump_centrifugal","pump_reciprocating"]},

  # Static - Vessels (IDs 11-12, 16-20)
  {"id":11,"category":"Static","equipment":"Vessel","failure_mode":"Internal Corrosion","keywords":["corrosion","internal","rust"],"severity":9,"occurrence":6,"detectability":6,"rpn":324,"recommended_actions":["Apply coating","Monitor thickness","Use inhibitor"],"equipment_type_ids":["vessel_pressure","vessel_storage"]},
  {"id":12,"category":"Static","equipment":"Vessel","failure_mode":"External Corrosion","keywords":["corrosion","external","weather"],"severity":8,"occurrence":7,"detectability":5,"rpn":280,"recommended_actions":["Inspect coating","Maintain insulation","Paint"],"equipment_type_ids":["vessel_pressure","vessel_storage"]},
  
  # Static - Heat Exchangers (IDs 13-15)
  {"id":13,"category":"Static","equipment":"Heat Exchanger","failure_mode":"Fouling","keywords":["fouling","scaling","dirty"],"severity":6,"occurrence":8,"detectability":4,"rpn":192,"recommended_actions":["Clean regularly","Monitor efficiency","Treat chemicals"],"equipment_type_ids":["heat_exchanger"]},
  {"id":14,"category":"Static","equipment":"Heat Exchanger","failure_mode":"Tube Leak","keywords":["tube leak","contamination"],"severity":8,"occurrence":5,"detectability":6,"rpn":240,"recommended_actions":["Inspect tubes","Replace","Pressure test"],"equipment_type_ids":["heat_exchanger"]},
  {"id":15,"category":"Static","equipment":"Heat Exchanger","failure_mode":"Tube Rupture","keywords":["rupture","tube"],"severity":10,"occurrence":3,"detectability":7,"rpn":210,"recommended_actions":["Monitor pressure","Inspect","Shutdown protocol"],"equipment_type_ids":["heat_exchanger"]},
  
  # Static - More Vessels
  {"id":16,"category":"Static","equipment":"Vessel","failure_mode":"Overpressure","keywords":["overpressure","pressure high"],"severity":10,"occurrence":3,"detectability":5,"rpn":150,"recommended_actions":["Install relief valve","Monitor pressure","Test PSV"],"equipment_type_ids":["vessel_pressure"]},
  {"id":17,"category":"Static","equipment":"Vessel","failure_mode":"Stress Corrosion Cracking","keywords":["scc","crack","stress"],"severity":9,"occurrence":4,"detectability":8,"rpn":288,"recommended_actions":["Material upgrade","Inspect","Reduce stress"],"equipment_type_ids":["vessel_pressure","vessel_storage"]},
  {"id":18,"category":"Static","equipment":"Vessel","failure_mode":"Thermal Fatigue","keywords":["thermal","fatigue","cycling"],"severity":8,"occurrence":5,"detectability":7,"rpn":280,"recommended_actions":["Control temp","Inspect cracks","Reduce cycles"],"equipment_type_ids":["vessel_pressure","heat_exchanger"]},
  {"id":19,"category":"Static","equipment":"Vessel","failure_mode":"Weld Failure","keywords":["weld","crack"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Improve QA","Inspect weld","Repair"],"equipment_type_ids":["vessel_pressure","vessel_storage","pipe"]},
  {"id":20,"category":"Static","equipment":"Vessel","failure_mode":"CUI","keywords":["corrosion under insulation","cui"],"severity":8,"occurrence":6,"detectability":8,"rpn":384,"recommended_actions":["Inspect insulation","Remove lagging","Repair coating"],"equipment_type_ids":["vessel_pressure","vessel_storage","pipe"]},

  # Piping - Pipes (IDs 21-22, 25-31, 34-40)
  {"id":21,"category":"Piping","equipment":"Pipe","failure_mode":"Corrosion Leak","keywords":["leak","corrosion","pipe"],"severity":9,"occurrence":7,"detectability":6,"rpn":378,"recommended_actions":["Coating","Inspection","Replacement"],"equipment_type_ids":["pipe"]},
  {"id":22,"category":"Piping","equipment":"Pipe","failure_mode":"Erosion","keywords":["erosion","wear"],"severity":8,"occurrence":6,"detectability":5,"rpn":240,"recommended_actions":["Reduce velocity","Inspect","Material upgrade"],"equipment_type_ids":["pipe"]},
  
  # Piping - Valves (IDs 23-24, 32-33)
  {"id":23,"category":"Piping","equipment":"Valve","failure_mode":"Seat Leakage","keywords":["valve leak","seat"],"severity":6,"occurrence":7,"detectability":4,"rpn":168,"recommended_actions":["Replace seat","Inspect","Maintain"],"equipment_type_ids":["valve_control","valve_safety","valve_manual"]},
  {"id":24,"category":"Piping","equipment":"Valve","failure_mode":"Valve Stuck","keywords":["stuck","valve"],"severity":8,"occurrence":5,"detectability":5,"rpn":200,"recommended_actions":["Service valve","Lubricate","Replace"],"equipment_type_ids":["valve_control","valve_safety","valve_manual"]},
  
  # Piping - More Pipes
  {"id":25,"category":"Piping","equipment":"Pipe","failure_mode":"Gasket Failure","keywords":["gasket","flange leak"],"severity":7,"occurrence":7,"detectability":4,"rpn":196,"recommended_actions":["Replace gasket","Torque correctly","Inspect"],"equipment_type_ids":["pipe"]},
  {"id":26,"category":"Piping","equipment":"Pipe","failure_mode":"Flange Leak","keywords":["flange","leak"],"severity":7,"occurrence":5,"detectability":5,"rpn":175,"recommended_actions":["Align flange","Tighten bolts","Inspect"],"equipment_type_ids":["pipe"]},
  {"id":27,"category":"Piping","equipment":"Pipe","failure_mode":"Fatigue Crack","keywords":["fatigue","crack"],"severity":9,"occurrence":4,"detectability":7,"rpn":252,"recommended_actions":["Reduce stress","Inspect","Repair"],"equipment_type_ids":["pipe"]},
  {"id":28,"category":"Piping","equipment":"Pipe","failure_mode":"Thermal Expansion Failure","keywords":["thermal","expansion"],"severity":8,"occurrence":5,"detectability":6,"rpn":240,"recommended_actions":["Expansion loops","Design check","Inspect"],"equipment_type_ids":["pipe"]},
  {"id":29,"category":"Piping","equipment":"Pipe","failure_mode":"Water Hammer","keywords":["hammer","pressure surge"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Install dampener","Control valves","Monitor"],"equipment_type_ids":["pipe"]},
  {"id":30,"category":"Piping","equipment":"Pipe","failure_mode":"Blockage","keywords":["block","plug"],"severity":7,"occurrence":6,"detectability":5,"rpn":210,"recommended_actions":["Clean line","Monitor flow","Flush system"],"equipment_type_ids":["pipe"]},
  {"id":31,"category":"Piping","equipment":"Pipe","failure_mode":"MIC","keywords":["bacteria","mic"],"severity":8,"occurrence":5,"detectability":7,"rpn":280,"recommended_actions":["Biocide","Monitor","Inspect"],"equipment_type_ids":["pipe"]},
  
  # Piping - More Valves
  {"id":32,"category":"Piping","equipment":"Valve","failure_mode":"Actuator Failure","keywords":["actuator","fail"],"severity":8,"occurrence":5,"detectability":5,"rpn":200,"recommended_actions":["Service actuator","Replace","Test"],"equipment_type_ids":["valve_control"]},
  {"id":33,"category":"Piping","equipment":"Valve","failure_mode":"Stem Leak","keywords":["stem leak"],"severity":7,"occurrence":6,"detectability":5,"rpn":210,"recommended_actions":["Replace packing","Tighten","Inspect"],"equipment_type_ids":["valve_control","valve_safety","valve_manual"]},
  
  # Piping - More Pipes
  {"id":34,"category":"Piping","equipment":"Pipe","failure_mode":"Scaling","keywords":["scale","deposit"],"severity":6,"occurrence":7,"detectability":5,"rpn":210,"recommended_actions":["Descale","Chemical clean","Monitor"],"equipment_type_ids":["pipe","heat_exchanger"]},
  {"id":35,"category":"Piping","equipment":"Pipe","failure_mode":"Support Failure","keywords":["support","pipe support"],"severity":8,"occurrence":4,"detectability":6,"rpn":192,"recommended_actions":["Repair support","Inspect","Reinforce"],"equipment_type_ids":["pipe"]},
  {"id":36,"category":"Piping","equipment":"Pipe","failure_mode":"Freeze Rupture","keywords":["freeze","cold"],"severity":8,"occurrence":3,"detectability":6,"rpn":144,"recommended_actions":["Insulate","Heat trace","Drain"],"equipment_type_ids":["pipe"]},
  {"id":37,"category":"Piping","equipment":"Pipe","failure_mode":"Sand Erosion","keywords":["sand","erosion"],"severity":8,"occurrence":6,"detectability":5,"rpn":240,"recommended_actions":["Filter solids","Inspect","Upgrade material"],"equipment_type_ids":["pipe"]},
  {"id":38,"category":"Piping","equipment":"Pipe","failure_mode":"Dead Leg Corrosion","keywords":["dead leg"],"severity":7,"occurrence":6,"detectability":7,"rpn":294,"recommended_actions":["Remove dead legs","Inspect","Flush"],"equipment_type_ids":["pipe"]},
  {"id":39,"category":"Piping","equipment":"Pipe","failure_mode":"Anchor Failure","keywords":["anchor","movement"],"severity":7,"occurrence":4,"detectability":6,"rpn":168,"recommended_actions":["Fix anchor","Inspect","Reinforce"],"equipment_type_ids":["pipe"]},
  {"id":40,"category":"Piping","equipment":"Pipe","failure_mode":"Pigging Damage","keywords":["pigging","damage"],"severity":7,"occurrence":3,"detectability":6,"rpn":126,"recommended_actions":["Improve procedure","Inspect","Train"],"equipment_type_ids":["pipe"]},

  # Instrumentation - Sensors (IDs 41-42, 47)
  {"id":41,"category":"Instrumentation","equipment":"Sensor","failure_mode":"Sensor Drift","keywords":["drift","calibration"],"severity":8,"occurrence":6,"detectability":7,"rpn":336,"recommended_actions":["Calibrate","Replace","Verify"],"equipment_type_ids":["sensor_pressure","sensor_temperature","sensor_flow"]},
  {"id":42,"category":"Instrumentation","equipment":"Sensor","failure_mode":"Sensor Failure","keywords":["sensor fail"],"severity":7,"occurrence":5,"detectability":5,"rpn":175,"recommended_actions":["Replace sensor","Test","Maintain"],"equipment_type_ids":["sensor_pressure","sensor_temperature","sensor_flow"]},
  
  # Instrumentation - Control Valves (ID 43)
  {"id":43,"category":"Instrumentation","equipment":"Control Valve","failure_mode":"Valve Sticking","keywords":["valve stuck"],"severity":8,"occurrence":6,"detectability":5,"rpn":240,"recommended_actions":["Lubricate","Repair","Replace"],"equipment_type_ids":["valve_control"]},
  
  # Instrumentation - Controls (IDs 44-50)
  {"id":44,"category":"Instrumentation","equipment":"Control","failure_mode":"Loop Instability","keywords":["loop unstable"],"severity":7,"occurrence":5,"detectability":6,"rpn":210,"recommended_actions":["Tune loop","Adjust PID","Test"],"equipment_type_ids":["plc"]},
  {"id":45,"category":"Instrumentation","equipment":"PLC","failure_mode":"PLC Failure","keywords":["plc"],"severity":9,"occurrence":3,"detectability":4,"rpn":108,"recommended_actions":["Redundancy","Backup","Test"],"equipment_type_ids":["plc"]},
  {"id":46,"category":"Instrumentation","equipment":"Signal","failure_mode":"Signal Loss","keywords":["signal loss"],"severity":7,"occurrence":5,"detectability":5,"rpn":175,"recommended_actions":["Repair wiring","Test signal","Replace cable"],"equipment_type_ids":["plc","sensor_pressure","sensor_temperature","sensor_flow"]},
  {"id":47,"category":"Instrumentation","equipment":"Sensor","failure_mode":"Calibration Error","keywords":["calibration error"],"severity":7,"occurrence":6,"detectability":6,"rpn":252,"recommended_actions":["Improve procedures","Train","Audit"],"equipment_type_ids":["sensor_pressure","sensor_temperature","sensor_flow"]},
  {"id":48,"category":"Instrumentation","equipment":"Power","failure_mode":"Power Failure","keywords":["instrument power"],"severity":8,"occurrence":4,"detectability":5,"rpn":160,"recommended_actions":["Backup power","Test","Inspect"],"equipment_type_ids":["plc","switchgear"]},
  {"id":49,"category":"Instrumentation","equipment":"Communication","failure_mode":"Comm Failure","keywords":["communication"],"severity":7,"occurrence":5,"detectability":6,"rpn":210,"recommended_actions":["Improve network","Redundancy","Monitor"],"equipment_type_ids":["plc"]},
  {"id":50,"category":"Instrumentation","equipment":"Alarm","failure_mode":"Alarm Flooding","keywords":["alarm","too many"],"severity":6,"occurrence":7,"detectability":7,"rpn":294,"recommended_actions":["Rationalize alarms","Filter","Prioritize"],"equipment_type_ids":["plc"]},

  # Electrical - Motors (ID 51)
  {"id":51,"category":"Electrical","equipment":"Motor","failure_mode":"Motor Burnout","keywords":["motor burn"],"severity":8,"occurrence":6,"detectability":5,"rpn":240,"recommended_actions":["Monitor load","Inspect","Protect"],"equipment_type_ids":["motor_electric"]},
  
  # Electrical - Transformers (ID 52)
  {"id":52,"category":"Electrical","equipment":"Transformer","failure_mode":"Transformer Failure","keywords":["transformer"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Test oil","Inspect","Maintain"],"equipment_type_ids":["transformer"]},
  
  # Electrical - Systems (IDs 53-70)
  {"id":53,"category":"Electrical","equipment":"System","failure_mode":"Short Circuit","keywords":["short circuit"],"severity":10,"occurrence":4,"detectability":5,"rpn":200,"recommended_actions":["Install protection","Inspect","Maintain"],"equipment_type_ids":["switchgear","transformer"]},
  {"id":54,"category":"Electrical","equipment":"Cable","failure_mode":"Insulation Failure","keywords":["cable","insulation"],"severity":8,"occurrence":5,"detectability":6,"rpn":240,"recommended_actions":["Replace cable","Inspect","Test"],"equipment_type_ids":["switchgear"]},
  {"id":55,"category":"Electrical","equipment":"System","failure_mode":"Power Loss","keywords":["outage"],"severity":10,"occurrence":4,"detectability":3,"rpn":120,"recommended_actions":["Backup power","Test","Maintain"],"equipment_type_ids":["switchgear","transformer"]},
  {"id":56,"category":"Electrical","equipment":"Protection","failure_mode":"Relay Failure","keywords":["relay"],"severity":7,"occurrence":5,"detectability":5,"rpn":175,"recommended_actions":["Test relay","Replace","Maintain"],"equipment_type_ids":["switchgear"]},
  {"id":57,"category":"Electrical","equipment":"System","failure_mode":"Ground Fault","keywords":["ground fault"],"severity":8,"occurrence":5,"detectability":5,"rpn":200,"recommended_actions":["Improve grounding","Inspect","Monitor"],"equipment_type_ids":["switchgear","motor_electric"]},
  {"id":58,"category":"Electrical","equipment":"Switchgear","failure_mode":"Switchgear Failure","keywords":["switchgear"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Maintain","Inspect","Replace"],"equipment_type_ids":["switchgear"]},
  {"id":59,"category":"Electrical","equipment":"UPS","failure_mode":"UPS Failure","keywords":["ups"],"severity":7,"occurrence":5,"detectability":4,"rpn":140,"recommended_actions":["Replace battery","Test","Maintain"],"equipment_type_ids":["switchgear"]},
  {"id":60,"category":"Electrical","equipment":"System","failure_mode":"Harmonics Damage","keywords":["harmonics"],"severity":6,"occurrence":4,"detectability":6,"rpn":144,"recommended_actions":["Install filters","Monitor","Adjust"],"equipment_type_ids":["motor_electric","transformer"]},
  {"id":61,"category":"Electrical","equipment":"System","failure_mode":"Voltage Spike","keywords":["voltage spike"],"severity":7,"occurrence":4,"detectability":5,"rpn":140,"recommended_actions":["Install surge protection","Monitor","Ground"],"equipment_type_ids":["switchgear","transformer"]},
  {"id":62,"category":"Electrical","equipment":"Generator","failure_mode":"Generator Failure","keywords":["generator"],"severity":9,"occurrence":4,"detectability":5,"rpn":180,"recommended_actions":["Test regularly","Maintain","Inspect"],"equipment_type_ids":["turbine_gas","turbine_steam"]},
  {"id":63,"category":"Electrical","equipment":"Battery","failure_mode":"Battery Degradation","keywords":["battery"],"severity":6,"occurrence":6,"detectability":5,"rpn":180,"recommended_actions":["Replace battery","Test","Monitor"],"equipment_type_ids":["switchgear"]},
  {"id":64,"category":"Electrical","equipment":"System","failure_mode":"Phase Imbalance","keywords":["phase"],"severity":7,"occurrence":5,"detectability":6,"rpn":210,"recommended_actions":["Balance load","Monitor","Adjust"],"equipment_type_ids":["motor_electric","transformer"]},
  {"id":65,"category":"Electrical","equipment":"System","failure_mode":"Arc Flash","keywords":["arc flash"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Improve protection","Train","Inspect"],"equipment_type_ids":["switchgear"]},
  {"id":66,"category":"Electrical","equipment":"Cable","failure_mode":"Loose Connection","keywords":["loose","connection"],"severity":7,"occurrence":6,"detectability":4,"rpn":168,"recommended_actions":["Tighten","Inspect","Maintain"],"equipment_type_ids":["switchgear","motor_electric"]},
  {"id":67,"category":"Electrical","equipment":"Cooling","failure_mode":"Cooling Failure","keywords":["cooling"],"severity":8,"occurrence":4,"detectability":5,"rpn":160,"recommended_actions":["Inspect cooling","Repair","Monitor"],"equipment_type_ids":["motor_electric","transformer"]},
  {"id":68,"category":"Electrical","equipment":"System","failure_mode":"Frequency Instability","keywords":["frequency"],"severity":8,"occurrence":3,"detectability":6,"rpn":144,"recommended_actions":["Stabilize supply","Monitor","Adjust"],"equipment_type_ids":["turbine_gas","turbine_steam"]},
  {"id":69,"category":"Electrical","equipment":"Relay","failure_mode":"Protection Failure","keywords":["protection"],"severity":9,"occurrence":3,"detectability":6,"rpn":162,"recommended_actions":["Test system","Upgrade","Inspect"],"equipment_type_ids":["switchgear"]},
  {"id":70,"category":"Electrical","equipment":"Panel","failure_mode":"Electrical Fire","keywords":["fire","panel"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Inspect wiring","Install protection","Maintain"],"equipment_type_ids":["switchgear"]},

  # Process (IDs 71-80) - Generic, link to multiple or none
  {"id":71,"category":"Process","equipment":"Operations","failure_mode":"Incorrect Operation","keywords":["operator error"],"severity":8,"occurrence":6,"detectability":6,"rpn":288,"recommended_actions":["Train operators","Improve procedures","Audit"],"equipment_type_ids":[]},
  {"id":72,"category":"Process","equipment":"Maintenance","failure_mode":"Maintenance Error","keywords":["maintenance error"],"severity":8,"occurrence":5,"detectability":6,"rpn":240,"recommended_actions":["Improve QA","Train staff","Review work"],"equipment_type_ids":[]},
  {"id":73,"category":"Process","equipment":"Operations","failure_mode":"Procedure Not Followed","keywords":["procedure"],"severity":8,"occurrence":6,"detectability":7,"rpn":336,"recommended_actions":["Train","Audit","Simplify procedures"],"equipment_type_ids":[]},
  {"id":74,"category":"Process","equipment":"System","failure_mode":"Poor Design","keywords":["design"],"severity":9,"occurrence":4,"detectability":8,"rpn":288,"recommended_actions":["Redesign","Review","Upgrade"],"equipment_type_ids":[]},
  {"id":75,"category":"Process","equipment":"Planning","failure_mode":"Poor Planning","keywords":["planning"],"severity":7,"occurrence":6,"detectability":6,"rpn":252,"recommended_actions":["Improve planning","Review","Optimize"],"equipment_type_ids":[]},
  {"id":76,"category":"Process","equipment":"System","failure_mode":"Overload","keywords":["overload"],"severity":9,"occurrence":5,"detectability":5,"rpn":225,"recommended_actions":["Reduce load","Monitor","Upgrade"],"equipment_type_ids":["pump_centrifugal","compressor_centrifugal","motor_electric"]},
  {"id":77,"category":"Process","equipment":"System","failure_mode":"Underdesign","keywords":["underdesign"],"severity":9,"occurrence":4,"detectability":7,"rpn":252,"recommended_actions":["Upgrade design","Review capacity","Improve"],"equipment_type_ids":[]},
  {"id":78,"category":"Process","equipment":"System","failure_mode":"Material Failure","keywords":["material"],"severity":9,"occurrence":4,"detectability":7,"rpn":252,"recommended_actions":["Upgrade material","Inspect","Test"],"equipment_type_ids":["vessel_pressure","pipe"]},
  {"id":79,"category":"Process","equipment":"System","failure_mode":"Human Error","keywords":["error"],"severity":8,"occurrence":7,"detectability":6,"rpn":336,"recommended_actions":["Training","Automation","Review"],"equipment_type_ids":[]},
  {"id":80,"category":"Process","equipment":"System","failure_mode":"Communication Failure","keywords":["communication"],"severity":7,"occurrence":6,"detectability":6,"rpn":252,"recommended_actions":["Improve communication","Standardize","Train"],"equipment_type_ids":[]},

  # Safety (IDs 81-90) - Safety systems
  {"id":81,"category":"Safety","equipment":"System","failure_mode":"Gas Leak","keywords":["gas leak"],"severity":10,"occurrence":4,"detectability":5,"rpn":200,"recommended_actions":["Install detectors","Inspect","Repair"],"equipment_type_ids":["pipe","valve_safety"]},
  {"id":82,"category":"Safety","equipment":"System","failure_mode":"Explosion Risk","keywords":["explosion"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Control ignition","Monitor","Train"],"equipment_type_ids":["vessel_pressure"]},
  {"id":83,"category":"Safety","equipment":"System","failure_mode":"Fire","keywords":["fire"],"severity":10,"occurrence":4,"detectability":5,"rpn":200,"recommended_actions":["Install fire system","Inspect","Train"],"equipment_type_ids":["switchgear"]},
  {"id":84,"category":"Safety","equipment":"System","failure_mode":"Toxic Release","keywords":["toxic"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Containment","Detection","Evacuation"],"equipment_type_ids":["vessel_pressure","pipe"]},
  {"id":85,"category":"Safety","equipment":"System","failure_mode":"Pressure Release Failure","keywords":["psv"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Test PSV","Maintain","Inspect"],"equipment_type_ids":["valve_safety"]},
  {"id":86,"category":"Safety","equipment":"System","failure_mode":"Emergency System Failure","keywords":["emergency"],"severity":10,"occurrence":3,"detectability":5,"rpn":150,"recommended_actions":["Test systems","Maintain","Train"],"equipment_type_ids":["plc"]},
  {"id":87,"category":"Safety","equipment":"System","failure_mode":"Detection Failure","keywords":["detector"],"severity":9,"occurrence":4,"detectability":7,"rpn":252,"recommended_actions":["Test detectors","Replace","Inspect"],"equipment_type_ids":["sensor_pressure","sensor_temperature","sensor_flow"]},
  {"id":88,"category":"Safety","equipment":"System","failure_mode":"Evacuation Failure","keywords":["evacuation"],"severity":9,"occurrence":3,"detectability":7,"rpn":189,"recommended_actions":["Train","Drill","Improve routes"],"equipment_type_ids":[]},
  {"id":89,"category":"Safety","equipment":"System","failure_mode":"Alarm Failure","keywords":["alarm"],"severity":8,"occurrence":4,"detectability":6,"rpn":192,"recommended_actions":["Test alarms","Maintain","Replace"],"equipment_type_ids":["plc"]},
  {"id":90,"category":"Safety","equipment":"System","failure_mode":"Barrier Failure","keywords":["barrier"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Inspect barriers","Repair","Test"],"equipment_type_ids":[]},

  # Environment (IDs 91-100) - Environmental systems
  {"id":91,"category":"Environment","equipment":"System","failure_mode":"Oil Spill","keywords":["spill"],"severity":10,"occurrence":4,"detectability":5,"rpn":200,"recommended_actions":["Containment","Inspect","Train"],"equipment_type_ids":["vessel_storage","pipe"]},
  {"id":92,"category":"Environment","equipment":"System","failure_mode":"Emission Exceedance","keywords":["emission"],"severity":9,"occurrence":5,"detectability":6,"rpn":270,"recommended_actions":["Monitor","Control","Adjust"],"equipment_type_ids":["compressor_centrifugal","turbine_gas"]},
  {"id":93,"category":"Environment","equipment":"System","failure_mode":"Water Contamination","keywords":["water"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Treat water","Monitor","Contain"],"equipment_type_ids":["heat_exchanger","vessel_storage"]},
  {"id":94,"category":"Environment","equipment":"System","failure_mode":"Waste Handling Failure","keywords":["waste"],"severity":8,"occurrence":5,"detectability":6,"rpn":240,"recommended_actions":["Improve handling","Train","Audit"],"equipment_type_ids":[]},
  {"id":95,"category":"Environment","equipment":"System","failure_mode":"Chemical Release","keywords":["chemical"],"severity":10,"occurrence":3,"detectability":6,"rpn":180,"recommended_actions":["Containment","Monitor","Emergency plan"],"equipment_type_ids":["vessel_storage","pipe"]},
  {"id":96,"category":"Environment","equipment":"System","failure_mode":"Soil Contamination","keywords":["soil"],"severity":9,"occurrence":4,"detectability":7,"rpn":252,"recommended_actions":["Monitor soil","Contain","Clean"],"equipment_type_ids":["vessel_storage"]},
  {"id":97,"category":"Environment","equipment":"System","failure_mode":"Noise Violation","keywords":["noise"],"severity":6,"occurrence":6,"detectability":6,"rpn":216,"recommended_actions":["Reduce noise","Monitor","Maintain"],"equipment_type_ids":["compressor_centrifugal","turbine_gas"]},
  {"id":98,"category":"Environment","equipment":"System","failure_mode":"Thermal Pollution","keywords":["thermal"],"severity":7,"occurrence":4,"detectability":6,"rpn":168,"recommended_actions":["Cool discharge","Monitor","Control"],"equipment_type_ids":["heat_exchanger"]},
  {"id":99,"category":"Environment","equipment":"System","failure_mode":"Dust Emission","keywords":["dust"],"severity":6,"occurrence":5,"detectability":6,"rpn":180,"recommended_actions":["Install filters","Monitor","Maintain"],"equipment_type_ids":[]},
  {"id":100,"category":"Environment","equipment":"System","failure_mode":"Regulatory Non-Compliance","keywords":["compliance"],"severity":9,"occurrence":4,"detectability":7,"rpn":252,"recommended_actions":["Audit","Train","Improve procedures"],"equipment_type_ids":[]},

  # Extruder - Screw & Barrel System (IDs 101-108)
  {"id":101,"category":"Extruder","equipment":"Extruder","failure_mode":"Screw Wear (Abrasive)","keywords":["screw wear","abrasive","extruder wear","screw abrasion"],"severity":7,"occurrence":7,"detectability":5,"rpn":245,"recommended_actions":["Inspect screw flight depth","Replace worn screw sections","Use wear-resistant coatings","Reduce abrasive filler content"],"equipment_type_ids":["extruder"]},
  {"id":102,"category":"Extruder","equipment":"Extruder","failure_mode":"Screw Wear (Adhesive)","keywords":["screw wear","adhesive","galling","screw damage"],"severity":7,"occurrence":5,"detectability":5,"rpn":175,"recommended_actions":["Check material compatibility","Apply surface treatments","Improve lubrication","Adjust processing temperature"],"equipment_type_ids":["extruder"]},
  {"id":103,"category":"Extruder","equipment":"Extruder","failure_mode":"Screw Breakage","keywords":["screw break","screw fracture","fatigue","overload"],"severity":10,"occurrence":3,"detectability":7,"rpn":210,"recommended_actions":["Inspect for fatigue cracks","Reduce operating torque","Check for blockages","Replace damaged screw"],"equipment_type_ids":["extruder"]},
  {"id":104,"category":"Extruder","equipment":"Extruder","failure_mode":"Screw Bending/Misalignment","keywords":["screw bent","misalignment","runout","screw deflection"],"severity":8,"occurrence":4,"detectability":5,"rpn":160,"recommended_actions":["Check shaft alignment","Inspect thrust bearing","Measure screw runout","Replace bent screw"],"equipment_type_ids":["extruder"]},
  {"id":105,"category":"Extruder","equipment":"Extruder","failure_mode":"Barrel Wear/Scoring","keywords":["barrel wear","scoring","barrel damage","bore wear"],"severity":8,"occurrence":6,"detectability":5,"rpn":240,"recommended_actions":["Measure barrel bore diameter","Install barrel liner","Reduce filler content","Check screw clearance"],"equipment_type_ids":["extruder"]},
  {"id":106,"category":"Extruder","equipment":"Extruder","failure_mode":"Barrel Corrosion","keywords":["barrel corrosion","chemical attack","acid","degradation"],"severity":8,"occurrence":4,"detectability":6,"rpn":192,"recommended_actions":["Use corrosion-resistant barrel","Adjust material formulation","Monitor barrel condition","Apply protective coating"],"equipment_type_ids":["extruder"]},
  {"id":107,"category":"Extruder","equipment":"Extruder","failure_mode":"Material Buildup/Fouling","keywords":["buildup","fouling","deposit","degraded material","carbon buildup"],"severity":6,"occurrence":7,"detectability":4,"rpn":168,"recommended_actions":["Purge system regularly","Clean barrel and screw","Adjust temperature profile","Use purge compound"],"equipment_type_ids":["extruder"]},
  {"id":108,"category":"Extruder","equipment":"Extruder","failure_mode":"Clearance Increase","keywords":["clearance","gap","efficiency loss","leakage"],"severity":6,"occurrence":6,"detectability":5,"rpn":180,"recommended_actions":["Measure screw-barrel clearance","Replace worn components","Monitor output rate","Rebuild barrel"],"equipment_type_ids":["extruder"]},

  # Extruder - Heating & Temperature Control (IDs 109-113)
  {"id":109,"category":"Extruder","equipment":"Extruder","failure_mode":"Heater Band Failure","keywords":["heater","band","burnout","open circuit","heating element"],"severity":7,"occurrence":6,"detectability":4,"rpn":168,"recommended_actions":["Check heater resistance","Inspect electrical connections","Replace failed heater bands","Verify contactor operation"],"equipment_type_ids":["extruder"]},
  {"id":110,"category":"Extruder","equipment":"Extruder","failure_mode":"Thermocouple Failure","keywords":["thermocouple","temperature sensor","drift","break","TC failure"],"severity":7,"occurrence":5,"detectability":5,"rpn":175,"recommended_actions":["Calibrate thermocouples regularly","Replace aging sensors","Check wiring connections","Install redundant sensors"],"equipment_type_ids":["extruder","sensor_temperature"]},
  {"id":111,"category":"Extruder","equipment":"Extruder","failure_mode":"Temperature Controller Malfunction","keywords":["temperature controller","PID","control fault","setpoint"],"severity":8,"occurrence":4,"detectability":5,"rpn":160,"recommended_actions":["Verify controller settings","Retune PID parameters","Replace faulty controller","Check power supply"],"equipment_type_ids":["extruder","plc"]},
  {"id":112,"category":"Extruder","equipment":"Extruder","failure_mode":"Uneven Heating Zones","keywords":["uneven heating","hot spot","cold spot","temperature variation"],"severity":6,"occurrence":5,"detectability":5,"rpn":150,"recommended_actions":["Balance zone temperatures","Check heater coverage","Inspect insulation","Calibrate all zones"],"equipment_type_ids":["extruder"]},
  {"id":113,"category":"Extruder","equipment":"Extruder","failure_mode":"Overheating/Thermal Runaway","keywords":["overheat","thermal runaway","high temperature","burning"],"severity":9,"occurrence":4,"detectability":4,"rpn":144,"recommended_actions":["Install high-temperature alarm","Check cooling system","Verify safety interlocks","Review material specifications"],"equipment_type_ids":["extruder"]},

  # Extruder - Drive System (IDs 114-118)
  {"id":114,"category":"Extruder","equipment":"Extruder","failure_mode":"Motor Failure","keywords":["motor","overheating","winding","drive motor","motor burnout"],"severity":9,"occurrence":4,"detectability":5,"rpn":180,"recommended_actions":["Monitor motor current","Check cooling airflow","Inspect windings","Install motor protection relay"],"equipment_type_ids":["extruder","motor_electric"]},
  {"id":115,"category":"Extruder","equipment":"Extruder","failure_mode":"Gearbox Wear/Failure","keywords":["gearbox","gear","reducer","transmission","gear damage"],"severity":9,"occurrence":4,"detectability":6,"rpn":216,"recommended_actions":["Check oil level and quality","Monitor gearbox temperature","Listen for abnormal noise","Schedule gearbox overhaul"],"equipment_type_ids":["extruder"]},
  {"id":116,"category":"Extruder","equipment":"Extruder","failure_mode":"Coupling Misalignment/Failure","keywords":["coupling","misalignment","coupling failure","shaft coupling"],"severity":7,"occurrence":5,"detectability":4,"rpn":140,"recommended_actions":["Align motor and gearbox","Inspect coupling elements","Replace worn coupling","Check for vibration"],"equipment_type_ids":["extruder","motor_electric"]},
  {"id":117,"category":"Extruder","equipment":"Extruder","failure_mode":"Drive Bearing Failure","keywords":["bearing","drive bearing","thrust bearing","radial bearing"],"severity":8,"occurrence":5,"detectability":5,"rpn":200,"recommended_actions":["Monitor bearing temperature","Check lubrication","Listen for bearing noise","Replace worn bearings"],"equipment_type_ids":["extruder"]},
  {"id":118,"category":"Extruder","equipment":"Extruder","failure_mode":"Drive Lubrication Failure","keywords":["lubrication","oil","grease","dry running","insufficient oil"],"severity":8,"occurrence":5,"detectability":5,"rpn":200,"recommended_actions":["Check oil level regularly","Replace lubricant on schedule","Inspect oil condition","Install oil level sensor"],"equipment_type_ids":["extruder"]},

  # Extruder - Feeding System (IDs 119-123)
  {"id":119,"category":"Extruder","equipment":"Extruder","failure_mode":"Hopper Bridging","keywords":["bridging","hopper","material bridge","rat-holing","flow blockage"],"severity":6,"occurrence":7,"detectability":3,"rpn":126,"recommended_actions":["Install vibrator or agitator","Modify hopper geometry","Use flow aids","Reduce moisture content"],"equipment_type_ids":["extruder"]},
  {"id":120,"category":"Extruder","equipment":"Extruder","failure_mode":"Feed Inconsistency","keywords":["feed","inconsistent","starving","surging","feed rate"],"severity":7,"occurrence":6,"detectability":4,"rpn":168,"recommended_actions":["Calibrate feeder","Check feed screw condition","Adjust feed rate","Install gravimetric feeder"],"equipment_type_ids":["extruder"]},
  {"id":121,"category":"Extruder","equipment":"Extruder","failure_mode":"Feeder Screw Jamming","keywords":["feeder jam","screw jam","blockage","feed screw"],"severity":7,"occurrence":5,"detectability":4,"rpn":140,"recommended_actions":["Clear blockage","Check for foreign objects","Inspect screw condition","Verify material flow"],"equipment_type_ids":["extruder"]},
  {"id":122,"category":"Extruder","equipment":"Extruder","failure_mode":"Feed Throat Blockage","keywords":["feed throat","blockage","throat jam","material stuck"],"severity":7,"occurrence":5,"detectability":4,"rpn":140,"recommended_actions":["Clear throat blockage","Check cooling water","Verify throat temperature","Adjust feed rate"],"equipment_type_ids":["extruder"]},
  {"id":123,"category":"Extruder","equipment":"Extruder","failure_mode":"Contamination Ingress","keywords":["contamination","foreign material","debris","metal detection"],"severity":8,"occurrence":4,"detectability":6,"rpn":192,"recommended_actions":["Install metal detector","Screen incoming material","Improve housekeeping","Check hopper covers"],"equipment_type_ids":["extruder"]},

  # Extruder - Die & Output Section (IDs 124-128)
  {"id":124,"category":"Extruder","equipment":"Extruder","failure_mode":"Die Blockage","keywords":["die block","die clog","restricted flow","die plugging"],"severity":8,"occurrence":5,"detectability":4,"rpn":160,"recommended_actions":["Clean die regularly","Check screen pack","Reduce contamination","Adjust temperature"],"equipment_type_ids":["extruder"]},
  {"id":125,"category":"Extruder","equipment":"Extruder","failure_mode":"Die Wear/Erosion","keywords":["die wear","die erosion","land wear","die damage"],"severity":7,"occurrence":5,"detectability":5,"rpn":175,"recommended_actions":["Measure die land","Replace worn die inserts","Use harder die material","Reduce filler content"],"equipment_type_ids":["extruder"]},
  {"id":126,"category":"Extruder","equipment":"Extruder","failure_mode":"Uneven Flow Distribution","keywords":["uneven flow","flow imbalance","thickness variation","profile defect"],"severity":6,"occurrence":6,"detectability":4,"rpn":144,"recommended_actions":["Adjust die lip","Check die temperature","Balance flow channels","Clean die surfaces"],"equipment_type_ids":["extruder"]},
  {"id":127,"category":"Extruder","equipment":"Extruder","failure_mode":"Screen Pack Clogging","keywords":["screen pack","clog","filter","mesh blocked","breaker plate"],"severity":6,"occurrence":7,"detectability":3,"rpn":126,"recommended_actions":["Change screen pack regularly","Use appropriate mesh size","Install screen changer","Monitor pressure buildup"],"equipment_type_ids":["extruder"]},
  {"id":128,"category":"Extruder","equipment":"Extruder","failure_mode":"Die Connection Leakage","keywords":["die leak","adapter leak","connection leak","material leak"],"severity":7,"occurrence":5,"detectability":4,"rpn":140,"recommended_actions":["Tighten die bolts","Replace sealing surfaces","Check die alignment","Apply anti-seize compound"],"equipment_type_ids":["extruder"]},

  # Extruder - Cooling & Venting System (IDs 129-133)
  {"id":129,"category":"Extruder","equipment":"Extruder","failure_mode":"Cooling Fan/Pump Failure","keywords":["cooling fan","cooling pump","coolant","cooling failure"],"severity":7,"occurrence":5,"detectability":4,"rpn":140,"recommended_actions":["Inspect fan blades","Check pump operation","Clean cooling channels","Replace failed components"],"equipment_type_ids":["extruder"]},
  {"id":130,"category":"Extruder","equipment":"Extruder","failure_mode":"Vent Port Blockage","keywords":["vent","blocked vent","degassing","vacuum port"],"severity":7,"occurrence":6,"detectability":4,"rpn":168,"recommended_actions":["Clean vent opening","Adjust screw design","Check vacuum level","Remove buildup"],"equipment_type_ids":["extruder"]},
  {"id":131,"category":"Extruder","equipment":"Extruder","failure_mode":"Vacuum System Failure","keywords":["vacuum","vacuum pump","degassing failure","low vacuum"],"severity":7,"occurrence":4,"detectability":5,"rpn":140,"recommended_actions":["Check vacuum pump","Inspect seals","Clean vacuum lines","Verify gauge accuracy"],"equipment_type_ids":["extruder"]},
  {"id":132,"category":"Extruder","equipment":"Extruder","failure_mode":"Cooling Channel Fouling","keywords":["cooling channel","fouled","scale","blocked channel"],"severity":6,"occurrence":5,"detectability":6,"rpn":180,"recommended_actions":["Flush cooling channels","Treat cooling water","Install filtration","Descale regularly"],"equipment_type_ids":["extruder"]},
  {"id":133,"category":"Extruder","equipment":"Extruder","failure_mode":"Water Leakage","keywords":["water leak","coolant leak","seal leak","cooling leak"],"severity":7,"occurrence":5,"detectability":4,"rpn":140,"recommended_actions":["Replace seals","Check connections","Inspect hoses","Repair leaks promptly"],"equipment_type_ids":["extruder"]},

  # Extruder - Instrumentation & Control (IDs 134-138)
  {"id":134,"category":"Extruder","equipment":"Extruder","failure_mode":"Pressure Sensor Failure","keywords":["pressure sensor","transducer","melt pressure","sensor fault"],"severity":8,"occurrence":5,"detectability":5,"rpn":200,"recommended_actions":["Calibrate sensors","Replace faulty transducers","Clean sensor ports","Verify wiring"],"equipment_type_ids":["extruder","sensor_pressure"]},
  {"id":135,"category":"Extruder","equipment":"Extruder","failure_mode":"PLC/Control System Fault","keywords":["PLC","control fault","control system","automation failure"],"severity":9,"occurrence":3,"detectability":5,"rpn":135,"recommended_actions":["Back up PLC program","Check I/O modules","Verify power supply","Review fault logs"],"equipment_type_ids":["extruder","plc"]},
  {"id":136,"category":"Extruder","equipment":"Extruder","failure_mode":"Signal Loss/Wiring Failure","keywords":["signal loss","wiring","cable fault","communication failure"],"severity":7,"occurrence":5,"detectability":5,"rpn":175,"recommended_actions":["Inspect wiring","Check terminations","Replace damaged cables","Test signal integrity"],"equipment_type_ids":["extruder","plc"]},
  {"id":137,"category":"Extruder","equipment":"Extruder","failure_mode":"Calibration Drift","keywords":["calibration","drift","sensor accuracy","measurement error"],"severity":6,"occurrence":6,"detectability":6,"rpn":216,"recommended_actions":["Schedule regular calibration","Use reference standards","Document calibration results","Replace aging sensors"],"equipment_type_ids":["extruder","sensor_pressure","sensor_temperature"]},
  {"id":138,"category":"Extruder","equipment":"Extruder","failure_mode":"Alarm System Failure","keywords":["alarm","alarm failure","warning system","safety alarm"],"severity":8,"occurrence":4,"detectability":6,"rpn":192,"recommended_actions":["Test alarms regularly","Check alarm settings","Verify alarm wiring","Document alarm tests"],"equipment_type_ids":["extruder","plc"]}
]

def find_matching_failure_modes(text: str, limit: int = 5) -> list:
    """Find failure modes that match keywords in the input text."""
    text_lower = text.lower()
    matches = []
    
    for fm in FAILURE_MODES_LIBRARY:
        score = 0
        # Check keywords
        for keyword in fm["keywords"]:
            if keyword.lower() in text_lower:
                score += 1
        # Also check equipment type
        if fm["equipment"].lower() in text_lower:
            score += 2
        # Also check failure mode name
        if fm["failure_mode"].lower() in text_lower:
            score += 2
        # Check category
        if fm["category"].lower() in text_lower:
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

def get_failure_modes_by_equipment_type_id(equipment_type_id: str) -> list:
    """Get all failure modes linked to a specific equipment type ID."""
    return [fm for fm in FAILURE_MODES_LIBRARY if equipment_type_id in fm.get("equipment_type_ids", [])]

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
