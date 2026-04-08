# Vercel Deployment Guide for AssetIQ

## Environment Variables Required

When deploying the frontend to Vercel with a separate backend (Railway/Emergent), you **MUST** set the following environment variable in Vercel:

### Required Environment Variables

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `REACT_APP_BACKEND_URL` | Base URL of your backend (without `/api`) | `https://your-backend.railway.app` |

### Optional Environment Variables

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `REACT_APP_API_URL` | Full API URL (with `/api`). If set, takes priority over `REACT_APP_BACKEND_URL` | `https://your-backend.railway.app/api` |
| `REACT_APP_VERSION` | App version | `2.7.0` |

## Setting Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the required variables:
   - Name: `REACT_APP_BACKEND_URL`
   - Value: `https://your-backend-url.railway.app` (your actual Railway/Emergent backend URL)
4. Select environments: **Production**, **Preview**, **Development**
5. Click **Save**
6. **IMPORTANT**: Redeploy your application for changes to take effect

## Backend CORS Configuration

The backend must allow requests from your Vercel domain. The following origins are already configured:

```python
ALLOWED_ORIGINS = [
    "https://assetiq.tech",
    "https://www.assetiq.tech",
    "https://assetiq-rho.vercel.app",
    "https://asset-iq-rho.vercel.app",
    "https://assetiq.vercel.app",
    "http://localhost:3000",
]
```

Additionally, the backend uses a regex to match all Vercel and Emergent preview deployments:
```python
allow_origin_regex=r"https://.*\.(vercel\.app|emergentagent\.com|emergent\.host)"
```

If you have a custom Vercel URL, add it to the `CORS_ORIGINS` environment variable in your backend:
```
CORS_ORIGINS=https://your-app.vercel.app,https://assetiq.tech
```

## Troubleshooting

### Login returns 404

**Cause**: Frontend is calling wrong API URL

**Fix**: 
1. Ensure `REACT_APP_BACKEND_URL` is set in Vercel
2. Redeploy the frontend

**Debug**: Open browser console and check for:
```
[API Config] REACT_APP_BACKEND_URL: https://your-backend.railway.app
[API Config] Using configured backend URL: https://your-backend.railway.app
```

### CORS Error

**Cause**: Backend doesn't allow frontend origin

**Fix**:
1. Add your Vercel domain to `CORS_ORIGINS` in backend `.env`
2. Or add it to `ALLOWED_ORIGINS` in `server.py`
3. Restart backend

### "Backend not configured" Error

**Cause**: `REACT_APP_BACKEND_URL` is not set

**Fix**: 
1. Set the environment variable in Vercel
2. Rebuild/redeploy the frontend

## API Routes Reference

All API routes are prefixed with `/api`. Examples:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | User login |
| `/api/auth/me` | GET | Get current user |
| `/api/auth/register` | POST | User registration |
| `/api/health` | GET | Health check |

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Vercel         │      │  Railway/       │      │  MongoDB        │
│  (Frontend)     │ ──── │  Emergent       │ ──── │  Atlas          │
│  React App      │ HTTPS│  (Backend)      │      │                 │
│                 │      │  FastAPI        │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘

Frontend calls: REACT_APP_BACKEND_URL/api/*
```

## Local Development

For local development, the frontend defaults to same-origin requests:
- Frontend: http://localhost:3000
- Backend: http://localhost:8001

The API proxy is configured in the development environment to route `/api/*` to the backend.
