# Documentación Funcional de la Aplicación del Mozo (pwaWaiter)

## Introducción

La aplicación del mozo constituye la herramienta de trabajo digital del personal de sala dentro del sistema de gestión gastronómica Buen Sabor. Diseñada como una aplicación web progresiva optimizada para dispositivos móviles, permite a los mozos gestionar sus mesas asignadas en tiempo real, recibir notificaciones inmediatas sobre pedidos y llamados de servicio, tomar pedidos para clientes que no disponen de dispositivo móvil, y coordinar el flujo operativo entre los comensales y la cocina. La aplicación opera exclusivamente dentro del contexto de una sucursal y un conjunto de sectores asignados para la jornada del día, garantizando que cada mozo acceda únicamente a la información relevante para su área de trabajo.

El diseño de la aplicación prioriza la velocidad de respuesta y la claridad visual. En un entorno de trabajo donde cada segundo cuenta, la interfaz presenta la información crítica mediante códigos de color, animaciones de prioridad y notificaciones sonoras que permiten al mozo identificar instantáneamente qué mesas requieren atención urgente sin necesidad de leer textos extensos.

---

## Flujo de Autenticación

### Selección de Sucursal Previa al Inicio de Sesión

El proceso de ingreso a la aplicación comienza con la selección de la sucursal donde el mozo trabajará durante la jornada. Esta pantalla se presenta antes del inicio de sesión propiamente dicho y no requiere autenticación: la aplicación consulta al servidor la lista de sucursales activas del sistema, presentándolas con su nombre y dirección para que el mozo identifique la correcta.

Esta decisión de diseño responde a una necesidad operativa concreta. Un mozo puede estar asignado a diferentes sucursales en distintos días, y la verificación de su asignación depende de cuál sucursal seleccione. Separar la selección de sucursal del inicio de sesión permite al mozo cambiar de sucursal sin necesidad de cerrar sesión completamente si seleccionó la incorrecta.

### Inicio de Sesión

Una vez seleccionada la sucursal, la pantalla de inicio de sesión muestra el nombre de la sucursal elegida junto con un enlace para cambiarla, y presenta los campos habituales de correo electrónico y contraseña. Al autenticarse exitosamente, el sistema verifica que el usuario posea el rol de mozo o administrador; de lo contrario, rechaza el acceso.

El token de acceso obtenido tiene una vigencia de quince minutos. Para evitar interrupciones durante el servicio, la aplicación renueva proactivamente este token cada catorce minutos, un minuto antes de su expiración. Si la renovación falla, el sistema reintenta hasta tres veces antes de cerrar la sesión automáticamente y redirigir al mozo a la pantalla de inicio de sesión. El token de renovación se almacena en una cookie segura gestionada por el servidor, nunca expuesta al código de la aplicación.

### Verificación de Asignación

Tras el inicio de sesión exitoso, la aplicación ejecuta una verificación crítica: consulta al servidor si el mozo está asignado a la sucursal seleccionada para el día actual. El servidor evalúa las asignaciones de sector vigentes y responde con la confirmación o el rechazo.

Si el mozo no está asignado a la sucursal seleccionada, la aplicación presenta una pantalla de acceso denegado que muestra la fecha actual e indica al mozo que debe contactar a un gerente o administrador para ser asignado a un sector. Un botón permite seleccionar otra sucursal e intentar nuevamente.

Si la verificación es exitosa, la aplicación recibe la lista de sectores asignados al mozo y habilita el acceso a la interfaz principal. Simultáneamente, establece la conexión WebSocket para comenzar a recibir eventos en tiempo real.

---

## Interfaz Principal

### Estructura de la Pantalla

La interfaz principal se organiza en una estructura vertical que maximiza la información visible en la pantalla del dispositivo móvil del mozo.

La barra superior presenta el logotipo de la aplicación junto al nombre de la sucursal actual, un indicador visual del estado de la conexión WebSocket representado por un punto verde cuando está conectado o rojo cuando está desconectado, un contador de operaciones pendientes que aparece únicamente cuando existen acciones en cola esperando conectividad, y el correo electrónico del usuario con el botón de cierre de sesión.

Debajo de la barra superior se encuentra el sistema de navegación principal con dos pestañas: la pestaña de comensales, que es la vista predeterminada y muestra la cuadrícula de mesas con su estado en tiempo real, y la pestaña de autogestión, que proporciona acceso a la funcionalidad de comanda rápida para tomar pedidos en nombre de clientes sin dispositivo.

### Filtrado de Mesas

Una barra de filtros permite al mozo segmentar la vista de mesas según su estado operativo. El filtro de todas las mesas muestra el panorama completo. El filtro de mesas urgentes destaca aquellas que tienen llamados de servicio pendientes o una solicitud de cuenta activa. El filtro de mesas activas muestra exclusivamente las mesas con una sesión en curso. El filtro de mesas libres presenta las mesas disponibles para nuevos comensales. El filtro de fuera de servicio muestra las mesas que están temporalmente inhabilitadas por mantenimiento u otras razones.

### Agrupación por Sectores

Las mesas se presentan agrupadas por sector del salón, reflejando la organización física del establecimiento. Cada grupo de sector muestra un encabezado con el nombre del sector, un contador de mesas contenidas y un indicador de urgencia que pulsa en rojo si alguna mesa del sector requiere atención inmediata. Dentro de cada sector, las mesas con situaciones urgentes se posicionan primero, seguidas por las demás mesas ordenadas por su código.

---

## Tarjeta de Mesa

### Presentación Visual

Cada mesa se representa mediante una tarjeta que condensa toda la información operativa relevante en un formato compacto y legible a distancia. El elemento central es el código de la mesa en tipografía grande y negrita, que permite al mozo identificar la mesa física correspondiente de un vistazo.

El estado de la mesa se indica mediante un código de color consistente en toda la aplicación. El verde representa una mesa libre sin sesión activa. El rojo indica una mesa activa con comensales atendidos. El púrpura señala una mesa en proceso de pago donde se ha solicitado la cuenta. El gris identifica una mesa fuera de servicio.

### Indicadores de Estado de Pedido

Cuando una mesa tiene pedidos activos, la tarjeta muestra un indicador de estado de pedido con colores que reflejan la situación más urgente entre todas las rondas de la mesa. El amarillo indica pedidos pendientes que aún no han sido validados. El azul señala pedidos confirmados o en proceso de envío a cocina. El naranja marca una situación mixta donde algunos ítems están listos para servir mientras otros aún se encuentran en preparación; esta distinción resulta crucial para que el mozo sepa que debe pasar por la cocina a recoger parte del pedido. El verde indica que todos los pedidos están listos para ser servidos.

### Insignias de Notificación

En la esquina superior derecha de la tarjeta se acumulan insignias que alertan sobre situaciones que requieren la atención del mozo. Una insignia naranja con un número indica la cantidad de rondas de pedido abiertas. Una insignia roja con un número señala la cantidad de llamados de servicio pendientes. Una insignia púrpura con la leyenda de cuenta indica que los comensales han solicitado la facturación.

---

## Sistema de Animaciones Prioritarias

La aplicación implementa un sistema de animaciones con prioridades estrictas que garantiza que la señal visual más importante siempre prevalezca cuando múltiples eventos coinciden en una misma mesa.

La animación de máxima prioridad es el parpadeo rojo, que se activa durante tres segundos cuando un comensal solicita la atención del mozo mediante un llamado de servicio. Esta animación captura inmediatamente la atención del mozo, independientemente de qué otras notificaciones tenga la mesa.

La segunda prioridad es el parpadeo naranja, que se mantiene durante cinco segundos cuando una mesa tiene ítems listos para servir y simultáneamente otros ítems aún en cocina. Este estado indica al mozo que debe dirigirse a la cocina a recoger un pedido parcial.

La tercera prioridad es el parpadeo azul de un segundo y medio que se activa ante cualquier cambio de estado general de la mesa, como el inicio de una nueva sesión o la confirmación de un pedido.

La cuarta prioridad es un pulso amarillo de dos segundos que señala la llegada de un nuevo pedido desde la mesa de los comensales.

La quinta prioridad es un pulso púrpura que se activa cuando los comensales solicitan la cuenta.

Cada animación se autolimpia después de su duración predefinida mediante temporizadores que se gestionan rigurosamente para prevenir fugas de memoria. Cuando el mozo cierra sesión o una mesa se reinicia, todos los temporizadores activos se cancelan.

---

## Detalle de Mesa

### Panel de Información

Al tocar una tarjeta de mesa, se despliega un panel modal que presenta la información detallada de la sesión activa. El encabezado muestra el código de la mesa con su indicador de estado y un botón de cierre.

La sección de resumen presenta una cuadrícula con dos métricas clave: la cantidad de rondas de pedidos pendientes y la cantidad de llamados de servicio activos. Debajo se muestra el total consumido acumulado durante la sesión, expresado en la moneda local.

### Gestión de Llamados de Servicio

Cuando la mesa tiene llamados de servicio pendientes, se presenta un banner rojo prominente que indica la cantidad de llamados activos. Junto al banner, un botón permite al mozo acusar recibo del llamado, confirmando al comensal a través de su dispositivo que el mozo está en camino. Al tocarlo, el botón cambia visualmente para indicar que el llamado ha sido atendido. La resolución del llamado se registra en el servidor y se difunde a todos los dispositivos involucrados.

### Alerta de Pedido Listo

Cuando alguna ronda de pedidos alcanza el estado de lista para servir, se muestra un banner verde pulsante con el mensaje de que el pedido está listo para ser recogido en cocina. Esta alerta visual complementa la notificación sonora que el mozo recibió cuando la cocina marcó el pedido como completado.

### Visualización de Rondas

Las rondas de pedidos se presentan con un sistema de filtrado por pestañas que permite al mozo visualizar todas las rondas, solo las pendientes que incluyen los estados de pendiente, confirmado, enviado y en cocina, solo las rondas listas para servir, o solo las rondas ya servidas.

Cada ronda muestra su número secuencial, su estado actual mediante un indicador de color, y la lista de ítems con el nombre del producto, la categoría, la cantidad solicitada y el precio unitario. Cada ítem incluye además un indicador de color que identifica al comensal que realizó el pedido, proporcionando contexto sobre quién en la mesa ordenó qué.

### Acciones sobre Rondas

Para las rondas en estado pendiente o confirmado, el mozo puede eliminar ítems individuales mediante un botón de eliminación que requiere confirmación antes de ejecutarse. Si la eliminación del último ítem deja la ronda vacía, esta se elimina automáticamente y el contador de rondas abiertas se decrementa.

Para las rondas en estado listo, el mozo dispone de un botón para marcar la ronda como servida, indicando que los platos han sido entregados en la mesa. Esta acción también requiere confirmación y, al ejecutarse, actualiza el estado de la ronda tanto localmente como en el servidor, generando una animación de cambio de estado en la tarjeta de mesa.

---

## Comanda Rápida

### Propósito

La comanda rápida resuelve un escenario operativo frecuente: clientes que no disponen de dispositivo móvil o que prefieren dictar su pedido al mozo de manera tradicional. En lugar de obligar al mozo a utilizar una libreta de papel, la aplicación proporciona una interfaz de toma de pedidos compacta que se integra directamente con el sistema de gestión de la cocina.

### Selección de Mesa

El primer paso de la comanda rápida es seleccionar la mesa para la cual se tomará el pedido. La interfaz muestra las mesas filtradas para incluir únicamente las mesas libres y las mesas activas, excluyendo las que están fuera de servicio o en proceso de pago. Para las mesas libres, el mozo debe indicar la cantidad de comensales que se sentarán, lo que activa la mesa creando una nueva sesión. Para las mesas activas, el sistema utiliza la sesión existente directamente.

### Interfaz de Toma de Pedidos

Una vez seleccionada la mesa, se presenta una interfaz dividida en dos paneles. El panel izquierdo funciona como un navegador de menú compacto que muestra las categorías como pestañas desplazables, una barra de búsqueda para localizar productos por nombre o descripción, y la lista de productos disponibles con su nombre, una descripción breve y el precio. Cada producto incluye un botón de adición rápida que lo incorpora al carrito con un solo toque.

El menú utilizado en la comanda rápida es una versión compacta del menú completo que omite las imágenes de los productos para reducir el consumo de datos y agilizar la carga. Esta decisión de diseño reconoce que el mozo conoce la carta y no necesita referencias visuales de los platos.

El panel derecho muestra el carrito de la comanda en construcción. Cada ítem del carrito presenta controles para incrementar o decrementar la cantidad, el precio unitario multiplicado por la cantidad, y un botón de eliminación. La parte inferior del carrito muestra el total acumulado, un botón para vaciar el carrito completamente y un botón de confirmación para enviar el pedido.

### Envío del Pedido

Al confirmar el pedido, la aplicación envía los ítems al servidor como una nueva ronda asociada a la sesión de mesa. El servidor genera un evento de ronda pendiente que se difunde a todos los dispositivos conectados: si el comensal tiene la aplicación abierta en su propio dispositivo, verá aparecer el pedido en su historial; la cocina recibirá la notificación una vez que la ronda sea validada y enviada por la gerencia; y la propia interfaz del mozo actualizará el contador de rondas abiertas en la tarjeta de mesa correspondiente.

Tras el envío exitoso, la interfaz muestra una confirmación visual durante un segundo y medio antes de cerrarse automáticamente, devolviendo al mozo a la vista principal de mesas.

### Comanda desde el Detalle de Mesa

Adicionalmente a la comanda rápida accesible desde la pestaña de autogestión, el mozo puede tomar un pedido adicional directamente desde el panel de detalle de una mesa activa. Esta funcionalidad presenta la misma interfaz de menú compacto y carrito, pero contexualizada dentro de la sesión existente de la mesa, sin necesidad de seleccionarla nuevamente. Resulta especialmente útil cuando el mozo ya está consultando el estado de una mesa y el comensal solicita agregar ítems al pedido.

---

## Gestión de Llamados de Servicio

### Recepción del Llamado

Cuando un comensal solicita la atención del mozo desde su dispositivo, el servidor publica un evento de llamado de servicio que llega instantáneamente a la aplicación del mozo. La recepción del llamado desencadena una cadena de señales diseñadas para capturar la atención del mozo de manera inequívoca.

La tarjeta de la mesa correspondiente activa la animación de parpadeo rojo, que tiene la máxima prioridad visual en el sistema de animaciones. Simultáneamente, la aplicación reproduce un sonido de alerta que se activa independientemente de los permisos de notificación del navegador. El contador de llamados pendientes en la insignia roja de la tarjeta se incrementa. Si el dispositivo del mozo tiene habilitadas las notificaciones del navegador, se muestra además una notificación del sistema con el mensaje de llamado de mesa, que persiste hasta que el mozo interactúe con ella.

El sistema implementa un mecanismo de deduplicación que previene el incremento múltiple del contador cuando el comensal toca repetidamente el botón de llamado. Cada llamado tiene un identificador único, y el sistema rastrea los identificadores ya procesados para ignorar duplicados, manteniendo un registro limitado a cien entradas para prevenir el crecimiento descontrolado de la memoria.

### Resolución del Llamado

Desde el panel de detalle de la mesa, el mozo puede acusar recibo del llamado tocando el botón de atención. Esta acción envía una confirmación al servidor que se difunde al dispositivo del comensal, informándole que el mozo está en camino. Visualmente, el botón cambia de un estado de alerta rojo a un estado de confirmación verde.

La resolución completa del llamado se registra cuando el mozo cierra el caso tras haber atendido la solicitud del comensal, eliminando el llamado del registro activo y decrementando el contador de la tarjeta de mesa.

---

## Comunicación en Tiempo Real

### Conexión WebSocket

La aplicación mantiene una conexión WebSocket persistente con el servidor de eventos, autenticada mediante el token de acceso del mozo. El indicador visual en la barra superior de la interfaz informa constantemente al mozo sobre el estado de esta conexión.

### Reconexión Automática

Si la conexión se interrumpe, el sistema ejecuta un proceso de reconexión automática con intervalos que se incrementan progresivamente desde un segundo hasta un máximo de treinta segundos, con una variación aleatoria para evitar la reconexión simultánea de múltiples dispositivos. El sistema realiza hasta cincuenta intentos de reconexión.

Ciertos códigos de cierre indican situaciones irrecuperables que no justifican reintentos: la autenticación fallida cuando el token ha expirado y no puede renovarse, los permisos insuficientes cuando el rol del usuario ya no permite la conexión, y la limitación de velocidad cuando el dispositivo ha excedido la tasa de mensajes permitida.

La aplicación detecta cuando el navegador pasa a segundo plano, como ocurre cuando el mozo bloquea la pantalla del dispositivo o cambia de aplicación. Al regresar al primer plano, verifica el estado de la conexión y la restablece si es necesario, garantizando que el mozo no pierda eventos durante las interrupciones del dispositivo.

### Actualización del Token

Cuando el token de acceso se renueva proactivamente cada catorce minutos, la aplicación notifica al servicio WebSocket del nuevo token. El servicio cierra la conexión actual y establece una nueva con el token actualizado, con un pequeño retardo para evitar condiciones de carrera entre el cierre y la reconexión.

### Latido Cardíaco

Para detectar conexiones que han dejado de funcionar silenciosamente, la aplicación envía un pulso cada treinta segundos y espera la respuesta dentro de un plazo de diez segundos. Si no recibe respuesta, cierra la conexión y activa el proceso de reconexión.

### Eventos Procesados

La aplicación procesa eventos de cuatro categorías principales. Los eventos del ciclo de pedidos informan sobre cada transición de estado de las rondas, desde la creación de un pedido pendiente hasta su entrega como servido, pasando por la confirmación, el envío a cocina, la preparación y la disponibilidad. Los eventos de llamados de servicio notifican la creación, el acuse de recibo y el cierre de las solicitudes de asistencia de los comensales. Los eventos de facturación informan sobre solicitudes de cuenta, pagos aprobados o rechazados, y cuentas saldadas. Los eventos de mesa notifican sobre el inicio de nuevas sesiones, los cambios de estado y el cierre de sesiones.

Cada categoría de evento actualiza el estado local de la aplicación inmediatamente, proporcionando una respuesta visual instantánea antes de cualquier consulta adicional al servidor. Las notificaciones urgentes, como los pedidos listos para servir, los llamados de servicio y las solicitudes de cuenta, activan además alertas sonoras para captar la atención del mozo incluso cuando no está mirando la pantalla.

---

## Funcionamiento Sin Conexión

### Cola de Reintentos

La aplicación está diseñada para mantener la operatividad del mozo incluso durante interrupciones temporales de la conexión de red. Las acciones que el mozo realiza mientras está desconectado se almacenan automáticamente en una cola de reintentos persistente que sobrevive al cierre del navegador.

Las acciones que soportan el encolamiento incluyen marcar una ronda como servida, acusar recibo de un llamado de servicio, resolver un llamado de servicio y liberar una mesa. Cuando el mozo ejecuta cualquiera de estas acciones y la conexión de red no está disponible, la aplicación registra la acción localmente con toda la información necesaria para reproducirla posteriormente.

### Procesamiento de la Cola

Al detectar que la conectividad se ha restablecido, la aplicación procesa automáticamente las acciones encoladas con un breve retardo de cien milisegundos para consolidar múltiples acciones que puedan haberse acumulado. Cada acción se reintenta hasta tres veces; si después de tres intentos la acción sigue fallando, se descarta para evitar el bloqueo de la cola.

El sistema discrimina entre errores transitorios y errores permanentes. Los errores de red y los tiempos de espera agotados se consideran transitorios y justifican reintentos. Los errores del servidor que indican situaciones como recursos no encontrados o permisos denegados se consideran permanentes y la acción se descarta inmediatamente.

Un mecanismo de deduplicación previene el encolamiento de acciones duplicadas: si ya existe en la cola una acción del mismo tipo para la misma entidad, la nueva solicitud se descarta.

### Indicadores Visuales

El contador de operaciones pendientes en la barra superior de la interfaz muestra la cantidad de acciones encoladas junto con un indicador de actividad giratorio, proporcionando al mozo visibilidad sobre las operaciones que aún no se han sincronizado con el servidor. Este contador desaparece cuando la cola se vacía completamente.

Un banner de estado de conexión aparece en la parte superior de la pantalla cuando el dispositivo pierde conectividad, mostrando un mensaje de sin conexión en rojo. Al restablecerse la conexión, el banner cambia brevemente a un mensaje de reconexión en naranja durante cinco segundos antes de desaparecer.

---

## Almacenamiento en Caché y Datos Locales

### Caché de Mesas

La aplicación almacena los datos de las mesas en una base de datos local indexada que permite al mozo consultar la información de sus mesas incluso sin conexión de red. Esta caché se actualiza cada vez que el servidor envía datos frescos y sirve como respaldo cuando las consultas al servidor no son posibles.

### Historial de Acciones

El historial de acciones del mozo registra las operaciones significativas realizadas durante la jornada: rondas marcadas como servidas, llamados de servicio completados y otras interacciones relevantes. Este historial se mantiene limitado a las cincuenta entradas más recientes y se sincroniza entre múltiples pestañas del navegador mediante un canal de difusión que permite que si el mozo tiene la aplicación abierta en dos dispositivos, ambos reflejen el mismo historial.

### Persistencia del Estado de Autenticación

El estado de autenticación, incluyendo el token de acceso, la información del usuario, la sucursal seleccionada y el estado de verificación de asignación, se persiste en el almacenamiento local del navegador con un control de versiones que permite migrar el formato de los datos almacenados cuando la aplicación se actualiza.

---

## Notificaciones y Alertas

### Notificaciones del Navegador

Al iniciar sesión, la aplicación solicita permiso para mostrar notificaciones del navegador. Los eventos urgentes generan notificaciones que persisten en el panel de notificaciones del dispositivo hasta que el mozo interactúa con ellas, garantizando que no pasen desapercibidas. Los eventos no urgentes generan notificaciones que se cierran automáticamente después de cinco segundos.

El sistema implementa un período de enfriamiento de cinco segundos entre notificaciones para evitar la saturación cuando múltiples eventos llegan en rápida sucesión. Adicionalmente, las notificaciones se deduplican por su contenido para evitar que el mismo evento genere alertas repetidas.

### Alertas Sonoras

Los eventos urgentes reproducen un sonido de alerta independientemente de si el mozo ha concedido permisos de notificación. El archivo de sonido se carga bajo demanda para no impactar el rendimiento inicial de la aplicación. Los eventos que activan alerta sonora son los llamados de servicio de los comensales, las solicitudes de cuenta y los pedidos listos para servir en cocina.

---

## Características de Aplicación Web Progresiva

### Instalabilidad

La aplicación puede instalarse en el dispositivo del mozo como una aplicación independiente, eliminando la barra de direcciones del navegador y proporcionando una experiencia visual comparable a la de una aplicación nativa. La pantalla de instalación incluye capturas del uso de la aplicación en formatos horizontal y vertical para orientar al mozo sobre la funcionalidad que obtendrá.

Una vez instalada, la aplicación ofrece accesos directos desde la pantalla de inicio que permiten abrir directamente la vista de todas las mesas o la vista filtrada de mesas urgentes, acelerando el acceso a la información más relevante durante el servicio.

### Almacenamiento en Caché del Navegador

La estrategia de almacenamiento en caché se adapta al tipo de recurso. Las imágenes se almacenan con prioridad al contenido local durante siete días. Los datos de mesas del servidor utilizan una estrategia que prioriza la red pero recurre a la caché local si la red no responde dentro de un plazo razonable, con una vigencia de una hora. Las tipografías se almacenan durante un año completo. Si el dispositivo está completamente desconectado, se presenta una página de respaldo que informa al mozo de la situación.

### Actualización de la Aplicación

La aplicación verifica periódicamente la disponibilidad de nuevas versiones y, al detectar una actualización, notifica al mozo para que pueda aplicarla en el momento que considere oportuno, evitando interrupciones durante momentos críticos del servicio.

---

## Actualización de Mesas

### Mecanismos de Actualización

La vista de mesas se mantiene actualizada mediante tres mecanismos complementarios. El primero y principal son los eventos WebSocket en tiempo real que actualizan el estado de cada mesa instantáneamente cuando ocurre un cambio. El segundo es una actualización periódica automática que consulta al servidor cada sesenta segundos para reconciliar cualquier evento que pudiera haberse perdido. El tercero es un botón de actualización manual flotante en la esquina inferior derecha de la pantalla que el mozo puede tocar en cualquier momento.

Adicionalmente, la aplicación soporta el gesto de arrastrar hacia abajo para actualizar, un patrón familiar en aplicaciones móviles que se activa cuando el mozo desliza el dedo hacia abajo desde la parte superior de la lista de mesas, con un umbral de ochenta píxeles para distinguir el gesto de un desplazamiento normal.

---

## Flujo Completo de Autogestión de Mesa

### Ciclo Completo sin Intervención del Comensal

La funcionalidad de autogestión permite al mozo gestionar el ciclo completo de una mesa sin que los comensales utilicen la aplicación en ningún momento. Este flujo cubre desde la activación de la mesa hasta su cierre tras el pago.

El mozo selecciona una mesa libre e indica la cantidad de comensales, lo que activa la mesa y crea una sesión en el servidor. A continuación, toma el pedido utilizando la interfaz de comanda rápida y lo envía como una ronda. La ronda ingresa al flujo normal del sistema: se valida, se envía a cocina, se prepara y se marca como lista. El mozo recibe la notificación de pedido listo y lo sirve.

Cuando los comensales desean pagar, el mozo puede solicitar la cuenta directamente desde la aplicación. El sistema calcula el total consumido y el mozo puede registrar el pago manualmente, indicando el método utilizado: efectivo, tarjeta física, transferencia externa u otro método manual. Tras registrar el pago, el mozo cierra la mesa, lo que reinicia su estado a libre y la prepara para los siguientes comensales.

En cada uno de estos pasos, el mozo puede consultar el resumen de la sesión que incluye la hora de apertura, la cantidad de comensales, el número de rondas, el total consumido, el monto pagado y el estado de la cuenta.

---

## Seguridad

### Protección de Solicitudes

La capa de comunicación con el servidor implementa validaciones de seguridad que previenen ataques de falsificación de solicitudes del lado del servidor. La dirección del servidor se verifica contra una lista de servidores y puertos permitidos, rechazando direcciones que apunten a redes internas o que incluyan credenciales embebidas.

### Gestión de Sesión

Las credenciales de renovación del token se almacenan exclusivamente en cookies seguras gestionadas por el servidor, inaccesibles desde el código de la aplicación. La detección de respuestas de autenticación fallida desencadena el cierre de sesión inmediato para prevenir bucles de renovación infinitos.

### Aislamiento por Sucursal

El mozo accede exclusivamente a la información de la sucursal seleccionada y verificada. Todas las consultas al servidor incluyen el identificador de sucursal, y el servidor valida que el mozo tenga asignación vigente para esa sucursal antes de devolver cualquier dato.

---

## Registro y Trazabilidad

### Sistema de Registro Centralizado

Todas las operaciones significativas de la aplicación generan registros estructurados con contexto relevante. El sistema utiliza registradores especializados para cada área funcional: comunicación con el servidor, eventos WebSocket, autenticación y gestión de estado. Los registros de depuración se emiten únicamente en entornos de desarrollo, mientras que las advertencias y errores se registran en todos los entornos.

### Historial del Mozo

El historial de acciones proporciona trazabilidad de las operaciones realizadas por el mozo durante su jornada, registrando qué rondas marcó como servidas, qué llamados de servicio atendió y otras acciones relevantes, con las marcas temporales correspondientes. Este historial puede consultarse para verificar la actividad del mozo y resolver discrepancias operativas.

---

## Accesibilidad

La aplicación implementa atributos de accesibilidad en todos los elementos interactivos. Los paneles modales se identifican correctamente como diálogos con su título asociado y restauran el foco al elemento previo al cerrarse. Los contadores dinámicos de mesas y notificaciones se anuncian a los lectores de pantalla mediante regiones activas que se actualizan en tiempo real. Los iconos decorativos se ocultan de las tecnologías asistivas, y todos los botones y controles interactivos incluyen etiquetas descriptivas accesibles. La navegación por teclado está soportada, con la tecla de escape disponible para cerrar los paneles modales.
