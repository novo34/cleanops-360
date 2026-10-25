# Timeout E2E: causa reproducida y corrección del harness

El síntoma volvió en la ejecución39071293911, fuentee862ec8: ambos flujos llegan a
sus fases finales y agotan el tiempo durante el cierre. ATTEMPT_1.json conserva FAIL
y limpieza Docker PASS. No se atribuye ese fallo a PostgreSQL o a la autenticación.

## Causa y prueba causal

El cierre original esperaba únicamente el callback de https.Server.close(). Node
espera conexiones/respuestas activas; el contexto del navegador sigue vivo hasta
que retorna el test, pero este esperaba el cierre del servidor. Según las conexiones
pendientes al terminar, aparecía una espera circular de teardown intermitente.

La regresión tests/b1/browser-server-cleanup.test.ts reproduce la primitiva real:
abre un servidor loopback propio y una respuesta HTTP sin terminar; close() no
completa aunque se haya solicitado. Cerrar explícitamente sus conexiones lo libera.
Después repite la situación con closeOwnedServer y comprueba cierre completo. No es
un stub ni una simulación del callback de Node. HTTPS usa esa misma semántica Server.

Corrección: scripts/b1-real-browser-server.mjs cierra únicamente las conexiones del
servidor que creó el test, mediante closeAllConnections(), antes de esperar el callback.
No toca recursos preexistentes, perfiles OTP, SQL, ACL, verificaciones ni timeouts de
los dos recorridos originales. E2E registra CLEANUP y CLEANUP_DONE por separado.

Ejecución posterior39072245268, fuente25b9706, completa ambos flujos y CLEANUP_DONE;
12 checks PASS, limpieza PASS. PREAUTH_MILESTONE.json conserva esa evidencia.
La CI sin DB39072245218 también pasa, incluida la reproducción causal de cierre.

La prueba nueva de alta ACTIVE tiene presupuesto propio120s por esperar ventanas
reales TOTP y cooldown canónicos. No se aumentaron los30s de los recorridos antiguos
para esconder este fallo. La instalación PG exacta y sus controles no se relajan.

## Fallo posterior separado: presupuesto real de verificaciones

ACTIVE_ATTEMPT_1.json (39072641248) conserva una aserción fallida al final del login
con dos métodos; los tres tests alcanzan CLEANUP_DONE. Se añadió un vector de
contador nuevo y diagnóstico HTTP. ACTIVE_ATTEMPT_2.json (39072974572) muestra
SELECT_STATUS_200 y VERIFY_STATUS_429: la causa efectiva es el presupuesto del caso,
no un error de selección ni el cierre. V4 rate_attempt limita cuando count>=limit;
el flujo hacía cinco verificaciones y otp_issue_user_limit=5. No se declara que el
ajuste de contador hubiera solucionado esa denegación: el diagnóstico lo descartó.

Se mantiene la denegación429 como prueba negativa (sin sesión), sin subir ni resetear
límites. Otro usuario sintético y otro dispositivo de un contexto de navegador
independiente prueban el login múltiple positivo dentro de presupuesto; ambos usan
la misma red sintética y el perfil V4 intacto. El fixture nuevo añade datos propios,
no borra rate_buckets, no manipula reloj/TTL y no relaja la autenticación.
