# OPENBAO-STAGING-01 — preparación, 28/10/2026

No instalado ni autorizado a aplicar. Base remota verificada: staging
`a217cfeda74431b77ffa30d117febb62695c70d0`. CRM-01 permanece en
`09c578137860cfc3726e67a21304a228c0657061`; no se modifica ninguna referencia
existente. Esta rama no debe configurarse como fuente de Dokploy.

## QG-0 y decisión única

Objetivo: incorporar únicamente el servidor OpenBao al mismo staging sintético.
Ruta: Dokploy → deploy/staging/compose.yaml → include compose.openbao.yaml →
Dockerfile existente → server.json y TLS privados → health existente.
Se reutilizan overlay, imagen 2.7.1, template, políticas, renderers y pruebas.
El consolidator y su prueba dejan de pasar explícitamente el overlay, ya incluido
por el entrypoint canónico, evitando importar dos veces los mismos recursos.
No se crean runners, motores ACL, SQL ni servicios auxiliares. El diff ejecutable principal
es un include de Compose (soportado por v5.0.2); mantiene el Compose Path y no
reescribe web, PostgreSQL, labels ni redes existentes. No usar simultáneamente
`-f compose.openbao.yaml`: duplicaría recursos importados. No consolidar ni añadir
compose.ingress.yaml: las etiquetas/redes de ingress que Dokploy inyecta deben
conservarse exactamente. La herramienta de consolidación existente sigue siendo
referencia histórica, no es la ruta seleccionada para este paquete.

Orden previo obligatorio: configuración requerida preparada → render efectivo
de Dokploy comprobado → autorización de integración/instalación. El render se
revisa antes de integrar en staging, mediante la previsualización/exportación
controlada disponible; no requiere desplegar ni cambiar la fuente configurada.
Si no puede comprobarse antes, la integración permanece bloqueada.

El perfil synthetic-custody sigue opt-in. La futura activación del perfil en
Dokploy requiere autorización específica; hoy no cambia COMPOSE_PROFILES ni
Autodeploy. La observación del usuario prevalece sobre synthetic-plan.json y
README históricos: web/PG ya funcionan. Evidencia posterior del propietario
(28/10/2026 14:31:16 Europe/Madrid, 12:31:16 UTC): Autodeploy desactivado;
variables guardadas en Dokploy y .env; TLS, permisos y Compose actual+overlay
verificados por el propietario. No se inspeccionaron aquí esos archivos privados.
Incluir la definición no equivale a iniciar OpenBao. Incluso con perfil apagado,
Compose puede exigir las variables requeridas al cargar el include: integrarlo
solo cuando estén preparados sus archivos/variables y se autorice el cambio.

Aceptación: config válida, recursos web/PG idénticos, Bao sin puertos publicados,
solo custody interna y traefik.enable=false; no activación B1. Riesgos: contención de CPU, IP candidata que puede colisionar después, secretos/permisos,
readiness sellada, CPU compartida y rollback sin borrar estado. Pruebas offline;
no se ejecutan comandos contra el VPS ni se valida infraestructura por inferencia.

## Observaciones y gates

Evidencia del propietario, 28/10/2026 14:31:16 Europe/Madrid (12:31:16 UTC):
2 CPU totales compartidas, MemAvailable 5687 MiB, 83 GB libres, sin swap.
vmstat idle 74/73/84/94/92%; steal 10/13/10/5/7%. Cinco muestras son una
observación breve, no una reserva, SLA ni prueba de estabilidad bajo build.
El mínimo idle observado es 73%; no se convierte en availableMillicpus. Steal
es tiempo sustraído por el hipervisor, no CPU utilizable adicional. No sumarlo
al idle ni descontarlo de nuevo para fabricar una reserva. Conservar muestras
crudas y repetir observación reciente antes de aplicar.

QG-0 de capacidad: reutilizar capacity() y el harness existentes, extender con
scope explícito; ningún wrapper ni runner nuevo. full-stack sigue por defecto,
con 4608 MiB, 2000 millicpus y todos sus rechazos previos. Ese presupuesto cubre
planificación del conjunto, no es el mínimo incremental para añadir Bao sellado
sin reconstruir/reiniciar web ni PostgreSQL. El selector no autoriza operaciones.

Ajuste mínimo propuesto: --capacity-scope openbao-sealed-addition, únicamente
HOST_BUILD selectivo; MemAvailable ya descuenta web/PG running, no cobrarlos de
nuevo. Exigir 512 Bao + 768 reserva host + 1536 reserva build = 2816 MiB disponibles
(conservador: se suman Bao y build aunque las fases no se solapen). Observado
5687 deja margen aritmético de 2871 MiB sobre esta propuesta; el disco supera
8192 MiB. Se conserva el presupuesto de disco. Los 83 GB se registran como
79154 MiB, cota conservadora asumiendo GB decimales; no se inventan bytes exactos.
Esto acredita comparación aritmética, no consumo medido del build ni aceptación.

CPU runtime: límite 500 millicpus existente. Build: CPU NO limitada por cpus:0.5
ni por mem_limit:512m del servicio. El Dockerfile descarga Node/Bao, descomprime
y prepara permisos; no compila web/PG. Su pico CPU, RAM, red y disco/caché siguen
sin medir. Propuesta de ensayo: presupuesto build 500 millicpus y 1536 MiB, sin
paralelismo con arranque ni otro build de este proyecto; NO asignación aprobada.
Para aceptarlo, comprobar que el builder existente soporta y aplica límites de
CPU/memoria para ESA invocación, o justificar su envolvente observada dentro de
capacidad disponible; no inventar flags de Compose/BuildKit ni crear otro builder,
runner o VPS. Si no puede comprobarse, buildEnvelopeVerified permanece false y
no se ejecuta build. Los comandos build posteriores quedan condicionados a esa
comprobación; el comando sin límites no la acredita por sí solo.

El gate requiere buildMillicpus explícito validado; calcula pico CPU como
max(500, buildMillicpus), porque el build termina antes del arranque (Bao antes
no existe). No suma ambos ni presume que build consume cero. El presupuesto
build de 500 es una propuesta: buildMillicpus=null en el registro hasta resolver
la envolvente real. Las pruebas usan cifras sintéticas para validar fronteras.
availableMillicpus sigue null: idle no lo rellena automáticamente. Un valor futuro
representaría una evaluación documentada y reciente de margen compartido, jamás
CPU reservada. Desconocido/insuficiente, build desconocido, alcance sin confirmar,
datos >24h/futuros, red o aislamiento desconocidos siguen bloqueando.

```sh
# Solo evaluación offline; no build ni despliegue. Exit 2 = BLOCKED.
python3 scripts/prepare-staging-synthetic.py --record /private/resource.json --capacity-scope openbao-sealed-addition
# Control completo conservado, sin selector:
python3 scripts/prepare-staging-synthetic.py --record /private/resource.json
```

El RESOURCE_RECORD separa observedOpenbaoPreparation (relato comprobado por el
propietario, no auditado aquí) de selectiveOpenbao (condiciones pendientes). CPU
usable, envolvente de build, constancia del plan selectivo, revalidación de red y
otherProjectsIsolated no se fabrican. deploymentAuthorized/backupAuthorized siguen
false. Tras límites/plan de build comprobados, aprobar instalación por separado;
no se deriva autorización de un PASS de headroom.

Aprobado y reutilizado: mismo VPS Hostinger, solo datos ficticios, sin copias de
producción, comunicaciones externas ni coste nuevo; principal custodio=propietario.
No reabrir la residencia suiza de producción ni declarar PR006/PR007 satisfechos.

Pendiente para servidor/ceremonia: autorización de instalación, verificación
independiente de firma/fingerprint y advisories de release 2.7.1; TTL global y
máximo: la plantilla pública sigue null, no se inspeccionó la configuración
privada ya verificada por el propietario; responsable y almacenamiento
offline de CA; custodios adicionales, shares/threshold y procedimiento humano
aprobados para este staging, destino cifrado independiente, retención y recuperación.
No adoptar 1-de-1 del harness ni 2-de-3 propuesto como quórum aprobado.

Pendiente para workloads, NO requisito para definir un servidor sellado:
tenant UUID real de staging, purpose/key_id y paths exactos aprobados,
lecturas/creaciones por workload, CIDRs de consumidores, TTL token/max/SecretID,
identidades administradoras y de snapshots/restore, entrega/revocación y permisos
exactos. No renderizar ACL con UUID ficticio. KVv2, CAS y separación de roles ya
preparados se reutilizan; no inventar grants adicionales. Backend closedBackend
permanece; ni la red web-custody ni credenciales se añaden en esta fase.

## Configuración no secreta: render offline de servidor solamente

server-inputs.json fija nombres técnicos y la IP candidata; los dos TTL null
bloquean el render hasta decisión explícita. El servidor no necesita tenant,
key paths ni AppRoles para arrancar sellado. No ejecutar el renderer completo
con fixtures para sortear esta separación. Tras aprobar los TTL, copiar inputs
fuera de Git y renderizar SOLO el template canónico, sin secretos:

```sh
python3 - /private/approved-server-inputs.json /private/new-server.json <<'PY'
import importlib.util, json, pathlib, sys
spec = importlib.util.spec_from_file_location('bao', 'scripts/prepare-b1-openbao.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
d = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert d['environment'] == 'staging-synthetic'
assert d['api_dns'] == 'openbao' and d['private_ipv4'] == '172.30.60.10'
ttl = m.positive(d['token_ttl_seconds']); maximum = m.positive(d['token_max_ttl_seconds'])
assert ttl <= maximum
raw = (m.BASE / 'server.template.json').read_text()
for k, v in {'API_DNS': d['api_dns'], 'PRIVATE_IPV4': d['private_ipv4'],
             'NODE_ID': m.name(d['node_id']), 'TOKEN_TTL': ttl, 'TOKEN_MAX_TTL': maximum}.items():
    raw = raw.replace('@'+k+'@', str(v))
assert '@' not in raw
server = json.loads(raw)
server['audit'][0]['file']['b1-private']['description'] = 'Synthetic staging audit; no production acceptance'
with pathlib.Path(sys.argv[2]).open('x') as f:
    f.write(json.dumps(server, indent=2)+'\n')
PY
sha256sum /private/new-server.json
```

Reutiliza validación/template de prepare-b1-openbao.py y la descripción sintética
de prepare-staging-synthetic.py. No instala auditoría/ACL ni prueba sintaxis del
binario. El paquete completo de workloads se renderizará posteriormente con
prepare-staging-synthetic.py --record /private/resource.json --inputs
/private/approved-workload-inputs.json --out /private/new-workload-package, sin
--compose-out. Su exit 2 exige resolver capacidad; no autoriza despliegue.

## TLS exacto propuesto — NO ejecutado, ninguna clave generada

CA nueva exclusiva de staging, sin relación con producción. SAN servidor
DNS:openbao, IP:172.30.60.10. Listener mTLS en esa IP:8200; cluster:8201 interno.
Cliente health separado, EKU clientAuth, sin token ni permisos KV. Su certificado
TLS autentica transporte, no concede permisos de custodia. CA firma offline;
solo su certificado público se monta como workload-ca.pem. No montar ca-key.pem.

Tras autorización explícita, en estación de custodia segura (no CI/VPS compartido),
con CA_DAYS y LEAF_DAYS positivos aprobados, LEAF_DAYS menor que CA_DAYS:

```sh
umask 077
: "${CA_DAYS:?Vigencia CA aprobada}" "${LEAF_DAYS:?Vigencia leaf aprobada}"
mkdir -m 700 /private/new-staging-pki
cd /private/new-staging-pki
openssl genpkey -algorithm RSA -aes-256-cbc -pkeyopt rsa_keygen_bits:3072 -out ca-key.pem
openssl req -x509 -new -sha256 -key ca-key.pem -days "$CA_DAYS" -subj /CN=CleanOps-Staging-Only-CA -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign,cRLSign -out workload-ca.pem
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out server-key.pem
openssl req -new -sha256 -key server-key.pem -subj /CN=openbao -out server.csr
cat > server.ext <<'EXT'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:openbao,IP:172.30.60.10
EXT
openssl x509 -req -sha256 -in server.csr -CA workload-ca.pem -CAkey ca-key.pem -set_serial 0x1001 -days "$LEAF_DAYS" -extfile server.ext -out server-chain.pem
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out health-client-key.pem
openssl req -new -sha256 -key health-client-key.pem -subj /CN=cleanops-staging-health -out health.csr
cat > health.ext <<'EXT'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
EXT
openssl x509 -req -sha256 -in health.csr -CA workload-ca.pem -CAkey ca-key.pem -set_serial 0x1002 -days "$LEAF_DAYS" -extfile health.ext -out health-client.pem
openssl verify -CAfile workload-ca.pem -purpose sslserver -verify_hostname openbao server-chain.pem
openssl verify -CAfile workload-ca.pem -purpose sslserver -verify_ip 172.30.60.10 server-chain.pem
openssl verify -CAfile workload-ca.pem -purpose sslclient health-client.pem
openssl x509 -in server-chain.pem -noout -dates -ext subjectAltName
openssl x509 -in health-client.pem -noout -dates -ext extendedKeyUsage
```

Seriales únicos para esta CA nueva; renovación exige nuevos seriales, nunca
reutilizar este directorio. Verificar correspondencia de clave/certificado por
comparación de hashes de claves públicas antes de transferir. No mostrar claves.
Transferir por canal privado SOLO server-chain.pem, server-key.pem,
workload-ca.pem, health-client.pem y health-client-key.pem al directorio TLS del
host; no ca-key.pem, CSRs ni archivos .ext. Mantener CA cifrada y recuperación
fuera del VPS. Los demás clientes requieren emisión/identidad propia posterior.

Ruta propuesta host /etc/cleanops360-staging/openbao (fuera del checkout).
Al aprobar su creación: directorio padre root:1000 modo 0750, tls root:1000 0750;
server.json root:1000 0440, certificados públicos 0444 y ambas claves leaf
root:1000 0440. Confirmar UID/GID 1000 real de la imagen y ausencia de usuarios
host no autorizados en ese grupo antes de aplicar. Bind config →
/etc/openbao/server.json y tls → /run/openbao-tls son read-only, create_host_path=false.
Bao USER node; Raft/audit en volúmenes propios inicializados por la imagen con
UID/GID1000. Revisar permisos efectivos; no chmod recursivo sobre PG ni volúmenes
existentes. No usar secrets en env/build args. No publicar material privado ni
adjuntar env/config interpolada de Dokploy a GitHub.

## Secuencia propuesta en el host — requiere autorización futura

A. Instalación y arranque sellado. Confirmar Autodeploy sin modificarlo ANTES de
integrar esta rama; no merge en este encargo. Conservar export privado del Compose
EFECTIVO de Dokploy, labels, redes, IDs de contenedores, mounts, imágenes y hashes
previos. Si web pierde default, staging_private o dokploy-network, ABORTAR.
PG debe seguir solo cleanops360_staging_private. No adivinar labels Traefik.

Preflight propuesto, lectura sin SQL (no ejecutado aquí):

```sh
cd /etc/dokploy/compose/cleanops360-f4fxmd/code
test "$(git rev-parse HEAD)" = a217cfeda74431b77ffa30d117febb62695c70d0
docker compose version
docker info --format '{{.Architecture}} {{.DockerRootDir}}'
free -m
df -m /var/lib/docker
uptime
swapon --show
ip -4 route show table all
docker network inspect $(docker network ls -q)
docker ps --filter label=com.docker.compose.project=cleanops360-f4fxmd --format '{{.ID}} {{.Names}} {{.Status}}'
```

Registrar hora UTC y ownership/aislamiento sin imprimir secretos. Tras integración
futura autorizada, verificar el nuevo SHA aprobado en lugar del SHA base anterior.
Nunca git reset sobre el checkout gestionado. Si cambió HEAD antes de integrar,
revisar de nuevo el diff completo. Revalidar 172.30.60.0/24 y .10 contra TODAS
las redes/rutas, incluidas VPN. No crear otra máquina/runner/entorno.

Preparar archivo privado /etc/cleanops360-staging/openbao/compose.env con estas
variables de ruta/no secretas y las variables EXISTENTES necesarias de Dokploy
por su mecanismo seguro, sin leer/imprimir contraseña de PG:

```dotenv
CLEANOPS_BAO_CONFIG_FILE=/etc/cleanops360-staging/openbao/server.json
CLEANOPS_BAO_TLS_DIR=/etc/cleanops360-staging/openbao/tls
CLEANOPS_BAO_SUBNET=172.30.60.0/24
CLEANOPS_BAO_PRIVATE_IPV4=172.30.60.10
```

No copiar valores supuestos de PG/origin. Confirmar que las mismas variables
están disponibles para el futuro render de Dokploy. Render con el archivo EFECTIVO
que Dokploy usa para preservar ingress; no sustituirlo por el YAML crudo:

```sh
# DOKPLOY_EFFECTIVE_COMPOSE: ruta absoluta confirmada del archivo efectivo
# que ya contiene include y las inyecciones de ingress conservadas.
: "${DOKPLOY_EFFECTIVE_COMPOSE:?Ruta efectiva confirmada, nunca inferida}"
docker compose -p cleanops360-f4fxmd --env-file /etc/cleanops360-staging/openbao/compose.env -f "$DOKPLOY_EFFECTIVE_COMPOSE" --profile synthetic-custody config -q
```

Comparar offline el modelo efectivo previo y nuevo: web/postgres, sus imágenes,
builds, labels, redes, mounts y pgdata deben ser idénticos; solo Bao/custody y
baodata/baoaudit nuevos. Si el include relativo se resuelve desde un directorio
distinto, ABORTAR y revisar export/ruta; no improvisar otro método en el host.
No activar desde UI un redeploy general esperando que respete esta separación.
Tras aprobación del modelo y autorización expresa, comandos selectivos:

```sh
docker compose -p cleanops360-f4fxmd --env-file /etc/cleanops360-staging/openbao/compose.env -f "$DOKPLOY_EFFECTIVE_COMPOSE" --profile synthetic-custody build openbao
docker compose -p cleanops360-f4fxmd --env-file /etc/cleanops360-staging/openbao/compose.env -f "$DOKPLOY_EFFECTIVE_COMPOSE" --profile synthetic-custody up -d --no-deps --no-build openbao
docker compose -p cleanops360-f4fxmd --env-file /etc/cleanops360-staging/openbao/compose.env -f "$DOKPLOY_EFFECTIVE_COMPOSE" --profile synthetic-custody ps -a
```

Registrar digest/image ID realmente construido (no inventar digest desde el
Dockerfile), hashes config/trust, propiedad de volúmenes y ausencia de ports.
Binario existente amd64 SHA256
0e2f1ce10d124e03112b50dd2fbec6b78003783253bc3a91587938f39d1e2243;
base Node está por tag mutable: registrar su digest antes del build y revisar
el resultado, no afirmar reproducibilidad completa por checksum de Bao.

Esperado antes de ceremonia: proceso running, initialized=false, sealed=true;
health HTTP501 y contenedor unhealthy tras start_period/retries. Tras init y antes
de unseal, HTTP503 con sealed=true. Esto NO es un fallo a esconder con start_period
infinito, standbyok/sealedcode ni health debilitado. No usar --wait como criterio
de éxito de esta etapa. Validar transporte/TLS y ausencia de reinicios por separado.

B. Inicialización/desellado y custodia: solo en nueva autorización con quórum,
custodios y recuperación aprobados. No hay comandos operator init/unseal con
valores inventados en este paquete. Mantener outputs/shares/root fuera de shell
history, logs, Git y CI. Configurar auditoría y verificar fail-closed, mount KVv2,
CAS, roles existentes exactos, denegaciones y recuperación; revocar root temporal.
Healthy exige HTTP200, initialized=true, sealed=false, pero no acredita ACL,
backup ni aceptación de custodia. No aceptar ceremonia solo por health verde.

C. Backend posterior: requiere autorización B1/AUTH-GATE-05, inputs exactos,
credenciales de workloads y pruebas privadas reales/negativas. No conectar web a
custody ni inyectar claves en este encargo. No ejecutar SQL ni scripts instaladores.

## Rollback selectivo propuesto (también requiere autorización)

```sh
docker compose -p cleanops360-f4fxmd --env-file /etc/cleanops360-staging/openbao/compose.env -f "$DOKPLOY_EFFECTIVE_COMPOSE" --profile synthetic-custody stop openbao
docker compose -p cleanops360-f4fxmd --env-file /etc/cleanops360-staging/openbao/compose.env -f "$DOKPLOY_EFFECTIVE_COMPOSE" --profile synthetic-custody rm -f openbao
```

No -v: conservar baodata, baoaudit, pgdata, TLS y configuración para diagnóstico;
no restaurar datos ni reinitializar. Retirar include mediante revert revisado en
otra autorización; no reset/force-push ni redes eliminadas. Comprobar IDs, imagen,
health y mounts de web/PG iguales al inventario previo, ingress HTTPS y PG sin
puertos públicos. Prohibido down -v, Fresh Volumes, prune, borrado de volúmenes,
redeploy global o exposición pública de Bao. Autodeploy no se modifica.

## Mantenimiento: identidad y Compose canónicos

RESOURCE_RECORD.json, STAGING_SYNTHETIC.composeProject=cleanops360-f4fxmd, es la
fuente de identidad del proyecto Compose observado. project=cleanops-360 es la
identidad de la aplicación Dokploy, no sustituye composeProject. El archivo
privado debe coincidir con composeProject y composePath canónicos; discrepancias
se rechazan antes de invocar Docker. El maintenance existente pasa solo el Compose
canónico, incluido una vez, valida config --format json antes de ps/inspect y
conserva guards de project/service labels y rechazo de ports. No busca proyectos
alternativos ni lee tokens antes de validar. Necesita las variables obligatorias
existentes en el entorno seguro; un perfil apagado no evita este requisito.
No se ha ejecutado backup ni se ha cambiado el instalador SQL histórico.

## Firma y advisories: pendientes específicos

Metadatos oficiales consultados por GitHub, sin descargar/ejecutar binarios:
https://github.com/openbao/openbao/releases/tag/v2.7.1 . Hay checksums.txt,
checksums.txt.gpgsig y firma detached del tarball amd64; también bundles Sigstore.
El checksum fijado del Dockerfile no autentica al firmante. Pendiente obtener
fingerprint de mantenedor por canal independiente y validar la firma de
checksums/tarball con esa confianza (o identidad/issuer/transparencia Sigstore
según procedimiento oficial); conservar recibo, hash y versión de herramienta.
Descargar la clave del mismo release sin esa comprobación no completa confianza.
No se verificó ninguna firma en este encargo.

Las notas 2.7.1 declaran correcciones GHSA-3237-j65r-m5rp,
GHSA-q74w-hv5x-6hxf, GHSA-7m59-mp95-w6ph, GHSA-5v22-543h-wg96 y
GHSA-gf3j-hm38-jhh5. Son fixes declarados, no dictamen de ausencia de advisories
posteriores ni prueba de que cada uno aplique a este listener sellado. Pendiente
inventario vigente de advisories, rangos afectados/fixed y análisis para 2.7.1,
Raft/mTLS/audit y futura AppRole; comprobar soporte del release y vulnerabilidades
del Node/base OS mutable. La API security-advisories fue rechazada por el conector
(HTTP400 endpoint no permitido): catálogo actual NO comprobado. Revisar por canal
oficial soportado antes de instalar. No cambiar versión/checksum sin nueva revisión.
