# CRM release audit — 2026-11-02

This is a source and local test audit for a release candidate, not a production certification. No real customer email, live payment or production database operation was performed. The production checklist must be completed before tagging or deploying a version.

## Scope and evidence

| Area | Checked | Result |
| --- | --- | --- |
| Dependencies | `npm audit` in backend and frontend; `npm audit --omit=dev` in frontend | Backend and frontend production dependency trees had no reported advisories. Six moderate advisories remain in frontend development tooling (`minimatch` via ESLint); the available install did not provide a nonbreaking fix. Recheck at release time. |
| Build and syntax | Backend `npm run check`; frontend `npm run build` | Passed locally. Frontend emits a 1.54 MB JavaScript chunk warning (about 382 kB compressed); plan route splitting before network-constrained use. |
| Automated tests | Backend Node tests with coverage; frontend Node tests; runtime lint | 224 backend tests and 38 frontend tests passed locally; backend coverage was 55.19% statements, 80.38% branches and 67.61% functions. Verify the exact candidate again in GitHub Actions, including Docker/MongoDB smoke tests. The container engine was unavailable in this workspace. |
| Full frontend lint | `npm run lint` | 39 errors and 7 warnings remain, mostly existing `react-hooks/set-state-in-effect` reports for request functions called from effects. This step is explicitly nonblocking in CI. It needs a measured refactor with request cancellation, not blanket rule suppression. |
| Auth and permissions | Read route middleware, JWT checks, role gates and public surface; checked source for committed secrets | Routes use explicit permission guards and there are no tracked `.env` secrets. Malformed saved login data now falls back to the login screen. The auth error response no longer reveals database error text. JWTs remain in browser local storage, so XSS hardening and session design warrant a separate security review. |
| PDFs | Generated and inspected normal and stress samples for quotation, invoice, hotel voucher and supplier remittance; reviewed remaining PDF generators and tests | Fixed multi-page field continuation labels, a supplier footer orphan page and long custom footer clipping. Browser-generated quotation previews are marked as drafts. Official quotation PDFs now come from saved server data and reject a mismatched stored grand total. |
| Customer and payment UI | Reviewed quotation and payment actions and customer export paths | Search-results CSV now calls the correct action; profile export appears on the profile. Payment email preview ignores responses after the panel closes. No live provider delivery was attempted. |

## Changes made in this candidate

- Saved quotations have their own permission-guarded PDF endpoint. The browser cannot substitute the official quotation number, client or prices. Draft, rejected, expired and past-validity copies carry visible review labels where applicable.
- Quotation CRUD and PDF use one pricing calculation to prevent drift. Official PDF generation rejects inconsistent stored pricing rather than silently issuing a different total.
- Four PDF layouts continue long labels on the next page; long footer text is fitted to its column. Supplier enquiries appear in the footer instead of forcing an almost blank page.
- Auth initialization tolerates damaged browser storage. The legacy itinerary proposal generator keeps its brand settings per request; a concurrent request can no longer overwrite another PDF's branding. An arbitrary booking/inquiry ID in a proposal payload no longer becomes an activity-log association.
- The customer CSV action and selected frontend effects/ref usage were corrected. The remaining full-lint findings are recorded above.

## Open release decisions and live gates

1. **Legacy AI itinerary proposal PDF:** `backend/controllers/pdfController.js` uses PDF-lib standard Helvetica and its `safeText` removes scripts outside Latin-1, including Sinhala, Tamil and Cyrillic. The newer quotation, guest itinerary and supplier documents have Unicode-aware font handling. Do not send the legacy proposal to a guest with such text until it is migrated to a tested font/layout path; review a representative real-language sample before claiming multilingual support for this PDF.
2. **Provider delivery:** Zoho CPaaS configuration, sender domain, delivery and PDF attachments can only be verified using the actual account and an owned test mailbox. Preview and unit tests do not prove delivery.
3. **Production data and rollback:** Backups, restore drills and deployment secrets are external to this repository and were not verified locally. Complete the [production checklist](../PRODUCTION_CHECKLIST.md).
4. **Quality debt:** Full ESLint and large frontend bundle remain work. Lint findings are not each a confirmed defect; address request lifecycles and data races in focused changes, then make full lint blocking. Browser token storage also deserves an explicit threat-model review.

This audit is intentionally dated. Re-run the gates for the exact commit that will be tagged and update this file if results change.
