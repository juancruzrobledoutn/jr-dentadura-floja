Actúa como un Arquitecto de Software Senior + Staff Engineer + Product Manager + Especialista en Reverse Engineering de Sistemas.

Tu misión es analizar completamente este proyecto existente (ubicado en el directorio actual) y transformarlo en una base de conocimiento exhaustiva, estructurada y autosuficiente.

IMPORTANTE:
La base de conocimiento debe permitir que una persona reconstruya el sistema SIN ver el código fuente.

--------------------------------------------------

OBJETIVO PRINCIPAL

Convertir TODO el proyecto en una Knowledge Base completa, incluyendo:

- Qué hace el sistema
- Por qué existe
- Cómo funciona
- Cómo está construido
- Cómo evoluciona
- Qué decisiones se tomaron

--------------------------------------------------

ALCANCE DEL ANÁLISIS

Debes analizar:

- Código fuente completo
- Estructura de carpetas
- Dependencias (package.json, requirements.txt, etc.)
- Configuraciones (.env, configs, etc.)
- Base de datos (si existe)
- Endpoints / APIs
- Componentes UI
- Lógica de negocio
- Scripts
- Tests (si existen)
- Nombres de variables/funciones (para inferir intención)

NO OMITAS NADA.
Si algo existe en el repo, debe reflejarse en la base de conocimiento.

--------------------------------------------------

PRINCIPIO CLAVE

La base de conocimiento ES el sistema.

Debe ser:

- Exhaustiva pero modular
- Clara pero profunda
- Dividida en múltiples archivos (NO archivos largos)
- Navegable
- Sin redundancia innecesaria
- Evolutiva

--------------------------------------------------

ESTRUCTURA OBJETIVO

Genera la base en /knowledge-base/ con esta estructura base (puedes ampliarla o quitar según la necesidad del sistema):

[ Núcleo del producto ]
- 01_vision_general.md
- 02_problema_que_resuelve.md
- 03_propuesta_de_valor.md
- 04_actores_y_roles.md

[ Funcionalidad ]
- 05_funcionalidades.md
- 06_flujos_de_usuario.md
- 07_casos_de_uso.md

[ Lógica del sistema ]
- 08_reglas_de_negocio.md
- 09_modelo_de_datos.md
- 10_estado_y_transiciones.md

[ Técnica ]
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

[ Evolución ]
- 24_roadmap_sugerido.md
- 25_oportunidades_de_mejora.md

[ Análisis crítico ]
- 26_suposiciones_detectadas.md
- 27_preguntas_abiertas.md

--------------------------------------------------

FORMA DE TRABAJO (CRÍTICO)

Trabaja en iteraciones.

Ciclo:

1. Analizas el proyecto
2. Explicas qué entendiste del sistema
3. Detectas:
   - inconsistencias
   - huecos
   - decisiones implícitas
4. Haces preguntas cuando sea necesario (ver regla abajo)
5. Generas o actualizas archivos de la base de conocimiento
6. Propones mejoras estructurales o de producto

--------------------------------------------------

FORMATO DE SALIDA

Cada archivo debe generarse así:

--- archivo: knowledge-base/nombre.md ---
(contenido en markdown claro, bien estructurado)
--- fin archivo ---

--------------------------------------------------

REGLAS IMPORTANTES

- NO inventes comportamiento → si no estás seguro:
  marcar como "Suposición"

- ANTE CUALQUIER DUDA debes preguntar:
  - incoherencias en el código
  - comportamientos ambiguos
  - decisiones poco claras
  - falta de contexto de negocio

- Si detectas código confuso:
  documenta la ambigüedad

- Si algo falta:
  agrégalo en "preguntas abiertas"

- Si detectas malas decisiones:
  explica el problema + propone alternativa

- Prioriza:
  claridad > cantidad

--------------------------------------------------

NIVEL DE PROFUNDIDAD

No quiero documentación superficial.

Explica siempre:

- el qué
- el cómo
- el por qué

Ejemplo malo:
"Hay un endpoint de login"

Ejemplo bueno:
"El sistema implementa autenticación basada en JWT sin refresh tokens, lo cual implica..."

--------------------------------------------------

INICIO

Antes de generar archivos:

1. Analiza la estructura del proyecto
2. Explica:
   - qué tipo de sistema es
   - stack tecnológico
   - nivel de madurez
3. Identifica riesgos iniciales
4. Propón un plan de cómo vas a construir la base de conocimiento
5. Haz preguntas SOLO si bloquean el análisis o detectas dudas

--------------------------------------------------

OBJETIVO FINAL

Que esta base de conocimiento permita:

- onboardear desarrolladores sin ver el código
- rediseñar el sistema
- escalarlo
- migrarlo
- reconstruirlo desde cero

--------------------------------------------------

COMENZAR

Analiza el proyecto actual y empieza.