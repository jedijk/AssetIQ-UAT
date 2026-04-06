# ThreatBase (AssetIQ) Test Credentials

## Production Database Connection
- **MongoDB Atlas:** mongodb+srv://assetiq_user:***@cluster0.kdaja2b.mongodb.net/assetiq
- **Database Name:** assetiq

## User Accounts (Production Database)

### Owner Account (Full Access)
- **Email:** jedijk@gmail.com
- **Password:** (User's own password - NOT admin123)
- **Role:** owner
- **Installations:** Tyromer

### Viewer Account
- **Email:** jaap.van-dijk@outlook.com
- **Role:** viewer

## Preview Environment Notes
- Preview now uses the SAME production MongoDB Atlas database
- Test credentials from local seed data no longer apply
- Use your actual production credentials to log in

## Default Password for New Users
When admins create new users via User Management, the default password is: `Welcome123!`
Users are required to change this password on their first login.

## Welcome Email Feature
- When creating users, admins can check "Send welcome email"
- User receives email with login credentials
- Email includes temporary password and login link
- User must change password on first login

## Notes
- All accounts have access to the "Tyromer" installation
- Owner role has full system access including user management
- Admin role has elevated privileges for configuration
- Viewer role has read-only access with restricted features hidden from navigation
- Owners and Admins can create new users via Settings > User Management > Add User
