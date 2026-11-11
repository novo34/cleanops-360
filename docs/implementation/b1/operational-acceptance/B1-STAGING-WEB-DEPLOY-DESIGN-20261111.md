# B1 staging: despliegue del web nuevo (P4) — diseño para aprobación

Estado: PROPUESTA (QG-2, STOP-AND-DESIGN). Nada de esto se ejecuta sin «sí» explícito del PO por paso. Decisión U-2 confirmada por el PO el 2026-11-11: **se mantiene `cleanops_staging`** (ya contiene SQL14 + 0002 + 0003 con hashes = repo, primer actor `COMMITTED`, `deployment_enabled=false`); no se crea `cleanops_b1_staging`.

## Hechos del VPS (inventory, solo lectura)
- Routers por cookie/canary/guarded retirados (`retire`, copia en `/root/b1-retired-20261111`).
- `cleanops-b1-mtls/` contiene `server-ca.crt`, `traefik-client.crt`, `traefik-client.key` (0400).
- En marcha desde el intento anterior: `cleanops360-b1-shadow-cc51574a` (imagen candidata antigua, aserción con pase de dispositivo) y su contenedor de assets. No sirven para el código de esta rama.
- La web original (`cleanops360-f4fxmd-web-1`) no se toca.

## Arquitectura (ya en el código, sin cambios)
El listener mTLS de ForwardAuth corre **dentro del mismo proceso web** (`instrumentation.ts` → `server-startup.ts`), con el paquete privado `CLEANOPS_B1_PRIVATE_DIR` montado en `/run/cleanops-b1-private` y el sink del Agent (`compose.b1-web.yaml`). Por tanto hay **un solo servicio nuevo**: backend (puerto 3000) + listener ForwardAuth (puerto/binding del manifiesto).

## Pasos propuestos (cada uno con «sí»)
1. **Inspección** (solo lectura, `inventory` ampliado): montajes, redes, NOMBRES de variables de entorno y puertos del shadow actual y de Traefik. Sin valores.
2. **Imagen**: construir desde el commit publicado de la rama con `deploy/staging/Dockerfile`; fijar digest. Sin tocar la imagen shadow antigua.
3. **Servicio nuevo** con nombre propio (`cleanops360-b1-web-<sha>`), mismo paquete privado/red/sink que el shadow actual, contra `cleanops_staging`; el shadow antiguo se para solo después y con otro «sí».
4. **Compatibilidad del paquete privado**: el emisor nuevo exige `pseudonymKey`; comprobar que el paquete existente lo provee. Si no, STOP-AND-DESIGN (no regenerar claves a mano).
5. `route` con `--backend-url http://<servicio-nuevo>:3000`, `--forward-auth-address https://<servicio-nuevo>:<puerto>/…`, TLS = rutas **vistas desde el contenedor de Traefik**.
6. `enable` → `smoke`.

## Riesgos abiertos
- Este script no construye ni arranca contenedores; falta decidir si se hace vía Dokploy (recomendado, Compose gestionado) o con un subcomando nuevo `deploy` con las mismas guardas.
- El paso 4 puede requerir cambiar el paquete privado (custodia de claves): decisión del PO.
