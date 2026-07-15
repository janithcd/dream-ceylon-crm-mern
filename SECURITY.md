# Security Policy

## Never Commit

- `.env`
- MongoDB credentials
- JWT secrets
- OpenAI API keys
- Real administrator passwords
- Service-role keys
- Customer exports
- Database backups

## Authentication

- Passwords are hashed with bcrypt.
- JWT tokens protect private routes.
- Inactive administrators are blocked.
- Public administrator registration is disabled.
- Login attempts are rate limited.

## Authorization

Backend permission middleware is the real security boundary.

Frontend guards improve user experience but do not replace backend authorization.

## Public Endpoints

Public inquiry submission is rate limited. Add CAPTCHA verification before connecting the production website.

## Production Requirements

- Use HTTPS
- Use a strong JWT secret
- Restrict CORS
- Restrict MongoDB Atlas network access
- Rotate exposed credentials
- Use separate test and production databases
- Back up MongoDB
- Review activity logs
- Keep packages updated
