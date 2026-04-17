# AssetIQ - Product Requirements Document

## Original Problem Statement
Robust full-stack platform (React + FastAPI + MongoDB) optimized for multi-environment execution with dynamic database switching, advanced form capabilities, and seamless AI integrations.

## Core Architecture
- **Frontend**: React (CRA) + TailwindCSS + Shadcn/UI
- **Backend**: FastAPI + MongoDB (Motor async driver)
- **File Storage**: Cloudflare R2 (primary) + MongoDB base64 (legacy fallback)
- **AI**: GPT-4o/Whisper (Emergent LLM Key), GPT-5.2 Vision (user OPENAI_VISION_KEY)
- **Version**: 3.4.4

## What's Been Implemented

### Core Platform
- Multi-environment database switching (Production/UAT)
- JWT auth with bcrypt, brute-force protection, password reset
- Role-based access (owner, admin, user)
- Forced version reload mechanism

### Features
- AI Chat Assistant, Task Scheduler, Equipment Hierarchy, Form Builder
- Observations/Actions/Causal Investigations, Production Dashboard
- QR Code system, My Tasks with persistent sort ordering
- Operator Landing Page / Simple Mode (mobile-optimized)
- Universal Photo Data Capture (GPT-5.2 Vision)
- Cloudflare R2 file storage migration
- File Storage metrics in Server Performance dashboard (with capacity bar)
- User Management: default_simple_mode toggle, last_login tracking
- Equipment Hierarchy: hide specific levels, leaf node alignment fix

### Mobile File Viewing (Latest Fix)
- Replaced iframe-based PDF preview with canvas-based MobilePdfViewer in EquipmentHierarchy details dialog
- Replaced Dialog-based file preview with full-screen DocumentViewer in both EquipmentHierarchy and PropertiesPanel
- Added touch pinch-zoom, pan, and double-tap-reset for image viewer
- Made DocumentViewer header mobile-responsive (icon-only buttons on mobile)
- Fixed Equipment card on Dashboard to open hierarchy sidebar on mobile instead of blocked Equipment Manager
- Fixed hierarchy auto-collapse on mobile so it can be opened via events
- Made file action buttons (view/download/delete) always visible on mobile (hover-only on desktop)

## Key API Endpoints
- `POST /api/ai/extract` - GPT-5.2 Vision processing
- `GET /api/system/file-storage` - File storage stats
- `GET /api/equipment-files/{fileId}/download` - Equipment file download
- `GET /api/equipment/{id}/files` - List equipment files

## Prioritized Backlog

### P1 (Next Up)
- Report generation (PowerPoint/PDF) for Causal Investigations
- Offline support with local storage for My Tasks execution

### P2
- QR scan analytics dashboard

### P3 (Refactoring)
- Break down large pages: FormsPage.js (2100+ lines), SettingsUserManagementPage.js, EquipmentManagerPage.js, DashboardPage.js
