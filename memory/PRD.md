# ThreatBase - Product Requirements Document

## Original Problem Statement
AI-Powered Threat Capture & Prioritization Platform for reliability engineers to capture failures via chat, automatically structure them, and receive prioritized risk decisions.

## User Personas
- **Primary**: Reliability Engineers, Asset Integrity Engineers
- **Secondary**: Maintenance Managers, Operations Managers

## Core Requirements
1. Chat-based failure capture (< 2 min interaction)
2. AI structuring engine (GPT-5.2)
3. Risk ranking and prioritization using FMEA methodology
4. Threat database with auto-creation from chat
5. Voice input (OpenAI Whisper)
6. Image analysis for damage detection (GPT-4 Vision)
7. Failure Mode Library (100 FMEA modes)

## What's Been Implemented (March 17, 2026)

### Backend (FastAPI + MongoDB)
- JWT authentication (register/login/me)
- Chat endpoint with AI threat analysis
- Voice transcription endpoint
- Threats CRUD with status management
- Risk score calculation using FMEA methodology
- Failure Mode Library API (100 modes, 8 categories)
- Stats endpoint for dashboard

### Frontend (React + Tailwind + Shadcn)
- Login/Register pages
- Chat interface with voice recording and image upload
- Threats list with search, filter, stats
- Threat detail page with status management
- Failure Mode Library page with category filters
- Mobile-responsive design
- Light theme with blue highlights

### AI Integration
- OpenAI GPT-5.2 for threat analysis via Emergent LLM key
- Extracts: Asset, Equipment Type, Failure Mode, Impact, Frequency, Likelihood, Detectability
- Calculates risk score and level (Critical/High/Medium/Low)
- Generates recommended actions

## Prioritized Backlog

### P0 (Critical - Done)
- [x] Chat-based threat capture
- [x] AI threat structuring
- [x] Risk ranking
- [x] Threat database

### P1 (High Priority - Done)
- [x] Voice input
- [x] Image analysis
- [x] Failure Mode Library

### P2 (Medium Priority - Next)
- [ ] Pattern recognition across threats
- [ ] Recurring threat detection
- [ ] Failure prediction based on patterns
- [ ] Multi-user/team support

### P3 (Future)
- [ ] CMMS integration
- [ ] Advanced dashboards
- [ ] Multi-site analytics
- [ ] Export/reporting

## Architecture
```
Frontend (React) → Backend (FastAPI) → MongoDB
                         ↓
                   OpenAI GPT-5.2 (via Emergent)
```

## Environment
- Backend: Port 8001
- Frontend: Port 3000
- Database: MongoDB
- AI: OpenAI GPT-5.2 via EMERGENT_LLM_KEY

## Test Credentials
- Email: test@example.com
- Password: test123
