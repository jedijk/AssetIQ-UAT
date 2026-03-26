# AssetIQ - AI-Powered Reliability Intelligence Platform

## Product Requirements Document (PRD)

### Original Problem Statement
Build an AI-Powered Reliability Intelligence Platform named "ReliabilityOS" (formerly ThreatBase / AssetIQ) that enables reliability engineers to capture failures via chat, have them automatically structured, and receive a clear prioritized risk decision.

### Architecture (Updated Mar 26, 2026)

**Backend** (FastAPI + MongoDB):
```
/app/backend/
├── server.py              # Thin entry point (~39 lines) - app creation + CORS + router includes
├── database.py            # Centralized DB connection + service initialization
├── auth.py                # Auth helpers (hash, verify, token, get_current_user)
├── storage.py             # Object storage helpers
├── ai_helpers.py          # AI helper functions (chat, analysis, transcription)
├── ai_risk_engine.py      # AI risk analysis engine
├── chat_handler_v2.py     # State-machine chat handler
├── failure_modes.py       # Static FMEA library (215 modes with structured actions)
├── iso14224_models.py     # ISO 14224 equipment models
├── investigation_models.py # Investigation data models
├── maintenance_strategy_generator.py  # AI maintenance strategy generator
├── maintenance_strategy_models.py     # Maintenance strategy Pydantic models
├── models/
│   ├── api_models.py      # Shared Pydantic API models
│   ├── task_models.py     # Task management models
│   └── form_models.py     # Form builder models
├── services/
│   ├── failure_modes_service.py    # FMEA CRUD with versioning
│   ├── efm_service.py             # Equipment failure modes
│   ├── task_service.py            # Task scheduling
│   ├── form_service.py            # Form management
│   ├── observation_service.py     # Observations
│   ├── decision_engine.py         # Decision rules engine
│   ├── analytics_service.py       # Analytics
│   ├── rbac_service.py            # Role-based access control
│   └── threat_score_service.py    # Threat score calculations
├── routes/
│   ├── __init__.py        # Route module registry (16 routers)
│   ├── auth.py            # Auth endpoints
│   ├── chat.py            # Chat + voice endpoints
│   ├── threats.py         # Threats CRUD + linking + investigate
│   ├── stats.py           # Stats + reliability scores
│   ├── failure_modes_routes.py  # Failure modes CRUD
│   ├── equipment.py       # Equipment hierarchy + unstructured import
│   ├── efms.py            # Equipment failure modes
│   ├── tasks.py           # Task templates/plans/instances
│   ├── forms.py           # Form templates/submissions
│   ├── observations.py    # Observations CRUD
│   ├── decision_engine_routes.py  # Decision engine
│   ├── investigations.py  # Investigations CRUD + sub-resources
│   ├── actions.py         # Centralized actions
│   ├── ai_routes.py       # AI risk engine endpoints
│   ├── maintenance.py     # Maintenance strategies
│   └── analytics.py       # Analytics + RBAC
```

**Frontend** (React + TailwindCSS + ShadcnUI):
- Pages: Dashboard, Observations, Causal Engine, Actions, Library, Equipment Manager, Task Scheduler, Forms, Decision Engine, Reliability Performance, Analytics
- Components: ChatSidebar, EquipmentHierarchy, Layout, MaintenanceStrategiesPanel, AIInsightsPanel, CausalIntelligencePanel

### Core Features (All Implemented)
1. **User Authentication** (JWT)
2. **AI Chat-Based Threat Capture** (GPT-5.2 via Emergent LLM Key)
3. **Equipment Hierarchy Manager** (ISO 14224 compliant, drag-and-drop)
4. **FMEA Library** (215 modes, structured actions with CM/PM/PDM types and disciplines)
5. **Causal Engine** (Root cause analysis with fault trees)
6. **Centralized Actions Management**
7. **Task Scheduler** (Templates, plans, execution instances)
8. **Form Builder** (Custom forms with field types)
9. **Decision Engine** (Automated rules)
10. **Maintenance Strategies** (AI-generated)
11. **Analytics Dashboard** (Risk overview, reliability performance)
12. **RBAC** (Role-based access control)
13. **Global Undo** (Undo last destructive action)
14. **Multi-Language Support** (EN/NL framework - partially implemented)

### Latest Updates

**Mar 26, 2026 - Backend Refactoring & FMEA Structured Actions**:
- **Backend Refactored**: server.py reduced from 6931 → 39 lines. All routes extracted to 16 modular files under `/app/backend/routes/`
- **New shared modules**: `database.py`, `auth.py`, `storage.py`, `models/api_models.py`, `services/threat_score_service.py`
- **FMEA Structured Actions**: All 215 failure modes updated with structured `recommended_actions`: `{action: str, action_type: "CM"|"PM"|"PDM", discipline: str}`
  - Action types: PM (73%), CM (16%), PDM (10%)
  - Disciplines: Mechanical (62%), Instrumentation (14%), Electrical (11%), Piping (7%), Safety (2%), Process (1%), Structural (1%)
- **Frontend Updated**: FailureModesPage and ThreatDetailPage now render structured action badges (CM/PM/PDM) with discipline labels
- **Testing**: 19/19 backend API tests passed, frontend verified

### Pending Issues
1. **P1 - Multi-Language Translations**: Pages still have hardcoded English strings. `LanguageContext.js` exists but not applied to all pages.
2. **P2 - Post-Login Redirect Bug**: Deep-linking doesn't work (requested URL lost after login redirect). Recurring issue (3+ forks).

### Upcoming Tasks
- P2: Voice input for chat interface
- P2: Image analysis for damage detection
- P2: Report generation (PowerPoint/PDF) for Causal Investigations

### Future/Backlog
- P3: Migrate FMEA library from Python file to MongoDB for scalability
- P3: Export equipment hierarchy to PDF/Excel
- P3: Bulk criticality assignment for equipment
- P3: Frontend component segmentation (break large pages into sub-components)
- P3: Clean up test data in equipment hierarchy

### Credentials
- Test account: test@test.com / test
- LLM: OpenAI GPT-5.2 via Emergent LLM Key

### 3rd Party Integrations
- OpenAI GPT-5.2 (Chat extraction, AI analysis) via Emergent LLM Key
- Object Storage via Emergent integrations
