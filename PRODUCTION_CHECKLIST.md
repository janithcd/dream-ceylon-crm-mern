# Production Checklist

## Code

- [x] Backend and frontend start without errors
- [x] Frontend build succeeds
- [x] All 39 Postman tests pass
- [x] Debug logs are removed
- [x] Temporary password reset scripts are removed
- [x] Git working tree is clean

## Secrets

- [x] `.env` is ignored
- [x] MongoDB credentials are private
- [x] JWT secret is at least 32 characters
- [x] OpenAI key is private
- [x] Exposed test passwords were changed
- [x] Exposed service-role keys were rotated

## Security

- [x] Helmet enabled
- [x] Rate limiting enabled
- [x] Production CORS configured
- [x] Public registration disabled
- [x] Public inquiry rate limit tested
- [x] Unknown origins blocked
- [x] Inactive admins blocked
- [x] Final Super Admin protection tested

## Data

- [x] Production database created
- [x] Database backup created
- [x] Test records separated
- [x] PDF assets backed up

## Deployment

- [x] Health check returns 200
- [x] Frontend uses production API URL
- [x] HTTPS enabled
- [x] PDFs tested
- [x] AI tested
- [x] Public APIs tested
- [x] Activity logs reviewed
