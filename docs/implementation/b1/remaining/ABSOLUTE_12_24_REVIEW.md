> Current execution update (2026-10-18): owner authorization is recorded in ../consolidated-test-13/AUTHORIZATION.json and the append-only canonical SESSION-OWNER-RESOLUTION-2026-10-18.md. SQL13 exact bytes are installed/tested,24 directed cases PASS. Numeric12h/24h, expiry and no-extension tests PASS. Most-restrictive multi-role integration remains OPEN pending the separate uninstalled SQL14 candidate. The original review below is historical, not a renewed approval request.

# Owner proposal: 12h / 24h absolute session limit — REVIEW ONLY

No active/canonical value changed. Owner requested evaluation, not installation/activation. Existing verified trial profile remains SENSITIVE28800s (8h), OPERATIONAL86400s (24h); idle1800/28800s unchanged. Existing 8h tests are not evidence that a 12h profile has executed.

|Proposed parameter|SRS / canonical contract|Assessment|
|---|---|---|
|Sensitive idle1800s (30min)|REQ-AUTH-044; V4 SECURITY_VALUES idle_sensitive APPROVED|Exact match.|
|Operational idle28800s (8h)|REQ-AUTH-044; V4 idle_operational APPROVED|Exact match.|
|Sensitive absolute maximum43200s (12h)|REQ-AUTH-045/SEC-021; AUTHENTICATION_SPEC duration subject to explicit validation; V4 28800s only PROPOSED_BENCHMARK_REQUIRED|Compatible design choice, not an already approved active value. Raises the tested sensitive cap by4h/50%; stolen-session exposure increases until absolute expiry unless a prior idle timeout/revocation intervenes.|
|Operational absolute maximum86400s (24h)|Same requirements; V4 86400s only trial proposal|Matches the tested trial; still needs explicit operating-policy approval.|
|Independent expiry, MFA, step-up, revocation|REQ-AUTH-002/045/046/047; approved C-LOGIN; V4 HTTP/session contracts|Preserve mandatory MFA for both risks, fresh action/resource-bound step-up, and server revalidation. Trusted Device never extends session or bypasses MFA. Revocation is effective from COMMIT; already committed effects are not retroactively undone.|

## Coverage discrepancy to resolve, not a new requirement

The owner's list names admin/commercial/finance. SRS AUTH002/044 also covers planning, responsables and equivalent sensitive roles. They must not fall back to OPERATIONAL because omitted from that list. The existing server API consumes a trusted SENSITIVE/OPERATIONAL risk classification; client role names, tenantId or riskClass are never authority and unknown risk fails closed. RBAC permissions remain separate from session risk.

Recommendation: approve explicit effective values43200/86400s for the two trusted risk classes if the12h working-day requirement is intended, covering ALL sensitive roles above. Preserve idle1800/28800s and every other control. If12h is only a ceiling and8h should remain effective, explicitly approve the8h value instead; an upper bound alone does not settle which number is configured under SEC021. No role/risk assignment is invented here.

## Directed validation after policy approval

Update only the explicitly approved configuration/profile through the authorized mechanism; do not edit the approved SQL blob or trial values silently. Existing backend requires exact policy/profile agreement, so a unilateral SQL configuration edit must remain rejected. Test real UI/API/PG session creation with the approved absolute duration, idle duration and trusted role/risk mapping; exact boundary before/at/after absolute expiry with continuing activity; idle expiry independently; Trusted Device cannot extend either; fresh step-up cannot reset absolute created-at; role/risk change, revocation, rollback and failed COMMIT. Reuse unaffected isolation/RBAC evidence.

Decision required: Product Owner approves effective values and role/risk coverage; Security validates measured boundary tests and residual exposure. No production/staging/SMTP authorization is included. REQ-SEC-021 and AUTH-GATE-01 remain OPEN until that decision and corresponding evidence.
