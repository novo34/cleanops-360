# B1: public origin and internal Next transport

Scope: REQ-AUTHZ-006/007, REQ-SEC-020/021, REQ-TEN-001..004 and the existing B1 HTTP/CSRF contract. This correction does not accept B1 or close AUTH-GATE-05.

## Verified cause

Before modifying service validation, the isolated production probe ran with the repository's locked Next.js 16.4.0 and Node 24. With `next start -H 0.0.0.0 -p 3109`:
- Direct HTTP: Request.url = http://0.0.0.0:3109/probe, Host = 127.0.0.1:3109.
- HTTPS proxy headers: Request.url = https://0.0.0.0:3109/probe, Host and X-Forwarded-Host = cleanops.nuvurent.com, X-Forwarded-Proto = https.
- Forged Host/forwarding headers do not make Request.url an authoritative public origin.

Evidence: https://github.com/novo34/cleanops-360/actions/runs/39314537289 (commit 7d36df5a15c6cf1d5d8fca0c092f364a0657e2cd). The probe uses node:http so Host is transmitted exactly, and creates/deletes a separate temporary application; it never installs a diagnostic route in CleanOps. The installed Next request documentation was read in the same job.

The original strict equality between Request.url.origin and CLEANOPS_AUTH_ORIGIN therefore rejects correctly routed requests before input/CSRF/backend validation. Terminal networking in the task environment is unavailable, so full dependency-based checks run in GitHub Actions; native service tests also run locally.

## Trust boundary and configuration

CLEANOPS_AUTH_ORIGIN remains a mandatory exact HTTPS public origin. It is the only authority for browser Origin/Referer checks. Internal transport addresses never become browser origins, redirect destinations, cookie domains, identity, tenant or permission inputs.

CLEANOPS_AUTH_INTERNAL_ORIGINS is an optional JSON array (maximum eight) of exact http/https origins, with no path, credentials, wildcard or trailing slash. Missing means no internal origins are allowed; malformed configuration fails closed. The service copies the configured values into private sets. Host and X-Forwarded-Host, when present, must match a configured public/internal authority exactly (DNS case insensitive); internal transport requires Host. Multi-valued/unknown forwarding authorities and unsupported proto values are rejected. X-Forwarded-Proto accepts only the single tokens http or https but never selects a trusted public origin. RFC 7239 Forwarded is ignored; even a forged value cannot replace configuration or satisfy CSRF.

The staging compose service explicitly configures:
```text
CLEANOPS_AUTH_ORIGIN=https://cleanops.nuvurent.com
CLEANOPS_AUTH_INTERNAL_ORIGINS=["http://0.0.0.0:3000","https://0.0.0.0:3000","http://127.0.0.1:3000"]
```
The two listen-address schemes reflect observed Next URL construction; the loopback authority permits container-local HTTP diagnostics. Other hosts/ports require an explicit deployment configuration update, not discovery from a request. For Dockerfile-only Dokploy deployments, add the same variable to this application's environment manually before rebuilding.

The application-scoped boundary is Traefik HTTPS termination -> private container HTTP:3000, with a domain-specific router. `deploy/staging/compose.yaml` uses expose:3000 and no host-published port; `compose.ingress.yaml` attaches the web service to Dokploy ingress. Verify the rendered application compose has no web ports publication and the router targets cleanops.nuvurent.com. No global Traefik trustForwardHeader/insecure setting is needed or authorized. Header allowlists are defense in depth, not proof that a request came from Traefik; trust comes from explicit deployment configuration and the network boundary. Arbitrary forwarding headers are never used to infer external HTTPS or authorize anything.

Method, pathname (including dynamic session IDs), parameters, query uniqueness, body/schema and size limits remain checked. Cookies remain __Host-/Secure/SameSite=Lax, CSRF remains digest-bound, and authorization/MFA/audit/tenant transaction logic is unchanged. GET also rejects an explicitly foreign Origin. No backend enable switch is introduced.

## Verification and manual staging check

Local: 22 native tests PASS, including all effective operations over public HTTPS and each configured transport, successful synthetic transaction dispatch, closed-backend 503, input errors, Host/X-Forwarded attacks, inert Forwarded, foreign Origin/Referer, method/static/dynamic path/query/selector rejection, digest-bound CSRF denial, cookies and fail-closed configuration. Synthetic successful adapters are tests only.

CI: the scoped proxy workflow repeats the production probe, lint, typecheck, full B1/Vitest suites, build and a real production Next server smoke against every effective B1 route over proxy HTTPS metadata and direct internal HTTP. Existing B1 no-database/browser/static checks remain in place. No SQL, database server, migrations, grants, seeds or OpenBao are run by the added workflow. Final run results are recorded in the PR.

After the reviewed commit is on staging, manually rebuild/redeploy this application's existing staging service in Dokploy, preserving its branch, public origin and closed backend. Do not deploy other applications or enable OpenBao. With the internal-origins variable visible inside the web service:
```bash
curl -i https://cleanops.nuvurent.com/auth/login \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://cleanops.nuvurent.com' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'X-CSRF-Token: CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' \
  --data '{}'
```
Expected: HTTP 422 / INVALID_INPUT (no INVALID_ROUTE). Without the required X-CSRF-Token header the contract permits HTTP 400 / MISSING_PARAMETER before body validation. A valid synthetic login payload plus a 43-character synthetic CSRF cookie/header and same-origin metadata reaches closedBackend and returns HTTP 503 / AUTH_DEPENDENCY_UNAVAILABLE, never a session cookie. These tokens are synthetic and do not establish a real binding.

Repeat inside the web container against http://127.0.0.1:3000/auth/login with the same headers. Do not install data to obtain a different response. Missing/foreign Origin on a schema-valid mutation must fail CSRF before closedBackend. TLS, HTTP->HTTPS and the absence of host port 3000 publication should also be checked manually. No Dokploy deployment has been executed by this change.
