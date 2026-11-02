# Production release checklist

This checklist is a gate for each release. A checked box must refer to evidence from that release; a passing CI run does not establish the state of a live Zoho account or production database.

## Candidate and automated checks

- [ ] Record the candidate commit and confirm its GitHub Actions run is green for both Node versions, the frontend and Docker/MongoDB smoke tests.
- [ ] Review the [release audit](docs/RELEASE_AUDIT_2026-11-02.md) and resolve or accept its open risks.
- [ ] Recheck `npm audit` for the backend and `npm audit --omit=dev` for the frontend; evaluate any new advisory before release.
- [ ] Review a normal and a multi-page PDF from the deployed build: quotation, invoice, guest itinerary, hotel voucher, supplier remittance and payment receipt/statement. Confirm the recipient, prices, dates and draft/validity labels.

## Live environment and data

- [ ] Verify the production `MONGO_URI`, `JWT_SECRET`, allowed frontend origins and API base URL in the deployment environment. Keep secrets out of Git and build artifacts.
- [ ] Make and restore-test a production database backup. Record its timestamp, retention and restore owner.
- [ ] Confirm HTTPS, login/logout, inactive-user rejection and role restrictions with non-admin test accounts.
- [ ] Confirm the sender domain and API key in Zoho CPaaS; send a test email to an owned mailbox and verify delivery, attachments and duplicate-send handling. A Zoho Mail mailbox alone does not configure CPaaS.
- [ ] Exercise a complete test booking from quotation through supplier confirmation and guest payment using synthetic data. Verify no test data or messages go to real guests.
- [ ] Check the deployed health endpoint, application logs and PDF generation after deployment.

## Release and rollback

- [ ] Record the previous working commit/build and the database backup before deployment.
- [ ] Deploy the candidate, verify the checks above, then create a version tag and release notes.
- [ ] Keep the previous frontend build and backend image available for rollback; if a migration changes data, document its reverse procedure separately.
