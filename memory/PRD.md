# ThreatBase - AI-Powered Threat Capture & Prioritization Platform

## Product Requirements Document (PRD)

### Original Problem Statement
Build an AI-Powered Threat Capture & Prioritization Platform named "ThreatBase" that enables reliability engineers to capture failures via chat, have them automatically structured, and receive a clear prioritized risk decision.

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

#### 5. Equipment Hierarchy & Criticality Manager - ISO 14224 (Completed - Mar 18, 2026)
- **Three-panel UI**: Libraries (left), Hierarchy Canvas (center), Properties (right)
- **ISO 14224 Hierarchy Levels** (Updated Mar 18, 2026):
  - Installation (Level 1: Offshore platform, Onshore plant)
  - Plant/Unit (Level 2: Production unit, Utility unit)
  - Section/System (Level 3: Gas compression, Water injection)
  - Equipment Unit (Level 4: Compressor, Pump, Heat exchanger)
  - Subunit (Level 5: Driver, Driven unit, Control system) - NEW
  - Maintainable Item (Level 6: Bearing, Seal, Impeller)
- **Criticality Assignment**: Safety Critical, Production Critical, Medium, Low
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

### Future Tasks (Backlog)
- [ ] P2: Voice input for chat interface
- [ ] P2: Image analysis for damage detection
- [ ] P2: Report generation (PowerPoint/PDF) for Causal Investigations
- [ ] P3: Export hierarchy to PDF/Excel
- [ ] P3: Bulk criticality assignment
- [ ] P3: Equipment template library
- [ ] P3: Data migration utility (convert legacy levels to ISO 14224)
- [ ] P3: Automated causal hypothesis generation for Causal Engine
- [ ] P3: Migrate FMEA library from Python file to MongoDB for better scalability
- [ ] P3: Break down FailureModesPage.js into smaller components
