# AssetIQ - Product Requirements Document

## Original Problem Statement
Robust full-stack platform (React + FastAPI + MongoDB) optimized for multi-environment execution with dynamic database switching, advanced form capabilities, and seamless AI integrations. Features include AI chat assistant, Task Scheduler, Equipment Hierarchy, Form Builder with Universal Photo Data Capture (GPT-5.2 Vision), Cloudflare R2 file storage, and a mobile-friendly 'Simple Mode' for operators.

## Core Architecture
- **Frontend**: React (CRA) + TailwindCSS + Shadcn/UI
- **Backend**: FastAPI + MongoDB (Motor async driver)
- **File Storage**: Cloudflare R2 (primary) + MongoDB base64 (legacy fallback)
- **AI**: GPT-4o/Whisper (Emergent LLM Key), GPT-5.2 Vision (user OPENAI_VISION_KEY)
- **Email**: Resend
- **Version**: 3.4.4

## What's Been Implemented

### Core Platform
- Multi-environment database switching (Production/UAT)
- JWT auth with bcrypt, brute-force protection, password reset
- Role-based access (owner, admin, user)
- Forced version reload mechanism

### Features
- AI Chat Assistant (GPT-4o)
- Task Scheduler with recurring tasks
- Equipment Hierarchy with ISO 14224 levels
- Form Builder with dynamic field types
- Observations/Actions/Causal Investigations
- Production Dashboard
- QR Code system for equipment
- My Tasks with persistent sort ordering

### Recent Additions (v3.4.4)
- Operator Landing Page / Simple Mode (mobile-optimized)
- Universal Photo Data Capture (GPT-5.2 Vision)
- Cloudflare R2 file storage migration
- File Storage metrics in Server Performance dashboard
- User Management: default_simple_mode toggle, last_login tracking
- Equipment Hierarchy: hide specific levels, leaf node alignment fix

## Key API Endpoints
- `POST /api/ai/extract` - GPT-5.2 Vision processing
- `POST /api/ai/corrections` - Store user corrections
- `GET /api/system/file-storage` - File storage stats (R2 + MongoDB)
- `GET /api/system/metrics` - CPU/RAM/Disk/Uptime
- `GET /api/system/database` - MongoDB storage stats
- `GET /api/system/security` - Security checks
- `PATCH /api/users/me/profile` - User profile updates

## Key DB Collections
- `file_storage`: `{path, url, size, content_type, storage_type, created_at}`
- `form_templates`: includes `photo_extraction_config`
- `users`: includes `default_simple_mode`, `last_login`

## Prioritized Backlog

### P1 (Next Up)
- Report generation (PowerPoint/PDF) for Causal Investigations
- Offline support with local storage for My Tasks execution

### P2
- QR scan analytics dashboard

### P3 (Refactoring)
- Break down large pages: FormsPage.js (2100+ lines), SettingsUserManagementPage.js, EquipmentManagerPage.js, DashboardPage.js, ProductionDashboardPage.js
