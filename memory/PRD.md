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
- **ISO 14224 Hierarchy Levels**: Installation → Unit → System → Equipment → Maintainable Item
- **Criticality Assignment**: Safety Critical, Production Critical, Medium, Low
- **Discipline Mapping**: Mechanical, Electrical, Instrumentation, Process
- **Equipment Type Library**: 20+ ISO-compliant equipment types with icons
- **Custom Equipment Types**: Add/edit/delete custom types
- **Unstructured Import**: 
  - Parse equipment lists from text (paste)
  - Upload files (Excel, PDF, CSV, TXT)
  - Auto-detect equipment types from names/tags
- **Drag & Drop**: Direct assignment from unassigned items to hierarchy (no confirmation needed)

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
│   │   │   ├── Layout.js       # Main layout with Settings menu
│   │   │   ├── ChatSidebar.jsx # AI chat interface
│   │   │   └── EquipmentHierarchy.jsx
│   │   ├── pages/
│   │   │   ├── ThreatsPage.js
│   │   │   ├── EquipmentManagerPage.js  # ISO 14224 module
│   │   │   └── FailureModesPage.js
│   │   └── lib/
│   │       └── api.js      # API client
└── memory/
    └── PRD.md
```

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
- `GET /api/equipment-hierarchy/types` - Get equipment types (merged default + custom)
- `POST /api/equipment-hierarchy/types` - Create custom type
- `PATCH /api/equipment-hierarchy/types/{id}` - Update type
- `DELETE /api/equipment-hierarchy/types/{id}` - Delete custom type
- `GET /api/equipment-hierarchy/nodes` - Get hierarchy nodes
- `POST /api/equipment-hierarchy/nodes` - Create node
- `PATCH /api/equipment-hierarchy/nodes/{id}` - Update node
- `DELETE /api/equipment-hierarchy/nodes/{id}` - Delete node (cascades)
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

### Future Tasks (Backlog)
- [ ] P2: Voice input for chat interface
- [ ] P2: Image analysis for damage detection
- [ ] P2: Failure prediction and pattern recognition
- [ ] P3: Export hierarchy to PDF/Excel
- [ ] P3: Bulk criticality assignment
- [ ] P3: Equipment template library
