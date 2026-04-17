# AssetIQ - Product Requirements Document

## Original Problem Statement
Robust full-stack platform (React + FastAPI + MongoDB) for multi-environment execution with dynamic database switching, advanced form capabilities, AI integrations, and production log analysis.

## Core Architecture
- **Frontend**: React (CRA) + TailwindCSS + Shadcn/UI
- **Backend**: FastAPI + MongoDB (Motor async driver)
- **File Storage**: Cloudflare R2 (primary) + MongoDB base64 (legacy)
- **AI**: GPT-4o/Whisper (Emergent LLM Key), GPT-5.2 Vision (user OPENAI_VISION_KEY)
- **Version**: 3.4.6

## What's Been Implemented

### Core Platform
- Multi-environment database switching, JWT auth, role-based access, forced version reload

### Features
- AI Chat, Task Scheduler, Equipment Hierarchy, Form Builder
- Observations/Actions/Causal Investigations, Production Dashboard
- QR Codes, My Tasks, Operator Landing Page / Simple Mode
- Universal Photo Data Capture (GPT-5.2 Vision)
- Cloudflare R2 file storage, File Storage metrics in Server Performance

### Production Log Ingestion & History Builder (Latest)
- **Upload**: CSV, TXT, LOG, XLSX, XLS, ZIP + folder structure upload (chunked, parallel R2)
- **Parsing**: Template-based (delimiter, column mapping) + AI-assisted (GPT-5.2)
- **Preview**: First 100 records with validation stats, error highlighting, event summary
- **Ingestion**: Async background processing into `production_logs` collection
- **Event Detection**: Auto-classify normal/downtime/waste/alarm from status keywords
- **Aggregation**: Hourly buckets in `asset_history` (avg/min/max metrics, event counts)
- **Dashboard**: Asset selector, time series charts (canvas-based), events timeline, stats summary
- **AI Detect**: GPT-5.2 analyzes unstructured logs and suggests column mappings

### Mobile Improvements
- Full-screen DocumentViewer with canvas PDF rendering, page navigation
- Touch pinch-zoom/pan for images, double-tap reset
- Equipment Details dialog centered on mobile
- Landscape blocker hidden during file viewing

## Key API Endpoints
- `POST /api/production-logs/upload` - Upload files (chunked, supports job_id append)
- `POST /api/production-logs/detect-columns` - Auto-detect columns
- `POST /api/production-logs/parse-preview` - Parse & preview
- `POST /api/production-logs/ingest` - Async ingestion
- `POST /api/production-logs/aggregate` - Build hourly aggregations
- `POST /api/production-logs/ai-parse` - AI-assisted structure detection
- `GET /api/production-logs/timeseries` - Time series data for charts
- `GET /api/production-logs/history` - Query aggregated data
- `GET /api/production-logs/assets` - List unique assets
- `GET /api/production-logs/stats` - Overall statistics

## Key DB Collections
- `production_logs`: Parsed log entries (timestamp, asset_id, metrics, status, event_type)
- `log_ingestion_jobs`: Upload/ingestion job tracking
- `asset_history`: Hourly aggregated metrics and event counts

## Prioritized Backlog

### P1 (Next Up)
- Report generation (PowerPoint/PDF) for Causal Investigations
- Offline support with local storage for My Tasks execution

### P2
- QR scan analytics dashboard
- Advanced event detection rule engine

### P3 (Refactoring)
- Break down large pages (FormsPage.js 2100+ lines, etc.)
