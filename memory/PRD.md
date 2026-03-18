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

### Completed Features (Mar 18, 2026)
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

### Future Tasks (Backlog)
- [ ] P2: Voice input for chat interface
- [ ] P2: Image analysis for damage detection
- [ ] P2: Failure prediction and pattern recognition
- [ ] P3: Export hierarchy to PDF/Excel
- [ ] P3: Bulk criticality assignment
- [ ] P3: Equipment template library
- [ ] P3: Data migration utility (convert legacy levels to ISO 14224)
