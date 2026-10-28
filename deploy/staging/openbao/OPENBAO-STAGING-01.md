# OPENBAO-STAGING-01 — preparación, 28/10/2026

No instalado ni autorizado a aplicar. Base remota verificada: staging
`a217cfeda74431b77ffa30d117febb62695c70d0`. CRM-01 permanece en
`09c578137860cfc3726e67a21304a228c0657061`; no se modifica ninguna referencia
existente. Esta rama no debe configurarse como fuente de Dokploy.

## QG-0 y decisión única

Objetivo: incorporar únicamente el servidor OpenBao al mismo staging sintético.
Ruta: Dokploy → deploy/staging/compose.yaml → include compose.openbao.yaml →
Dockerfile existente → server.json y TLS privados → health existente.
Se reutilizan overlay, imagen 2.7.2, template, políticas, renderers y pruebas.
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
sin reconstruir/reiniciar web ni PostgreSQL. El selector no autoriza operaciones. El scope selectivo solo evalúa capacidad:
se rechaza combinarlo con --compose-out, --inputs, --out o --include-ingress,
incluso argumentos parciales, antes de leer el registro o escribir archivos.
Generar Compose del stack o paquete general de workloads exige full-stack
(predeterminado), cuya evaluación queda reflejada en el manifiesto. Un resultado
selectivo nunca se adjunta a esos artefactos.

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
de advisories vigente antes de aplicar; firma/checksum 2.7.2 comprobados
en esta revisión con las fuentes y límites descritos abajo; TTL global y
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
582b1f3c2fdc5afd443b2d57a225ef654de75adea609fdb66731fd582a9cbc96;
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

## OpenBao 2.7.2: firma, checksum y aplicabilidad

Diff mínimo del Dockerfile: únicamente versión en URL y SHA256 del tarball amd64.
Se conservan Node base, usuario, TLS/config preparada, health, entrypoint, límites,
mounts y redes. Evidencia runtime anterior 2.7.1 es histórica: no se relabela como
prueba de 2.7.2. No se ha construido la imagen ni arrancado/instalado el binario.
La descarga pública para hash no se extrajo ni ejecutó. CPU/build siguen BLOCKED.

Verificación independiente realizada en esta revisión, separada de la afirmación
del propietario: descarga HTTPS de checksums.txt y checksums.txt.gpgsig desde
https://github.com/openbao/openbao/releases/tag/v2.7.2 ; clave de firma obtenida
por separado en https://openbao.org/assets/openbao-gpg-pub-20240618.asc .
Fingerprint contrastado con https://openbao.org/docs/install/#gpg :
primary 66D15FDD87287219C8E15478D200CD702853E6D0, signing subkey
E617DCD4065C2AFC0B2CF7A7BA8BC08C0F691F94. La clave web coincide byte a byte
con el asset del release, pero la confianza se ancla en la documentación HTTPS
del sitio oficial, no solo en la clave distribuida junto al tarball. No se afirma
validación fuera de banda por humanos ni certificación Web of Trust.

GnuPG 2.4.7 devolvió exit0 y VALIDSIG de esa subkey para checksums.txt, firmado
26/10/2026 19:47:13 UTC. TRUST_UNDEFINED es esperado en keyring aislado: no se
alteró ownertrust para fabricar confianza. Entrada única del manifiesto firmado:
582b1f3c2fdc5afd443b2d57a225ef654de75adea609fdb66731fd582a9cbc96
openbao_2.7.2_linux_amd64.tar.gz. Hash calculado del archivo descargado coincide;
una copia de checksums alterada devuelve exit1/BADSIG. Recibos y hashes en CHECKS.

Comandos de reproducción solo de verificación pública (no build/install/unpack):

```sh
review_dir="$(mktemp -d /tmp/bao272-review.XXXXXX)"
chmod 700 "$review_dir"
release=https://github.com/openbao/openbao/releases/download/v2.7.2
curl --fail --location "$release/checksums.txt" -o "$review_dir/checksums.txt"
curl --fail --location "$release/checksums.txt.gpgsig" -o "$review_dir/checksums.txt.gpgsig"
curl --fail --location https://openbao.org/assets/openbao-gpg-pub-20240618.asc -o "$review_dir/key.asc"
gpg --batch --no-autostart --homedir "$review_dir" --dearmor --output "$review_dir/key.gpg" "$review_dir/key.asc"
gpg --batch --no-autostart --homedir "$review_dir" --no-default-keyring --keyring "$review_dir/key.gpg" --with-colons --fingerprint
# Comparar primary/subkey con documentación oficial antes de aceptar la firma.
gpg --batch --no-autostart --homedir "$review_dir" --no-default-keyring --keyring "$review_dir/key.gpg" --status-fd 1 --verify "$review_dir/checksums.txt.gpgsig" "$review_dir/checksums.txt"
curl --fail --location "$release/openbao_2.7.2_linux_amd64.tar.gz" -o "$review_dir/openbao_2.7.2_linux_amd64.tar.gz"
# Comparar entrada única del manifiesto firmado y SHA256 calculado con el pin.
sha256sum "$review_dir/openbao_2.7.2_linux_amd64.tar.gz"
```

Advisories oficiales consultados por HTTPS en
https://api.github.com/repos/openbao/openbao/security-advisories?per_page=100
(51 entradas, sin Link de paginación). El fallo histórico del conector se resolvió
para esta consulta usando curl con permiso de red, sin eludir proxy ni TLS.
Los cuatro publicados 26/10/2026 y corregidos por 2.7.2, según las fichas:

| Advisory | Corrección / precondición | Aplicabilidad al paquete |
|---|---|---|
| [GHSA-736f-82w7-hj22](https://github.com/openbao/openbao/security/advisories/GHSA-736f-82w7-hj22) | Canonicalización de rutas AppRole RoleID y cert CRL; también plugins LDAP/RADIUS separados. | Relevante al AppRole futuro. Sellado sin auth configurada no ejecuta esas operaciones. mTLS del listener no es el método auth/cert; no se habilita este último aquí. Plugins LDAP/RADIUS no incorporados; si se habilitan, requieren versiones corregidas propias >=0.2.0. |
| [GHSA-q824-44ff-f5j5](https://github.com/openbao/openbao/security/advisories/GHSA-q824-44ff-f5j5) | OIDC provider podía emitir credenciales para cliente público mal configurado. | Provider OIDC no habilitado/propuesto por este paquete; no justifica habilitarlo. |
| [GHSA-h76r-48x5-36hg](https://github.com/openbao/openbao/security/advisories/GHSA-h76r-48x5-36hg) | Wildcards en identidades de certificados SSH; nuevo default false. | Motor SSH y plantillas de identidad fuera del alcance. |
| [GHSA-5pmx-2p74-x478](https://github.com/openbao/openbao/security/advisories/GHSA-5pmx-2p74-x478) | Path traversal al importar claves Transit podía sortear restricciones de nombre. | Motor Transit/import no habilitado. Custodia B1 preparada usa KVv2, no Transit. |

Las fichas incluyen 2.7.1 en la rama afectada y 2.7.2 como corregida (también
2.6.5, rama que upstream declara no soportada). Los límites/versiones exactos
son los de cada ficha; no extrapolar la corrección a plugins externos. Los
advisories anteriores tienen fixes anteriores según el catálogo; esto no es una
auditoría completa del binario, de sus dependencias ni de los controles de ACL.
Revalidar catálogo/revocaciones/advisories antes de instalar. Firma válida prueba
procedencia/integridad bajo la clave contrastada, NO ausencia de vulnerabilidades.
Node/base OS siguen por tag mutable y necesitan revisión de digest y advisories;
no se ha escaneado una imagen ni acreditado consumo del build o seguridad runtime.

## RUNTIME-CUSTODY-01 — siguiente incremento, preparación sobre 6d89888

Este asiento prevalece para el estado de staging comunicado por el propietario;
las instrucciones anteriores de instalación/ceremonia quedan como historia, no
como operaciones a repetir. Checkout 6d89888804ffa4e2ba7635878c88eaf7f3b9c997;
web/PostgreSQL/OpenBao healthy sin reinicios, Bao 2.7.2 inicializado/desellado,
custodia staging 1-de-1, auditoría privada con solicitud/respuesta correlacionadas,
token HMAC y rechazo sin token. Backend cerrado, Autodeploy OFF. CRM-01 se conserva
en 09c578137860cfc3726e67a21304a228c0657061. Son observaciones del propietario,
no inspección independiente del VPS ni evidencia de recuperación/custodia integral.
No reabrir init/unseal, instalación, quórum ni build para documentar este estado.

### QG-0 y diff de esta preparación

Objetivo REQ-AUTH-001/002/003/022/040, PR006/007: preparar login/TOTP/sesión con
custodia real sin activar runtime ni declarar CRM/R4 completos. Fuente: AGENTS,
ENGINEERING_QUALITY_POLICY, SRS §4, ROADMAP fase1/3, IMPLEMENTATION_GATES,
KEY_OPERATIONS, CUSTODY_AND_RECOVERY y contratos canónicos B1. Inventario: runtime,
proxy bootstrap, private-adapter, approved-backend/factors, custody-composition,
openbao-keys, pg-identity-driver, custody-deadline de main, v4-broker/config,
renderer/políticas, scripts de integración privada y ramas R4/CRM fijadas por SHA.
Se reutiliza el código canónico; no se convierte un harness de CI en servidor ni
se crea setter, feature flag de activación, segundo login, motor ACL o token client.

Diff ejecutable mínimo: ocho blobs EXACTOS de main
4f19c36f8eda2c846c6e3c7164814f26841b3bce, procedentes de a809604:
lib/b1/{custody-composition,custody-deadline,openbao-keys,pg-identity-driver}.ts
y sus cuatro tests/b1 correspondientes. Dos rutas deadline se añaden porque no
existen en staging; owner B1/seguridad, consumidor composición privada, prueba de
lease/COMMIT. No son un mecanismo paralelo ni temporal. Ningún cambio a runtime,
proxy, permisos, SQL14, service/contracts, B2, R4, CRM, Dockerfile/Compose/TLS.

El cambio elimina el riesgo de expirar claves después de permitir efectos/COMMIT:
lease compartida, statement_timeout acotado al presupuesto restante sin alargar
uno más estricto, descarte de conexión tardía, rollback de efectos no confirmados,
limpieza de buffers incluso con trabajo pendiente. Un COMMIT confirmado puede
entregar su recibo tardío sin autorizar nuevas consultas/claves. El fallo de
release se sanea sin reintentar un efecto. Los tests usan transportes/saldos en
memoria; no demuestran cancelación real de PostgreSQL bajo carga ni memoria JS
perfectamente borrada. Revert de estos ocho blobs restaura el código anterior sin
SQL inverso/volúmenes y sin arrancar servicios. Evidencia en CHECKS existente.

Se añade runtime-catalog.review.sql, propiedad B1/DBA, consumidor revisión del
catálogo desplegado y preparación de conexión; no runner/migración/instalador.
Su ejecución queda pendiente. Cambios documentales en este procedimiento y su
CHECKS mantienen una sola fuente para operaciones futuras y su evidencia.

### Dependencias reales y frontera de R4/CRM

Ruta existente: proxy.ts /login → runtimeHandler().bootstrap() → digest CSRF;
app/auth/* → handleAuth → createAuthHandler → backend privado → withB1Custody →
createOpenBaoKeys → createApprovedPrivateBackend → repositorio V4 → PG dedicado.
Hoy runtimeHandler siempre usa closedBackend, incluida bootstrap. La custodia
healthy no cambia esa frontera. Abrir solo handleAuth dejaría bootstrap cerrado.

R4 remoto inspeccionado: codex/r4-aud-031 en
9a4c8b90a159f2853f040dc5597042c17408da00. AUD-031 cambia la cadena de invitación:
UI Idempotency-Key → invitation-acceptance-http.accept(cap,csrf,key,corr) → digest
vinculado → broker consume_invitation_acceptance(text,text,bytea,uuid) → candidato
SQL5 con efecto/auditoría/consumo atómicos. No degradar a la firma de tres args,
no usar SQL histórico como sustituto ni quitar guards de autorización W/ref/App.
Las barreras nativas de AUD-031 y sus callers fijados se conservan intactos.
Login de identidad YA provisionada, TOTP y sesión no consumen esa operación de
invitación. Si el usuario de staging depende de aceptar invitación, la corrección
AUD-031 y sus permisos/SQL/validación exactos son requisito previo separado,
no un motivo para insertar usuario, grants o factor por SQL administrativo aquí.
No se incorpora ni ejecuta R4 en este diff; se consulta solo su firma de catálogo.

Dependencias de main además de la lease: private-adapter/approved-backend/service
incluyen absoluteExpiresAt y renovación de actividad autenticada mediante
SQL14 touch_activity y relectura de binding. Staging carece de esa renovación.
Para un recorrido que mantenga sesión debe seleccionarse ese fix mínimo y probar
CSRF, absolutos/idle y COMMIT; no copiar approved-backend completo de main porque
arrastra módulos B2. Esta preparación no lo instala ni declara R4 cerrado.

CRM-01 en 09c5781 añade rutas /auth/crm/*, contratos, dispatch, crmRecord y SQL
candidato; no existe en staging. Su página renderiza el shell, pero el servidor
exige sesión ACTIVE y autorización efectiva; mostrar shell no prueba acceso.
El propio CRM-01 conserva closedBackend y crm_module_guard() que DENIEGA todo.
Aún requiere contrato/permisos companies/contacts, SQL/ACL revisados, vínculo
feature_flags.organization_id ↔ tenant app.organizations y evidencia multi-tenant,
idempotencia/CAS/auditoría. No suponemos igualdad de UUID ni levantamos el guard.
Por ello Bao→login→sesión se prepara primero; sesión→datos CRM sigue bloqueado por
su autorización y código propios. No importar toda R4/CRM para conectar Bao.

### Inputs concretos pendientes (no contienen valores secretos aquí)

Servidor ya configurado: conservar endpoint privado, CA, SAN, config y quórum
comunicados; confirmar sus referencias/hashes al autorizar, sin pedir ni mostrar
claves/token inicial en chat. Los null de plantillas públicas NO significan que
se deba sobrescribir la configuración privada healthy con plantillas vacías.

Para la conexión faltan: base/rol PG efectivo y TLS/socket de la identidad dedicada
(no bootstrap/owner), grants/firmas desplegadas y roles heredados; tenant de ensayo,
usuario/principal/MFA provisionados por el mecanismo aprobado (no consultar datos
personales en la consulta de catálogo); método/algorithm/version y formato AAD;
mount real KVv2, catálogo tenant/purpose/key_id/version inmutables y sus lectores;
AppRole mount/RoleID e identidad nominal, TLS cliente workload propio y canal de
entrega/rotación; TTL token/max/SecretID, wrapping y lifetime/timeout explícitos.
No asignar versiones 1/key-v1/UUID de fixtures como inputs operativos.

withB1Custody exige una sola identidad de tenant en los refs y cuatro HMAC
(audit, otp, recovery, cursor), más las versiones TOTP de lectura necesarias.
El tenant inicial para bootstrap/login debe venir de una decisión de composición
server-side aprobada; no del body/header ni de un default global de tenant. Si
se requiere login multi-tenant, resolver el alcance previo a tenant seleccionado
es un contrato pendiente: no escalar la allowlist a todos los tenants como atajo.

También faltan dummyPasswordHash real de admisión (misma política Argon2), regla
normalizeEmail coherente con provisión, transport() con dimensiones HMAC de ingress
real confiable (no IP de header, buffers constantes o fixture), labels privados de
sesión y límite de métodos TOTP/política según config canónica. Reutilizar
openEnrollmentSecret con AAD tenant/user/method/generación/algorithm/keyVersion;
no red/segundo pool dentro de decryptTotp, fallback a latest ni cache de claves
entre peticiones. Enrolamiento/rotación de TOTP es otro scope: si ya hay factor
válido, no precisa credenciales de issuer/mail-worker; tampoco activar EMAIL.

### Plan exacto de conexión posterior, aún bloqueado por esos inputs

El siguiente parche deberá afectar runtime.ts y su consumidor proxy bootstrap
solo si la forma de pasar contexto de ingress lo exige, con tests del runtime.
Reutilizar los factories existentes en el mismo entrypoint, no duplicar Backend.
Pool pg dedicado con identidad operativa; createOpenBaoKeys con mTLS/allowlist
revisada y token provider acotado; dependencias privadas por operación; ejecutar
bootstrap y handle dentro de withB1Custody hasta terminar la transacción HTTP.
No cachear backend con Buffer prestado, copiar keys a un singleton, activar por
un flag vacío, montar secretos en build o reutilizar el token inicial. El actual
provider acepta token():Promise<string> pero no implementa un lifecycle AppRole
operativo; el harness lo hace con credenciales sintéticas y root de ensayo.
Resolver entrega/renovación/expiración/revocación de ese callback es requisito
antes de escribir el parche de encendido, no se añade un proveedor ficticio ahora.
Fallos Bao/PG/deadline siguen 503/no-store; falta MFA nunca crea ACTIVE/CRM.

Pruebas posteriores exigidas: bootstrap privado, login correcto/incorrecto, TOTP
correcto/repetido/versión o tenant equivocado, sesión expirada/revocada, CSRF,
ninguna operación tras lease y recuperación de respuesta tras COMMIT tardío,
fallo de auditoría fail-closed, pool sin owner/BYPASSRLS y negación cross-tenant.
Para CRM, además catálogo, módulo aprobado, grants, CAS/idempotencia/auditoría y
negativos de guard. La matriz no se presenta como ejecutada por este paquete.

### Catálogo PostgreSQL propuesto: autorización A, solo lectura

El archivo runtime-catalog.review.sql contiene exclusivamente catálogos, atributos
de roles, firmas/ACL/owner/security-definer/settings y hashes de funciones del
recorrido, más tres firmas CRM y la firma AUD-031 como sentinelas. Consulta tipos
de columnas/RLS/ACL sin filas de app; nunca credentials/secret_ciphertext reales,
pg_authid, hashes de passwords o valores de tenant/usuario. Esperados del repositorio
cleanops_identity_service y cleanops_auth_broker NO son identidades observadas.
Si faltan o son incompatibles, registrar GAP y detenerse, no usar bootstrap como
runtime ni conceder permisos. Esta consulta no prueba que toda RLS sea correcta;
si sus flags/ACL revelan discrepancias, una consulta posterior de políticas/DDL
concreta requiere nueva selección revisada. Los MD5 de función son huellas del
catálogo, no certificación contra SQL14 ni hashes de secretos.

Comando futuro, SOLO tras autorización del archivo/hash, endpoint y rol lector;
PGSERVICEFILE/PG_CATALOG_SERVICE deben identificar una conexión privada ya aprobada,
sin password en argumentos ni salida. No se define otro entorno ni otro PG:

```sh
: "${PGSERVICEFILE:?Archivo privado de conexión aprobado}"
: "${PG_CATALOG_SERVICE:?Alias aprobado para el PostgreSQL staging existente}"
: "${CATALOG_OUTPUT:?Archivo nuevo privado fuera de Git}"
test ! -e "$CATALOG_OUTPUT"
umask 077
psql -X --set=ON_ERROR_STOP=1 --dbname="service=$PG_CATALOG_SERVICE" \
  --file=deploy/staging/openbao/runtime-catalog.review.sql > "$CATALOG_OUTPUT"
```

BEGIN READ ONLY con statement_timeout 5s/lock_timeout 1s limita esta inspección;
son límites técnicos propuestos para la consulta, no TTL de negocio aprobados.
No ejecutar funciones auth_api/identity_private ni GRANT/CREATE/ALTER/INSERT/UPDATE,
ningún instalador staging-sql14 ni SQL14 otra vez. Resultados privados y revisión
redactada de presentes/ausentes/firmas antes de preparar cualquier escritura.

### Sustituir token inicial sin perder administración: autorización B separada

Separar control plane humano de identity-verifier. Verifier solo READ en paths
exactos de los HMAC/TOTP aprobados; sin default policy, LIST/metadata/writes/sys,
otro tenant, grants ni snapshots. Reutilizar renderer prepare-b1-openbao.py y sus
políticas/AppRoles con bind_secret_id, SecretID de un uso, CIDRs y TTL explícitos.
No dar al servidor web el token root, shares, key-creator, snapshot o restore.
El health cliente mTLS no sustituye la identidad AppRole ni el cliente workload.

Administración: identificar administrador humano y método de autenticación ya
aprobado, política de control exacta y recuperación; eso sigue pendiente. Poder
editar políticas/roles es poder otorgar privilegios: no se presenta como rol sin
riesgo. No renderizar ni instalar un admin genérico de sys/* o un nombre supuesto.
Snapshot reader, restore y key-creator son identidades separadas para operaciones
futuras que las requieran; no se crean para poder hacer login. Shares 1-de-1 de
staging no son credenciales web ni aceptación de recuperación de producción.

Secuencia futura exacta de gates, sin ejecutar en este encargo:
1. Revisar inputs y catálogo; render offline a directorio NUEVO únicamente con
   inputs aprobados; revisar hashes de policy/AppRole contra paths y tenant.
2. Aprobar por separado políticas de administrador nominal y canal/authentication,
   probar login de administrador en una sesión independiente del token inicial,
   capacidades necesarias, denegaciones y una operación administrativa inocua
   expresamente aprobada con rollback, auditada. Verificar TTL/renovación/revocación
   y que esa identidad sobrevivirá a revocar el token inicial (sin parentesco que
   la revoque en cascada; comprobarlo, no suponer orphan).
3. Bajo esa administración, comprobar mount KVv2/CAS y versión existente. No recrear
   mount, cambiar claves existentes, sobrescribir config server.json ni reinit.
   Crear solo las policies/AppRole exactas aprobadas y canal de entrega de SecretID
   wrapped de un uso; no transportar tokens por URL, terminal/CI/chat o build args.
   Validar login AppRole, allowlist y negaciones, expiración y rotación del token
   operativo. No usar el token inicial como token() callback ni fallback.
4. Solo después de las pruebas de administración/recovery independiente y workload,
   autorización del propietario para revocar el token inicial en su sesión aislada.
   Revocar antes de montar/activar web; verificar que él y sus accesores/descendientes
   no necesarios ya no autentican y el administrador sí puede administrar. No revocar
   primero para luego descubrir que todas las sesiones admin dependían de él.
5. Preparar el parche de conexión real y su diff, revisar otra vez y solicitar
   autorización C para build/despliegue web selectivo y prueba de login/TOTP/sesión;
   preservar PostgreSQL/Bao, Autodeploy OFF y volúmenes. CRM necesita autorización D.

Comandos propuestos de preparación y comprobación (sin material privado en argv):

```sh
# Offline, no credenciales ni aplicación. El server.json de salida NO se instala.
python3 scripts/prepare-b1-openbao.py --inputs /private/approved-workload-inputs.json --out /private/NEW-review-workload-pack
# En una sesión futura con token-helper privado y mTLS aprobados, nunca BAO_TOKEN root en web:
bao status -format=json
: "${APPROVED_ENV:?Entorno aprobado}" "${APPROVED_TENANT:?Tenant aprobado}"
: "${APPROVED_PURPOSE:?Propósito aprobado}" "${APPROVED_KEY_ID:?Key ID aprobado}"
bao token capabilities "b1-keys/data/$APPROVED_ENV/$APPROVED_TENANT/$APPROVED_PURPOSE/$APPROVED_KEY_ID"
# Solo en la sesión del token inicial y tras gates 1-4 y permiso expreso:
bao token revoke -self
```

No se suministran comandos de alta de administrador/policies con nombres o grants
inventados. Sus JSON y destinos exactos, TTL/canales y hashes deberán adjuntarse a
la autorización B una vez decididos. Una receta con placeholders no es permiso
para crear credenciales. Tampoco se suministra comando de despliegue C antes de
que exista y se revise el parche de runtime; no hay encendido oculto en esta rama.

Rollback futuro C: volver al artefacto web previo/closedBackend bajo autorización,
revocar solo identidad workload afectada si procede, conservar PG/Bao/keys/audit y
volúmenes. No reactivar root ni deshacer SQL/datos para ocultar un fallo; preservar
recibos sin secretos. Rollback de esta preparación: revert del diff de código y
documentación en rama, sin servicios. No se declara R4, CRM ni custodia integral
completos ni se heredan PASS nativos por disponibilidad del servidor.
