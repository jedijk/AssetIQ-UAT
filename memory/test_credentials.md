# Test Credentials

## User Accounts

### Owner Account (Full Access - All Installations)
- **Email:** test@test.com
- **Password:** test
- **Role:** Owner
- **Access:** All installations automatically

### Admin Account
- **Email:** jedijk@gmail.com
- **Password:** (user-created)
- **Role:** Admin
- **Installations:** Tyromer

---

## Admin Endpoints

### Database Seed (after deployment)
```
GET/POST https://your-domain/api/admin/seed-database?secret_key=emergent-seed-2024
```

---

## Roles Hierarchy
1. **Owner** - Super admin, sees all installations, full control
2. **Admin** - Full access, manages users, sees assigned installations
3. **Reliability Engineer** - Analysis focus, limited settings
4. **Maintenance** - Task management, observations
5. **Operations** - Report threats, create observations
6. **Viewer** - Read-only access
