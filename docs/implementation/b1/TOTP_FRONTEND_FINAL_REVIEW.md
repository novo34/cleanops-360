# TOTP frontend final review — code and no-database fixtures only

Review source: 53fce533aa8354cde4668eb42585092b3e9f42fb, PR #7.
Authority: original V4 HTTP_CONTRACT, effective OpenAPI plus approved H1-H3 addendum,
and service.ts transition checks. No canonical contract was changed.

## Findings and corrections

1. ACTIVE context was discarded on 403/409/410, cancellation and ceremony expiry.
   Ending a ceremony now removes its grant/resource/action, method UUIDs, challenges
   and cached records but retains only an unexpired source ACTIVE summary.
   It neither grants step-up nor resumes an action. PREAUTH returns to the login gate.
   Absolute session expiry or 401 invalidates the local ACTIVE summary.

2. The UI and ACTIVE fixtures accepted ACTIVE directly from password login although
   service.ts explicitly forbids it. Login now rejects that transition; positive
   fixtures establish PREAUTH/PENDING_MFA then verify MFA before issuing ACTIVE.
   STEP_UP verification must return the same session/tenant without extending absolute
   expiry. A pending state, different identity context or extended expiry is rejected
   without executing the action or replacing the source ACTIVE context.
   Successful protected actions still require an ACTIVE verification response.

3. A late JSON parse error could overwrite a cancellation/expiry notice, and the
   disabled cancel button prevented stopping a hung selection. Generation checks
   now guard both parsed responses and failures; cancellation/expiry abort and detach
   the old request. Only the owning AbortController can release busy state. Cancel
   remains usable during a ceremony request. An obsolete completion cannot change
   a newer request's state. Expired factors are not submitted.

4. Any HTTP success status previously used the 200 schema, Content-Type was ignored,
   redirects followed, and catch erased the rate-limit message. Only contractual
   200 application/json responses can advance state; redirects, malformed JSON,
   wrong schemas/mode/factor and other 2xx remain closed. 429 keeps the ceremony and
   a safe wait message; no server error details or arbitrary Retry-After text render.
   403/409 and defensive 410 end the ceremony without assuming ACTIVE revocation.
   401 invalidates authentication even with malformed JSON. V4 deliberately groups
   invalid session/ceremony/factor under 401; the UI cannot infer continued authority
   from that error. This review adds no speculative session-recovery flow.

5. Selection retries already reused their own key. Ambiguous startStepUp retries
   now reuse a separate in-memory key for the same grant/resource, cleared after a
   confirmed preparation or end of ceremony. No credentials are retained in that map.
   No Idempotency-Key is invented for verifyMfa, which V4 excludes from public replay.

6. Positive fixtures now validate request methods/paths, schemas, required headers,
   origin, cookie/CSRF correspondence and published response schemas. HttpOnly binding
   cookies and readable CSRF use Secure/Path=/ and canonical SameSite=Lax. PREAUTH and
   CSRF rotate for login; MFA establishes SESSION and clears PREAUTH before ACTIVE.
   Negative fixtures explicitly bypass the success helper. Browser Fetch Metadata is
   checked via a real, non-intercepted HTTPS request to a CI-only loopback probe because
   Playwright interception does not expose that header. The probe returns booleans,
   never tokens; it is not an application/authentication endpoint.

## Regression evidence and limits

The 44-case Chromium suite at 2a19da96d213b3a113bb22c63fcd5cd87b2d2679 passed in
GitHub Actions run 38941945535, with lint/typecheck, 148 B1 tests, Vitest and build.
This revision additionally pins ACTIVE selection/challenge expiry using browser clock.
The final PR CI must validate those added cases at its exact HEAD.

Coverage includes login/PREAUTH, multi/single method, selection and ACTIVE step-up;
cancel/expiry/late JSON, network/idempotent retries, duplicate submits/methods,
401/403/409/410/429 at three stages, unexpected statuses/redirect/content type/JSON,
context/factor mismatches, and a successful single protected action. Fixtures remain
simulated authority; they do not certify live identity services or database behavior.

Cancellation is local and aborts observation, not a server rollback or session revocation.
UUIDs/context exist only in component memory and contractual request bodies; no browser
storage, URLs, console logging or telemetry was introduced. Fixture traces/video are off.
No TOTP secret, URI, ciphertext or recipient is used by selection or projected to it.
Existing enrollment UI was not enabled or altered by this review.

closedBackend remains wired to runtime; EMAIL and real D2/D3 enrollment stay closed.
AUTH-GATE-05 OPEN. No PostgreSQL, SQL, migration, grant, deployment or merge performed.
Next action after green final CI: owner review of this frontend increment, without
runtime activation or moving to another security gate.
