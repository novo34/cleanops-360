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
README históricos: web/PG ya funcionan y Autodeploy está SIN CONFIRMAR.
Incluir la definición no equivale a iniciar OpenBao. Incluso con perfil apagado,
Compose puede exigir las variables requeridas al cargar el include: integrarlo
solo cuando estén preparados sus archivos/variables y se autorice el cambio.

Aceptación: config válida, recursos web/PG idénticos, Bao sin puertos publicados,
solo custody interna y traefik.enable=false; no activación B1. Riesgos: auto deploy
no confirmado, IP candidata que puede colisionar después, secretos/permisos,
readiness sellada, CPU compartida y rollback sin borrar estado. Pruebas offline;
no se ejecutan comandos contra el VPS ni se valida infraestructura por inferencia.

## Observaciones y gates

Servidor observado: x86_64, 2 CPU, 5701 MiB disponibles; /var/lib/docker con
84 GB libres; carga 0.85/0.41/0.31; Compose v5.0.2. Presupuesto existente:
768+1024+512+768+1536=4608 MiB, disco 8192 MiB, CPU 2000 millicpus.
Memoria supera el presupuesto en 1093 MiB; 2 CPU nominales y carga no prueban
2000 millicpus libres. No fabricar measuredAt, availableMillicpus ni
otherProjectsIsolated=true para conseguir PASS. Revalidar con hora UTC precisa,
redes/rutas, swap deshabilitado, espacio, aislamiento y capacidad de build.
El RESOURCE_RECORD existente queda sin falsificar ni marcar desplegado.

Aprobado y reutilizado: mismo VPS Hostinger, solo datos ficticios, sin copias de
producción, comunicaciones externas ni coste nuevo; principal custodio=propietario.
No reabrir la residencia suiza de producción ni declarar PR006/PR007 satisfechos.

Pendiente para servidor/ceremonia: autorización de instalación, verificación
independiente de firma/fingerprint y advisories de release 2.7.1; TTL global y
máximo (null en server-inputs.json); vigencia TLS; responsable y almacenamiento
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
