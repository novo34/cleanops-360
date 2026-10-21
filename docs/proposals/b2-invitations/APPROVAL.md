# SQL4 — administración de invitaciones: solicitud individual

PENDIENTE. No SQL, ACL, fixtures o E2E SQL4 ejecutados. Contrato de producto y
parámetros aprobados separadamente en 3ea4ec8; esa aprobación no autoriza este SQL.
El commit inmutable se indicará en la solicitud del PR. Todos los hashes de
archivos de ejecución están fijados en sql4-manifest.review.json.

| Archivo | SHA-256 |
|---|---|
| `docs/proposals/b2-invitations/004-invitation-administration.review.sql` | `e32365999f4f41a1ded6ee7da375878b18c0c907bfd982fd86f68cf84336fc96` |
| `docs/proposals/b2-invitations/invitation-admin-tests.review.py` | `166ccde947b44216b04354b7cc666ebb549f58a53695b229bf75521bb976e0fd` |
| `scripts/b2-invitations-postgres.review.py` | `55891967bc24f3fbe958aa2107376a55dae652763a85f6e6fba59f15befeb922` |
| `scripts/b2-invitation-browser-backend.ts` | `acd3ee77a8ab11f00029ea77942dfcc89b7e6f2c24350b38da654a6ccb612070` |
| `scripts/b2-invitation-browser-server.mjs` | `bdcb459b4bc33de942888b51e25bef441b10075748c5d3fdceabb05795434fe2` |
| `playwright.b2-invitations-postgres.config.ts` | `61b12db0d9d04a51d2204d000340b68b0bc54843540ba5f18372f7ba2ed39e03` |
| `e2e/b2-invitations-postgres.spec.ts` | `31680f5d6e637d3e35eb1123fbf785621bbd27624194c5d46a3b8e7210d5eb3a` |
| `docs/proposals/b2-invitations/workflow.review.yml` | `6789c4e8806f8ec7a0f4777aaadcad63c97e553e154cbaed8dd89324afd250f6` |

## Dependencias y diferencias exactas

Base: SQL14+SQL1+SQL2+SQL3 y composición de 3ea4ec8 ya aprobados y ejecutados
(230/230 PASS). Se reutilizan sus 20 archivos y su autorización histórica, sin
cambiar esos SQL/fixtures ni el runner base. El nuevo runner añade una segunda
autorización fail-closed antes de cualquier SQL y delega aislamiento/limpieza al
mismo runner existente. No crea otro motor RBAC, usuarios, permisos o sesiones.
El código de aplicación bajo prueba es el autorizado en la rama B2; SQL, fixtures
y harness de esta solicitud deben conservar exactamente sus bytes aprobados.

## DDL, funciones y grants propuestos

- Crear tres tablas privadas B2: user_invitations, invitation_delivery_attempts e
  invitation_policy, y dos índices de destinatario/ventana. Referencian los tenants
  y actores B1 existentes; no crean principales, credenciales o pertenencias.
  Broker existente: SELECT/INSERT/UPDATE invitaciones; SELECT/INSERT intentos;
  SELECT política. Sin permisos de tabla/schema a runtime, identity o mail worker.
- Política explícita de tenant: enlace1–24h; máximos aprobados3/h y10/d por
  destinatario,20/h actor,100/h tenant y60s entre envíos. Permite cuotas menores
  y pausas mayores. Ausencia de configuración implica denegación, no defaults
  productivos ni seeds en bases persistentes.
- Ampliar app.auth_outbox con invitation_id/generation y FK a invitación; permitir
  user_id/challenge_id NULL **solo para INVITATION** mediante CHECK por propósito.
  EMAIL_OTP/SECURITY_NOTICE conservan obligatoriedad y FKs B1. Esto es indispensable:
  un invitado pendiente todavía no tiene usuario/desafío MFA para el outbox actual.
- Reemplazar claim_mail_v2 con su cuerpo original exacto, añadiendo únicamente
  filtro event_type IN(EMAIL_OTP,SECURITY_NOTICE) a la selección. Evita que el
  worker OTP reclame/cancele una invitación. No se relaja validación OTP ni ACL.
- Crear invitation_draft_owned(jsonb,uuid,bytea,bytea,uuid),
  publish_invitation_owned(uuid,bigint,uuid,bytea,bytea,text,bytea,bytea,uuid) y
  administration_invitations(uuid): propietario broker; EXECUTE solo identity.
  Draft/publish exigen reserva B1 one-time del mismo backend/xid, tenant confiable,
  create/users, step-up vigente y versión. Lista exige view/users. Tokens nunca
  se devuelven al administrador. Publicación inserta ciphertext en el mismo outbox.
- Crear claim_invitation_mail(bytea,uuid) y
  authorize_invitation_dispatch(uuid,uuid,bytea,uuid): propietario broker, EXECUTE
  solo mail worker. Comprueban tenant activo, generación, vigencia, claim/lease.
  Finalización reutiliza finish_mail_outcome_cas y auditoría SYSTEM existente.
- No nuevas funciones públicas de login, activación, credenciales, MFA o sesiones.
  Aceptación limitada/primer password/MFA se desarrollará aparte y requerirá SQL
  específico. Este paquete no autoriza correo real ni instala un proveedor SMTP.

## Fixtures, E2E y ejecución exacta

Un único PG16 GitHub-hosted nuevo, network none, sin puertos ni bind/volúmenes,
PGDATA/tmp en tmpfs, socket local y datos sintéticos. Antes de SQL: verificar todos
los hashes/bytes del commit, SQL14/SQL1 y aprobaciones SQL2/SQL3/composición, ausencia
de variables/credenciales externas y metadatos de aislamiento. Si falla, no instalar.

Instalar dependencias existentes y SQL4; configurar política sintética de24h en
los dos tenants; conceder únicamente grants sintéticos de create/view users;
probar denegación sin permiso/MFA, lectura privada denegada, ownership, cuotas,
CAS, emisión cifrada, no creación de usuarios/credenciales, separación del worker
OTP, reenvío con invalidación/cancelación del envelope anterior, revocación,
tenant extranjero, rollback sin invitación/outbox/auditoría residual y journal
one-time sin respuesta secreta. Para probar reenvío sin espera se envejecen SOLO
los timestamps de intentos sintéticos dos minutos. Los ciphertext nativos de
prueba son datos sintéticos no entregados; la UI usa cifrado AES-GCM real.

E2E Chromium: UI → servicio B1/broker con login identity no privilegiado → SQL4 →
lista visible → revocación con motivo → PostgreSQL/auditoría; cookie B1 intacta.
Custodia local sintética de clave de correo, ningún envío real. Después, ejecutar
intactos todos los fixtures R2/matriz B1 de la composición previamente aprobada
con SQL4 instalado, incluidos sus dos E2E. Ningún fallo previo se reescribe.

Preservar report/screenshot sintéticos, eliminar solo el contenedor de etiqueta
propia e inspeccionar inventario final. Cualquier FAIL o SKIP impide PASS global.
Workflow permanece REVIEW ONLY fuera de .github/workflows hasta autorización.
No incluye bases persistentes, Hostinger/Suiza, activación B1, closedBackend,
AUTH-GATE-05, staging/main, despliegues o merges. No acredita B2-TECH-READY.
