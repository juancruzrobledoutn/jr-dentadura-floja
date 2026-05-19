# Documento Funcional del Backend — Sistema de Gestión Gastronómica "Buen Sabor"

## Introducción

El backend del sistema Buen Sabor constituye el núcleo operativo sobre el cual se sustentan todas las aplicaciones del ecosistema: el panel de administración, la aplicación de menú para comensales y la aplicación para mozos. Se trata de una interfaz de programación construida sobre principios de arquitectura limpia, diseñada para soportar operaciones concurrentes de entre cuatrocientos y seiscientos usuarios simultáneos, con capacidad de gestión multiinquilino y multisucursal.

El sistema se compone de dos servicios principales: una API REST que atiende en el puerto ocho mil y gestiona todas las operaciones de negocio, y una pasarela WebSocket que atiende en el puerto ocho mil uno y se encarga de la comunicación en tiempo real entre todos los participantes del sistema. Ambos servicios comparten una base de datos PostgreSQL y un servidor Redis que actúa como intermediario de mensajes y almacén de caché.

---

## Modelo de datos

### Estructura multiinquilino

El sistema está diseñado bajo un modelo multiinquilino donde cada restaurante opera como un inquilino aislado. Toda consulta a la base de datos se filtra automáticamente por el identificador de inquilino, lo que garantiza que la información de un restaurante nunca sea accesible desde otro.

Cada inquilino puede administrar múltiples sucursales. Las sucursales representan ubicaciones físicas del restaurante, cada una con su propio menú, sus mesas, su personal y sus operaciones de venta independientes.

### Jerarquía del menú

El menú se organiza en tres niveles: categorías, subcategorías y productos. Las categorías representan las divisiones principales del menú (por ejemplo, entradas, platos principales, postres, bebidas). Cada categoría contiene subcategorías que ofrecen una segmentación más fina (por ejemplo, dentro de entradas: empanadas, ensaladas, sopas). Finalmente, cada subcategoría contiene los productos individuales que los comensales pueden ordenar.

Los productos poseen un conjunto extenso de atributos. Además del nombre, la descripción y la imagen, cada producto puede tener un precio base global y, opcionalmente, precios diferenciados por sucursal. Esta funcionalidad permite que un mismo producto tenga un valor distinto según la ubicación donde se comercialice, e incluso permite desactivar la venta de un producto en sucursales específicas.

Cada producto puede vincularse con alérgenos, indicando para cada uno el tipo de presencia (contiene, puede contener o libre de) y el nivel de riesgo (bajo, estándar o alto). Los alérgenos del sistema incluyen información sobre reacciones cruzadas, como el síndrome de alergia al látex y frutas.

Los productos también poseen un perfil dietario detallado con indicadores individuales para vegetariano, vegano, sin gluten, sin lácteos, apto para celíacos, keto y bajo en sodio. Se pueden asociar métodos de cocción (horneado, frito, grillado, crudo, hervido, al vapor, salteado, braseado), perfiles de sabor (suave, intenso, dulce, salado, ácido, amargo, umami, picante) y perfiles de textura (crocante, cremoso, tierno, firme, esponjoso, gelatinoso, granulado).

Adicionalmente, los productos pueden contener advertencias con niveles de severidad (informativo, precaución, peligro), ingredientes con subingredientes desglosados y modificaciones permitidas (quitar o sustituir componentes).

Las categorías y subcategorías pueden excluirse por sucursal, lo que permite que cada ubicación ofrezca un menú adaptado sin necesidad de duplicar la estructura.

### Modelo de servicio

El modelo de servicio gira en torno al concepto de sesión de mesa. Cuando un comensal escanea el código QR de una mesa o cuando un mozo activa una mesa manualmente, se crea una sesión que permanece abierta hasta que se procesa el pago y se libera la mesa.

Dentro de cada sesión pueden participar múltiples comensales, cada uno identificado por un nombre y un color distintivo que permite atribuir los pedidos a cada persona. Los comensales interactúan con un carrito compartido en tiempo real: cuando uno agrega un producto al carrito, todos los demás comensales de la misma mesa ven el cambio instantáneamente.

Los pedidos se organizan en rondas. Cada ronda representa un envío de pedido al restaurante y contiene uno o más ítems, cada uno con la referencia al producto, la cantidad solicitada, el precio unitario capturado en el momento del pedido (para preservar la exactitud histórica) y notas especiales.

Cuando una mesa solicita la cuenta, el sistema genera un documento de cobro que totaliza el importe de todas las rondas no canceladas. Los pagos se registran contra este documento y se asignan a los cargos pendientes mediante un algoritmo de asignación secuencial (el primer pago cubre los primeros cargos, y así sucesivamente). El sistema soporta pagos parciales y métodos mixtos: un comensal puede pagar parte en efectivo y parte con Mercado Pago.

Las llamadas de servicio permiten que los comensales soliciten atención del mozo sin necesidad de hacer señas. Cada llamada tiene un tipo (recarga, cuenta, queja u otro) y atraviesa tres estados: activa, reconocida por el mozo y resuelta.

### Modelo de cocina

El sistema de cocina opera con dos niveles de granularidad. El primer nivel son las rondas, que representan el pedido completo de una mesa. El segundo nivel son los tickets de cocina, que fragmentan la ronda por estación de trabajo (preparación, freidora, parrilla, salsas, emplatado). Cada ticket agrupa los ítems que corresponden a una misma estación, lo que permite que múltiples cocineros trabajen en paralelo sobre diferentes componentes de un mismo pedido.

### Pista de auditoría

Todas las entidades del sistema mantienen un registro completo de auditoría. Cada registro almacena quién lo creó, quién lo modificó por última vez y quién lo eliminó, tanto mediante identificador numérico como mediante correo electrónico. Se registran las marcas de tiempo de creación, última modificación y eliminación. La eliminación es lógica: los registros no se borran físicamente sino que se marcan como inactivos, lo que permite la restauración posterior si fuera necesario.

---

## Autenticación y autorización

### Autenticación del personal

El personal del restaurante (administradores, gerentes, cocineros y mozos) se autentica mediante correo electrónico y contraseña. Al iniciar sesión exitosamente, el sistema emite dos credenciales: un token de acceso con una vigencia de quince minutos y un token de refresco con una vigencia de siete días.

El token de acceso contiene información del usuario encapsulada: su identificador, el inquilino al que pertenece, las sucursales a las que tiene acceso, sus roles y su correo electrónico. Cada token posee un identificador único que permite su revocación individual.

El token de refresco se almacena en una cookie segura del navegador, configurada como inaccesible desde JavaScript para prevenir ataques de robo de credenciales. Cuando el token de acceso expira, el sistema utiliza automáticamente el token de refresco para obtener nuevas credenciales sin interrumpir la sesión del usuario.

El sistema implementa rotación de tokens: cada vez que se utiliza un token de refresco, se emite uno nuevo y el anterior se invalida inmediatamente. Si el sistema detecta que un token de refresco ya invalidado intenta ser reutilizado, interpreta esto como un posible robo de credenciales y ejecuta una revocación total de todas las sesiones del usuario afectado como medida de protección.

El inicio de sesión está protegido contra ataques de fuerza bruta mediante un sistema de limitación de velocidad que restringe los intentos tanto por dirección de red como por correo electrónico. Los intentos fallidos se registran con el correo electrónico parcialmente enmascarado para proteger la información personal en los registros del sistema.

### Autenticación de comensales

Los comensales que utilizan la aplicación de menú no necesitan crear una cuenta ni iniciar sesión. En su lugar, al escanear el código QR de una mesa, reciben un token de mesa firmado digitalmente con una vigencia de tres horas. Este token se transmite en cada solicitud mediante una cabecera especial y habilita las operaciones de pedido, carrito compartido, llamadas de servicio y pago.

### Control de acceso basado en roles

El sistema define cuatro roles con niveles de acceso progresivos.

El administrador posee acceso irrestricto a todas las funcionalidades y a todas las sucursales del restaurante. Puede gestionar la estructura organizacional, el menú, el personal, las operaciones y la configuración del sistema.

El gerente puede gestionar el personal, las mesas, los sectores, los alérgenos y las promociones, pero únicamente dentro de las sucursales que tiene asignadas. No puede crear sucursales ni gestionar la configuración global del restaurante.

El cocinero tiene acceso exclusivo a la vista de cocina, las recetas y los ingredientes. Puede ver los pedidos que llegan a cocina y actualizar su estado de preparación, pero no tiene permisos para modificar el menú, los precios ni la estructura del restaurante.

El mozo puede verificar pedidos, atender llamadas de servicio, gestionar mesas y registrar pagos manuales, pero únicamente dentro de los sectores que le fueron asignados para la jornada.

---

## Interfaz pública

El sistema expone un conjunto de funcionalidades que no requieren autenticación, diseñadas para ser consumidas por la aplicación de menú de los comensales y por la pantalla de selección de sucursal de la aplicación de mozos.

La consulta del menú permite obtener la carta completa de una sucursal a partir de su identificador amigable. La respuesta incluye las categorías con sus subcategorías y productos, los precios específicos de esa sucursal, los alérgenos con sus tipos de presencia, los perfiles dietarios y los métodos de cocción. Las categorías y subcategorías excluidas de esa sucursal se omiten automáticamente.

Existe también una consulta de producto individual que devuelve la información detallada de un producto específico, incluyendo sus alérgenos con reacciones cruzadas, su perfil dietario completo, sus ingredientes con subingredientes desglosados, sus métodos de cocción, su perfil sensorial, las modificaciones permitidas y las advertencias de seguridad.

La consulta de sucursales públicas devuelve la lista de sucursales activas del restaurante, que la aplicación de mozos utiliza para que el mozo seleccione su sucursal antes de iniciar sesión.

La consulta de alérgenos devuelve el catálogo completo de alérgenos con información de reacciones cruzadas, soportando filtrado avanzado para condiciones como el síndrome de alergia al látex y frutas.

El sistema también ofrece puntos de verificación de salud: uno básico que reporta si el servicio está operativo, y uno detallado que incluye el estado de la conexión con la base de datos, el estado de la conexión con Redis, las estadísticas del mecanismo de protección contra fallos en cascada y el estado de la cola de reintentos de notificaciones de pago.

---

## Gestión de sesiones de mesa

El ciclo de vida de una sesión de mesa comienza cuando se activa la mesa, ya sea por el escaneo de un código QR por parte de un comensal o por la activación manual del mozo. En ese momento se crea una sesión con estado abierto y la mesa cambia su estado a activa.

Durante la sesión, los comensales pueden registrarse proporcionando su nombre, un identificador de dispositivo y un color distintivo. El registro es idempotente: si un comensal intenta registrarse con el mismo identificador local dentro de la misma sesión, el sistema retorna el registro existente en lugar de crear uno duplicado.

La sesión puede contener múltiples rondas de pedidos y mantiene un carrito compartido en tiempo real. Cuando un comensal solicita la cuenta, la sesión pasa al estado de pago. Durante este estado los comensales aún pueden seguir ordenando. Una vez que el pago se completa en su totalidad y el mozo libera la mesa, la sesión se cierra definitivamente y la mesa queda disponible para nuevos comensales.

---

## Flujo de pedidos

### Perspectiva del comensal

El comensal interactúa con un carrito compartido donde puede agregar productos, modificar cantidades, agregar notas especiales y eliminar ítems. Cada operación sobre el carrito se transmite en tiempo real a todos los comensales de la misma mesa, de modo que todos ven el mismo contenido del carrito en todo momento.

Cuando los comensales deciden enviar su pedido, se crea una ronda con estado pendiente. Cada ítem de la ronda captura el precio vigente en ese momento, lo que garantiza que eventuales cambios de precio posteriores no afecten los pedidos ya realizados.

### Confirmación y envío a cocina

El flujo de un pedido atraviesa seis estados con restricciones de rol en cada transición.

El pedido nace como pendiente cuando el comensal lo envía. Un mozo debe verificar el pedido presencialmente en la mesa y marcarlo como confirmado. Esta verificación evita que pedidos erróneos o malintencionados lleguen a la cocina sin supervisión humana.

Una vez confirmado, un administrador o gerente envía el pedido a cocina, momento en que su estado cambia a enviado. Este paso adicional de supervisión permite que la dirección del restaurante tenga control sobre el flujo de trabajo antes de comprometer recursos de cocina.

Cuando el personal de cocina comienza a preparar el pedido, lo marca como en preparación. Al finalizar la preparación, lo marca como listo. Finalmente, cuando el mozo entrega los platos a la mesa, marca el pedido como servido.

En cualquier momento antes de ser servido, un administrador o gerente puede cancelar un pedido.

La cocina únicamente ve los pedidos que ya fueron enviados a cocina. Los pedidos pendientes y confirmados permanecen invisibles para el personal de cocina, ya que aún no han sido autorizados para su preparación.

### Tickets de cocina

Cuando un pedido llega a cocina, el sistema puede fragmentarlo en tickets asignados a estaciones de trabajo específicas. Si un pedido incluye una hamburguesa, una ensalada y unas papas fritas, se generan tickets separados para la estación de parrilla, la estación de preparación y la estación de fritura. Cada ticket atraviesa sus propios estados: pendiente, en progreso, listo y entregado. Esto permite que múltiples estaciones trabajen en paralelo y que el sistema rastree el progreso granular de cada componente del pedido.

### Flujo gestionado por el mozo

Cuando los comensales no disponen de teléfono o prefieren no usar la aplicación, el mozo puede gestionar todo el proceso directamente. El mozo activa la mesa manualmente, indica la cantidad de comensales, toma el pedido utilizando un menú compacto sin imágenes optimizado para velocidad, y envía la ronda en nombre de los comensales. El mozo también puede registrar pagos manuales (efectivo, tarjeta física o transferencia) y cerrar la mesa al finalizar el servicio.

---

## Facturación y pagos

### Solicitud de cuenta

Cuando un comensal o mozo solicita la cuenta, el sistema genera un documento de cobro que totaliza el importe de todas las rondas no canceladas de la sesión. La solicitud es idempotente: si ya existe un documento de cobro para esa sesión, se retorna el existente en lugar de crear uno nuevo. El estado de la mesa cambia a en proceso de pago y se emite un evento que notifica a todos los participantes.

### Pagos en efectivo

El registro de un pago en efectivo es una operación que el sistema protege contra condiciones de carrera mediante bloqueos exclusivos a nivel de base de datos. El sistema verifica que el monto del pago no exceda el saldo pendiente, crea el registro de pago, lo asigna a los cargos pendientes mediante el algoritmo de asignación secuencial y actualiza el estado del documento de cobro. Si el pago completa el saldo total, el documento de cobro se marca como pagado.

Cada operación de pago se registra en una cadena de auditoría resistente a manipulación, que almacena la identidad del usuario que registró el pago, su dirección de red, el tipo de recurso, el identificador del recurso y los datos de la transacción.

### Pagos con Mercado Pago

La integración con Mercado Pago permite que los comensales paguen digitalmente desde la aplicación de menú. El proceso comienza cuando el sistema crea una preferencia de pago en Mercado Pago, calculando el monto pendiente restante (lo que permite pagos mixtos: parte en efectivo, parte digital). La preferencia incluye la descripción de la mesa, el monto en pesos argentinos y las direcciones de retorno para los distintos resultados del pago.

Cuando Mercado Pago procesa el pago, envía una notificación al sistema mediante un mecanismo de retrollamada. El sistema verifica la autenticidad de esta notificación mediante una firma digital antes de procesarla. Para prevenir el procesamiento duplicado de una misma notificación, el sistema utiliza bloqueos exclusivos a nivel de base de datos.

Si el procesamiento de una notificación falla, el sistema la encola para reintento con un mecanismo de retroceso exponencial: el primer reintento se ejecuta a los diez segundos, el segundo a los veinte, el tercero a los cuarenta, y así sucesivamente hasta un máximo de una hora entre intentos, con un límite de cinco intentos totales. Las notificaciones que agotan todos los intentos se derivan a una cola de mensajes no procesables para revisión manual.

La comunicación con la interfaz de programación de Mercado Pago está protegida por un mecanismo de disyuntor que previene fallos en cascada. Si el servicio de Mercado Pago presenta cinco fallos consecutivos, el disyuntor se abre y todas las solicitudes subsiguientes reciben una respuesta inmediata de servicio no disponible con una indicación del tiempo de espera sugerido, en lugar de acumularse y degradar el rendimiento del sistema. Después de treinta segundos, el disyuntor permite dos solicitudes de prueba; si ambas tienen éxito, el servicio se restablece completamente.

### Liberación de mesa

Una vez que el pago está completo, el mozo puede liberar la mesa. El sistema verifica que todos los pagos han sido cobrados, cierra la sesión, marca la mesa como libre y emite un evento que notifica a todos los participantes. Si la mesa ya estaba libre, la operación se maneja de forma idempotente sin generar errores.

---

## Llamadas de servicio

Las llamadas de servicio permiten que los comensales soliciten atención del mozo desde la aplicación de menú. Cada llamada especifica un tipo (recarga de bebida, solicitud de cuenta, queja u otro motivo) y se crea con estado activa.

El mozo puede reconocer la llamada, lo que cambia su estado a reconocida e informa a los comensales que su solicitud fue recibida. Posteriormente, el mozo resuelve la llamada marcándola como cerrada. El sistema registra la identidad del mozo que reconoció y resolvió cada llamada, junto con las marcas de tiempo correspondientes.

Las llamadas de servicio activas se filtran por la sucursal del mozo y se envían únicamente a los mozos asignados al sector donde se encuentra la mesa, lo que evita que mozos de otros sectores reciban notificaciones irrelevantes.

---

## Gestión administrativa

### Sucursales y estructura física

Los administradores pueden crear, modificar y consultar sucursales, cada una con su nombre, dirección, teléfono, correo electrónico, horarios de apertura y cierre, y estado de actividad. Cada sucursal se divide en sectores (interior, terraza, barra, VIP) que agrupan las mesas físicas. Las mesas se identifican con un código alfanumérico compuesto por el prefijo del sector y un número correlativo (por ejemplo, INT-01 para la primera mesa del interior).

### Asignaciones de mozos

Las asignaciones de mozos a sectores se gestionan de forma diaria. Un administrador o gerente asigna a cada mozo los sectores donde trabajará durante su turno (mañana, tarde o noche). Estas asignaciones determinan qué mesas puede ver el mozo y qué notificaciones recibe. La aplicación de mozos verifica la asignación del día antes de permitir el acceso, garantizando que un mozo solo trabaje en las sucursales y sectores donde fue programado.

### Menú y catálogos

La administración del menú comprende la gestión de categorías, subcategorías y productos con todos sus atributos. Cada operación de creación, modificación y eliminación valida que el usuario tenga acceso a la sucursal correspondiente y que los datos cumplan con las reglas de negocio.

Los catálogos globales del sistema incluyen alérgenos con reacciones cruzadas, métodos de cocción, perfiles de sabor, perfiles de textura, tipos de cocina, grupos de ingredientes con ingredientes y subingredientes. Estos catálogos están aislados por inquilino, lo que permite que cada restaurante personalice su configuración sin afectar a otros.

Las exclusiones por sucursal permiten ocultar categorías o subcategorías completas en sucursales específicas, adaptando el menú visible sin modificar la estructura global.

### Personal

La gestión de personal permite crear usuarios con roles asignados por sucursal. Un mismo usuario puede tener roles diferentes en distintas sucursales. El sistema valida la unicidad del correo electrónico y las contraseñas se almacenan cifradas con un algoritmo resistente a ataques de fuerza bruta.

### Promociones

Las promociones son ofertas comerciales con vigencia temporal que combinan productos a un precio especial. Cada promoción define un rango de fechas y horarios, las sucursales donde aplica y los productos que componen el combo con sus cantidades.

### Recetas y fichas técnicas

El módulo de recetas permite crear fichas técnicas detalladas que documentan la preparación de cada plato. Las fichas incluyen ingredientes con cantidades y unidades, pasos de preparación numerados con tiempos estimados, notas del chef, consejos de presentación, instrucciones de almacenamiento, perfil de alérgenos, perfil dietario, perfil sensorial, información de costos (costo de producción, precio sugerido, rendimiento) y advertencias de seguridad.

Las fichas técnicas pueden ser marcadas como ingeridas por un sistema de base de conocimiento que las convierte en material de consulta para un asistente de inteligencia artificial orientado al personal de cocina.

### Pedidos y reportes

La interfaz administrativa permite consultar los pedidos activos con estadísticas de resumen (total activos, pendientes, en cocina, listos) y filtrarlos por sucursal y estado. También ofrece reportes analíticos con información de ingresos, productos más vendidos y horas pico.

### Auditoría

El sistema mantiene un registro de auditoría consultable que permite filtrar por tipo de entidad, tipo de acción, usuario responsable y rango de fechas. Los administradores también pueden restaurar entidades previamente eliminadas (eliminación lógica).

Todas las listas administrativas soportan paginación mediante parámetros de límite y desplazamiento, con un máximo de quinientos registros por consulta.

---

## Sistema de eventos en tiempo real

### Arquitectura de la pasarela WebSocket

La pasarela WebSocket es un servicio independiente que gestiona las conexiones de todos los participantes del sistema. Cada tipo de participante se conecta a un punto de acceso específico: los mozos al punto de mozos, el personal de cocina al punto de cocina, los administradores al punto de administración y los comensales al punto de comensales.

La pasarela mantiene índices multidimensionales de todas las conexiones activas, organizados por usuario, sucursal, sector y sesión de mesa. Esto permite enviar mensajes con precisión a subconjuntos específicos de destinatarios sin necesidad de iterar sobre todas las conexiones.

Para soportar alta concurrencia, el sistema implementa bloqueos fragmentados por sucursal que reducen la contención en un noventa por ciento comparado con un bloqueo global. La difusión de mensajes se paraleliza en lotes de cincuenta conexiones, lo que reduce el tiempo de difusión a cuatrocientos usuarios simultáneos de aproximadamente cuatro segundos a ciento sesenta milisegundos.

### Autenticación en WebSocket

La autenticación de las conexiones WebSocket utiliza un patrón de estrategia con dos implementaciones: una estrategia basada en tokens de acceso para el personal del restaurante y una estrategia basada en tokens de mesa para los comensales. Los tokens de acceso se revalidan periódicamente cada cinco minutos para detectar tokens revocados, y las conexiones con tokens inválidos se cierran con un código de error específico.

### Tipos de eventos

El sistema define un catálogo extenso de eventos agrupados por dominio.

Los eventos del ciclo de vida de pedidos notifican cada cambio de estado: pendiente, confirmado, enviado a cocina, en preparación, listo, servido y cancelado. También se notifica la eliminación de ítems individuales de un pedido.

Los eventos de llamadas de servicio notifican la creación, el reconocimiento y la resolución de cada llamada.

Los eventos de facturación notifican la solicitud de cuenta, la aprobación y el rechazo de pagos, y la finalización del cobro completo.

Los eventos de carrito compartido notifican la adición, modificación y eliminación de ítems, así como la limpieza completa del carrito.

Los eventos de mesas notifican el inicio de sesión, la liberación de mesa y los cambios de estado.

Los eventos de tickets de cocina notifican el inicio de preparación, la finalización y la entrega de cada ticket.

Los eventos administrativos notifican la creación, modificación y eliminación de entidades, incluyendo las eliminaciones en cascada.

### Enrutamiento de eventos

Cada tipo de evento tiene reglas de enrutamiento que determinan quién lo recibe. Los eventos de pedidos pendientes se envían a todos los mozos de la sucursal y a los administradores. Los eventos de pedidos confirmados se envían a los administradores y a los mozos del sector correspondiente. Los eventos enviados a cocina se dirigen al personal de cocina, los administradores y los mozos. Los eventos de pedidos listos y en preparación se envían adicionalmente a los comensales de la mesa.

Los mozos reciben eventos filtrados por sector: solo reciben notificaciones de las mesas ubicadas en los sectores que tienen asignados. Los administradores y gerentes siempre reciben todos los eventos de sus sucursales sin filtrado sectorial.

### Garantía de entrega

El sistema utiliza dos estrategias de publicación de eventos según su criticidad.

Los eventos financieros y críticos (solicitud de cuenta, pagos, envío a cocina, pedido listo, creación de llamada de servicio) se publican mediante un patrón de bandeja de salida transaccional. El evento se escribe en una tabla de la base de datos dentro de la misma transacción que la operación de negocio, lo que garantiza atomicidad. Un procesador de fondo lee la tabla y publica los eventos en Redis de forma asíncrona. Este mecanismo garantiza que ningún evento crítico se pierda, incluso si Redis está temporalmente no disponible.

Los eventos informativos de menor criticidad (confirmación de pedido, preparación en cocina, servicio, sincronización de carrito, cambios de mesa, operaciones administrativas) se publican directamente en Redis con menor latencia. La pérdida eventual de estos eventos es aceptable porque pueden reconstruirse consultando el estado actual.

### Resiliencia

La pasarela WebSocket implementa un mecanismo de disyuntor para la conexión con Redis que previene fallos en cascada. Si Redis no está disponible, el disyuntor se abre y los eventos se descartan de forma controlada en lugar de acumular solicitudes fallidas. La cola de eventos tiene un límite de cinco mil mensajes con un sistema de contrapresión que alerta cuando la tasa de descarte supera el cinco por ciento.

Cada conexión WebSocket está sujeta a un límite de velocidad de veinte mensajes por segundo, implementado mediante un algoritmo de ventana deslizante. Las conexiones mantienen un latido cada treinta segundos y se consideran inactivas después de sesenta segundos sin respuesta.

Las conexiones cerradas reciben códigos de error específicos: cuatro mil uno para fallo de autenticación, cuatro mil tres para acceso prohibido y cuatro mil veintinueve para exceso de velocidad.

---

## Seguridad

### Protección contra ataques

El sistema implementa múltiples capas de protección. Los encabezados de seguridad incluyen política de seguridad de contenido, seguridad estricta de transporte en producción, protección contra enmarcado y contra detección de tipo de contenido. La validación de tipo de contenido rechaza solicitudes de modificación que no sean de tipo JSON o formulario codificado. La validación de origen en WebSocket verifica que las conexiones provengan de orígenes autorizados.

La limitación de velocidad protege los puntos de acceso sensibles: el inicio de sesión permite cinco intentos por minuto, la solicitud de cuenta diez por minuto, el registro de pago en efectivo veinte por minuto, la creación de preferencia de Mercado Pago cinco por minuto y el registro de comensales veinte por minuto.

La validación de direcciones de imágenes bloquea intentos de ataque de falsificación de solicitudes del lado del servidor, rechazando direcciones internas, de metadatos de nube y direcciones privadas. Se verifica que las direcciones utilicen protocolos seguros y que correspondan a extensiones de archivo de imagen válidas.

Los términos de búsqueda se sanean eliminando caracteres de control y limitando su longitud. Los patrones de búsqueda en base de datos se escapan para prevenir inyecciones.

### Protección de datos personales

Los registros del sistema enmascaran los correos electrónicos, mostrando únicamente los primeros tres y los últimos tres caracteres. Las contraseñas se almacenan cifradas con un algoritmo diseñado para ser computacionalmente costoso, lo que dificulta los ataques de fuerza bruta incluso si la base de datos se ve comprometida.

### Configuración de producción

El sistema valida su configuración al iniciar y se niega a arrancar en entorno de producción si detecta que las claves secretas mantienen sus valores predeterminados. Los requisitos de producción incluyen secretos de al menos treinta y dos caracteres aleatorios, la configuración explícita de los orígenes permitidos para solicitudes entre dominios, la activación de cookies seguras exclusivas para conexiones cifradas y la desactivación del modo de depuración.

---

## Observabilidad

El sistema genera registros estructurados con contexto enriquecido que incluye el identificador del usuario, el identificador del inquilino y la acción realizada. Cada módulo utiliza un registrador especializado (API REST, comensales, cocina, mozos, facturación) lo que permite filtrar y analizar los registros por dominio funcional.

La verificación detallada de salud reporta el estado de conectividad con PostgreSQL y Redis, las estadísticas del mecanismo de protección contra fallos en cascada y el estado de la cola de reintentos de notificaciones de pago. Si alguna dependencia está degradada, el sistema retorna un estado de servicio no disponible.

El sistema soporta integración con plataformas de observabilidad distribuida mediante instrumentación automática que registra trazas de solicitudes a través de la API, la base de datos y Redis, permitiendo diagnosticar problemas de rendimiento en entornos distribuidos.

Las métricas del sistema están disponibles en un formato compatible con sistemas de monitoreo estándar de la industria, lo que permite crear paneles de visualización y configurar alertas operativas.

---

## Datos iniciales

El sistema incluye un mecanismo de siembra que inicializa la base de datos con datos de demostración cuando se detecta que está vacía. La siembra crea un inquilino de ejemplo, una sucursal con tres sectores (interior, terraza y barra), un conjunto de usuarios de prueba con distintos roles, categorías de menú con productos y alérgenos, y asignaciones de mozos a sectores. La siembra es idempotente: si los datos ya existen, no se ejecuta, lo que previene duplicaciones en reinicios del servicio.

---

## Consideraciones de escalabilidad

El sistema está diseñado para escalar horizontalmente. Múltiples instancias de la API REST pueden operar detrás de un balanceador de carga, compartiendo la base de datos y Redis como estado común. La pasarela WebSocket opera como un servicio separado que puede replicarse independientemente. Las conexiones a la base de datos se gestionan mediante un mecanismo de agrupación que optimiza el uso de recursos y se ajusta por instancia.

El mecanismo de publicación y suscripción de Redis permite que eventos emitidos por una instancia de la API sean recibidos por todas las instancias de la pasarela WebSocket, garantizando que todos los clientes conectados reciban las notificaciones independientemente de la instancia que procesó la operación original.
