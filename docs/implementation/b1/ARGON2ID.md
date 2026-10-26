# B1 Argon2id verifier increment

Base: 2333c3a28b6d77a0a9b093fac029340d2077ee9b, PR #7.
AUTH-GATE-05 remains OPEN. This is a trial verifier, not production authentication.

- Mature library: node-argon2 0.44.0, Argon2id v19. Existing B1 configuration supplies 65536 KiB (64 MiB), three passes, one lane and a fresh cryptographic 16-byte salt for every progressive replacement; output is 32 bytes.
- Internal entry point: `verifyPasswordFactor` in `lib/b1/password.ts`. Uses B1 `AuthError` outcomes: invalid proof/record returns 401 so the transaction can commit failure counters; dependency, hash-generation, persistence or credential-race failures throw generic 503 for rollback.
- The private `Transaction.execute` adapter must supply its trusted stored hash after rate/account checks, lock and revalidate the credential, then compare-and-swap the replacement in the same transaction as attempts and audit. A verified factor is not a session or permission. Runtime remains wired to `closedBackend`; no adapter, identity, environment flag or production activation is added.
- Bounded PHC admission precedes native work. Only Argon2id v16/v19 with costs at or below the trial envelope is accepted; lower cost/version/short salt or digest upgrades only after a valid proof and successful replacement. Above-envelope costs fail closed rather than downgrade. No normalization or truncation of passwords; malformed Unicode and passwords above the existing B1 maximum fail closed.
- Unit tests use real native hashing/verification for correct/incorrect passwords, corrupt PHC, foreign algorithm, excessive costs, progressive updates, salt uniqueness, persistence failure and credential races. No database tests or commands are introduced.
- Dependencies are pinned in package.json/package-lock.json. Transitive package metadata/integrities are copied from the library's v0.44.0 upstream lockfile; the argon2 registry archive is version-pinned without inventing an integrity value.
- Validation is delegated to the existing B1 no-database GitHub Actions workflow (install with scripts disabled, lint, typecheck, Node B1 tests, Vitest and build). No local checks are claimed. The inherited PostgreSQL job remains skipped on feat/b1-* branches. Actual run status must be checked on the published commit.

No TOTP, corpus/enrollment, PostgreSQL, migrations, grants, merge or deployment. Concurrency/admission controls and transactional integration in a real private identity adapter remain pending; this increment does not close the authentication gate.
