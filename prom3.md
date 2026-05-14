# Prompt: Generacion de Knowledge Base Exhaustiva — v3

> Version 3, basada en la experiencia real de:
> - v1: generar 27 archivos de KB desde cero para un monorepo de 866+ archivos
> - v2: expandir a 35 archivos agregando seguridad, flujos de eventos, metricas, patrones
> - v2→v3: implementar 18 mejoras y descubrir que la KB no cubria features parciales,
>   dependencias entre features, tooling de desarrollo, ni capas de abstraccion
>
> Cambios v2→v3 marcados con [v3]

---

Actua como un Arquitecto de Software Senior + Staff Engineer + Product Manager + Especialista en Reverse Engineering de Sistemas + QA Architect + DevEx Engineer [v3].

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
- Que patrones de diseno usa y por que
- Que esta roto o es inconsistente
- Que se planeo pero no se implemento
- [v3] Que esta parcialmente implementado (modelo sin API, API sin frontend, scaffold sin logica)
- [v3] Que depende de que (mapa de dependencias entre features)
- [v3] Que herramientas tiene el desarrollador para trabajar (DX)
- [v3] Que puntos de extension existen para crecer (abstracciones, interfaces, scaffolds)

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

Analisis adicional obligatorio:

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

[v3] Analisis adicional de madurez y DX:

- Migraciones de base de datos
  → Existe Alembic/Prisma/etc? Cuantas migraciones hay? Estan encadenadas correctamente?
  → Hay migraciones pendientes (modelo cambiado pero sin migracion)?
- Tooling de desarrollo (scripts/, CLI, seed data, codegen)
  → Que herramientas tiene el dev? Como se usa cada una?
  → Cuanto tarda un dev nuevo en tener el sistema corriendo?
- Features parcialmente implementadas
  → Detectar: modelo sin API, API sin frontend, frontend sin backend, scaffold sin logica
  → Para cada feature parcial: que existe, que falta, que esfuerzo requiere completarla
- Capas de abstraccion (interfaces, factories, strategy pattern)
  → Que puntos de extension existen? Para que fueron disenados?
  → Ejemplo: PaymentGateway ABC → MercadoPagoGateway (actual) → StripeGateway (futuro)
- Internacionalizacion (i18n)
  → Que componentes tienen i18n? Cuales no? Es consistente?
  → Que idiomas estan soportados? Que calidad tiene cada traduccion?
- Dependencias entre features
  → Que feature depende de cual? Si toco X, que se rompe?
  → Ejemplo: Kitchen Display depende de Round status flow + WS events

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
- Accionable (cada hallazgo debe indicar si requiere accion)
- [v3] Versionada (cada archivo indica cuando fue creado/actualizado)
- [v3] Con estado de madurez (cada feature clasificada como: completa, funcional, parcial, scaffold, planificada)

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

[ Patrones y calidad ]
- 28_patrones_de_diseno.md
- 29_patrones_planificados_vs_implementados.md
- 30_inconsistencias_detectadas.md

[ Seguridad ]
- 31_modelo_de_seguridad.md
- 32_superficie_de_ataque.md

[ Flujos end-to-end ]
- 33_flujos_de_eventos.md
- 34_flujos_de_datos.md

[ Metricas ]
- 35_metricas_del_proyecto.md

[v3] [ Madurez de features ]
- 36_matriz_de_madurez.md          ← Cada feature con nivel: completa/funcional/parcial/scaffold/planificada
- 37_features_parciales.md         ← Detalle de features incompletas: que existe, que falta, esfuerzo

[v3] [ Dependencias entre features ]
- 38_mapa_de_dependencias.md       ← Que depende de que. Si toco X, que se rompe.
- 39_cadena_de_migraciones.md      ← Orden de migraciones BD, dependencias, estado

[v3] [ Developer Experience ]
- 40_onboarding_developer.md       ← Paso a paso para tener el sistema corriendo desde cero
- 41_tooling_inventario.md         ← Scripts, CLI, seed, codegen, backup, E2E — que existe y como se usa
- 42_trampas_conocidas.md          ← Gotchas, inconsistencias de config, problemas Windows, etc.

[v3] [ Extensibilidad ]
- 43_capas_de_abstraccion.md       ← Interfaces, factories, strategies disenadas para extensibilidad
- 44_internacionalizacion.md       ← Estado de i18n por componente, idiomas, calidad, gaps

--------------------------------------------------

[v3] FASE -1: DETECCION DE BASE DE CONOCIMIENTO EXISTENTE

ANTES de cualquier analisis, verifica:

1. Existe /knowledge-base/? Si tiene archivos, son la version previa.
2. Existe CLAUDE.md? Es la guia para el agente de codigo.
3. Existe UsadoPatrones.md, faltaPatrones.md, patronesAusar.md? Son analisis de patrones previos.
4. Existe prompt_knowledge_base_v2.md o similar? Es el prompt anterior.

Si encuentras una KB existente:
- NO regeneres todo desde cero. Actualiza lo que cambio.
- Compara archivos existentes contra el estado actual del codigo.
- Marca que archivos necesitan actualizacion y cuales estan vigentes.
- Agrega los archivos NUEVOS que v3 introduce (36-44) sin tocar los existentes innecesariamente.

Si NO existe KB previa:
- Genera todo desde cero siguiendo la estructura completa.

--------------------------------------------------

FASE 0: LECTURA DE DOCUMENTACION EXISTENTE

ANTES de analizar codigo, lee TODA la documentacion existente:

1. README.md (raiz y subdirectorios)
2. CLAUDE.md (raiz y subdirectorios)
3. Cualquier *.md en la raiz del proyecto
4. Archivos de diseno, arquitectura, o planificacion
5. docs/ si existe
6. Comentarios en archivos de configuracion

Esto te da:
- Contexto que el codigo solo no revela
- Claims que puedes verificar contra el codigo
- Terminologia del dominio
- Decisiones ya documentadas (no reinventar)

Registra TODA inconsistencia entre documentacion y codigo.

--------------------------------------------------

FASE 0.5: METRICAS CUANTITATIVAS

Antes de generar la KB, produce estas metricas:

- Archivos totales por extension (.py, .ts, .tsx, .json, .yml, .sql, .md)
- Lineas de codigo por componente (backend, cada frontend, ws_gateway)
- Numero de endpoints REST (por metodo HTTP)
- Numero de eventos WebSocket
- Numero de modelos de base de datos
- Numero de stores (Zustand/Redux)
- Numero de hooks custom
- Numero de tests y tipo (unit, integration, e2e)
- Numero de dependencias (pip, npm)
- [v3] Numero de migraciones de BD y su estado
- [v3] Numero de scripts de tooling
- [v3] Numero de idiomas soportados por componente

--------------------------------------------------

[v3] FASE 0.75: INVENTARIO DE MADUREZ

Para CADA feature del sistema, clasificala:

| Nivel | Definicion | Ejemplo |
|-------|-----------|---------|
| COMPLETA | Modelo + API + Frontend + Tests + Docs | Login, CRUD productos |
| FUNCIONAL | Modelo + API + Frontend, sin tests completos | Kitchen Display, Estadisticas |
| PARCIAL | Tiene algunos layers pero no todos | Push notifications (backend + frontend, sin tests ni i18n) |
| SCAFFOLD | Modelo y/o estructura creados, sin logica completa | Reservaciones, Takeout/Delivery |
| PLANIFICADA | Documentada pero sin codigo | Feature-Sliced Design |

Este inventario va en 36_matriz_de_madurez.md y es LA REFERENCIA para priorizar trabajo.

--------------------------------------------------

FORMA DE TRABAJO (CRITICO)

Trabaja en iteraciones.

Ciclo:

1. [v3] Detecta KB existente (Fase -1)
2. Lee documentacion existente (Fase 0)
3. Analiza la estructura del proyecto
4. Produce metricas cuantitativas (Fase 0.5)
5. [v3] Clasifica features por madurez (Fase 0.75)
6. Explica que entendiste del sistema
7. Detecta:
   - inconsistencias (entre docs y codigo)
   - huecos (features sin implementar)
   - decisiones implicitas
   - bugs documentados como features
   - patrones planificados no implementados
   - [v3] features parciales (modelo sin API, API sin frontend)
   - [v3] dependencias rotas entre features
   - [v3] tooling faltante para DX
8. Haz preguntas cuando sea necesario
9. Genera o actualiza archivos de la base de conocimiento
10. Genera lista de acciones recomendadas priorizadas
11. [v3] Genera mapa de dependencias entre features
12. Propone mejoras estructurales o de producto

--------------------------------------------------

FORMATO DE SALIDA

Cada archivo debe generarse como archivo markdown bien estructurado.
Incluir un README.md en knowledge-base/ con indice navegable.

[v3] Cada archivo debe incluir al inicio:
```markdown
> Creado: YYYY-MM-DD | Actualizado: YYYY-MM-DD | Estado: vigente/necesita-revision
```

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

- Si la documentacion existente dice X pero el codigo hace Y:
  documenta la inconsistencia en 30_inconsistencias_detectadas.md
  y pregunta al usuario cual es el comportamiento correcto

- Si encuentras patrones de diseno planificados (en docs de arquitectura)
  que no estan implementados: documenta en 29_patrones_planificados_vs_implementados.md

- Si encuentras tests: analiza QUE testean y que NO testean.
  Los gaps de testing revelan areas de riesgo.

- [v3] Si encuentras una feature con modelo pero sin API:
  documenta en 37_features_parciales.md con estimacion de esfuerzo para completarla

- [v3] Si encuentras una capa de abstraccion (interface, ABC, factory):
  documenta en 43_capas_de_abstraccion.md — que extensiones estan previstas, cuales implementadas

- [v3] Si encuentras configuracion que puede confundir a un dev nuevo:
  documenta en 42_trampas_conocidas.md (gotchas)

- Prioriza: claridad > cantidad

--------------------------------------------------

NIVEL DE PROFUNDIDAD

No quiero documentacion superficial.

Explica siempre:

- el que
- el como
- el por que
- el donde (file paths exactos)
- el estado (funciona, parcial, roto, placeholder)
- [v3] el nivel de madurez (completa, funcional, parcial, scaffold, planificada)
- [v3] las dependencias (de que depende, que depende de esto)

Ejemplo malo:
"Hay un endpoint de login"

Ejemplo bueno:
"El sistema implementa autenticacion JWT con access token (15min) y refresh token (7 dias, HttpOnly cookie). El refresh se hace proactivamente a los 14 minutos con jitter de ±2min para evitar thundering herd. Token blacklist en Redis con patron fail-closed (si Redis cae, se rechazan todos los tokens). Madurez: COMPLETA. Depende de: Redis (blacklist), PostgreSQL (users). Lo usan: Dashboard, pwaWaiter (JWT), pwaMenu (table token). Ver: backend/shared/security/auth.py, Dashboard/src/stores/authStore.ts"

Ejemplo de feature parcial:
"Reservaciones: existe el modelo `Reservation` (backend/rest_api/models/reservation.py) con status flow PENDING→CONFIRMED→SEATED→COMPLETED/CANCELED/NO_SHOW, y migracion Alembic (003). NO existe: router, servicio, frontend, tests. Madurez: SCAFFOLD. Esfuerzo estimado para MVP: ~1 semana (API + frontend basico). Depende de: Table model (FK), Branch model (FK). Bloqueado por: nada."

--------------------------------------------------

ANALISIS DE SEGURIDAD

Para cada punto de entrada al sistema (endpoint, WebSocket, formulario):

1. Que autenticacion requiere?
2. Que autorizacion (RBAC)?
3. Hay rate limiting?
4. Hay validacion de input?
5. Hay proteccion contra SSRF/XSS/CSRF/SQL injection?
6. Los tokens expiran? Se pueden revocar?

Documenta en 31_modelo_de_seguridad.md y 32_superficie_de_ataque.md.

--------------------------------------------------

FLUJOS DE EVENTOS END-TO-END

Para sistemas con comunicacion real-time (WebSocket, SSE, pub/sub):

Documenta el flujo COMPLETO de al menos 5 eventos criticos, trazando desde la accion del usuario hasta el ultimo consumidor.

Incluir:
1. Accion del usuario (componente, boton)
2. Cadena de funciones frontend
3. Endpoint API (metodo, path, auth)
4. Handler backend (router → service → repository)
5. Operaciones de BD
6. Emision de evento (Outbox vs Direct Redis)
7. Canal/stream Redis
8. Procesamiento ws_gateway (subscriber → validator → router)
9. Conexiones destino (endpoints WS, filtro por sector?)
10. Recepcion frontend (store, update de UI)

Esto va en 33_flujos_de_eventos.md.

--------------------------------------------------

[v3] ANALISIS DE MADUREZ DE FEATURES

Para CADA feature del sistema, documenta en 36_matriz_de_madurez.md:

```markdown
| Feature | Modelo | API | Frontend | Tests | Docs | i18n | Madurez |
|---------|:------:|:---:|:--------:|:-----:|:----:|:----:|---------|
| Login   |   ✅   | ✅  |    ✅    |  ✅   |  ✅  |  -   | COMPLETA |
| Kitchen Display | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | FUNCIONAL |
| Reservaciones | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | SCAFFOLD |
```

Para cada feature con madurez < COMPLETA, documenta en 37_features_parciales.md:
- Que existe (con file paths)
- Que falta (layers especificos)
- Esfuerzo estimado para completar
- Dependencias y bloqueos

--------------------------------------------------

[v3] MAPA DE DEPENDENCIAS ENTRE FEATURES

Documenta en 38_mapa_de_dependencias.md:

```
Round Submission
  ├── depende de: Table Session, Product Catalog, Diner Registration
  ├── lo usan: Kitchen Display, Statistics, Billing
  └── WebSocket events: ROUND_PENDING, ROUND_CONFIRMED, etc.

Kitchen Display
  ├── depende de: Round Status Flow, WebSocket Events, Kitchen Router
  ├── lo usan: (standalone, consumer de datos)
  └── WebSocket events: ROUND_SUBMITTED, ROUND_IN_KITCHEN, ROUND_READY

Product Availability
  ├── depende de: BranchProduct model, Kitchen Router
  ├── lo usan: Public Menu, pwaMenu filtering
  └── WebSocket events: PRODUCT_AVAILABILITY_CHANGED
```

Este mapa responde: "si toco X, que se puede romper?"

--------------------------------------------------

[v3] DEVELOPER EXPERIENCE (DX)

Documenta en 40_onboarding_developer.md:

1. Prerequisitos (Docker, Node, Python, etc.)
2. Pasos exactos para tener el sistema corriendo desde cero
3. Cuanto tarda (estimacion realista)
4. Que puede salir mal (y como solucionarlo)
5. Primer feature para implementar como ejercicio de onboarding

Documenta en 41_tooling_inventario.md:

| Herramienta | Ubicacion | Comando | Proposito |
|-------------|-----------|---------|-----------|
| Seed modular | backend/rest_api/seeds/ | python cli.py db-seed --only=users | Poblar BD con datos de prueba |
| OpenAPI codegen | scripts/generate-types.sh | ./scripts/generate-types.sh | Generar tipos TS desde OpenAPI |
| Backup | devOps/backup/backup.sh | ./backup/backup.sh | Backup PostgreSQL + Redis |
| E2E tests | e2e/ | cd e2e && npx playwright test | Tests end-to-end |
| ... | ... | ... | ... |

Documenta en 42_trampas_conocidas.md:

```markdown
1. VITE_API_URL: Dashboard usa SIN /api, pwaMenu/pwaWaiter agregan /api internamente
2. Windows: uvicorn necesita `python -m uvicorn`, WS Gateway necesita PYTHONPATH
3. Redis port: 6380 externo, 6379 interno en Docker
4. Branch slugs: globalmente unicos (no por tenant)
5. Precios: SIEMPRE en centavos en backend, SIEMPRE en pesos en frontend
6. IDs: BigInteger en backend, string en frontend (convertir con String/parseInt)
```

--------------------------------------------------

[v3] CAPAS DE ABSTRACCION

Documenta en 43_capas_de_abstraccion.md:

Para cada interfaz/ABC/factory disenada para extensibilidad:

```markdown
## PaymentGateway
- Interface: backend/rest_api/services/payments/gateway.py
- Implementaciones: MercadoPagoGateway (actual)
- Extension prevista: Stripe, PayPal
- Metodos: create_preference(), verify_payment(), verify_webhook_signature(), handle_webhook()

## WebSocket Auth Strategy
- Interface: ws_gateway/components/auth/strategies.py
- Implementaciones: JWTAuthStrategy, TableTokenAuthStrategy, CompositeAuthStrategy, NullAuthStrategy
- Extension prevista: OAuth2Strategy, APIKeyStrategy
```

--------------------------------------------------

[v3] INTERNACIONALIZACION

Documenta en 44_internacionalizacion.md:

| Componente | i18n Setup | Idiomas | Cobertura | Calidad |
|------------|:----------:|---------|-----------|---------|
| pwaMenu | ✅ i18next | es, en, pt | 100% (zero hardcoded) | es=alta, en=media, pt=media |
| Dashboard | ✅ i18next (setup) | es, en | ~5% (solo sidebar) | Scaffold |
| pwaWaiter | ❌ | es hardcoded | 0% | No tiene i18n |
| Backend errors | Parcial | es (messages) | ~50% | Mensajes de error en espanol |

--------------------------------------------------

VERIFICACION CRUZADA

Antes de finalizar, haz estas verificaciones:

1. Todo endpoint documentado en la KB existe en el codigo?
2. Todo modelo documentado existe en la BD?
3. Todo patron documentado tiene evidencia de codigo?
4. Toda suposicion esta marcada como tal?
5. Toda inconsistencia docs-vs-codigo esta registrada?
6. Las preguntas abiertas cubren todo lo ambiguo?
7. El roadmap es coherente con las limitaciones y riesgos?
8. [v3] Toda feature tiene nivel de madurez asignado?
9. [v3] El mapa de dependencias cubre todas las features?
10. [v3] Las trampas conocidas cubren todos los gotchas encontrados?
11. [v3] Las capas de abstraccion documentan implementaciones actuales Y futuras previstas?

--------------------------------------------------

INICIO

Antes de generar archivos:

1. [v3] Detecta KB existente (Fase -1)
2. Lee TODA la documentacion existente (README, CLAUDE.md, *.md)
3. Analiza la estructura del proyecto
4. Produce metricas cuantitativas
5. [v3] Clasifica features por madurez
6. Explica:
   - que tipo de sistema es
   - stack tecnologico
   - nivel de madurez
   - que documentacion ya existe y que calidad tiene
   - [v3] cuantas features estan completas vs parciales vs scaffold
7. Identifica riesgos iniciales
8. Lista inconsistencias encontradas entre docs y codigo
9. [v3] Identifica features parciales y dependencias criticas
10. Propone un plan de como vas a construir la base de conocimiento
11. Haz preguntas SOLO si bloquean el analisis

--------------------------------------------------

OBJETIVO FINAL

Que esta base de conocimiento permita:

- Onboardear desarrolladores sin ver el codigo
- Redisenar el sistema
- Escalarlo
- Migrarlo
- Reconstruirlo desde cero
- Auditar seguridad sin acceso al entorno
- Identificar bugs y deuda tecnica sin correr tests
- Priorizar trabajo basandose en riesgos reales, no intuicion
- [v3] Saber exactamente que features estan completas y cuales necesitan trabajo
- [v3] Entender que se rompe si se toca una feature especifica
- [v3] Tener un dev productivo en < 1 hora con el onboarding guide
- [v3] Extender el sistema (nuevo payment gateway, nuevo idioma, nuevo frontend) siguiendo las capas de abstraccion documentadas

--------------------------------------------------

COMENZAR

Analiza el proyecto actual y empieza.
