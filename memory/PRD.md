# ThreatBase - AI-Powered Threat Capture & Prioritization Platform

## Original Problem Statement
Build an AI-Powered Threat Capture & Prioritization Platform named "ThreatBase" with:
- User authentication
- Chat-based threat capture system
- Risk prioritization
- Equipment Hierarchy FMEA Library
- Causal Engine

## Core Architecture
```
/app/
├── backend/
│   ├── server.py               # Slim entry point (39 lines)
│   ├── database.py             # DB connection
│   ├── auth.py                 # Auth utilities
│   ├── ai_helpers.py           # AI/LLM helpers (GPT-5.2, Whisper)
│   ├── models/                 # Pydantic models (api_models.py)
│   ├── routes/                 # 16 Extracted API routes
│   ├── services/               # Core services (ai, rbac, etc.)
│   └── failure_modes.py        # FMEA static definitions library
├── frontend/
│   └── src/
│       ├── App.js                  
│       ├── components/         # Reusable UI components
│       ├── contexts/           # Auth, Language contexts
│       └── pages/              # Page components (needs segmentation)
└── memory/
    └── PRD.md                    
```

## What's Been Implemented

### ✅ Completed Features
- [x] User Authentication (JWT-based)
- [x] Dashboard with analytics
- [x] Observations/Threats management with risk scoring
- [x] Equipment Hierarchy Manager (Tree + Levels view)
- [x] FMEA Library with structured recommended_actions (CM/PM/PDM + disciplines)
- [x] Chat-based threat capture (2-step flow: equipment → failure mode)
- [x] Voice input with Whisper (auto-language detection - Dutch/English)
- [x] Causal Engine for investigations
- [x] Actions management
- [x] Backend modular architecture (16 route files)

### 🔧 Recent Changes (March 26, 2026)
- **NEW**: Frontend Code Segmentation - Extracted components from ThreatDetailPage.js:
  - `RecommendedActionsSection.jsx` (326 lines) - Handles recommended actions list and add dialog
  - `RiskScoreCard.jsx` (198 lines) - Risk score display with popup calculator
  - `ThreatHeader.jsx` (177 lines) - Header with title, status, and action buttons
  - Reduced ThreatDetailPage.js from 1738 to 1304 lines (25% reduction)
- **NEW**: Add Recommended Action with Type & Discipline - Users can now manually add recommended actions to observations with `action_type` (CM/PM/PDM) and `discipline` fields. New "Add Recommendation" button in ThreatDetailPage with full form dialog including live preview.
- **NEW**: AI Risk Analysis now generates structured recommendations with `action_type` (CM/PM/PDM) and `discipline` fields. Updated AI prompts and frontend panel to display badges and discipline tags.
- Removed "Create Action" button from Recommended Actions section (redundant with "Act" buttons on each action)
- Fixed voice chat to support Dutch via auto-language detection (removed hardcoded `language="en"`)
- Fixed chat "Failed to send message" bug - `NoneType` iteration error in chat_handler_v2.py when suggestions were None
- Fixed chat 2-step flow bug - `ThreatResponse` Pydantic model now accepts structured `recommended_actions` dicts
- Created mobile frontend at `/mobile` route with LinkedIn-style bottom navigation (Hierarchy, Observations, Report, Actions, Alerts)
- Updated mobile frontend to match desktop light theme (white backgrounds, blue accents, card layouts)
- Added Risk Score and RPN display to Actions page with filtering capability
- Backend fully refactored from monolithic server.py to modular routes

## Pending Items

### P1 - High Priority
- [ ] Frontend Code Segmentation (FailureModesPage.js ~1964 lines, ThreatDetailPage.js ~1508 lines)
- [ ] Multi-Language Translations (Dutch/English - currently hardcoded English)

### P2 - Medium Priority  
- [ ] Post-Login Redirect Bug (deep-linking broken)
- [ ] Image analysis for damage detection
- [ ] Report generation (PowerPoint/PDF) for Causal Investigations

### P3 - Future/Backlog
- [ ] Export equipment hierarchy to PDF/Excel
- [ ] Bulk criticality assignment for equipment

## Key Technical Details

### Database Schema (MongoDB)
- `failure_modes`: `{_id, failure_mode, category, equipment, recommended_actions: [{action, action_type, discipline}]}`
- `chat_messages`: Chat state and history
- `threats`: Main observations with risk scores
- `equipment`: Hierarchical equipment structure
- `users`: User accounts

### 3rd Party Integrations
- OpenAI GPT-5.2 (Chat logic & Risk Analysis) — Emergent LLM Key
- OpenAI Whisper (Voice transcription) — Emergent LLM Key

### Test Credentials
- Email: `test@test.com`
- Password: `test`

### Key API Endpoints
- `POST /api/chat/send` - Send chat message
- `POST /api/voice/transcribe` - Voice to text
- `GET/PATCH /api/failure-modes` - FMEA library CRUD
- `GET/POST /api/threats` - Observations CRUD
- `GET/POST /api/equipment` - Equipment hierarchy

## Known Issues
1. **Post-Login Redirect** - Users not redirected to originally requested URL after login
2. **Hardcoded Translations** - Pages contain English text instead of using LanguageContext
