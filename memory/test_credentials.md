# Test Credentials

## User Accounts

### Owner Account (Full Access - All Installations)
- **Email:** test@test.com
- **Password:** test
- **Role:** Owner
- **Access:** All installations automatically, can delete installations

### Admin Account
- **Email:** jedijk@gmail.com
- **Password:** admin123
- **Role:** Admin
- **Installations:** Tyromer
- **Restrictions:** Cannot delete installations

---

## Admin Endpoints

### Database Seed (after deployment)
```
GET/POST https://your-domain/api/admin/seed-database?secret_key=emergent-seed-2024
```

---

## Roles Hierarchy
1. **Owner** - Super admin, sees all installations, full control, can delete installations
2. **Admin** - Full access, manages users, sees assigned installations, CANNOT delete installations
3. **Reliability Engineer** - Analysis focus, limited settings
4. **Maintenance** - Task management, observations
5. **Operations** - Report threats, create observations
6. **Viewer** - Read-only access

## Permission Notes
- Only Owner can delete installations (top-level equipment nodes)
- Only Owner and Admin can delete threats and observations
- Equipment nodes (non-installation) can be deleted by Admin and Owner
