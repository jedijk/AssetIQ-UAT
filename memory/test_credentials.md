# ThreatBase (AssetIQ) Test Credentials

## User Accounts

### Owner Account (Full Access)
- **Email:** jedijk@gmail.com
- **Password:** admin123
- **Role:** owner
- **Installations:** Tyromer

### Admin Account
- **Email:** test@test.com
- **Password:** test
- **Role:** admin
- **Installations:** Tyromer

### Viewer Account (Restricted Access)
- **Email:** viewer@test.com
- **Password:** test
- **Role:** viewer
- **Installations:** Tyromer
- **Restricted Features:** No access to Causal Engine, Forms, Equipment, Users, Settings

### Test User (Created via Admin - Password Changed)
- **Email:** emailtest@example.com
- **Password:** NewPassword123!
- **Role:** viewer
- **Created By:** Admin user creation feature

### Test User (Must Change Password)
- **Email:** changepwd@test.com
- **Password:** Welcome123! (temporary)
- **Role:** viewer
- **Note:** Will be prompted to change password on first login

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
