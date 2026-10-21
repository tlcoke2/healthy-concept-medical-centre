# Healthy Concept Medical Centre

Patient-facing website for 58 Barnett Street, Montego Bay, St. James, Jamaica.

## Delivery state

- `dist/`: complete, responsive static frontend, compatible with GitHub Pages project paths.
- `backend/`: Node 24 API, Dockerfile, Railway configuration, tests and environment example.
- `.github/workflows/pages.yml`: GitHub Pages deployment workflow.
- A private Sites review deployment is separate from the requested production hosting.
- The source is uploaded to `tlcoke2/healthy-concept-medical-centre`. GitHub Pages is live at https://tlcoke2.github.io/healthy-concept-medical-centre/ and the Railway API health check succeeds at https://healthy-concept-medical-centre-production.up.railway.app/health. Frontend API wiring is configured. At the last check, booking was disabled and the GitHub Pages origin was rejected; Railway environment configuration and notification verification remain outstanding. The user supplied TEC login URL is `https://portal.thuemancokelimited.com/login`, and the staff entrance is connected to it. No booking is claimed when the API is unavailable.
- No patient records are stored on GitHub Pages. This is appointment intake, not an EPR replacement or a patient records portal. Clinical workflows remain in the existing TEC application.

## Publish the frontend without buying a domain

1. The repository `tlcoke2/healthy-concept-medical-centre` has been created and populated. The existing TEC EPR repositories and TCL website are unchanged.
2. The website source, backend and publishing workflow are on `main`. No local transfer or ZIP extraction is required.
3. Open repository Settings → Pages. Choose GitHub Actions as the source.
4. Run the included **Publish clinic website** workflow. After success, use the URL returned by GitHub Pages Settings. The usual project address is `https://tlcoke2.github.io/healthy-concept-medical-centre/`; this is a planned address, not a verified live URL. An account-level custom domain may affect the resulting URL.
5. Add a custom domain later if desired. All assets use relative paths for project hosting.

## Deploy the API to Railway

1. In your Railway workspace, add a new service from this repository. Set its root directory to `/backend`. Keep the existing TEC EPR service unchanged.
2. Add a persistent volume mounted at `/data`. Use one replica. The SQLite database lives on this volume; do not use ephemeral storage. Enable volume backups and test restoration before intake goes live.
3. Set variables from `backend/.env.example`: `DATABASE_PATH`, `ALLOWED_ORIGINS`, `ADMIN_API_TOKEN`, `RESEND_API_KEY`, `MAIL_FROM`, `CLINIC_EMAIL`.
4. Generate `ADMIN_API_TOKEN` as instructed in the example. Store it in Railway and a password manager only. It is for server-to-server administration, not a patient or staff password, and must never be put in frontend code.
5. `ALLOWED_ORIGINS` must contain the exact frontend origin, e.g. `https://tlcoke2.github.io`, with no trailing slash or repository path. If the actual Pages URL uses a custom domain, use that origin. Add the private review origin only if intentionally testing it against the API.
6. Configure a Resend API key and a verified sender address, preferably on an existing domain you control (for example your business domain). You do not need a new clinic domain for the website, but the notification sender must be authorised. The clinic recipient defaults to `hcmcstjames@gmail.com`. The API is deliberately unavailable for intake until the required notification/admin settings exist. Use the provider's actual key and verified sender; placeholder values are not sufficient.
7. Generate a Railway HTTPS domain and check `/health` returns `{"status":"ok"}`. Confirm `/api/public/config` reports `bookingEnabled: true` only after configuration.
8. Set `apiBase` in `dist/config.js` to the API's actual HTTPS origin. Commit to republish Pages.
9. Submit one controlled test request, confirm the email arrives, verify it in the admin API, then delete the test request. Verify access from an unapproved origin fails. Check the Railway volume persists after redeployment.

## Connect the TEC staff portal

`tecLoginUrl` in `dist/config.js` is now set to `https://portal.thuemancokelimited.com/login`, as supplied by the owner. The staff entrance opens that application in a new tab. Existing TEC authentication and permissions apply there. No iframe, password forwarding, new EPR account or single sign-on is assumed. Deeper appointments/EPR integration requires the TEC API contract and credentials and has not been implemented.

## API and operations

- `GET /health`: health check.
- `GET /api/public/config`: whether online intake is configured.
- `POST /api/appointments`: validated appointment request, with UUID `Idempotency-Key`. Success means stored intake, not a confirmed appointment.
- `GET /api/admin/appointments`: most recent 500 requests, requires `Authorization: Bearer <ADMIN_API_TOKEN>`.
- `PATCH /api/admin/appointments/<reference>`: authenticated JSON `{ "status": "contacted" }`; supported values: requested, contacted, confirmed, cancelled, completed.
- `DELETE /api/admin/appointments/<reference>`: authenticated permanent removal of a request.

Request details are never written to application logs. No unauthenticated patient lookup is exposed. The API has a 4 KB request limit, field validation, exact origin allowlisting, a honeypot, idempotent submission, hashed-phone rate limits and a global submission ceiling. Cross-origin restrictions are not a substitute for bot protection: add infrastructure rate limits/challenge verification if abuse warrants it. Admin API tokens are shared service credentials, not individual staff authentication. Do not expose them in a browser dashboard. The secure TEC login remains the designated staff portal.

Notifications use a persisted outbox retried every minute; pending notifications remain visible through the admin API. Monitor pending notifications and provider errors operationally; a configured provider can still fail. Configure monitoring for `/health` and check notification delivery before launch. Provider idempotency windows may expire during prolonged outages, so delayed notifications can repeat with the same reference. Staff should reconcile by reference.

All booking requests expire after 30 days, including completed/cancelled requests. This is not a clinical retention policy. Arrange any necessary transfer into the clinical system before expiry. Email notifications and backups require their own retention controls. Clinical documents, diagnoses, payment details and files are not accepted. This release does not implement patient accounts, clinical records, payments, automated prescriptions, test result delivery or teleconsultations.

## Content requiring owner confirmation before public launch

- Opening hours, fees, insurance/payment arrangements and accessibility/entrance instructions.
- Current service and specialist availability. No unverified doctor profiles or testimonials are included.
- Exact map pin/entrance: the map searches the supplied street address rather than asserting verified coordinates.
- Scope of any further EPR integration. The existing login URL has been supplied and linked.
- Privacy notice, booking retention and notification recipient/sender arrangements.

## Verification

Run `node --test backend/server.test.mjs` with Node 24. Tests cover validation, consent, invalid dates, honeypot rejection, disallowed origins, idempotency, authenticated administration, rate limiting, persistence, deletion, retention and disabled intake without configuration. Run `node --check dist/app.js` for frontend syntax. Browser visual and interaction testing was unavailable in the build environment; test desktop and mobile and keyboard navigation before public launch. No claim of regulatory certification or comprehensive security audit is made.

## Existing project findings (20 October 2026)

Connected GitHub repositories include `tlcoke2/tec_epr_frontend` and `tlcoke2/tec_epr_backend`. The `TLC-Associated-Healthcare` main tree contained only `.gitattributes` when inspected. The connected Sites list contained the Centry project but no Healthy Concept site before this build. Web and file searches did not identify an existing live Healthy Concept website. This does not prove one has never existed in another account or environment.
