# ReliabilityOS Backend Refactoring Guide

## Current State
- `server.py`: 4,365 lines - Monolithic API file
- All endpoints, models, and helpers in one file

## Modular Structure (Partially Implemented)

### Created Files
```
/app/backend/
├── routes/
│   ├── __init__.py       # Package init
│   ├── deps.py           # Shared dependencies (db, auth, utils)
│   ├── auth.py           # Authentication endpoints
│   ├── threats.py        # Threat management endpoints
│   └── stats.py          # Statistics & reliability scores
├── ai_helpers.py         # AI-related functions and prompts
```

### Planned Route Files (To Be Created)
```
├── routes/
│   ├── chat.py           # Chat & voice endpoints
│   ├── equipment.py      # Equipment hierarchy endpoints
│   ├── investigations.py # Causal engine endpoints
│   ├── actions.py        # Actions management
│   ├── maintenance.py    # Maintenance strategies
│   ├── failure_modes.py  # FMEA library endpoints
│   └── ai_engine.py      # AI risk engine endpoints
```

## Server.py Section Map

| Line Range | Section | Target Route File |
|------------|---------|-------------------|
| 72-142 | Models | Keep in server.py or create models.py |
| 143-170 | Auth Helpers | routes/auth.py |
| 171-584 | AI Helpers | ai_helpers.py (CREATED) |
| 585-640 | Auth Endpoints | routes/auth.py (CREATED) |
| 641-902 | Chat Endpoints | routes/chat.py |
| 903-912 | Voice Endpoint | routes/chat.py |
| 913-1028 | Threat Endpoints | routes/threats.py (CREATED) |
| 1029-1046 | Stats Endpoint | routes/stats.py (CREATED) |
| 1047-1311 | Reliability Scores | routes/stats.py (CREATED) |
| 1312-1317 | Root Endpoint | Keep in server.py |
| 1318-1561 | Failure Modes | routes/failure_modes.py |
| 1562-2355 | Equipment Hierarchy | routes/equipment.py |
| 2356-2644 | Unstructured Items | routes/equipment.py |
| 2645-3151 | Investigations | routes/investigations.py |
| 3152-3346 | Actions Management | routes/actions.py |
| 3347-3612 | Investigation Create | routes/investigations.py |
| 3613-4054 | AI Risk Engine | routes/ai_engine.py |
| 4055-4365 | Maintenance Strategies | routes/maintenance.py |

## Migration Strategy

### Phase 1 (DONE)
- Created route structure
- Created reusable components
- Created ai_helpers.py

### Phase 2 (In Progress)
- Test route files independently
- Gradually migrate endpoints
- Keep server.py as fallback

### Phase 3 (Future)
- Update server.py to use routers
- Remove migrated code from server.py
- Full testing

## How to Use New Routes

To use the new modular routes, update server.py:

```python
from routes.auth import router as auth_router
from routes.threats import router as threats_router
from routes.stats import router as stats_router

# Add routers to app
app.include_router(auth_router, prefix="/api")
app.include_router(threats_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
```

## Testing Commands

```bash
# Test auth routes
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}'

# Test threats routes
curl -X GET http://localhost:8001/api/threats \
  -H "Authorization: Bearer <token>"

# Test stats routes
curl -X GET http://localhost:8001/api/stats \
  -H "Authorization: Bearer <token>"
```

## Notes
- The existing server.py remains fully functional
- New route files are ready for gradual migration
- All changes are backward compatible
