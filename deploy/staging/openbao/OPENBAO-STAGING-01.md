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

### Continuación sobre staging 198b4e4 — 28/10/2026

Este apartado actualiza el estado y prevalece sobre los pendientes de instalación
descritos más abajo. Base exacta: 198b4e41d89c373c7aebda23ee20700643ce339c;
candidato original: 4d5563899bc327f3c272ef13625ebffc3cc96b46, con base común
6d89888804ffa4e2ba7635878c88eaf7f3b9c997. Los cuatro commits posteriores de staging
aportan MIGRATIONS-01 y se conservan íntegros; los once archivos del candidato
no colisionan con ellos. Reconciliación exclusivamente local, sin integración remota.

Hechos comunicados por el propietario: SQL14 instalado y fila b1_sql14 con
checksum/procedencia verificados; evidencia privada
/var/tmp/cleanops-sql14-install-bxwe9_e3. Bao inicializado, desellado y auditoría
verificada. No se ha leído esa evidencia desde este entorno. Backend cerrado,
sin usuarios de prueba ni CRM instalado. SQL14 NO vuelve a instalarse ni se
ejecuta el perfil foundation contra esta base.

QG-0 adicional: mismo objetivo y recorrido privados del inventario inferior;
reutilizar createOpenBaoKeys, withB1Custody, createCustodyDeadlinePool y
createPgIdentityUnitOfWork. Revisados además SQL14, MIGRATIONS-01, runtime,
AUTHENTICATION_SPEC, ROADMAP, IMPLEMENTATION_GATES y KEY_OPERATIONS. El delta
adicional modifica solo openbao-keys y su test: token y GET KV comparten un
deadline monotónico; un token tardío no abre red aunque su promesa gane al timer.
Corrección posterior a revisión independiente del patch af1f15677f3804ee88e854c207b603fd9bab301e021154714e01b66839e179d8:
el handler KV end vuelve a comprobar ese deadline después de validar/decodificar
y antes de resolver la clave. Si el event loop retrasa el timer, rechaza el
material tardío y catch/finally borran clave decodificada, respuesta agregada y
chunks; no inicia work ni una lease nueva. Regresión adicional con token inmediato
y end posterior al plazo con timer impedido, en la misma suite canónica.
No se cambian contratos de lease/COMMIT, permisos, API, R4, CRM ni configuración.
Prueba negativa de event-loop bloqueado y suites existentes, sin PG/Bao reales.

#### Valores no secretos propuestos, todavía no aprobados

| Campo | Propuesta | Fuente / restricción |
|---|---|---|
| Base PG | cleanops_staging | RESOURCE_RECORD; conservar instalación |
| Identidad PG efectiva | cleanops_identity_service | Rol SQL14 NOLOGIN; conexión dedicada requiere decisión DBA |
| Broker | cleanops_auth_broker NOLOGIN | SECURITY DEFINER existente; nunca identidad de conexión |
| Mount / entorno | b1-keys / staging | Renderer existente; contrastar mount real antes de aplicar |
| Workload | identity-verifier | AppRole separado de administrador/issuer/mail-worker |
| Token TTL / máximo | 300 / 900 segundos | Propuesta operativa, no valor normativo de sesión |
| SecretID TTL / usos | 300 segundos / 1 uso | Renderer; nueva entrega para cada autenticación |
| timeoutMs / lifetimeMs | 5000 / 10000 | Adquisición por clave / lease SQL, ambos ≤30000 |
| HMAC | audit-hmac, otp-hmac, recovery-hmac, cursor-hmac | Cuatro claves distintas de 32 bytes por tenant |
| TOTP | totp-aead, 32 bytes | Versión exacta, envelope v2 y AAD existentes |

No hay UUID, key ID, versión o CIDR operativo propuesto: los de tests son
fixtures. El catálogo aprobado debe fijar tenant UUID, propósito, key ID
inmutable, versión KV entera y correspondencia con key_version de ciphertext.
El renderer fija mount b1-keys: si el mount observado difiere, revisar el punto
canónico antes de emitir políticas; no sustituirlo silenciosamente en runtime.
KV policy limita paths, no versiones: el cliente exige además la versión exacta.
Para login y bootstrap se necesita una decisión explícita de alcance server-side
del tenant inicial; no aceptar tenant de headers/body ni una clave global.

#### Decisiones pendientes que impiden conectar el runtime

1. DBA: elegir autenticar directamente cleanops_identity_service (cambiar NOLOGIN
   exige aprobación) o una identidad LOGIN separada con membresía mínima aprobada.
   Revisar herencia/SET ROLE efectivo y permisos transitivos en PG16. No conceder
   cleanops_auth_broker, cleanops_bootstrap, owner, SUPERUSER o BYPASSRLS, ni acceso
   directo a tablas. Fijar TLS/CA/SAN o socket y canal privado de credencial.
   El catálogo inferior consulta el rol contractual; si se elige otro login,
   ampliar esa misma consulta para inspeccionar también su cadena efectiva.
2. Operaciones/seguridad: administrador nominal y recuperación independientes del
   token inicial, identidad mTLS propia, mount AppRole, DNS/CA/SAN/CIDR observados,
   entrega de SecretID wrapped y token-helper/agente aprobado. No hay lifecycle
   AppRole productivo implementado: token() es un punto de inyección, no un login.
3. Lifecycle propuesto: helper privado desenvuelve una sola vez, autentica AppRole,
   entrega token service solo en memoria y sin default policy. Reautenticar antes
   de 300 s con NUEVO SecretID; no reutilizar el de un uso. Fallo/expiración/revocación
   deniega nuevas lecturas; no root fallback ni reintento de SQL. Revocar token y
   accessor saliente tras rotación/drenaje y al retirar workload. Renovación
   automática no se presupone: el renderer no concede renew-self y no se amplía
   policy para hacerlo. Aprobar mecanismo/helper, margen y revocación antes de
   implementar su consumidor en runtime; no crear otro cliente Bao paralelo.
4. Provisión: tenant y primer actor autorizado, canal de invitación/correo, política
   de tenant, passwordAdmission/normalización, dummy Argon2, issuer TOTP y catálogo
   de escritura/lectura. Ni SQL14 ni Bao healthy crean esos datos/configuración.
5. Composición: ingress confiable para transport(), labels y fix mínimo de actividad
   autenticada descrito abajo. Revisión de todos los inputs y pruebas privadas
   antes de sustituir closedBackend tanto en bootstrap como en handleAuth.

#### Primer usuario con TOTP: dependencia exacta de R4

No se ha identificado un mecanismo aprobado de bootstrap del primer actor/tenant
en staging. Los fixtures nativos no lo sustituyen. El flujo existente de R4 para
una identidad nueva es: actor ACTIVE con create/users y step-up → emisión de
invitación con reserva one-time y outbox → entrega privada del enlace →
POST /auth/invitations/prepare (password y capability/CSRF) →
POST /auth/invitations/factor (primer código TOTP, CAS del contador) →
POST /auth/invitations/accept (capability/CSRF e Idempotency-Key) → alta atómica
y auditoría → login B1 normal y verificación MFA. Preparar/mostrar QR no activa MFA.

Prerequisito concreto: revisar e integrar por separado el linaje R4/AUD-031
codex/r4-aud-031 en 9a4c8b90a159f2853f040dc5597042c17408da00, sus dependencias
SQL1–SQL4/B2 y SQL5 candidato correspondiente, manifests/hashes y autorizaciones
vigentes, sin repetir SQL14. Revalidar ese ref antes de autorizar: no se afirma
que siga siendo HEAD. UI → invitation-acceptance-http → accept debe propagar
Idempotency-Key, digest vinculado y correlation hasta
auth_api.consume_invitation_acceptance(text,text,bytea,uuid). Exigir efectos,
consumo y auditoría atómicos y recibo recuperable, incluidos replay/concurrencia.
La variante histórica de tres argumentos y las autorizaciones para PG16 efímero
no autorizan staging persistente. Conservar guards/callers AUD-031 fijados.
SQL14 por sí solo no incluye esa cadena. Además debe aprobarse expresamente la
creación inicial de tenant/actor; R4 presupone un emisor autorizado y no resuelve
por sí solo ese arranque. Ningún INSERT manual de principal, password, usuario,
rol o mfa_methods forma parte de esta entrega.

#### Operaciones remotas que requerirán autorización posterior

La lista define alcance; los destinos pendientes deben concretarse en el paquete
firmado antes de ejecutar. No es una autorización ni una receta ejecutable con
identidades inventadas.

| Orden | Operación exacta / artefacto | Condición y resultado requerido |
|---|---|---|
| A1 | psql del runtime-catalog.review.sql, comando inferior | Aprobar hash, conexión lectora y salida privada; solo catálogos |
| A2 | Plan B1 del migrate-postgres existente, --plan --profile=b1 | Conexión lectora aprobada; confirmar b1_sql14 y procedencia sin aplicar SQL |
| B1 | Establecer autenticación PG dedicada y comprobar rol efectivo | DDL/auth exactos pendientes de opción DBA; aprobación separada de A1/A2 |
| B2 | Autenticación admin Bao independiente y prueba de capacidades/recuperación | No reinit/unseal; no depender del token inicial para sobrevivir a su revocación |
| B3 | Aplicar policies y AppRole identity-verifier del renderer | Inputs y hashes aprobados; no instalar server.json, mount/config ni roles extra |
| B4 | Crear solo claves tenant/purpose/ID ausentes con CAS aprobado | CSPRNG en custodia; ningún overwrite, latest fallback o clave en chat/Git |
| B5 | Emitir SecretID wrapped, unwrap/login workload y probar alcance/TTL/revocación | Canal/helper y mTLS aprobados; negativos otro tenant/purpose/versión |
| B6 | bao token revoke -self en sesión aislada del token inicial | Solo tras comprobar admin/recovery y workload independientes; verificar revocación |
| R4 | Instalar incrementales R4 revisadas y provisionar primer actor/invitación/TOTP | Autorizaciones específicas persistentes, correo y mecanismo inicial todavía pendientes |
| C | Build/despliegue selectivo web y recorrido bootstrap/login/TOTP/sesión | Solo tras parche runtime completo revisado y pruebas; no autorizado aquí |

No hay comando de B1/R4/C seguro que completar sin esas decisiones; proporcionar
SQL de alta o un deploy genérico ahora fingiría un paquete autorizado. A1 y el
renderer offline sí tienen comandos canónicos abajo. A2 requiere DATABASE_URL
inyectada privadamente y no imprimir su valor. Cada ejecución futura registra
SHA/artefacto, aprobación, hora, resultado y evidencia privada redactada.
CRM y AUD-031 conservan código, estado y gates; sesión válida no habilita CRM.


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

## Diseño operativo recomendado — continuación documental de a6d2f45

Estado: PROPUESTA PARA APROBACIÓN, NO IMPLEMENTADA NI EJECUTABLE COMO RUNBOOK.
Este apartado concreta y sustituye las alternativas abiertas de la preparación
anterior; no concede autorización. HEAD/base siguen en
198b4e41d89c373c7aebda23ee20700643ce339c. Antes de escribir este diseño se verificó
que git diff HEAD --binary coincidía exactamente con el patch revisado
a6d2f45ac2bd3e83324d4b0a7c5a7a10de5d7bc812104d7c35c67b507442e5c3.
Ese patch se conserva sin modificar y se incluye separadamente en el ZIP.
GitHub revalidado en lectura: staging=198b4e41d89c373c7aebda23ee20700643ce339c,
prep/staging-runtime-custody-01=4d5563899bc327f3c272ef13625ebffc3cc96b46,
codex/r4-aud-031=9a4c8b90a159f2853f040dc5597042c17408da00.
La referencia CRM 09c578137860cfc3726e67a21304a228c0657061 se conserva como
referencia histórica; no se afirma que sea una rama remota revalidada.

### QG-0: alcance, inventario y recorrido elegido

Objetivo: diseño verificable de login → TOTP → sesión, REQ-AUTH-001/002/021,
aislamiento tenant y custodia, sin modificar decisiones de producto ni runtime.
Fuente de autoridad: Product Master/SRS, AUTHENTICATION_SPEC, gates y política
de ingeniería. Inventario leído y decisión de reutilización:

| Responsabilidad | Fuente inspeccionada | Decisión |
|---|---|---|
| Rol contractual y ACL | SQL14 schema.review.sql, líneas 9–25, 774–800 y grants posteriores | Conservar NOLOGIN y funciones; no duplicar grants |
| Consumidor PG | pg-identity-driver.ts, v4-broker.ts, approved-backend.ts | Herencia de permisos al LOGIN, sin SET ROLE ni segundo pool |
| Presupuesto/limpieza | openbao-keys.ts, custody-composition.ts, custody-deadline.ts | Preservar íntegro el código revisado |
| ACL/AppRole | prepare-b1-openbao.py y operational-acceptance/openbao/README.md | Renderer canónico para políticas de datos y roles de workload |
| Login Bao sintético | openbao-isolated-worker.mjs y openbao-b1-integration.ts | Solo referencia de protocolo; root de fixtures nunca se reutiliza |
| Bootstrap web | runtime.ts, proxy.ts y auth_api.bootstrap_csrf | Solo vínculo anónimo/CSRF, no aprovisiona identidad |
| Bootstrap infraestructura | compose.yaml, SQL14 y migrate-postgres.mjs | Infra/DDL/historial; no crea actor empresarial |
| Provisión/aceptación | linaje R4 fijado; invitation-acceptance.ts, SQL4 y SQL5 AUD031 | Reutilizar aceptación solo después de un emisor inicial legítimo |

Ruta propuesta: LOGIN PG dedicado → permisos heredados auth_api → SECURITY
DEFINER broker → contexto autenticado; claves exactas del tenant desde KV mediante
token operativo en memoria → withB1Custody → transacción con deadline. El
supervisor de credenciales controla disponibilidad; nunca elige tenant desde HTTP.
Diff de ESTE encargo: solo los dos documentos existentes de procedimiento y
evidencia. SQL/policies siguientes son material de revisión embebido, no nuevas
migraciones ni configuración instalada. Dueños propuestos: DBA (PG), custodio
(Bao/distribución), propietario (primer actor), mantenedor B1 (composición).

### PG: conservar NOLOGIN con un LOGIN dedicado y herencia explícita

Recomendación: cleanops_staging_identity_login como credencial de conexión,
miembro únicamente de cleanops_identity_service con INHERIT TRUE, SET FALSE,
ADMIN FALSE en PG16. El nombre es propuesto, no observado. El rol contractual
NOLOGIN/NOINHERIT de SQL14 no se altera. INHERIT de una membresía es independiente
de la posibilidad SET ROLE; en PG16 hay que inspeccionar inherit_option y
set_option, no inferirlos del atributo rolinherit. El NOINHERIT del rol destino
no impide heredar sus permisos propios, pero no debe tener membresías transitivas.

Fuera de SECURITY DEFINER, session_user=current_user=LOGIN dedicado; funciones
SECURITY DEFINER usan su owner revisado cleanops_auth_broker dentro de la función.
La búsqueda de session_user/current_user/current_role en SQL14 no encontró una
dependencia que exija autenticar como el rol contractual. v4-broker no ejecuta
SET ROLE, y su runner conserva una conexión/transacción. Esta opción funciona
con esa composición sin añadir inicializadores asíncronos al pool. Heredar EXECUTE
no permite SELECT/INSERT/UPDATE/DELETE en tablas cuyo acceso SQL14 revoca.
El LOGIN puede invocar todo EXECUTE concedido al rol contractual: este diseño
no pretende limitarlo solo a tres endpoints; reducir ese contrato sería otro cambio.

Alternativas comparadas:

| Opción | Efecto | Decisión |
|---|---|---|
| LOGIN separado, INHERIT TRUE / SET FALSE | Credencial y revocación separadas; reutiliza ACL; sin estado SET ROLE en pool | Recomendada |
| LOGIN NOINHERIT, INHERIT FALSE / SET TRUE | Necesita SET LOCAL ROLE por transacción y también en bootstrap; más estado y pruebas | Descartada para este incremento |
| ALTER ROLE cleanops_identity_service LOGIN | Evita membresía pero cambia contrato SQL14 y mezcla autenticación/ACL | Descartada mientras la herencia basta |
| Copiar grants al LOGIN | Duplica ACL y deriva con futuras migraciones | Descartada |

SQL propuesto PG-P1, NO EJECUTADO. Destino exclusivo cleanops_staging/PG16 del
VPS existente; sesión DBA aprobada, nunca conexión web. El rol debe estar AUSENTE;
CREATE sin IF NOT EXISTS evita adoptar uno ajeno. Revisión previa exige verificar
ACL, owners y membresías del rol contractual, incluida ausencia de caminos hacia
broker/bootstrap/owner, roles predefinidos privilegiados o BYPASSRLS. Abort ante
discrepancias. No se ejecuta directamente este bloque desde el documento.

```sql
-- PG-P1: PROPOSED, NOT EXECUTED. Credential provisioning is deliberately absent.
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
CREATE ROLE cleanops_staging_identity_login LOGIN INHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 4 PASSWORD NULL;
GRANT cleanops_identity_service TO cleanops_staging_identity_login
  WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT CONNECT ON DATABASE cleanops_staging TO cleanops_staging_identity_login;
ALTER ROLE cleanops_staging_identity_login IN DATABASE cleanops_staging
  SET search_path = pg_catalog;
COMMIT;
```

PASSWORD NULL no entrega una credencial ni habilita una conexión SCRAM utilizable.
Propuesta: password SCRAM-SHA-256 exclusiva, entregada después por mecanismo
privado DBA al gestor de secretos del servicio; lectura en memoria al crear Pool,
nunca DSN con password en argv/env de Compose/build/log ni archivo en Git.
No elegir la contraseña de cleanops_bootstrap ni usar su archivo Compose.
Rotación exige crear nuevas conexiones y drenar las antiguas; alterar password
no mata sesiones abiertas. Retirada: impedir LOGIN, terminar solo sesiones del
LOGIN identificado tras drenaje autorizado y revocar su membresía; no borrar datos.

Transporte recomendado: TCP en red privada existente con TLS verify-full y SAN
DNS postgres, CA privada separada del secreto de autenticación. Pool usa host
postgres, database cleanops_staging, user dedicado, ssl con CA y verificación
de nombre, sin rejectUnauthorized=false; máximo propuesto 4 conexiones.
HBA futura, antes de conexiones web: hostssl con DB y LOGIN exactos, CIDR efectivo
de web aprobado y scram-sha-256; rechazar ese LOGIN desde otras bases/orígenes
con reglas ordenadas ANTES de reglas generales. El CIDR debe observarse, no usar
una IP del documento como autorización. Verificar que no haya ruta hostnossl/trust.
Faltan TLS/HBA/certificados PG observados: el Compose actual no los acredita.
Es otro parche/config de infraestructura con aprobación; no se toca Compose hoy.
Socket Unix exigiría un mount/permiso nuevo entre contenedores y peer mapping;
no ofrece ventaja suficiente frente a la red privada existente. No proponer
plaintext por el mero hecho de que la red sea interna.

Verificaciones PG-P2 propuestas, NO EJECUTADAS: primera mitad con lector de
catálogo; segunda con el LOGIN una vez provisionado, en transacción READ ONLY.
No se llama ninguna función empresarial ni se leen tablas de aplicación.

```sql
-- PG-P2: PROPOSED, NOT EXECUTED, catalog inspection in cleanops_staging / PG16.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT current_database(), current_user, session_user;
SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreaterole,
       rolcreatedb,rolreplication,rolconnlimit
FROM pg_catalog.pg_roles
WHERE rolname IN ('cleanops_identity_service','cleanops_staging_identity_login');
SELECT parent.rolname AS granted_role,member.rolname AS member_role,
       m.admin_option,m.inherit_option,m.set_option
FROM pg_catalog.pg_auth_members m
JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid
JOIN pg_catalog.pg_roles member ON member.oid=m.member
WHERE member.rolname IN ('cleanops_staging_identity_login','cleanops_identity_service');
WITH RECURSIVE reachable(oid) AS (
 SELECT oid FROM pg_catalog.pg_roles WHERE rolname='cleanops_staging_identity_login'
 UNION
 SELECT m.roleid FROM pg_catalog.pg_auth_members m JOIN reachable r ON m.member=r.oid
)
SELECT p.rolname,p.rolsuper,p.rolbypassrls,p.rolcreaterole,p.rolcreatedb
FROM reachable r JOIN pg_catalog.pg_roles p ON p.oid=r.oid;
SELECT n.nspname,c.relname
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('app','identity_private') AND c.relkind IN ('r','p','v','m','f')
AND (has_table_privilege('cleanops_staging_identity_login',c.oid,'SELECT')
 OR has_table_privilege('cleanops_staging_identity_login',c.oid,'INSERT')
 OR has_table_privilege('cleanops_staging_identity_login',c.oid,'UPDATE')
 OR has_table_privilege('cleanops_staging_identity_login',c.oid,'DELETE')
 OR has_any_column_privilege('cleanops_staging_identity_login',c.oid,'SELECT')
 OR has_any_column_privilege('cleanops_staging_identity_login',c.oid,'INSERT')
 OR has_any_column_privilege('cleanops_staging_identity_login',c.oid,'UPDATE'));
SELECT pg_has_role('cleanops_staging_identity_login','cleanops_identity_service','USAGE') AS inherits,
       pg_has_role('cleanops_staging_identity_login','cleanops_identity_service','SET') AS can_set,
       has_schema_privilege('cleanops_staging_identity_login','auth_api','USAGE') AS api_usage,
       has_function_privilege('cleanops_staging_identity_login','auth_api.bootstrap_csrf(bytea,bytea)','EXECUTE') AS bootstrap_exec;
SELECT ssl,version,cipher FROM pg_catalog.pg_stat_ssl WHERE pid=pg_backend_pid();
COMMIT;
```

Esperado: solo membresía LOGIN→identity, true/false/false para herencia/SET/admin;
reachable solo esos dos roles; búsqueda de acceso a tablas devuelve cero filas;
inherits=true, can_set=false, api_usage/bootstrap_exec=true; TLS ssl=true al
inspeccionar desde el LOGIN. Comparar además TODOS los EXECUTE efectivos con
los del rol contractual y PUBLIC: usar catálogo inferior ampliando el rol lector,
no solo el ejemplo bootstrap_exec. Auditor DBA revisa privilegios de columnas,
secuencias y ownership si el catálogo remoto revela objetos fuera de SQL14.
Pruebas negativas futuras autorizadas: SET ROLE a identity/broker/bootstrap/owner
debe fallar; SELECT y mutación de tablas deben fallar en transacciones revertidas;
DB/origen incorrectos y TLS sin CA deben rechazar conexión. No ejecutadas ahora.

### Bao: distribución independiente y lifecycle sin renew-self

Recomendación operativa: un distribuidor de SecretID en el host, identidad nominal
cleanops-staging-secretid-distributor, separado de web y del administrador. Usa
el CLI oficial Bao ya seleccionado por el proyecto como único transporte de
autenticación/control; createOpenBaoKeys sigue siendo el único lector KV de B1.
Un supervisor local recibe credenciales por pipe/Unix socket y alimenta token()
desde memoria. No implementar un segundo cliente HTTPS Bao en TypeScript.
El CLI disponible y su ejecución privada fuera de stdout de Docker deben
verificarse; no se da por instalado en el host porque exista en una imagen.

| Mecanismo | Ventaja / límite | Resolución |
|---|---|---|
| Operador entrega wrapping con CLI | Aprovecha operación humana; cada reauth depende de presencia manual | Útil para ensayo acotado, no servicio continuo |
| Bao Agent auto-auth/sink | Herramienta oficial; no elimina quién suministra SecretID nuevo; sink/renewal requieren diseño | No adoptarlo implícitamente como lifecycle ya existente |
| Harness h.root | Ya muestra unwrap/login y negativos sintéticos | Prohibido operacionalizar root o fixtures |
| Distribuidor host con auth/cert y supervisor en memoria | Entrega repetible independiente de root; privilegio y componentes explícitos | Recomendada, componentes aún ausentes |

Autenticación propuesta del distribuidor: método auth/cert dedicado
auth/cleanops-staging-distributor, certificado clientAuth emitido por CA de
control custodiada fuera del web, sujeto/SAN nominal fijado en el registro cert,
CIDR de host exacto, policy única sin default, TTL de token distribuidor 120 s,
máximo 120 s y certificado 24 h para staging (valores a aprobar). Clave del
certificado solo proceso/UID del distribuidor, archivo privado fuera de checkout,
no montaje web. La CA admin y la aprobación de emisión/revocación permanecen
humanas. El mTLS del listener NO habilita auth/cert: hay que configurar y probar
ese método/binding por separado. TLS de transporte y autenticación de Bao son
dos verificaciones distintas, aunque se entregue un certificado autorizado para
ambas explícitamente. Revocar binding/certificado y tokens emitidos ante incidente.

El administrador nominal configura una vez el método cert, binding y policies
y el AppRole con el renderer. Su método humano/recuperación independiente sigue
requiriendo aprobación nominal antes de revocar el token inicial. Una vez
comprobado, el distribuidor obtiene cada token de 120 s mediante cert; no conserva
token root ni SecretID propio ni una cadena de tokens hija del token inicial.
El certificado es su raíz de autenticación renovable por el custodio; no se oculta
ese secreto de larga duración bajo la palabra «sin credenciales».

Policy propuesta del distribuidor, no instalada, un stanza por workload real:

```hcl
# BAO-B1: template for review, NOT executable until the two segments are bound.
path "auth/<approved-approle-mount>/role/<exact-rendered-role>/secret-id" {
  capabilities = ["update"]
  min_wrapping_ttl = "60s"
  max_wrapping_ttl = "60s"
}
```

No permiso role-id (RoleID público se entrega como config aprobada), ni role
update, policies, LIST, KV, sys/*, root generation, renew-self o token creation.
Emitir SecretID es poder obtener tokens de ese workload: distribuidor es parte
de su frontera de confianza, no un rol inocuo. El path se concreta con nombre
b1-staging-<tenant-uuid>-identity-verifier del renderer; mount AppRole debe
observarse y aprobarse. Enrollment-issuer tiene stanza/identidad separada si se
autoriza primera provisión, nunca permisos sumados al verifier web.
La extensión de policy de control no la produce hoy prepare-b1-openbao.py:
mantener el renderer canónico y revisar su punto de extensión antes de implementar;
no copiarlo ni instalar los otros outputs server.json/mount/snapshot como efecto lateral.

Protocolos recomendados, todos pendientes de implementación/aprobación:

1. Arranque: supervisor sin token, admisión B1 cerrada. Autentica el distribuidor
   por cert con CLI oficial; identidad del solicitante workload comprobada por
   UID/peer credentials del socket, environment/tenant/workload desde configuración
   fija, nunca valores de una request HTTP. Un wrap por proceso/generación.
2. Distribuidor solicita SecretID nuevo con wrapping 60 s y SecretID TTL 300 s,
   num_uses=1; guarda accessor/control de entrega en memoria privada, no SecretID
   sin wrapping. Entrega wrapping token por canal local autenticado solo al UID
   receptor previsto. Nada en argv/env, URLs, journal/stdout compartido o CI.
3. Supervisor usa CLI privado por stdin/config seguro para unwrap una sola vez y
   AppRole login (RoleID fijo + SecretID recién obtenido). Parser de la respuesta
   exige client_token, accessor, TTL positivo ≤300 y policies exactas sin default.
   Descarta strings/raw de unwrap/login tras uso; no se promete zeroization de JS.
   El token operativo se mantiene solo en memoria; token() no ejecuta login por
   cada clave: devuelve la generación vigente bajo deadline monotónico comprobado.
4. Caducidad conservadora: medir t0 antes del login, valid_until=t0+lease_duration
   menos margen 10 s; TTL propuesto 300/max900, reauth a los 240 s. No extenderlo
   por reloj de pared ni confiar solo en timers. Un único refresh en vuelo evita
   emitir varios SecretID por peticiones simultáneas. Nunca reutilizar SecretID.
5. Reauth: distribuidor vuelve a autenticarse por cert para cada emisión; nuevo
   wrapping, unwrap/login nuevo. Si pierde respuesta de unwrap/login, no reusar
   su SecretID: marcar generación incierta, registrar incidente sin secretos,
   emitir otra y dejar expirar/revocar lo conocido. El límite TTL acota el token
   huérfano cuyo accessor no se recibió; no afirmar revocación inmediata imposible.
6. Drenaje: publicar nueva generación solo tras validación completa; congelar
   nuevas adquisiciones con la vieja, esperar a que sus lecturas KV en curso
   finalicen, con cota 5 s por lectura. Claves ya prestadas siguen exclusivamente
   la lease SQL de 10 s y limpieza/COMMIT existentes; revocar un token Bao no
   puede retirar de memoria una clave ya leída ni revertir un COMMIT confirmado.
7. Expiración/fallo: sin generación válida, token() falla 503; no root fallback,
   no latest ni caché de claves. Si refresh falla, usar la vieja solo hasta el
   límite conservador; llegada al límite bloquea nuevas adquisiciones, no renueva.
   Supervisor verifica reloj en cada entrega, no solo al recibir una señal timer.
8. Revocación: no se añade renew-self al workload. Administrador/control plane
   separado registra y revoca accessors de tokens retirados mediante su permiso
   aprobado auth/token/revoke-accessor, y destruye SecretID no consumidos por su
   endpoint de accessor del rol exacto. Ese permiso de tokens no es role-scoped:
   NO se concede al distribuidor de mínimo privilegio. En operación normal, si no
   hay admin presente, token viejo queda drenado y caduca ≤300 s; no denominar
   esto revocación inmediata. Para incidente se exige intervención admin y bloqueo
   de nueva admisión; si se exige revocación automática inmediata, aprobar antes
   un revocador control-plane y su riesgo adicional, ausente en este diseño mínimo.
9. Reinicio: memoria vacía, generation counter nuevo, no leer token de disco ni
   wrapping de un arranque anterior. Distribuidor identifica nueva instancia y
   emite nuevo SecretID; accessors previos se revocan por administración o expiran.
   Retirada programada drena, cierra admisión, solicita revocación de accessors y
   deshabilita emisión/cert del servicio retirado. Caída abrupta depende del TTL.

Componentes REALMENTE ausentes: distribuidor autenticado por cert, canal local
con peer credentials, supervisor/slot token en memoria y drenaje, binding cert y
policies de control, integración token() y observabilidad sin secretos. No se
implementan en esta tarea documental. El CLI debe llamarse sin command substitution
con credenciales ni logs de respuestas: todavía no hay helper privado aprobado,
por eso no hay una línea shell segura de unwrap/login que se pueda ejecutar hoy.
La propuesta no declara esos componentes desplegados por la existencia del renderer.

### Primer tenant/actor: contrato mínimo a aprobar, no un seed

Búsqueda realizada en Product Master/SRS, AUTHENTICATION_SPEC, DATA_MODEL,
ROADMAP/gates, lib/scripts/docs y git log --all por bootstrap/provision/invitation;
también grep del árbol R4 fijado. No se encontró un mecanismo aprobado de creación
del primer tenant y actor. Esta conclusión se limita a esos árboles/historial
disponibles; un procedimiento privado del propietario no se supone inexistente.
SRS exige seed data para pruebas, no autoriza insertar un administrador persistente.
0001_system_status crea public.organizations y metadatos de Foundation; no es
app.organizations ni provisioning B1. bootstrap_csrf crea el vínculo anónimo y
su protección CSRF; compose/SQL14/journal preparan infraestructura. Ninguno crea
principal, password, pertenencia ni factor del primer actor.

SQL4 R4 exige created_by con FK a app.users y actor ACTIVE/create/users/step-up.
No sirve para crear al mismo emisor que exige. Recomendación: contrato separado
FIRST-ACTOR-01 de ceremonia de control plane de ejecución única, sin endpoint
público, que crea UN tenant y UN actor SENSITIVE con TOTP confirmado. Después
entra por la UI B1 existente, sin sesión automática ni invitación autorreferente.
Así el recorrido inicial recomendado NO depende de R4. Esta es una propuesta
normativa nueva: aprobar antes de escribir función, migración o ejecutor.

Contrato mínimo propuesto, con estado durable y recuperación:

| Elemento | Propuesta concreta para aprobación |
|---|---|
| Alcance | Una instalación staging identificada por DB/baseline b1_sql14, un tenant, un principal/email verificado por custodio y un user SENSITIVE |
| Autoridad | Propietario firma aprobación ligada a deployment_id, operation_id y hash del manifiesto no secreto; operador nominal distinto de identidad web |
| Inputs públicos | UUIDs de operación/tenant/user/method, nombre tenant, referencia privada de destinatario, política y key ID/version, límites, aprobaciones y expiración |
| Inputs privados | Password elegido por destinatario vía canal seguro; hash Argon2 con política B1, TOTP generado/cifrado dentro de custodia, primer proof; nunca archivos de fixtures |
| Acceso | Ejecutable local privado futuro, no ruta HTTP; login provisioning exclusivo con EXECUTE solo en funciones FIRST-ACTOR, sin tablas ni membresía broker/owner |
| Persistencia | Nueva incremental revisada por mecanismo canónico, no editar ni volver a aplicar SQL14; función SECURITY DEFINER con owner/ACL mínimos revisados |
| Antirreplay | Singleton por deployment más operation_id único, request digest vinculado a inputs inmutables, bloqueo transaccional y restricción UNIQUE; mismo id/hash recupera recibo, id/hash distinto rechaza |
| Estados | PREPARED sin autoridad empresarial → FACTOR_CONFIRMED → COMMITTED terminal; ABORTED/EXPIRED sin login; TTL propuesta 10 min |
| Factor | Reutilizar prepareTotpEnrollment/openEnrollmentSecret/verifyTotpFactor y AES-GCM/AAD exactos; activar solo tras primer código y CAS de contador |
| Efecto único | Commit de tenant, policy_versions, principal, credential, pertenencia SENSITIVE, método TOTP confirmado y recibo/auditoría en una transacción |
| Privilegios negocio | Solo reglas B1 self-service enumeradas y aprobadas; ningún Super Admin/grant universal por nombre; create/users posterior requiere aprobación separada |
| Auditoría | SYSTEM/actor_id NULL hasta existir actor, operador y aprobación identificados mediante referencias no secretas; correlation/operation/request digest, IDs, transición y resultado; sin password, hash password, proof, URI, ciphertext o claves en logs |
| Resultado | Recibo no secreto con IDs, estado, manifest digest y referencia de auditoría; jamás cookie ACTIVE, password, TOTP o token Bao |

PREPARED debe ser un registro de ceremonia privado sin usuario/principal ACTIVE.
Antes de COMMITTED solo hay material efímero/cifrado y evidencia de primer factor;
ninguna fila de sesión o permiso empresarial. El escritor futuro comprobará que
no exista otro tenant/actor inicial y fijará el estado global bajo lock. Los
intentos/denegaciones previos se auditan por canal control-plane autenticado, ya
que aún no existe tenant; tras commit, evento en app.audit_logs forma parte de
la misma transacción. Si auditoría durable falla, no confirmar creación.

Resultado incierto: cerrar admisión y no volver a generar identidades, password,
TOTP ni ejecutar operación nueva. Consulta status(operation_id,manifest_digest)
de solo lectura bajo misma identidad de provisioning devuelve recibo COMMITTED,
PREPARED pendiente o ABSENT tras resolver la transacción original. Una conexión
perdida no demuestra rollback: esperar/inspeccionar lock/transacción por DBA con
autorización. Solo ABSENT confirmado permite reintento del MISMO manifiesto; hash
distinto se rechaza. Recibo idéntico no expone secretos ni reemite QR/recovery.
Concurrentes: restricción singleton y lock hacen que solo un commit gane, el otro
obtiene recibo o conflicto sin efecto adicional. Expiración invalida capacidad;
no limpia evidencia terminal ni permite volver a crear un segundo primer actor.

Después del commit, cerrar permiso de escritura de provisioning (revocar EXECUTE
y LOGIN de su credencial temporal), conservar status/recibo mediante lector
separado y completar verificación negativa de ejecución repetida. La protección
singleton sigue aunque un administrador reotorgue accidentalmente EXECUTE.
Si la credencial/TOTP se pierde tras commit, procedimiento posterior de recuperación
de cuenta con revocación y auditoría; nunca resetear singleton ni borrar actor.
Recovery codes: reutilizar ceremonia B1 aprobada cuando corresponda; aprobación
de este contrato debe fijar su entrega única segura y recibo, no regenerarlos al
consultar status. No existe hoy función/protocolo FIRST-ACTOR en el repositorio.

### Dependencia R4 exacta y alternativa limitada

Ruta recomendada para primer actor: FIRST-ACTOR-01 aprobado/implementado/validado
→ login B1 normal → TOTP → sesión. No requiere cerrar directorio, cambios de
usuarios, correo de invitaciones ni toda R4. Requiere revisar política B1,
deployment_enabled y conexión runtime por separado; la ceremonia NO pone
deployment_enabled=true ni cambia closedBackend. SQL14 require_enabled rechaza
si esa configuración no está autorizada; healthy PG/Bao no la habilita.

Para un SEGUNDO usuario mediante invitación o si el propietario exige ese canal
después de crear un emisor legítimo: slice de emisión SQL4 y aceptación SQL5
AUD-031, no todo R4. Prerrequisitos concretos: actor con create/users, step-up y
contexto B1; política invitation_policy explícita del tenant; outbox/dispatch
aprobados y issuer TOTP de escritura separado; UI/HTTP/broker acceptance. SQL5
AUD031 consume cuatro args, no el r3 de tres args. Artefacto exacto:
docs/proposals/b2-invitations/005-invitation-acceptance.aud031-candidate.review.sql
en 9a4c8b90a159f2853f040dc5597042c17408da00, SHA256
06156e11e460102cae3568b0cf58d53b8b7638293d8b712d11fd86a379e65471;
manifest sql5-aud031-candidate-manifest.review.json del mismo árbol. Revisar
SQL1/SQL2/SQL3 como dependencias de definiciones/ACL de esa composición, trasladar
solo las necesarias en incremental contra SQL14 YA instalado; no ejecutar el
stack histórico de tests para instalar una base persistente. No se certifica
ese recorte de migración antes de revisar sus bytes y catálogo observado.
Idempotency-Key UI→HTTP→accept, digest y correlation→
auth_api.consume_invitation_acceptance(text,text,bytea,uuid) atómico se preservan.
AUD-031 y sus callers/guards no se vuelven a ejecutar ni modificar en esta tarea.
La autorización efímera SQL5 no autoriza estas escrituras en staging.

### Orden operativo y decisiones acotadas del propietario

| Paso | Clase / entorno | Material o acción futura | Condición |
|---|---|---|---|
| O1 | OFFLINE, workspace | Congelar manifiesto tenant/key/roles y revisar PG-P1/PG-P2 y BAO-B1 | Sin credenciales; hoy solo diseño |
| O2 | LECTURA, VPS PG16 existente | runtime-catalog y PG-P2 anterior al alta (consultas del rol nuevo solo tras existir); inspeccionar HBA/TLS y ACL exactos | Autorización de lectura y salida privada; rol ausente no prueba permisos |
| O3 | LECTURA, VPS Bao existente | Mounts/auth methods/binding/TTL/capabilities/auditoría; no GET de secretos | Selección exacta de APIs y lector aprobados; no init/unseal |
| O4 | ESCRITURA, control plane PG | PG-P1, SCRAM privado, HBA/TLS y negativos | Revisión DBA de bytes/config; no ejecutar desde este documento |
| O5 | ESCRITURA, control plane Bao | Admin independiente, cert distributor, ACL/AppRole del renderer, claves exactas faltantes | Inputs/hashes/policies aprobados; root inicial retirado solo después de independencia comprobada |
| O6 | IMPLEMENTACIÓN OFFLINE futura | Supervisor/distribuidor/canal y FIRST-ACTOR incremental + ejecutor | Aprobar contratos antes de escribir; pruebas nuevas específicas autorizadas aparte |
| O7 | ESCRITURA, ceremonia privada | Provisión FIRST-ACTOR y cierre de privilegios temporales | Nuevo permiso explícito; no INSERT/fixtures, no activar runtime |
| O8 | CAMBIO WEB futuro | Composición bootstrap/handleAuth, transporte PG/ingress y lifecycle token, fix mínimo actividad | Diff completo y pruebas de integración revisados; autorización específica build/deploy |

Comandos de inspección/preparación reproducibles, NO ejecutados aquí y NO listos
para ejecutar hasta aprobar parámetros. En estación offline de revisión, inputs
sin secretos aprobados y directorio nuevo (se revisan solo outputs workload):

```sh
# OFFLINE REVIEW ONLY; does not install any output on the healthy server.
python3 scripts/prepare-b1-openbao.py --inputs /private/approved-workload-inputs.json --out /private/new-workload-review
```

En sesión VPS de lector PG ya aprobada, servicio privado exacto y salida privada:

```sh
# REMOTE READ, NOT AUTHORIZED HERE. Connection selected through private service file.
: "${PGSERVICEFILE:?approved private service file}" "${PG_CATALOG_SERVICE:?approved staging reader}"
: "${CATALOG_OUTPUT:?new private output file}"
test ! -e "$CATALOG_OUTPUT"
umask 077
psql -X --set=ON_ERROR_STOP=1 --dbname="service=$PG_CATALOG_SERVICE" --file=deploy/staging/openbao/runtime-catalog.review.sql > "$CATALOG_OUTPUT"
```

PG-P1/PG-P2 se extraen literalmente del documento en artefacto de revisión y se
aprueban por hash antes de usar psql; no existe script de aplicación autorizado.
No se entrega comando de BAO-B1 con segmentos vacíos, ni unwrap/login que pudiera
imprimir un token, ni comando de FIRST-ACTOR inexistente. No pueden ejecutarse hoy.
Las inspecciones Bao requieren lista exacta de paths del mount observado y policy
lectora; no dar sys/* por comodidad para completar ese inventario.

Decisiones que el propietario puede aprobar o rechazar por separado:

1. PG-D1: LOGIN separado y membresía PG16 con INHERIT TRUE/SET FALSE/ADMIN FALSE,
   nombre propuesto, máximo 4 conexiones, SCRAM+TLS verify-full y cambio HBA/TLS
   posterior; sin alterar el rol NOLOGIN ni conceder tablas.
2. BAO-D1: certificado nominal auth/cert del distribuidor con vigencia 24 h,
   token distribuidor 120 s, wrapping60/SecretID300/un uso, workload300/max900,
   reauth240/margen10; autorizar desarrollo del supervisor/canal propuestos.
3. BAO-D2: aceptar expiración acotada del token drenado como mínimo y revocación
   admin en incidente, o exigir revocador automático con análisis propio; designar
   administrador/custodio y canal de emisión/recuperación del certificado.
4. INIT-D1: aprobar FIRST-ACTOR-01 limitado a un tenant/actor SENSITIVE y reglas
   self-service exactas, TOTP confirmado, singleton/recibo/status e identidad de
   provisioning separada; fijar entrega recovery codes y manifiesto privado.
   Esto no aprueba de antemano SQL ni una ejecución de provisión.
5. ROUTE-D1: elegir primer actor por ceremonia separada (recomendado, R4 no previo)
   y reservar slice de invitaciones para usuarios posteriores. Si se exige
   invitación inicial, resolver primero el emisor legítimo, no inventarlo.

Los UUID/CIDR/CA observados y el destinatario real se registrarán por canal
privado al preparar autorización; no se fabrican ni se piden secretos en chat.
Se mantienen Compose efectivo, Autodeploy OFF, CRM separado y runtime cerrado.

## Incremento canónico entre entornos — 29/10/2026

Este apartado sustituye la recomendación de construir distribuidor/supervisor
propios del diseño anterior. No modifica sus registros históricos ni autoriza
operaciones. Revalidación GitHub en lectura: staging 198b4e41d89c373c7aebda23ee20700643ce339c,
candidato remoto 4d5563899bc327f3c272ef13625ebffc3cc96b46 y R4/AUD031
9a4c8b90a159f2853f040dc5597042c17408da00. HEAD local sigue en staging; los
cambios locales NO están publicados. Base revisada a6d2f45 y diseño posterior
se conservan. Sin ZIP nuevo, sin SQL/Bao, credenciales, provisión ni despliegue.

### Recomendación única y QG-0 del incremento

Usar una sola composición privada PG + custodia para cualquier instalación;
LOGIN PG independiente que hereda ACL contractual, y herramienta oficial
OpenBao Agent 2.7.2 con auto-auth cert por workload y sink en memoria de sistema
(tmpfs). El callback token() existente consumirá ese sink en el futuro; no otro
cliente Bao, distribuidor/supervisor propio ni bifurcación NODE_ENV. El cambio de
AppRole a cert del workload es una decisión explícita pendiente de aprobación,
NO implementada. Si se rechaza, AppRole requiere resolver su emisor de SecretID;
no se cambia bind_secret_id ni se convierte un SecretID en reutilizable.

Inventario adicional: pg 8.16.3 del lock, pg-identity-driver y sus consumidores
IdentityPool en v4-broker/custody-composition; extensión de ese único punto para
configuración/Pool. Riesgos: herencia de entorno del driver, SSL débil, conexión
como owner, secreto en DSN y CA inválida. Plan: factory explícito con validación,
sin importar configuración global; prueba local de construcción sin connect,
negativos y suite PG modificada, typecheck/lint pertinentes y diff. No archivos
ni dependencias nuevos; no se repiten suites Bao/deadline sin cambios.

### Preparación PG implementada, aún desconectada

createPgIdentityPool en lib/b1/pg-identity-driver.ts es el punto canónico interno
de composición, sin consumidor HTTP hasta la integración autorizada. Construirlo
no abre sockets ni solicita contraseña. Acepta exactamente environment, host,
port, database, loginRole, contractualRole, ca, password (callback privado),
maxConnections y connectionTimeoutMs. Valida DNS/IP, puerto, identificadores,
roles distintos, límites, CA X.509 PEM de CA única y callback. Rechaza DSN,
campos extra, socket implícito y nombres privilegiados conocidos. No prueba
privilegios por el nombre: inspección de catálogo/ACL sigue siendo obligatoria.
El callback obtiene credencial solo cuando pg la necesita, valida su formato y
sanea errores; no genera contraseña ni lee secretos de NODE_ENV/PGPASSWORD.
El Pool fija TLS rejectUnauthorized=true, CA copiada, opciones GUC vacías y todos
los parámetros de conexión explícitos. No SET ROLE, SQL propio ni conexión de
bootstrap. La identidad contractual se valida como dato del manifiesto, no se
asume autenticación con ella ni se hace ALTER ROLE en código.

Configuración lógica, no valores operativos: manifest de instalación con ID de
entorno, host/SAN esperado, puerto, DB, LOGIN, rol NOLOGIN observado, CA pública,
referencia al proveedor privado de password y límites. El loader privado futuro
resuelve las referencias, valida pertenencia al entorno y pasa el objeto al
factory; ese loader no se ha inventado ni conectado ahora. No serializar el
callback/Pool/config privado en logs. La contraseña JS no admite prometer borrado
perfecto; no se cachea en un singleton adicional.

Propuesta SQL/config única, NO EJECUTADA: PG-P1 anterior se parametriza con
identificadores aprobados, sin crear una variante para producción. SQL14 conserva
cleanops_identity_service NOLOGIN. Si el nombre contractual varía, exige una
instalación SQL aprobada coherente, no renombrarlo por configuración. Roles son
globales al cluster: separar instancias PG por entorno o demostrar aislamiento
DB/HBA/ACL; un sufijo de LOGIN no aísla automáticamente un cluster compartido.

```sql
-- PG-CANONICAL: psql identifier parameters from an approved non-secret manifest.
-- NOT EXECUTED. No credential here; not an automatic migration or ready runbook.
BEGIN;
CREATE ROLE :"login_role" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS PASSWORD NULL;
GRANT :"contractual_role" TO :"login_role"
  WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT CONNECT ON DATABASE :"database_name" TO :"login_role";
ALTER ROLE :"login_role" IN DATABASE :"database_name" SET search_path = pg_catalog;
COMMIT;
```

Los parámetros no son defaults: aprobación debe fijar valores/hash y comprobar
ausencia del LOGIN antes de CREATE. PG-P2 se ejecutaría con esos mismos roles/DB,
verificando catálogo, herencia y ningún permiso de tabla/columna/secuencia ni
membresía a broker/bootstrap/owner/BYPASSRLS; sin SET ROLE transitorio. El guard
HBA hostssl DB/LOGIN/CIDR exactos y SCRAM+TLS verify-full es idéntico en ambos
entornos, cambia su configuración. SQL14 y Compose efectivo no cambian hoy.

### Herramienta oficial Bao: capacidades contrastadas con v2.7.2

Se leyeron las fuentes oficiales fijadas al tag (no se ejecutó el binario):
website/content/docs/agent-and-proxy/autoauth/{index,methods/cert,methods/approle,sinks/file}.mdx
y agent/index.mdx en https://github.com/openbao/openbao/tree/v2.7.2/website/content/docs/agent-and-proxy .
Dockerfile selecciona 2.7.2; release-pin.json de aceptación conserva 2.7.1 como
historia, no acredita ni configura Agent 2.7.2. Antes de usar Agent hay que fijar
su artefacto 2.7.2 verificado, config y evidencia propios; no cambiar pin histórico.

| Capacidad / contrato | Agent cert | Agent AppRole | Código anterior propuesto |
|---|---|---|---|
| Login inicial | Cert/key local + binding nombrado | RoleID + SecretID entregados externamente | Reimplementaba autenticación con CLI |
| Expiración/reauth | Auto-auth renueva y reautentica al fallar/expirar | Igual, pero necesita SecretID nuevo de un uso | Supervisor propio innecesario si Agent cubre política |
| Reemplazos | cert reload=true permite recarga en cada autenticación | Nuevos archivos se usan en siguiente autenticación; puede unwrap verificando creation_path | Emisor/canal SecretID propios ausentes |
| Entrega del token | Sink file con permisos configurables, recomendado ramdisk | Mismo sink | Slot/IPC propio evita archivo pero añade arquitectura |
| Revocación | Administrador revoca token y bloquea identidad cuando procede | También debe impedir emisión de nuevos SecretID | No elimina autoridad de control plane |

Recomendación: auto_auth method cert con mount y name exactos, reload=true,
CA/nombre de servidor y client cert/key privados por workload; sink file sin
wrapping ni cifrado experimental en tmpfs dedicado, modo explícito 0600 y UID
lector mínimo (o 0640 con grupo dedicado aprobado si procesos separados). Sin
listener/proxy, caché de respuestas/secretos ni templates KV. B1 sigue leyendo
KV exacto mediante createOpenBaoKeys, mTLS, allowlist, versiones y deadline.
No se amplía red/Compose para arrancar Agent en esta entrega.

Las policies actuales sin default NO garantizan renovación. Aprobar expresamente
update auth/token/renew-self para el token operativo si se selecciona renovación
de Agent; ninguna ampliación se instala silenciosamente. Revoke-self solo si se
aprueba un procedimiento que lo use; no se afirma que Agent revoque al salir.
No se propone periodic token ilimitado: TTL/máximo, CIDR y policies exactas
se configuran por instalación. Al alcanzar maxTTL, reauth con certificado vigente.
No asumir soporte de tokens con usos limitados: auto-auth requiere token_num_uses=0;
esto no convierte SecretID num_uses=1 en reutilizable. La documentación declara
que wrap_ttl del método impide el lifecycle automático; no activarlo aquí.

Responsabilidad de la credencial inicial y reemplazos: custodio PKI/control plane
nominal de cada instalación emite el primer cert/key clientAuth, instala el binding
de cert auth y entrega al UID Agent por canal privado; clave nunca en web/Git/build.
El mismo custodio (o servicio PKI ya aprobado por él) entrega cada reemplazo antes
de expirar con escritura atómica/permisos comprobados; reload=true lee el nuevo
par en la siguiente autenticación. Agent NO emite ni renueva certificados y NO
distribuye SecretID. No hay servicio PKI automatizado acreditado: hasta aprobarlo,
la renovación de certificados es tarea operativa con dueño/alertas/ventana definida,
igual en producción. Si AppRole se mantiene, ese custodio/distribuidor aprobado
debe emitir y entregar CADA SecretID wrapped nuevo; Agent solo lo consume.
Ni producción ni staging dependen continuamente del token inicial de Bao.

Arranque: sink vacío y token() indisponible hasta login Agent. Lectura futura del
sink por token() en cada adquisición (archivo regular, no symlink, tamaño/permisos
y deadline acotados, errores saneados); no copia perpetua en singleton ni red Bao
adicional. No implementada todavía: esta mínima integración necesita aprobar el
sink como canal. No retirar el archivo tras cada lectura: hay múltiples lecturas
KV; el contrato propio debe distinguir reemplazo de token de sus renovaciones.
El sink no es una prueba de token vigente: no contiene lease_duration; no inferir
TTL desde mtime ni prometer deadline local de token sin metadatos. Bao valida cada
GET y la pérdida/expiración del token debe producir 503, nunca servir claves caché.
Auto-auth reintenta con backoff documentado; aceptación debe demostrar recuperación
tras expiración, revocación y cert reemplazado sin requests con identidad ajena.

Drenaje: no se reintenta SQL ni se reinicia una operación confirmada al reemplazar
token. Lecturas antiguas fallan o terminan bajo su plazo; claves ya prestadas
siguen lease SQL y borrado existentes. Matar Agent no revoca instantáneamente el
token; stop/restart supervisados por el gestor de procesos oficial del entorno,
sin daemon propio. Reinicio elimina sink viejo antes de abrir admisión; token viejo
se revoca por accessor de control plane o expira. Para incidente: bloquear primero
binding/cert/renovación de la identidad comprometida y después revocar sus tokens;
revocar solo un token con cert aún válido permite reauth. Custodio debe controlar
también certificados ya sustituidos y sesiones emitidas antes de su revocación.
No prometer que revocación remota borre claves en memoria o deshaga COMMIT.

### FIRST-ACTOR-01: inicialización de instalación, no seed de entorno

Mismo procedimiento en todas las instalaciones. Alcance singleton por
installation_id estable y baseline aprobada; environment es una etiqueta de
configuración, no la condición que permite crear un administrador. Propuesta
normativa pendiente, sin función/migración/ejecutor implementados.

Permisos mínimos: ejecutor nominal temporal con CONNECT y USAGE del schema de
ceremonia, EXECUTE solo prepare/confirm/commit/status FIRST-ACTOR; sin tablas ni
membresía broker/owner ni facultad de reasignar permisos. Owner de las funciones
SECURITY DEFINER revisado con DML exacto requerido en org/principal/credential/
user/policy/MFA/recovery/receipt/audit, sin LOGIN ni privilegio universal. Runtime
no recibe EXECUTE de inicialización. Revocar escritura/LOGIN temporal tras commit;
status posterior mediante lector separado. No deshabilitar singleton para recuperar.

Reutilización: passwordAdmission/prepareReplacementHash, prepareTotpEnrollment,
openEnrollmentSecret, verifyTotpFactor y CAS de contador, approvedTotpEnrollmentPolicy,
AAD tenant/user/method/generación/algorithm/keyVersion, primitivas recovery B1 y
digest/política canónicos. El owner de la ceremonia no fabrica una sesión/contexto
B1 ni llama a un helper de ENROLLMENT fingiendo PREAUTH. Las transiciones y su
persistencia requieren contrato nuevo explícito, no copiar lógica de factores.

Entrega TOTP única: tras verificar destinatario y canal privado, prepare muestra
QR/URI una vez y registra entrega, caducidad y aceptación del destinatario sin
registrar URI/secret. Primer código confirma posesión; método no ACTIVE hasta
commit. Si se pierde QR antes de confirmar, abortar esa generación y revocar su
capacidad antes de preparar otra, sin crear principal activo. Tras commit no se
vuelve a mostrar QR: se usa recuperación aprobada, no reejecutar inicialización.

Recovery: códigos de un solo uso generados por las primitivas B1, almacenados
solo como sus digests canónicos, entregados una sola vez por canal privado y
confirmados por destinatario antes de cerrar ceremonia. Propuesta concreta:
preparar en estado privado no empresarial, entregar/ack y guardar solo digests;
commit atómico publica digests junto al factor/principal/recibo/auditoría. No
regenerarlos al reintentar commit o leer status. Si la entrega/ack queda incierta
antes de commit, abortar generación y anular todo el material anterior; destinatario
descarta códigos de generación abortada. Esta secuencia/ack necesita aprobación
normativa y pruebas; no se anuncia como conducta actual de B1.

Commit: singleton + bloqueo/unique, operation_id e input_digest inmutables,
auditoría durable dentro de transacción y recibo no secreto. Sin sesión automática,
ni cookie ACTIVE, ni grants implícitos por nombre Super Admin. Permisos iniciales
son el conjunto self-service enumerado aprobado; create/users requiere decisión
separada. Tras commit, login → TOTP → sesión ocurre por interfaz B1 existente.
R4 no es dependencia del primer actor recomendado; solo slice de invitaciones
posteriores con emisor legítimo, conservando AUD-031 fijado.

Resultado incierto: bloquear nueva provisión; status(operation_id,input_digest)
resuelve COMMITTED/ABORTED/PREPARED/ABSENT después de aclarar la transacción
original. COMMITTED devuelve el MISMO recibo sin secretos; no reentrega QR/codes
ni crea otra identidad. ABSENT confirmado permite mismo manifiesto; ausencia
de respuesta no demuestra rollback. Pérdida de TOTP/recovery tras commit exige
procedimiento de recuperación de cuenta, no borrar actor, singleton o historial.

### Delta mínimo y aceptación restante

| Archivo / responsabilidad | Cambio de este incremento | Idéntico en producción / variable |
|---|---|---|
| lib/b1/pg-identity-driver.ts | Factory Pool configurado/validado, sin conectar | Mismo factory y protocolo; cambian endpoints, nombres, CA, credencial y límites |
| tests/b1/pg-identity-driver.test.ts | Caso positivo en ambos entornos y negativos de configuración | Mismo test de contrato, sin PostgreSQL |
| OPENBAO-STAGING-01.md | Solo este apartado vigente con recomendación oficial y FIRST-ACTOR genérico | Documento sigue en ruta histórica; diseño no depende del nombre staging |
| OPENBAO-STAGING-01-CHECKS.md | Evidencia nueva separada de la acreditada | Sin relabel de pruebas históricas |

Sin cambios a createOpenBaoKeys/deadline, renderer de AppRole, SQL14, runtime,
Compose, CRM o AUD-031. Aprobar Agent cert y self-renew/sink, canal PKI y FIRST-ACTOR
precede a implementar Agent config/loader de sink/provisión. No añadir código de
distribuidor ni política cert a un renderer de AppRole antes de esa decisión.
Falta aceptación real de PG16 ACL/herencia/HBA/TLS y credencial privada; Agent
2.7.2 contra Bao real con renovación/reauth/cert rotation/restart/revocación y
canal sink protegido; ceremonia FIRST-ACTOR y entrega única ante concurrencia/
resultado incierto; integración bootstrap/handleAuth, sesión/actividad y navegador.
Producción conserva además sus gates de residencia, custodia, recuperación y
capacidad: misma implementación no equivale a aceptación de infraestructura.

## Desarrollo local autorizado Agent cert + FIRST-ACTOR-01 — 29/10/2026

Este apartado actualiza los anteriores: el propietario autorizó implementar
localmente ambos contratos, sin aplicación SQL/infraestructura ni activación.
Refs revalidadas: candidato 87938c0e1d7e8294bbffc58cec6b301a9370093c,
staging 198b4e41d89c373c7aebda23ee20700643ce339c y R4
9a4c8b90a159f2853f040dc5597042c17408da00. Tras aclaración expresa del propietario
se hizo SOLO merge local de staging: su ascendencia y MIGRATIONS-01 quedan
preservados. Sin rebase, force, publicación, PR o merge en GitHub.

### QG-0 e inventario aplicado antes de escribir

Alcance B1: consumidor de sink y ceremonia interna por instalación. Se reutilizan
createOpenBaoKeys.token, renderer prepare-b1-openbao, artefacto 2.7.2 ya fijado
en el Dockerfile con checksum verificado, createPgIdentityUnitOfWork,
createCustodyDeadlinePool y PrivateCustody. No otro cliente Bao/runner/servidor.
FIRST-ACTOR reutiliza prepareReplacementHash/passwordAdmission, normalización
privada de email, prepareTotpEnrollment/openEnrollmentSecret y AAD v2,
verifyTotpFactor/CAS, approvedTotpEnrollmentPolicy y dominio recovery B1.
El writer de auditoría final usa el contrato existente de app.audit_logs; eventos
previos al tenant se guardan en el ledger privado de la ceremonia, sin PII/secrets.

Permisos self-service iniciales EXACTOS: B1-SELF-01 ver identidad propia;
02 listar sesiones propias; 03 revocar sesión propia; 04 revocar otras sesiones
propias; 05 enrolar MFA propio; 06 confirmar MFA propio; 07 ver membresías propias;
08 cambiar a membresía propia verificada. Se conservan predicados/step-up y
DENY de B1. No create/users, consulta de otros usuarios, grants universales,
roles de aplicación implícitos ni acceso CRM. configuration.deployment_enabled
se mantiene false; otorgar estas reglas no abre auth_api ni closedBackend.

Archivos nuevos justificados: first-actor.ts es entrada privada y repositorio de
esa responsabilidad, sin endpoints; recovery-material.ts extrae la generación
actual para sus DOS consumidores reales, sin segundo dominio recovery; incremental
0002_first_actor.review.sql mantiene DDL/ACL/transiciones versionados propuestos;
tests first-actor/agent-sink y test_b1_agent_cert cubren esas responsabilidades.
Dueño B1/seguridad; consumidor inmediato operador privado/createFirstActorCeremony,
composición de custodia y renderer. Se extienden manifiesto/plan canónicos de
migraciones, tipos y harness existentes. No se crea CLI que inyecte secretos ni
se toca runtime, Compose, SQL14, workflows, CRM o AUD-031.

Riesgos y pruebas: aislamiento instalación/operación/tenant; pérdida de respuesta
después de commit; entrega única; expiración y borrado; symlinks/races del sink;
auditoría y permisos de owner. Modelo transaccional concurrente offline y casos
negativos, más regresiones de los puntos modificados. Nada acredita PG16/Bao
nativos; no se repiten auditorías cerradas ni se transforma un SKIP en PASS.

### Agent oficial: configuración y consumidor implementados

El MISMO renderer acepta --agent-cert en cualquier entorno. Usa las lecturas
tenant/purpose/key_id existentes y exige agent.address HTTPS, cert_mount/cert_name
exactos, certificado público de confianza para cert auth y Common Name exacto,
ca_file/client_cert_file/client_key_file, sink_file, sink_uid/gid/mode,
directory_uid/gid/mode y read_timeout_ms. Inputs proceden del manifiesto privado
aprobado; no hay UUID, token, CA privada o identidad real predeterminados.
Las rutas no aceptan interpolación HCL. El bundle Agent devuelve SOLO:

- agent.hcl con vault TLS verificado, method cert/name/mount exactos, reload=true
  y sink file. Sin listener/proxy, cache, templates ni secret distributor.
- policy del workload: READ de paths KV exactos y update auth/token/renew-self
  explícito; sin default policy, LIST, escrituras KV, revoke-accessor ni sys/*.
- cert-role.json con CA pública, CN, policies, TTL/máximo, CIDR y token_num_uses=0.
- sink-reader.json con propietario/modos y límite de lectura del mismo input.

La forma HCL se contrastó con parseAutoAuth/parseMethod/parseSinks del código
oficial internal/command/agent/config/config.go y cert reload con
internal/command/agentproxyshared/auth/cert/cert.go, tag v2.7.2. Esto no ejecuta
el parser/binario ni certifica la configuración real. Se reutiliza el mismo
artefacto 2.7.2 ya verificado; no se instala ni se construye otra imagen.
El modo anterior del renderer conserva sus límites de autorización de servidor;
no es una bifurcación de autenticación por NODE_ENV.

createAgentSinkToken se pasa directamente como callback token() de
createOpenBaoKeys en una composición privada futura; no hay wiring web nuevo.
Reabre en cada adquisición. Linux: recorre directorios con O_DIRECTORY/NOFOLLOW
anclados por descriptor en /proc/self/fd, valida dueño/modos de directorio final,
tipo tmpfs, fichero regular de un enlace con UID/GID/modo aprobados y ≤1024 bytes;
usa O_NONBLOCK/NOFOLLOW, buffer de 1025 bytes, reloj monotónico y timeout ≤5000 ms.
Rechaza path relativo/traversal/symlink, bytes no ASCII y token mal formado;
borra buffer y cierra descriptores incluso tras completarse I/O tardío. No cachea
tokens ni deduce TTL desde existencia/mtime. No garantiza borrar strings JS.

Comportamiento: ausencia/sink inválido/timeout → error saneado 503. Reemplazo
atómico/renovación → la siguiente lectura usa el contenido vigente; el token sin
cambio puede seguir válido por renovación. Un rechazo 403 de Bao sigue 503 y
work no se invoca; no login/retry SQL automático ni claves cacheadas. Si Agent
cae y queda token válido en tmpfs, Bao sigue decidiendo su vigencia hasta rechazo
o expiración: el lector no finge detectar la caída. Para reinicio operativo,
cerrar admisión y eliminar el sink viejo antes de arrancar Agent; esto es una
operación futura, no un flag o supervisor nuevo. Claves ya prestadas y COMMIT
confirmado conservan exactamente su deadline/limpieza/recibo existentes.

PKI inicial/reemplazos, montaje tmpfs/permisos, identidad ejecutora de Agent,
instalación del binding/policy y revocación por administración son operaciones
futuras con autorización específica. Agent recarga el certificado al autenticar,
no lo emite ni lo renueva; no presupone distribución de SecretID. Revocación de
incidente debe impedir reauth antes de revocar tokens; detener Agent no revoca
por sí solo un token ni borra claves que una operación ya tomó prestadas.

### FIRST-ACTOR: entrada privada prepare/confirm/commit/status

createFirstActorCeremony recibe pool de provisioning, manifiesto aprobado e
instalación/operación/tenant/user/principal UUID, nombres/email ya normalizado,
alias y aprobación; referencias de claves TOTP/recovery y keyVersion explícita,
custodia, presupuesto, admisión de contraseña y normalizador privados. El digest
vincula manifiesto, catálogo de claves, política B1 y las ocho reglas exactas.
No selecciona datos por headers/body, NODE_ENV ni defaults de staging.

prepare reserva bajo lock el singleton por base/instalación y operación/digest
inmutables, antes de generar nada. En la MISMA transacción prepara hash admitido,
TOTP/AAD y recovery, guarda solo material cifrado/hash/digests y marca PREPARED;
devuelve capability, URI y códigos UNA vez, mediante privateArtifact, solo tras
COMMIT observado. Reintento devuelve estado sin material ni regeneración. No hay
principal, usuario, factor ACTIVE o autoridad empresarial antes del commit final.

confirm exige capability ligada al manifiesto, primer TOTP verificado con el
helper canónico y acuse explícito de entrega recovery. Persiste contador inicial
y estado CONFIRMED. Rechazos se auditan en una transacción confirmada antes de
devolver AuthError y consumen otp_attempts de la política canónica; agotar el
límite expira/borra material. No genera nuevos códigos en confirm/replay.

commit bloquea la misma fila y revalida estado/expiry/capability, instala un
tenant/actor SENSITIVE, credencial, policy_versions, ocho reglas self-service,
TOTP confirmado y batch de digests, evento app.audit_logs, evento privado y
recibo en UNA transacción. No inserta sesiones, no invoca un emisor de sesión ni
activa deployment_enabled. Fallar auditoría revierte todos los efectos. Llamadas
concurrentes/repetidas devuelven el mismo recibo COMMITTED; no duplican actor.
El dominio y generación recovery se extrajeron del backend existente a
prepareRecoveryCodes; backend y FIRST-ACTOR usan exactamente esa implementación.

status no depende de Bao/claves, tiene statement_timeout 5s y serializa contra
la operación original mediante el mismo advisory lock. Devuelve ABSENT,
PREPARED, CONFIRMED, COMMITTED o EXPIRED y recibo no secreto. En el caso de
expiración puede borrar material y registrar esa transición al confirmar su
transacción; no es una consulta libre de efectos cuando expira. Nunca se infiere
rollback de una respuesta perdida. COMMIT perdido se resuelve consultando status;
no se vuelve a crear identidad, TOTP o recovery. No reemite URI/codes/capability.
Si se pierde la entrega antes de COMMITTED, el operador original autorizado usa
abort(reason) con installationId, operationId y digest originales; no necesita la
capability perdida ni acceso a Bao. Razones: DELIVERY_LOST, EXPIRED,
ATTEMPTS_EXHAUSTED y OPERATOR_CANCELLED. Las dos razones de agotamiento exigen
respectivamente expiración o límite otp_attempts alcanzado. El aborto, borrado de
material y evento ABORTED_reason son atómicos. Si falla auditoría, nada se invalida.
Si se pierde su respuesta, consultar status y repetir el mismo aborto es idempotente.

ABORTED conserva manifiesto, digest, operador, número de generación, expiración y
razón en first_actor_history, sin material. Solo tras ese aborto puede el mismo
operador preparar una generación explícitamente nueva con otro operationId; todos
los demás campos, política y catálogo deben ser idénticos. El digest nuevo vincula
el nuevo operationId. No hay reset, borrado de historia ni regeneración automática.
Repetir prepare de una operación archivada devuelve ABORTED sin secretos. Los
escritores exigen la operación actual: una capability/generación anterior no puede
confirmar, cometer ni agotar intentos de la actual. El singleton no cambia.

Status/abort/prepare/confirm/commit comparten advisory lock y bloqueo de fila.
Abortar primero impide confirm/commit; confirmar primero aún permite aborto;
COMMITTED primero impide aborto y cualquier nueva inicialización. Dos operaciones
nuevas compiten por el mismo slot: solo una puede comenzar. Tras COMMITTED, pérdida
de factor/codes pertenece a recuperación de cuenta, nunca a reinicialización.
Esta recuperación es propuesta offline y simulada: falta aceptación nativa PG16.

### Incremental propuesta y permisos

db/migrations/0002_first_actor.review.sql es la única fuente propuesta de DDL.
trusted-migrations la registra con SHA256 y proposed=true. offline-plan B1 muestra
proposed/executable=false; la cola aplicable permanece VACÍA. No se descubre por
glob ni se promueve a aplicada por este permiso de desarrollo. La implementación
canónica MIGRATIONS-01 sigue siendo el único runner/journal; solo se extendió el
plan offline y los tipos para revisar propuestas. SQL14 queda byte a byte intacto.

Roles nuevos propuestos, sin LOGIN ni credenciales/membresías creadas:
cleanops_first_actor_owner (owner de funciones/tablas privadas),
cleanops_first_actor_executor (USAGE schema y EXECUTE de las transiciones) y
cleanops_first_actor_reader (USAGE y solo status COMMITTED de la instalación).
Ninguno es miembro del broker/bootstrap/owner existente ni BYPASSRLS. Owner
tiene SELECT/INSERT mínimos en las tablas explícitas necesarias, políticas RLS
de INSERT ligadas al tenant/principal y backend/xid de la transacción de commit;
no UPDATE/DELETE de datos empresariales ni grants de tabla al ejecutor/web.
Owner registra el evento final usando la forma canónica de app.audit_logs;
events privados no contienen password/hash, TOTP, ciphertext, capability ni codes.
Tras aceptar ejecución futura: cerrar LOGIN/EXECUTE de escritura del operador y
conservar lectura de recibo mediante identidad reader separada. No se crean esas
credenciales ni se aplica el SQL hoy. La aceptación debe revisar privilegios
transitivos, FORCE RLS/owners/firmas y logs de parámetros privados en PG16 real.

Bloqueos concretos de aceptación: incremental aún no ejecutada ni validada por
parser PostgreSQL disponible (pglast ausente; no se instaló); falta aceptación
PG16 de ACL/RLS/atomicidad/locks y resultado incierto; falta parser/Agent/Bao 2.7.2
reales, tmpfs/UIDs efectivos, TLS/PKI/renovación/reautenticación/revocación/restart;
identidades de operador y reader/catálogo privado aprobados; canal humano de
entrega/acuse de TOTP y recovery y recuperación de preparación expirada. Son
condiciones de operación futura, no implementaciones temporales para staging.
Runtime, Compose efectivo, Autodeploy OFF, CRM y AUD-031 permanecen intactos.

### Corrección local de revisión: deadline y recuperación precommit

QG-0: reutilizados first_actor, su ledger, executor y funciones de ceremonia;
control privado de status para abort sin claves; advisory lock, unidad de trabajo
y guard de deadline existentes. No hay provisioning paralelo, grants web ni
permisos iniciales nuevos: B1-SELF-01 a B1-SELF-08 permanecen idénticos.
El sink verifica nuevamente el deadline monotónico después de cerrar todos los
descriptores y antes de entregar el token. Un cierre que bloquee el event loop
no puede ganar al timer y entregar material tardío. Se mantienen limpieza y
semántica de COMMIT confirmado; no se reintentan efectos SQL.
