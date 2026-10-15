# Tabla única de seguridad V4

Generada de security-values.yaml. APPROVED se conserva; PROPOSED_BENCHMARK_REQUIRED no constituye aprobación ni valor de producción.

| Clave | Valor | Unidad | Estado | Fuente / prueba |
|---|---|---|---|---|
| email_otp_ttl | 300 | seconds | APPROVED | REQ-AUTH-011; Security regression; no reapproval |
| idle_sensitive | 1800 | seconds | APPROVED | REQ-AUTH-044; Security regression; no reapproval |
| idle_operational | 28800 | seconds | APPROVED | REQ-AUTH-044; Security regression; no reapproval |
| trusted_device_max | 2592000 | seconds (DEFERRED B1) | APPROVED | REQ-AUTH-046; Security regression; no reapproval |
| password_hash | Argon2id | algorithm | APPROVED | OWNER 6195913199; Library maturity/security tests |
| absolute_sensitive | 28800 | seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Clock/role policy/load |
| absolute_operational | 86400 | seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Clock/role policy/load |
| step_up_ttl | 300 | seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Replay/resource binding |
| preauth_ttl | 600 | seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Expiry/enumeration |
| enrollment_ttl | 600 | seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Single-use enrollment |
| argon_memory | 65536 | KiB | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Concurrent memory/DoS benchmark |
| argon_iterations | 3 | passes | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Latency/load |
| argon_parallelism | 1 | lane | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; CPU/load |
| argon_salt | 16 | bytes | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Library CSPRNG |
| otp_digits | 6 | decimal digits | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Entropy/abuse |
| otp_attempts | 5 | per challenge | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Parallel exhaustion |
| otp_resend_cooldown | 60 | seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Concurrent resend |
| login_user_limit | 5 | failures per 900 seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Distributed spraying/false lockout |
| login_ip_limit | 30 | failures per 900 seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; NAT false positives |
| login_device_limit | 10 | failures per 900 seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Device reset attacks |
| progressive_backoff | [1, 2, 4, 8, 16, 32, 60] | seconds, cap60, reset after 900s | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; No permanent lockout/DoS |
| otp_issue_user_limit | 5 | issues per 900 seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Mail abuse |
| otp_issue_ip_limit | 30 | issues per 900 seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Mail abuse |
| otp_issue_device_limit | 10 | issues per 900 seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Mail abuse |
| totp_period | 30 | seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; RFC-compatible library drift |
| totp_digits | 6 | digits | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Library compatibility |
| totp_window | 1 | counter each side | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Replay/drift/concurrency |
| session_token_entropy | 32 | random bytes, base64url43 | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; CSPRNG/no tokens in logs |
| csrf_entropy | 32 | random bytes, base64url43 | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Login CSRF/cookie binding |
| preauth_entropy | 32 | random bytes, base64url43 | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Binding/replay |
| recovery_count | 10 | codes per batch | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; One-time display/parallel consume |
| recovery_entropy | 16 | random bytes per code, base32 length26 | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Atomic consume/no plaintext |
| json_body_max | 16384 | bytes | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Request boundary/413 |
| password_min | 12 | Unicode code points | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; UX/compromised corpus |
| password_max | 128 | Unicode code points | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Hash DoS/Unicode |
| email_max | 254 | characters | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Normalization/index consistency |
| display_name_max | 120 | characters | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; UX/schema |
| reason_max | 500 | characters | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Audit minimization |
| page_default | 50 | rows | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Pagination performance |
| page_max | 100 | rows | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Query load |
| cursor_max | 512 | characters | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Tamper/tenant binding |
| idempotency_ttl | 86400 | seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Concurrent replay/isolation |
| outbox_max_attempts | 5 | attempts | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; SMTP outage |
| outbox_claim_lease | 60 | seconds | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Worker crash/redelivery |
| context_gc_age | 3600 | seconds (only finished xids) | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Pool/GC locks |
| preauth_security_log_retention | 604800 | seconds synthetic staging proposal | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal, NOT OWNER approval; Privacy/abuse analysis |
| membership_max | 100 | memberships per principal B1 | PROPOSED_BENCHMARK_REQUIRED | V4 engineering proposal; Bounded broker lookup/pagination |
| rate_window | 900 | seconds | PROPOSED_BENCHMARK_REQUIRED | V4 technical contract proposal; Boundary/abuse/privacy tests |
| rate_bucket_retention | 86400 | seconds synthetic staging | PROPOSED_BENCHMARK_REQUIRED | V4 technical contract proposal; Boundary/abuse/privacy tests |
| outbox_retry_delay | 60 | seconds | PROPOSED_BENCHMARK_REQUIRED | V4 technical contract proposal; Boundary/abuse/privacy tests |
| idempotency_key_min | 16 | ASCII characters | PROPOSED_BENCHMARK_REQUIRED | V4 technical contract proposal; Boundary/abuse/privacy tests |
| idempotency_key_max | 128 | ASCII characters | PROPOSED_BENCHMARK_REQUIRED | V4 technical contract proposal; Boundary/abuse/privacy tests |
| organization_hint_max | 128 | characters | PROPOSED_BENCHMARK_REQUIRED | V4 technical contract proposal; Boundary/abuse/privacy tests |
| provisioning_uri_max | 2048 | characters | PROPOSED_BENCHMARK_REQUIRED | V4 technical contract proposal; Boundary/abuse/privacy tests |
| set_cookie_header_max | 2048 | characters | PROPOSED_BENCHMARK_REQUIRED | V4 technical contract proposal; Boundary/abuse/privacy tests |
| error_code_max | 64 | characters | PROPOSED_BENCHMARK_REQUIRED | V4 technical contract proposal; Boundary/abuse/privacy tests |
| error_field_max | 80 | characters | PROPOSED_BENCHMARK_REQUIRED | V4 technical contract proposal; Boundary/abuse/privacy tests |
| error_message_max | 300 | characters | PROPOSED_BENCHMARK_REQUIRED | V4 technical contract proposal; Boundary/abuse/privacy tests |
| error_details_max | 16 | items | PROPOSED_BENCHMARK_REQUIRED | V4 technical contract proposal; Boundary/abuse/privacy tests |
| compromised_password_check | local versioned corpus; fail safely on unavailable checker | deployment proposal | PROPOSED_BENCHMARK_REQUIRED | OWNER approves detection, implementation proposed; No external password disclosure; corpus update/correctness |
