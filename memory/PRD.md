# AssetIQ - Product Requirements Document

## Original Problem Statement
Create a comprehensive asset management platform with:
- Mobile landing page for field use
- Universal Photo Data Capture with AI extraction
- Cloudflare R2 file storage
- Production Log Ingestion & History Builder
- Equipment hierarchy management
- Task scheduler and forms

## Current Stack
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Storage**: Cloudflare R2
- **AI**: OpenAI GPT-4o (direct SDK - migrated from emergentintegrations)

## Completed Features

### Core Platform (Completed)
- [x] User authentication with JWT
- [x] Role-based access control (owner, admin, user)
- [x] Equipment hierarchy management
- [x] Form builder with custom fields
- [x] Task scheduler
- [x] Mobile-friendly "Simple Mode"

### AI Integration (Completed - Dec 2025)
- [x] AI Chat Assistant
- [x] Universal Photo Data Capture with GPT-4o Vision
- [x] AI-assisted log parsing
- [x] Learning from user corrections

### File Storage (Completed)
- [x] Cloudflare R2 integration
- [x] Chunked file uploads (5 files per request)
- [x] Folder/directory upload support

### Production Log Ingestion (Completed)
- [x] CSV/Excel/TXT file support
- [x] Batch folder uploads
- [x] Template-based parsing
- [x] AI-assisted column mapping
- [x] Asset history aggregation

### OpenAI Migration (Completed - April 2026)
- [x] Migrated from emergentintegrations to official OpenAI SDK
- [x] Configured OPENAI_API_KEY and OPENAI_VISION_KEY
- [x] Verified all AI endpoints working

## Pending Tasks

### P1 - High Priority
1. **Report Generation** - PowerPoint/PDF reports for Causal Investigations
2. **Offline Support** - Local storage for My Tasks execution

### P2 - Medium Priority
1. QR scan analytics dashboard

### P3 - Low Priority / Refactoring
1. Break down large components:
   - `FormsPage.js`
   - `SettingsUserManagementPage.js`
   - `EquipmentManagerPage.js`
   - `DashboardPage.js`
   - `SettingsLogIngestionPage.js`
2. Advanced event detection rule engine

## Key API Endpoints

### AI Endpoints
- `POST /api/ai/extract` - Photo data extraction with GPT-4o Vision
- `POST /api/ai/extract/corrections` - Store user corrections
- `POST /api/production/ai-insights` - AI-powered insights

### Production Logs
- `POST /api/production-logs/upload` - Upload log files
- `POST /api/production-logs/batch-ingest` - Batch process logs
- `POST /api/production-logs/ai-parse` - AI-assisted parsing

## Environment Variables

### Backend (.env)
- `MONGO_URL` - MongoDB connection string
- `DB_NAME` - Database name (assetiq)
- `OPENAI_API_KEY` - OpenAI API key for chat
- `OPENAI_VISION_KEY` - OpenAI API key for vision
- `R2_ACCESS_KEY` - Cloudflare R2 access key
- `R2_SECRET_KEY` - Cloudflare R2 secret key
- `R2_ENDPOINT` - Cloudflare R2 endpoint

### Frontend (.env)
- `REACT_APP_BACKEND_URL` - Backend API URL

## Test Credentials
- Email: jedijk@gmail.com
- Password: Jaap8019@

---
*Last Updated: April 2026*
