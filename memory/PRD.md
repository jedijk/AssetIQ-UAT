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
- **AI**: OpenAI GPT-4o (direct SDK - user's API keys)

## Completed Features

### Core Platform
- [x] User authentication with JWT
- [x] Role-based access control (owner, admin, user)
- [x] Equipment hierarchy management
- [x] Form builder with custom fields
- [x] Task scheduler
- [x] Mobile-friendly "Simple Mode"

### AI Integration
- [x] AI Chat Assistant
- [x] Universal Photo Data Capture with GPT-4o Vision
- [x] AI-assisted log parsing
- [x] Learning from user corrections

### File Storage
- [x] Cloudflare R2 integration
- [x] Chunked file uploads (5 files per request)
- [x] Folder/directory upload support

### Production Log Ingestion
- [x] CSV/Excel/TXT file support
- [x] Batch folder uploads
- [x] Template-based parsing
- [x] AI-assisted column mapping
- [x] Asset history aggregation
- [x] **Template Training System** (April 2026)
  - Save column mappings as reusable templates
  - Column aliases for fuzzy matching
  - "Train once, apply to many" bulk workflow
  - Match preview before processing
- [x] **Time-only timestamp support** (April 2026)
  - Parses time-only values (HH:MM:SS)
  - Extracts base date from Excel header sections
  - Combines date + time for full timestamps

### Default Templates
- [x] **Production Log - Daily Format**: For files like "Production Log 05-01-2026.xlsx"
  - Skips 18 header rows
  - Maps TIME, RPM, FEED, M%, ENERGY, MT1-3, MP1-4, CO2, IR
  - 15 column aliases for flexibility

### OpenAI Migration (April 2026)
- [x] Migrated from emergentintegrations to official OpenAI SDK
- [x] Configured OPENAI_API_KEY and OPENAI_VISION_KEY
- [x] All AI endpoints verified working

## Pending Tasks

### P1 - High Priority
1. **Report Generation** - PowerPoint/PDF reports for Causal Investigations
2. **Offline Support** - Local storage for My Tasks execution

### P2 - Medium Priority
1. QR scan analytics dashboard

### P3 - Low Priority / Refactoring
1. Break down large components
2. Advanced event detection rule engine

## Key API Endpoints

### Template Management
- `POST /api/production-logs/templates` - Save template
- `GET /api/production-logs/templates` - List templates
- `PUT/DELETE /api/production-logs/templates/{id}` - Update/delete
- `POST /api/production-logs/batch-ingest-with-template` - Bulk ingest with template
- `POST /api/production-logs/preview-template-match` - Preview column matching

## Database Collections

### log_parse_templates
```json
{
  "id": "uuid",
  "name": "Production Log - Daily Format",
  "description": "For daily production log Excel files...",
  "template": {
    "delimiter": ",",
    "has_header": true,
    "skip_rows": 18,
    "timestamp_format": "%H:%M:%S",
    "column_mapping": {
      "timestamp": "TIME",
      "asset_id": null,
      "status": "REMARKS",
      "metric_columns": ["RPM", "FEED", "M%", "ENERGY", "MT1", "MT2", "MT3", "MP1", "MP2", "MP3", "MP4", "CO2 Feed/P", "T Product IR"]
    }
  },
  "column_aliases": {
    "TIME": ["Time", "TIMESTAMP", "DateTime"],
    "RPM": ["rpm", "Speed", "Rotation"],
    ...
  },
  "usage_count": 0,
  "created_at": "ISO datetime"
}
```

---
*Last Updated: April 2026*
