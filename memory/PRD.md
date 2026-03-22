# ReliabilityOS - AI-Powered Reliability Intelligence Platform

## Product Requirements Document (PRD)

### Original Problem Statement
Build an AI-Powered Reliability Intelligence Platform named "ReliabilityOS" (formerly ThreatBase) that enables reliability engineers to capture failures via chat, have them automatically structured, and receive a clear prioritized risk decision.

### Latest Update (Mar 22, 2026)
- **NEW Risk Score Methodology** (Mar 22, 2026):
  - Changed formula from multiplier-based to averaging: **Risk Score = (Criticality Score + FMEA Score) / 2**
  - Criticality Score = (Safety×25 + Production×20 + Environmental×15 + Reputation×10) / 3.5 (0-100)
  - FMEA Score = (Severity × Occurrence × Detectability) / 10 (0-100)
  - Updated all backend endpoints: link-equipment, link-failure-mode, recalculate-scores
  - Updated frontend Score Calculation popup to display the new formula
  - Updated Risk Methodology Info Dialog with new documentation
  - Full EN/NL translations for all new labels
- **Better Failure Mode Linking during Threat Creation** (Mar 22, 2026):
  - Updated AI system prompt to explicitly extract failure mode names from chat text
  - Implemented multi-priority fuzzy matching against the FMEA library
  - Auto-assigns `failure_mode_id` and `failure_mode_data` to new threats
  - Added new API endpoint: `POST /api/threats/{threat_id}/link-failure-mode`
  - Added "Link Failure Mode" dialog in Threat Detail page with searchable FMEA list
- **4-Dimension Criticality System** (Mar 22, 2026): Safety, Production, Environmental, Reputation impacts
- Added Reliability Performance Dashboard with snowflake/radar chart visualization
- Implemented deep linking from dashboard numbers to related app sections

### Risk Score Calculation (Current Methodology)
```
Criticality Score = (Safety×25 + Production×20 + Environmental×15 + Reputation×10) / 3.5
FMEA Score = (Severity × Occurrence × Detectability) / 10

Final Risk Score = (Criticality × 0.7) + (FMEA × 0.3)
  - Criticality weighted at 70%
  - FMEA weighted at 30%

Risk Levels:
- Critical: ≥70
- High: 50-69
- Medium: 30-49
- Low: <30
```

### Codebase Architecture (Dec 2025 Cleanup)

#### Backend Structure
```
/app/backend/
├── server.py              # Main API server (4,364 lines - to be further split)
├── routes/                # NEW: Modular API routes
│   ├── __init__.py
│   ├── deps.py           # Shared dependencies (db, auth, utils)
│   ├── auth.py           # Authentication endpoints
│   ├── threats.py        # Threat management endpoints  
│   └── stats.py          # Statistics & reliability scores
├── ai_risk_engine.py
├── maintenance_strategy_generator.py
├── maintenance_strategy_models.py
├── investigation_models.py
├── iso14224_models.py
└── failure_modes.py
```

#### Frontend Structure  
```
/app/frontend/src/
├── components/
│   ├── maintenance/       # NEW: Extracted maintenance components
│   │   ├── index.js
│   │   ├── constants.js
│   │   ├── CollapsibleSection.jsx
│   │   ├── EditableItem.jsx
│   │   └── FailureModesDisplay.jsx
│   ├── MaintenanceStrategiesPanel.jsx
│   ├── BackButton.jsx     # NEW: Navigation back button
│   └── ...
├── pages/
└── contexts/
```

### Core Modules

#### 1. Chat Interface (Completed)
- AI-powered chat sidebar for threat reporting
- Conversational follow-up questions for detail gathering
- In-chat threat summary cards
- Mobile-responsive design

#### 2. AI Structuring Engine (Completed)
- Natural language parsing using GPT-5.2
- Automatic risk classification
- Action recommendation generation

#### 3. Risk & Prioritization Engine (Completed)
- Risk scoring algorithm
- Priority ranking
- Criticality assessment

#### 4. Threat Database (Completed)
- MongoDB storage for threats
- User authentication (JWT)
- Full CRUD operations

#### 5. Equipment Hierarchy & Criticality Manager - ISO 14224 (Updated Mar 22, 2026)
- **Three-panel UI**: Libraries (left), Hierarchy Canvas (center), Properties (right)
- **ISO 14224 Hierarchy Levels** (Updated Mar 18, 2026):
  - Installation (Level 1: Offshore platform, Onshore plant)
  - Plant/Unit (Level 2: Production unit, Utility unit)
  - Section/System (Level 3: Gas compression, Water injection)
  - Equipment Unit (Level 4: Compressor, Pump, Heat exchanger)
  - Subunit (Level 5: Driver, Driven unit, Control system) - NEW
  - Maintainable Item (Level 6: Bearing, Seal, Impeller)
- **4-Dimension Criticality Assignment** (Mar 22, 2026):
  - Safety Impact (1-5, red color scale)
  - Production Impact (1-5, orange color scale)
  - Environmental Impact (1-5, green color scale)
  - Reputation Impact (1-5, purple color scale)
  - Overall Criticality = max of all dimensions
  - Backwards compatible level mapping: safety_critical, production_critical, medium, low
- **Discipline Mapping**: Mechanical, Electrical, Instrumentation, Process
- **Equipment Type Library**: 20+ ISO-compliant equipment types with icons
- **Custom Equipment Types**: Add/edit/delete custom types
- **Unstructured Import**: 
  - Parse equipment lists from text (paste)
  - Upload files (Excel, PDF, CSV, TXT)
  - Auto-detect equipment types from names/tags
- **Move Mode**: Click-based node repositioning (select node → click "Move" → click valid parent)

#### 6. Equipment Navigation Sidebar - ISO 14224 (Updated Mar 18, 2026)
- **Tree View**: Hierarchical tree showing equipment structure from DB
- **Levels View**: ISO 14224 taxonomy summary with counts per level
- **Legacy Support**: Maps old level names (unit, system, equipment) to ISO 14224 equivalents
- **Threat Counts**: Shows number of threats per equipment node
- **Quick Navigation**: Click to navigate to Equipment Manager with node selected

### Technical Architecture

```
/app/
├── backend/
│   ├── server.py           # FastAPI server with all endpoints
│   ├── iso14224_models.py  # ISO 14224 data models and validation
│   ├── failure_modes.py    # Failure modes library
│   └── services/
│       └── ai_service.py   # OpenAI GPT-5.2 integration
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.js               # Main layout with Settings menu
│   │   │   ├── ChatSidebar.jsx         # AI chat interface
│   │   │   └── EquipmentHierarchy.js   # ISO 14224 navigation sidebar
│   │   ├── pages/
│   │   │   ├── ThreatsPage.js
│   │   │   ├── EquipmentManagerPage.js # ISO 14224 module
│   │   │   └── FailureModesPage.js
│   │   └── lib/
│   │       └── api.js      # API client
└── memory/
    └── PRD.md
```

### ISO 14224 Level Configuration

| Level Key | ISO 14224 Label | Description | Icon |
|-----------|-----------------|-------------|------|
| installation | Installation | Offshore platform, Onshore plant | Building2 |
| plant_unit | Plant/Unit | Production unit, Utility unit | Factory |
| section_system | Section/System | Gas compression, Water injection | Settings |
| equipment_unit | Equipment Unit | Compressor, Pump, Heat exchanger | Cog |
| subunit | Subunit | Driver, Driven unit, Control system | Box |
| maintainable_item | Maintainable Item | Bearing, Seal, Impeller | Wrench |

**Legacy Level Mapping:**
- `unit` → `plant_unit`
- `system` → `section_system`
- `equipment` → `equipment_unit`

### Key API Endpoints

#### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

#### Threats
- `GET /api/threats` - List all threats
- `GET /api/threats/{id}` - Get threat details
- `POST /api/chat/send` - Send chat message (creates threats)
- `POST /api/threats/{id}/investigate` - Create investigation from threat

#### Causal Investigations
- `GET /api/investigations` - List all investigations
- `POST /api/investigations` - Create investigation
- `GET /api/investigations/{id}` - Get investigation details
- `PATCH /api/investigations/{id}` - Update investigation
- `DELETE /api/investigations/{id}` - Delete investigation
- `POST /api/investigations/{id}/events` - Add timeline event
- `POST /api/investigations/{id}/failures` - Add failure identification
- `POST /api/investigations/{id}/causes` - Add causal node
- `POST /api/investigations/{id}/actions` - Add corrective action

#### Equipment Hierarchy (ISO 14224)
- `GET /api/equipment-hierarchy/iso-levels` - Get ISO 14224 levels with labels and hierarchy
- `GET /api/equipment-hierarchy/types` - Get equipment types (merged default + custom)
- `POST /api/equipment-hierarchy/types` - Create custom type
- `PATCH /api/equipment-hierarchy/types/{id}` - Update type
- `DELETE /api/equipment-hierarchy/types/{id}` - Delete custom type
- `GET /api/equipment-hierarchy/nodes` - Get hierarchy nodes
- `POST /api/equipment-hierarchy/nodes` - Create node
- `PATCH /api/equipment-hierarchy/nodes/{id}` - Update node
- `DELETE /api/equipment-hierarchy/nodes/{id}` - Delete node (cascades)
- `POST /api/equipment-hierarchy/nodes/{id}/move` - Move node to new parent
- `POST /api/equipment-hierarchy/nodes/{id}/reorder` - Reorder node up/down among siblings
- `POST /api/equipment-hierarchy/nodes/{id}/reorder-to` - Reorder node to specific position (for drag-drop)
- `POST /api/equipment-hierarchy/nodes/{id}/change-level` - Promote/demote node level
- `POST /api/equipment-hierarchy/nodes/{id}/criticality` - Assign criticality
- `POST /api/equipment-hierarchy/nodes/{id}/discipline` - Assign discipline

#### Unstructured Import
- `GET /api/equipment-hierarchy/unstructured` - Get unassigned items
- `POST /api/equipment-hierarchy/parse-list` - Parse text list
- `POST /api/equipment-hierarchy/parse-file` - Parse uploaded file
- `POST /api/equipment-hierarchy/unstructured/{id}/assign` - Assign to hierarchy
- `DELETE /api/equipment-hierarchy/unstructured/{id}` - Delete item

### Test Credentials
- Email: test@test.com
- Password: test

### Completed Features (Mar 19, 2026)
- [x] Full-stack MVP with React, FastAPI, MongoDB
- [x] JWT authentication
- [x] AI chat interface with GPT-5.2
- [x] Threat management and prioritization
- [x] Failure Modes Library (100+ modes)
- [x] Equipment Hierarchy navigator sidebar
- [x] Mobile-responsive design
- [x] Equipment Manager module (ISO 14224)
- [x] Three-panel hierarchy editor
- [x] Drag-drop unstructured list import
- [x] Auto-detection of equipment types
- [x] Editable ISO 14224 equipment type library
- [x] Direct drag-drop assignment (no confirmation)
- [x] Click-based "Move Mode" for hierarchy repositioning
- [x] **ISO 14224 Aligned Hierarchy** (Mar 18, 2026):
  - Added "Subunit" level between Equipment Unit and Maintainable Item
  - Updated terminology to match ISO 14224 standard
  - Left sidebar now shows ISO 14224 taxonomy levels with counts
  - Legacy level support for backward compatibility
- [x] **Causal Engine Module** (Mar 19, 2026):
  - Investigation cases creation and management
  - Event timeline with categories
  - Failure mode identification
  - Causal tree building with root cause flagging
  - Corrective action tracking
  - Integration with threat detail page ("Start Investigation" button)
- [x] **Drag-and-Drop Hierarchy Reordering** (Mar 19, 2026):
  - Fixed critical bug with undefined `movingNode` state
  - New backend endpoint `POST /api/equipment-hierarchy/nodes/{id}/reorder-to` for position-based reordering
  - Drag nodes to reorder among siblings (drop on top/bottom edge)
  - Drag nodes to become children of other nodes (drop in center)
  - Visual feedback during drag operations (blue highlight, drop indicators)
  - Toast notifications for successful moves
- [x] **Persistent Hierarchy Expansion State** (Mar 19, 2026):
  - Equipment Manager page remembers expanded nodes via localStorage
  - Sidebar hierarchy remembers expanded nodes separately
  - Expansion state persists across page navigation and refreshes
- [x] **Libraries Moved to FMEA Page** (Mar 19, 2026):
  - Equipment Types and Criticality now in Library page under "Equipment & Criticality" tab
  - Equipment Manager simplified to two-panel layout
- [x] **FMEA Library Enhancements** (Mar 19, 2026):
  - Search functionality fixed (searches across all fields)
  - CRUD operations for Failure Modes (Create, Read, Update, Delete)
  - Auto-link to Equipment Types based on equipment name
  - Manual equipment type linking via dropdown
  - Keywords and Recommended Actions editable with add/remove
  - Live RPN calculation in dialog
  - Built-in modes can be edited but not deleted
- [x] **Custom FMEA Data Integration** (Mar 19, 2026):
  - Integrated failure modes from user-provided FMEA 2022-2023.xlsx (rubber recycling plant)
  - Library expanded from original ~100 modes to **200 failure modes**
  - **8 new categories added**: Extruder (38 modes), Material Handling (10), Quality Control (12), Dosing (6), Ventilation (6), Cutting (5), Packaging (11), Cooling (6)
  - New modes include: Screw Wear, Material Out of Spec, Metal Detector issues, Hopper Bridging, Knife Wear, CO2 dosing, etc.
  - All data searchable and properly categorized with RPN values
- [x] **Global Undo System** (Mar 19, 2026):
  - Undo button in header on every page (amber colored when active)
  - Tracks up to 5 most recent actions
  - Shows tooltip with action description and count
  - Badge counter shows number of undoable actions
  - Supported undo operations:
    - Edit threat (reverts all field changes)
    - Delete failure mode (recreates the deleted mode)
    - Delete equipment node (recreates the deleted node)
    - Delete investigation (recreates the deleted investigation)
  - UndoContext.js provides pushUndo, undo, canUndo functions
  - Tests: 8/8 undo feature tests passed
- [x] **Hierarchical Threat Filtering** (Mar 19, 2026):
  - Clicking parent node in hierarchy filters threats from that node AND all descendants
  - Filter banner shows "(including X items below)" when filtering by parent
  - URL params: assets (comma-separated), assetName (display name)
- [x] **Centralized Actions Management** (Mar 19, 2026):
  - New "Actions" tab in navigation between Threats and Causal Engine
  - Dedicated ActionsPage.js with stats cards (Total, Open, In Progress, Completed, Overdue)
  - Filters: Status, Priority, Source Type (Threat/Investigation)
  - Search by title, description, assignee, action number
  - "Act" button on threat recommended actions (hover to reveal)
  - "Act" button on investigation corrective actions
  - Actions store: title, description, source_type, source_id, source_name, priority, status
  - Edit dialog: title, description, status, priority, assignee, discipline, due date, completion notes
  - Quick status toggle by clicking status icon
  - Backend: /api/actions CRUD endpoints with filtering
  - Backend tests: 20/20 passed
- [x] **UI/UX Consistency Redesign** (Mar 20, 2026):
  - ActionsPage.js redesigned to match ThreatsPage.js layout
  - FailureModesPage.js (Library) redesigned with consistent style
  - CausalEnginePage.js redesigned with:
    - Compact stats row at top (Events, Failures, Causes, Root Causes, Actions)
    - Tab navigation matching other pages
    - Card-based metadata display (Asset, Date, Lead)
    - Section tabs for Timeline, Failures, Causes, Actions
    - priority-list component styling for all item lists
  - Floating Action Button (+) for threat reporting (replaces header button)
  - Equipment Manager sidebar auto-collapses when navigating to page
  - Equipment Manager only shows Equipment Type/Discipline for lower hierarchy levels
- [x] **ThreatBase v2 - AI Risk Engine (Phase 1)** (Mar 21, 2026):
  - Dynamic Risk Scoring (0-100) replacing static labels
  - Failure Probability calculation (0-100%)
  - Time-to-Failure prediction with confidence scores
  - Risk Trend Tracking with visual indicators (↑ ↓ →)
  - Risk Forecast for 7/14/30 days ahead
  - Key Risk Factors identification
  - AI Recommendations generation
  - AIInsightsPanel component with circular risk gauge
  - Backend: /api/ai/analyze-risk/{threat_id}, /api/ai/risk-insights/{threat_id}, /api/ai/top-risks
  - MongoDB caching in ai_risk_insights collection
  - All tests passed: 17/17
- [x] **ThreatBase v2 - Causal Intelligence Engine (Phase 2)** (Mar 21, 2026):
  - Auto-generate Top 3-5 probable causes per threat
  - "Why is this happening?" explainability feature
  - Cause categories: technical, human_factor, maintenance, design, organizational, external
  - Probability ranking with supporting evidence
  - Recommended mitigations per cause
  - Fault Tree generation (auto-generated hierarchical structure)
  - Bow-Tie model generation with preventive/mitigative barriers
  - Action Optimization with ROI analysis (risk reduction per EUR)
  - CausalIntelligencePanel component with expandable cause cards
  - Backend: /api/ai/generate-causes, /api/ai/explain, /api/ai/fault-tree, /api/ai/bow-tie, /api/ai/optimize-actions
  - MongoDB caching in ai_causal_analysis, ai_fault_trees, ai_bow_ties, ai_action_optimization collections
  - GPT-5.2 LLM integration via emergentintegrations

### ThreatBase v2 Architecture Update

```
/app/
├── backend/
│   ├── server.py               # Main API with AI endpoints
│   ├── ai_risk_engine.py       # NEW: AI Risk Engine service (GPT-5.2)
│   ├── ai_risk_models.py       # NEW: Pydantic models for AI features
│   ├── iso14224_models.py
│   ├── investigation_models.py
│   └── failure_modes.py        
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── AIInsightsPanel.jsx        # NEW: AI Risk Analysis UI
│       │   ├── CausalIntelligencePanel.jsx # NEW: Causal Intelligence UI
│       │   └── ...existing components
│       ├── pages/
│       │   ├── ThreatDetailPage.js  # Updated with AI panels
│       │   └── ...existing pages
│       └── lib/
│           └── api.js              # NEW: aiRiskAPI methods
```

### New AI Collections (MongoDB)
- `ai_risk_insights` - Cached risk analysis results
- `ai_causal_analysis` - Cached causal analysis
- `ai_fault_trees` - Cached fault tree structures
- `ai_bow_ties` - Cached bow-tie models
- `ai_action_optimization` - Cached action recommendations

### Future Tasks (Backlog)
- [ ] P1: Complete Multi-Language (EN/NL) translations for all pages
- [ ] P2: Voice input for chat interface
- [ ] P2: Image analysis for damage detection
- [ ] P2: Report generation (PowerPoint/PDF) for Causal Investigations
- [ ] P2: AI Alerting System (proactive alerts when risk crosses thresholds)
- [ ] P2: Risk Timeline Graph visualization
- [ ] P2: Data Integration Layer (SCADA/CMMS/IoT)
- [ ] P3: Cross-Asset Learning Engine (pattern detection)
- [ ] P3: Export hierarchy to PDF/Excel
- [ ] P3: Bulk criticality assignment
- [ ] P3: Equipment template library
- [ ] P3: Migrate FMEA library from Python file to MongoDB for better scalability
- [ ] P3: Break down FailureModesPage.js into smaller components

### Changelog

#### Mar 22, 2026 - Maintenance Strategy Module
- [x] **Maintenance Strategy Database & Auto-Generation** (Mar 22, 2026):
  - NEW: Complete Maintenance Strategy data model combining ALL 4 criticality levels per equipment type:
    - Safety Critical, Production Critical, Medium, Low - each with tailored strategies
    - Operator Rounds (frequency-based: shift/daily/weekly/monthly)
    - Detection Systems (vibration, temperature, pressure, etc. with alarm thresholds)
    - Scheduled Maintenance Tasks (preventive, predictive, condition-based)
    - Corrective Actions with response times and priorities
    - Emergency Procedures (for safety-critical equipment)
    - Spare Parts inventory recommendations
    - Failure Mode Mappings linking FMEA to maintenance actions
  - NEW: AI-powered strategy generation from FMEA failure modes
  - NEW: "Generate All" button to create strategies for all equipment types at once
  - NEW: Search functionality across strategies, spare parts, and failure modes
  - NEW: **Full editing capability** with dialogs for each component type:
    - Add/Edit/Delete operator rounds with checklist items
    - Add/Edit/Delete detection systems with alarm thresholds
    - Add/Edit/Delete scheduled maintenance tasks
    - Add/Edit/Delete corrective actions
    - Add/Edit/Delete emergency procedures
    - Add/Edit/Delete spare parts
    - All changes auto-increment strategy version
  - NEW: Strategy versioning (auto-increments on changes)
  - NEW: Tabbed UI showing all criticality levels in one card
  - NEW: "Maintenance" tab added to Library page
  - Backend files: `maintenance_strategy_models.py`, `maintenance_strategy_generator.py`
  - Frontend file: `MaintenanceStrategiesPanel.jsx`
  - API endpoints: `/api/maintenance-strategies/*`, `/api/maintenance-strategies/generate-all`

#### Mar 21, 2026 - AI Risk Score Alignment
- [x] **AI Risk Analysis Score Aligned with Threat Score** (Mar 21, 2026):
  - Fixed confusion where AI Risk Analysis showed a different score than the threat's actual Risk Score
  - AI Risk Analysis now uses the threat's FMEA-calculated risk score (Likelihood × Detectability × 10)
  - Updated RiskGauge component to use FMEA thresholds: Critical ≥150, High ≥100, Medium ≥50, Low <50
  - Updated ForecastChart to use 250-point FMEA scale
  - Backend `ai_risk_engine.py` now always returns threat's actual risk_score for consistency
  - Forecasts are now properly scaled to FMEA range (10-250)
  - Updated files: `/app/frontend/src/components/AIInsightsPanel.jsx`, `/app/backend/ai_risk_engine.py`

#### Mar 21, 2026 - Missing Library Data Warning
- [x] **Missing Library Data Warning in AI Risk Analysis** (Mar 21, 2026):
  - Added automatic detection of missing Equipment Types and Failure Modes from the FMEA library
  - When a threat's equipment type or failure mode is not found in the library, a prominent amber warning box appears
  - Warning shows exactly which items are missing with their values
  - "Go to Library" button navigates directly to the Library page for easy addition
  - Full EN/NL translation support for warning messages
  - Updated files: `/app/frontend/src/components/AIInsightsPanel.jsx`, `/app/frontend/src/contexts/LanguageContext.js`

#### Mar 21, 2026 - Searchable Dropdowns for Threat Editing
- [x] **Searchable Combobox for Asset, Equipment Type, Failure Mode** (Mar 21, 2026):
  - Created reusable `SearchableCombobox.jsx` component using Radix UI Command + Popover primitives
  - When editing a threat, Asset, Equipment Type, and Failure Mode fields now show searchable dropdowns
  - Asset dropdown populated from Equipment Hierarchy nodes (flattened tree with level descriptions)
  - Equipment Type dropdown populated from Equipment Types library (shows discipline as description)
  - Failure Mode dropdown populated from FMEA library (shows equipment category as description)
  - All dropdowns support:
    - Real-time search/filter functionality
    - Custom value entry (users can type a value not in the list)
    - Descriptions under each option for context
    - Checkmark indicating currently selected value
  - Fixed API response handling for nested data structures ({nodes: [...]}, {equipment_types: [...]}, {failure_modes: [...]})
  - Component located at: `/app/frontend/src/components/SearchableCombobox.jsx`
  - Updated file: `/app/frontend/src/pages/ThreatDetailPage.js`



#### Dec 2025 - Complete Dutch (NL) Localization
- [x] **Full Application Localization** (Dec 2025):
  - Extended `LanguageContext.js` with comprehensive translation dictionaries
  - Updated `FailureModesPage.js` with Dutch translations for:
    - Tab labels (Failure Modes, Equipment Types, Maintenance)
    - Form labels (Category, Equipment, Severity, Occurrence, etc.)
    - Dialog titles (Add/Edit Failure Mode, Add/Edit Equipment Type)
    - Button labels (Add, Cancel, Save, Create)
    - Empty states and search placeholders
  - Updated `EquipmentManagerPage.js` with Dutch translations for:
    - Toolbar buttons (Import List, Add Installation, Add Child)
    - Search placeholder and match counts
    - Empty state messages
    - Dialog titles and form labels
    - Move mode banner text
  - Updated `CausalEnginePage.js` with Dutch translations for:
    - Investigation sidebar (title, search, empty state)
    - Tab labels (Overview, Timeline, Failures, Causal Tree, Actions)
    - Dialog forms (Event, Failure, Cause, Action dialogs)
    - Form labels and button text
  - Added URL parameter handling in `FailureModesPage.js` for FMEA linkage from Maintenance Strategies
  - All pages now support seamless EN/NL language toggle


#### Dec 2025 - FMEA Linkage Bug Fix
- [x] **Fixed Missing FMEA Linkages in Maintenance Strategies** (Dec 2025):
  - Bug: Clickable FMEA failure mode badges were not visible in Maintenance Strategy cards
  - Root cause: `onFailureModeClick` handler was not being passed to `StrategyCard` component in the strategies mapping loop
  - Fix: Added `onFailureModeClick={handleFailureModeClick}` prop to `StrategyCard` in `MaintenanceStrategiesPanel.jsx` (line 1220)
  - The FMEA linkages now properly display as amber-colored clickable badges showing:
    - "Checks for:" (Operator Rounds - from checklist failure_modes_addressed)
    - "Detects:" (Detection Systems - from failure_modes_detected)
    - "Prevents:" (Scheduled Maintenance - from failure_modes_addressed)
    - "Addresses:" (Corrective Actions - from failure_modes)
  - Clicking a badge navigates to Library → Failure Modes with pre-filled search
  - Toast notification confirms the navigation action
  - File updated: `/app/frontend/src/components/MaintenanceStrategiesPanel.jsx`

#### Dec 2025 - Reliability Performance Dashboard
- [x] **Reliability Snowflake Dashboard** (Dec 2025):
  - Created `ReliabilitySnowflake.jsx` component with SVG radar/snowflake chart
  - 6 reliability dimensions: Criticality, Incidents, Investigations, Maintenance, Reactions, Threats
  - Visual profile with yellow filled area and dimension labels
  - Dynamic scoring based on actual equipment data
  - Created `ReliabilityPerformancePage.js` with:
    - Equipment hierarchy tree with mini score bars
    - Per-item and aggregated scoring
    - Level summary cards (Plant, Installation, Unit, System, etc.)
    - Dimension details panel with progress bars
    - Quick stats panel (dark theme)
  - Added backend API `/api/reliability-scores`:
    - Calculates scores for each of 6 dimensions per equipment
    - Aggregates scores up the hierarchy tree
    - Supports filtering by node_id or level
    - Returns global scores and summary statistics
  - Integrated into Dashboard page with tabs: "Operational" | "Reliability Performance"
  - Added Dutch (NL) translations for all new dashboard features
  - Files: `/app/frontend/src/components/ReliabilitySnowflake.jsx`, `/app/frontend/src/pages/ReliabilityPerformancePage.js`
