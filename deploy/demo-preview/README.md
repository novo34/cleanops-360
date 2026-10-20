# Preview privada de la demo — preparada, NO desplegada

No modifica staging, AutoDeploy, main, B1 ni sus gates. No requiere PostgreSQL, OpenBao, sesiones de aplicación, credenciales de staging ni servicios externos. Datos y cartografía locales sintéticos. El único almacenamiento del navegador es `cleanops.demo.theme` (claro/oscuro).

## Controles preparados

- Compose independiente `cleanops-demo-preview`, red de aplicación **interna** y red de entrada propia solo para gateway, sin pertenecer a redes de DB/staging.
- Next no publica puertos. Gateway únicamente en `127.0.0.1:3187`; acceso privado con HTTP Basic independiente de B1, secreto montado desde archivo externo a Git. Nunca publicar Basic sobre HTTP sin TLS.
- Gateway permite solo GET/HEAD y las cinco rutas demo y sus recursos; bloquea login, API, auth, MFA, me y demás módulos. Elimina Authorization/Cookie antes de reenviar y Set-Cookie al responder.
- No-index y no-store, sin logs de cabeceras/credenciales. Contenedores no root, filesystem de solo lectura, capabilities eliminadas, no-new-privileges, límites conjuntos de 864 MiB y 1,25 CPU; comprobar margen real del host antes de autorizar.
- Imágenes Node versionadas y fijadas al digest comprobado durante la construcción; escanear la imagen en la infraestructura destino antes de publicar. `npm ci --ignore-scripts`, sin instaladores remotos.
- Configuración no incorpora redes/labels de Traefik compartidas ni dominio supuesto. El proxy existente debe terminar TLS y reenviar al gateway, **nunca directamente a app**. Restringir además por IP/VPN si está disponible; no convertirla en demo pública sin autenticación.

## Pasos exactos del operador, SOLO tras aprobación de infraestructura

1. Confirmar capacidad del VPS, disponibilidad DNS y acceso privado/TLS. Crear aplicación/Compose **nueva** en Dokploy, proyecto propio, repositorio `novo34/cleanops-360`, rama `feat/demo-v0-map-themes`, commit validado del informe de cierre. AutoDeploy desactivado. No reutilizar variables ni volúmenes de staging.
2. Checkout aislado del commit publicado, sin merges. Compose path `deploy/demo-preview/compose.yaml`, build context raíz del checkout (el YAML lo resuelve). No importar `.env` de otras aplicaciones.
3. Crear fuera del checkout un directorio privado, archivo `preview_password` aleatorio (al menos 24 caracteres; recomendado 32 bytes aleatorios codificados hex) y propiedad UID 1000/modo 0400 para lectura por Node en el contenedor. Directorio del host 0700. No imprimir ni subir el secreto. Establecer `PREVIEW_PASSWORD_PATH` con ruta absoluta en configuración **exclusiva** de la preview. Usuario Basic: `owner`. Entregar la contraseña al propietario por canal privado existente, nunca mediante commits o logs.
4. Validar y construir en ese checkout:

   ```sh
   docker compose -f deploy/demo-preview/compose.yaml config --quiet
   docker compose -f deploy/demo-preview/compose.yaml build
   docker compose -f deploy/demo-preview/compose.yaml up -d
   docker compose -f deploy/demo-preview/compose.yaml ps
   ```

   En este entorno de QA con proxy, se usó adicionalmente el certificado público de sesión mediante secreto BuildKit `proxy_ca`; no se copia a la imagen. En el VPS con CA pública normal no se necesita.
5. Antes de publicar: comprobar localmente 401 sin credenciales, 200 autenticado en `/demo`, 404 autenticado en `/login` y `/api/...`, 405 para POST; sin cookies de aplicación. Verificar que app no tiene puertos publicados ni variables DB/B1 ni salida a Internet, y que los límites no compiten con B1. Revisar escaneo de imagen, disco, memoria y DNS reales.
6. **Tras aprobación concreta** configurar dominio disponible (candidato, NO verificado/configurado: `preview-cleanops.nuvurent.com`) y TLS en el proxy/app existente con destino `127.0.0.1:3187`. Si Dokploy enruta desde un contenedor que no alcanza el loopback del host, preparar una conexión de ingress exclusiva del gateway y someter esa modificación a revisión antes de aplicarla. No conectar app a redes compartidas. Este detalle requiere inspección real de Dokploy; no se presupone una topología.
7. Verificar desde fuera: TLS válido, 401 anónimo, 200 propietario, mapa/cinco rutas/ambos temas y ausencia de acceso a rutas privadas. Solo entonces comunicar la URL como disponible.

Rollback independiente: retirar únicamente la ruta/dominio de esta preview y ejecutar `docker compose -f deploy/demo-preview/compose.yaml down` en su checkout. No usar `down -v` ni limpiar recursos globales. Custodiar/eliminar el secreto según la revisión acordada.

## Estado y límites

No existe acceso Dokploy/DNS/VPS en las herramientas conectadas. No se han aplicado los pasos anteriores. La capacidad Sites conectada utiliza Workers/Vinext o exportación estática, no ejecuta directamente este servidor Next con proxy nonce y rutas dinámicas; migrarlo sería trabajo adicional innecesario. Se conserva la aplicación validada.

Pruebas reproducibles: `node --test tests/demo-preview.test.mjs`; `PREVIEW_PASSWORD_PATH=/tmp/operator-secret docker compose -f deploy/demo-preview/compose.yaml config --quiet` (solo análisis, sin desplegar). La validación local de la imagen y las limitaciones reales se registran en el informe de cierre.
