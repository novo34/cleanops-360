# Custody alternatives — owner decision still OPEN

Synthetic software unseal tests can prove threshold enforcement; both trial shares
are controlled by the harness, NOT separate human custodians. No tested threshold
constitutes approval, designation or proof of human/physical custody.

|Scheme|Availability / key-loss tolerance|Compromise risk|Recommendation|
|---|---|---|---|
|2-of-2, two actual independent custodians|Both needed; one unavailable/lost share blocks unseal/recovery. An encrypted backup of each person's own share can mitigate media loss but not absence/loss of that person's decryption factors.|Neither person alone should hold quorum; any two-share collection defeats that separation.|Suitable only if both accept the recovery dependency and independent encrypted share backups are verified. Do not approve silently from a synthetic2-of-2 test.|
|2-of-3, three actual independent custodians|One unavailable/lost share tolerated; two unavailable still block.|Any two can collude; third custodian adds trust/safekeeping obligations. Giving two shares to one person destroys person-level separation.|Preferred for availability IF a genuine third custodian can be designated with Swiss-compatible storage/recovery controls. Otherwise not an available operational choice.|
|1-of-2|One loss tolerated, unilateral recovery possible.|Any one compromised custodian/share enables unseal; no dual-person control.|Not recommended for the proposed custody boundary. Requires explicit acceptance of the weaker unilateral model.|
|Auto-unseal with independent Swiss-controlled HSM/KMS/TPM mechanism|May reduce routine unseal dependence, but availability now depends on that device/service and its backup/authorization path.|Adds another privileged root of trust; a home TPM tied to one lost machine is not portable recovery.|Optional separate infrastructure/security design; not configured, required or presumed authorized now.|

Recommendation now: do not buy hardware or initialize real custody to complete the
synthetic trials. First confirm the owner as principal (if accepted), name secondary,
and decide2-of-2 versus2-of-3 with the actual third-person/absence trade-off. Never
split shares across accounts controlled by the same person and call that independent
custody. Maintain each encrypted share backup and its decryption factors separately
from full Raft backups, with Swiss residence/private inventory and periodic witnessed
restore. No operational quorum, TTL, retention or nonce-budget default is activated.
