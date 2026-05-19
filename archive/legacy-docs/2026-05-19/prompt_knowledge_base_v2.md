# Prompt: Generacion de Knowledge Base Exhaustiva — v2

> Version mejorada basada en la experiencia real de ejecutar v1 contra un sistema de gestion de restaurantes multi-tenant con 866+ archivos, 5 componentes, WebSocket real-time, y multiples frontends.

---

Actua como un Arquitecto de Software Senior + Staff Engineer + Product Manager + Especialista en Reverse Engineering de Sistemas + QA Architect [NUEVO].

Tu mision es analizar completamente este proyecto existente (ubicado en el directorio actual) y transformarlo en una base de conocimiento exhaustiva, estructurada y autosuficiente.

IMPORTANTE:
La base de conocimiento debe permitir que una persona reconstruya el sistema SIN ver el codigo fuente.

--------------------------------------------------

OBJETIVO PRINCIPAL

Convertir TODO el proyecto en una Knowledge Base completa, incluyendo:

- Que hace el sistema
- Por que existe
- Como funciona
- Como esta construido
- Como evoluciona
- Que decisiones se tomaron
- [NUEVO] Que patrones de diseno usa y por que
- [NUEVO] Que esta roto o es inconsistente
- [NUEVO] Que se planeo pero no se implemento

--------------------------------------------------

ALCANCE DEL ANALISIS

Debes analizar:

- Codigo fuente completo
- Estructura de carpetas
- Dependencias (package.json, requirements.txt, etc.)
- Configuraciones (.env, configs, etc.)
- Base de datos (si existe)
- Endpoints / APIs
- Componentes UI
- Logica de negocio
- Scripts
- Tests (si existen)
- Nombres de variables/funciones (para inferir intencion)

[NUEVO] Analisis adicional obligatorio:

- Documentacion existente (README.md, CLAUDE.md, docs/, *.md en raiz)
  → Leerla PRIMERO. Contrastar contra el codigo. Detectar inconsistencias.
- Archivos de diseno previo (patronesAusar.md, arquitectura.md, etc.)
  → Verificar que se implemento vs que quedo pendiente.
- Tests existentes
  → Que se testea? Que NO se testea? Que revela esto sobre prioridades?
- Configuracion de CI/CD (.github/workflows/, Dockerfiles, scripts)
  → Existe? Que cubre? Que gaps tiene?
- Modelo de seguridad completo
  → Autenticacion, autorizacion, RBAC, tokens, CORS, rate limiting, SSRF
- Flujos de eventos end-to-end
  → Para sistemas real-time: seguir un evento desde su origen hasta el ultimo consumidor
- Metricas cuantitativas
  → Contar: archivos por tipo, lineas de codigo, endpoints, modelos, tests, stores, hooks

NO OMITAS NADA.
Si algo existe en el repo, debe reflejarse en la base de conocimiento.

--------------------------------------------------

PRINCIPIO CLAVE

La base de conocimiento ES el sistema.

Debe ser:

- Exhaustiva pero modular
- Clara pero profunda
- Dividida en multiples archivos (NO archivos largos)
- Navegable (indice con links)
- Sin redundancia innecesaria
- Evolutiva
- [NUEVO] Accionable (cada hallazgo debe indicar si requiere accion)

--------------------------------------------------

ESTRUCTURA OBJETIVO

Genera la base en /knowledge-base/ con esta estructura (ampliar segun necesidad del sistema):

[ Nucleo del producto ]
- 01_vision_general.md
- 02_problema_que_resuelve.md
- 03_propuesta_de_valor.md
- 04_actores_y_roles.md

[ Funcionalidad ]
- 05_funcionalidades.md
- 06_flujos_de_usuario.md
- 07_casos_de_uso.md

[ Logica del sistema ]
- 08_reglas_de_negocio.md
- 09_modelo_de_datos.md
- 10_estado_y_transiciones.md

[ Tecnica ]
- 11_arquitectura_general.md
- 12_estructura_del_codigo.md
- 13_componentes_clave.md
- 14_api_endpoints.md
- 15_integraciones.md

[ Infraestructura ]
- 16_configuracion_y_entornos.md
- 17_dependencias.md
- 18_despliegue.md

[ Decisiones ]
- 19_decisiones_tecnicas.md
- 20_tradeoffs.md

[ Estado actual ]
- 21_limitaciones.md
- 22_deuda_tecnica.md
- 23_riesgos.md

[ Evolucion ]
- 24_roadmap_sugerido.md
- 25_oportunidades_de_mejora.md

[ Analisis critico ]
- 26_suposiciones_detectadas.md
- 27_preguntas_abiertas.md

[NUEVO] [ Patrones y calidad ]
- 28_patrones_de_diseno.md          ← Todos los patrones con evidencia de codigo
- 29_patrones_planificados_vs_implementados.md  ← Contrastar docs de diseno vs realidad
- 30_inconsistencias_detectadas.md  ← Bugs, docs desactualizados, codigo vs documentacion

[NUEVO] [ Seguridad ]
- 31_modelo_de_seguridad.md         ← Auth, RBAC, tokens, rate limiting, CORS, SSRF
- 32_superficie_de_ataque.md        ← Endpoints publicos, WebSocket, inputs sin validar

[NUEVO] [ Flujos end-to-end ]
- 33_flujos_de_eventos.md           ← Para sistemas real-time: evento desde origen a destino final
- 34_flujos_de_datos.md             ← Como fluye un dato desde la UI hasta la BD y de vuelta

[NUEVO] [ Metricas ]
- 35_metricas_del_proyecto.md       ← Conteo de archivos, lineas, endpoints, tests, cobertura

--------------------------------------------------

[NUEVO] FASE 0: LECTURA DE DOCUMENTACION EXISTENTE

ANTES de analizar codigo, lee TODA la documentacion existente:

1. README.md (raiz y subdirectorios)
2. CLAUDE.md (raiz y subdirectorios)
3. Cualquier *.md en la raiz del proyecto
4. Archivos de diseno, arquitectura, o planificacion
5. Comentarios en archivos de configuracion

Esto te da:
- Contexto que el codigo solo no revela
- Claims que puedes verificar contra el codigo
- Terminologia del dominio
- Decisiones ya documentadas (no reinventar)

Registra TODA inconsistencia entre documentacion y codigo.

--------------------------------------------------

[NUEVO] FASE 0.5: METRICAS CUANTITATIVAS

Antes de generar la KB, produce estas metricas:

- Archivos totales por extension (.py, .ts, .tsx, .json, .yml, .sql, .md)
- Lineas de codigo por componente (backend, cada frontend, ws_gateway)
- Numero de endpoints REST
- Numero de eventos WebSocket
- Numero de modelos de base de datos
- Numero de stores (Zustand/Redux)
- Numero de hooks custom
- Numero de tests y tipo (unit, integration, e2e)
- Numero de dependencias (pip, npm)

Estas metricas van en 35_metricas_del_proyecto.md pero tambien informan tu juicio sobre madurez y complejidad.

--------------------------------------------------

FORMA DE TRABAJO (CRITICO)

Trabaja en iteraciones.

Ciclo:

1. [NUEVO] Lee documentacion existente
2. Analiza la estructura del proyecto
3. [NUEVO] Produce metricas cuantitativas
4. Explica que entendiste del sistema
5. Detecta:
   - inconsistencias (entre docs y codigo)
   - huecos (features sin implementar)
   - decisiones implicitas
   - [NUEVO] bugs documentados como features
   - [NUEVO] patrones planificados no implementados
6. Haz preguntas cuando sea necesario
7. Genera o actualiza archivos de la base de conocimiento
8. [NUEVO] Genera lista de acciones recomendadas priorizadas
9. Propone mejoras estructurales o de producto

--------------------------------------------------

FORMATO DE SALIDA

Cada archivo debe generarse como archivo markdown bien estructurado.
Incluir un README.md en knowledge-base/ con indice navegable.

--------------------------------------------------

REGLAS IMPORTANTES

- NO inventes comportamiento → si no estas seguro: marcar como "Suposicion"

- ANTE CUALQUIER DUDA debes preguntar:
  - incoherencias en el codigo
  - comportamientos ambiguos
  - decisiones poco claras
  - falta de contexto de negocio

- Si detectas codigo confuso: documenta la ambiguedad

- Si algo falta: agregalo en "preguntas abiertas"

- Si detectas malas decisiones: explica el problema + propone alternativa

- [NUEVO] Si la documentacion existente dice X pero el codigo hace Y:
  documenta la inconsistencia en 30_inconsistencias_detectadas.md
  y pregunta al usuario cual es el comportamiento correcto

- [NUEVO] Si encuentras patrones de diseno planificados (en docs de arquitectura)
  que no estan implementados: documenta en 29_patrones_planificados_vs_implementados.md

- [NUEVO] Si encuentras tests: analiza QUE testean y que NO testean.
  Los gaps de testing revelan areas de riesgo.

- Prioriza: claridad > cantidad

--------------------------------------------------

NIVEL DE PROFUNDIDAD

No quiero documentacion superficial.

Explica siempre:

- el que
- el como
- el por que
- [NUEVO] el donde (file paths exactos)
- [NUEVO] el estado (funciona, parcial, roto, placeholder)

Ejemplo malo:
"Hay un endpoint de login"

Ejemplo bueno:
"El sistema implementa autenticacion JWT con access token (15min) y refresh token (7 dias, HttpOnly cookie). El refresh se hace proactivamente a los 14 minutos con jitter de ±2min para evitar thundering herd. Token blacklist en Redis con patron fail-closed (si Redis cae, se rechazan todos los tokens). Ver: backend/shared/security/auth.py, Dashboard/src/stores/authStore.ts"

[NUEVO] Ejemplo de inconsistencia:
"CLAUDE.md dice 'Customers can still order during PAYING'. Sin embargo, la regla de negocio correcta (confirmada por el product owner) es que NO se puede ordenar durante PAYING. El codigo actual PERMITE ordenar durante PAYING — esto es un BUG, no un feature. Ver: round_service.py:106, knowledge-base/26_suposiciones_detectadas.md seccion 4."

--------------------------------------------------

[NUEVO] ANALISIS DE SEGURIDAD

Para cada punto de entrada al sistema (endpoint, WebSocket, formulario):

1. Que autenticacion requiere?
2. Que autorizacion (RBAC)?
3. Hay rate limiting?
4. Hay validacion de input?
5. Hay proteccion contra SSRF/XSS/CSRF/SQL injection?
6. Los tokens expiran? Se pueden revocar?

Documenta en 31_modelo_de_seguridad.md y 32_superficie_de_ataque.md.

--------------------------------------------------

[NUEVO] FLUJOS DE EVENTOS END-TO-END

Para sistemas con comunicacion real-time (WebSocket, SSE, pub/sub):

Documenta el flujo COMPLETO de al menos 3 eventos criticos:

Ejemplo:
"ROUND_SUBMITTED:
1. Diner taps 'Proponer Enviar' en pwaMenu (SharedCart.tsx)
2. Group confirmation: todos los diners confirman 'Estoy listo'
3. Frontend llama POST /api/diner/rounds/submit (X-Table-Token auth)
4. round_service.submit_round() crea Round + RoundItems con price snapshot
5. write_billing_outbox_event() escribe evento en tabla outbox (misma transaccion)
6. Outbox processor publica en Redis channel:branch:{id}:waiters
7. redis_subscriber.py recibe y valida el evento
8. EventRouter determina targets: admins (siempre) + waiters (sector) + kitchen (no, es SUBMITTED no IN_KITCHEN)
9. ConnectionBroadcaster envia via worker pool a conexiones WebSocket
10. pwaWaiter recibe → tablesStore actualiza status → TableCard muestra yellow pulse
11. Dashboard recibe → admin WebSocket handler actualiza UI"

Esto va en 33_flujos_de_eventos.md.

--------------------------------------------------

[NUEVO] VERIFICACION CRUZADA

Antes de finalizar, haz estas verificaciones:

1. Todo endpoint documentado en la KB existe en el codigo?
2. Todo modelo documentado existe en la BD?
3. Todo patron documentado tiene evidencia de codigo?
4. Toda suposicion esta marcada como tal?
5. Toda inconsistencia docs-vs-codigo esta registrada?
6. Las preguntas abiertas cubren todo lo ambiguo?
7. El roadmap es coherente con las limitaciones y riesgos?

--------------------------------------------------

INICIO

Antes de generar archivos:

1. [NUEVO] Lee TODA la documentacion existente (README, CLAUDE.md, *.md)
2. Analiza la estructura del proyecto
3. [NUEVO] Produce metricas cuantitativas
4. Explica:
   - que tipo de sistema es
   - stack tecnologico
   - nivel de madurez
   - [NUEVO] que documentacion ya existe y que calidad tiene
5. Identifica riesgos iniciales
6. [NUEVO] Lista inconsistencias encontradas entre docs y codigo
7. Propone un plan de como vas a construir la base de conocimiento
8. Haz preguntas SOLO si bloquean el analisis

--------------------------------------------------

OBJETIVO FINAL

Que esta base de conocimiento permita:

- Onboardear desarrolladores sin ver el codigo
- Redisenar el sistema
- Escalarlo
- Migrarlo
- Reconstruirlo desde cero
- [NUEVO] Auditar seguridad sin acceso al entorno
- [NUEVO] Identificar bugs y deuda tecnica sin correr tests
- [NUEVO] Priorizar trabajo basandose en riesgos reales, no intuicion

--------------------------------------------------

COMENZAR

Analiza el proyecto actual y empieza.
