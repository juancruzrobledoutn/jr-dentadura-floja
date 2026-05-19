# Documentación Funcional del WebSocket Gateway

## Introducción

El WebSocket Gateway constituye el componente de comunicación en tiempo real del sistema de gestión gastronómica Buen Sabor. Su propósito fundamental es establecer y mantener conexiones bidireccionales persistentes entre el servidor y los distintos tipos de usuarios del sistema, permitiendo que los eventos generados por las operaciones del negocio se propaguen instantáneamente a todos los participantes relevantes. Este gateway opera como un servicio independiente en el puerto 8001, separado del API REST principal, y se encarga exclusivamente de la distribución de eventos en tiempo real sin contener lógica de negocio propia.

La arquitectura del gateway sigue un patrón de orquestador delgado, donde los componentes principales delegan responsabilidades a módulos especializados. Esta decisión de diseño permite que cada aspecto del sistema de comunicación en tiempo real evolucione de manera independiente, facilitando tanto el mantenimiento como la escalabilidad del servicio.

---

## Puntos de Conexión

El gateway expone cuatro puntos de conexión WebSocket, cada uno diseñado para atender a un tipo específico de usuario del sistema. Esta separación no es arbitraria: cada tipo de conexión tiene requisitos de autenticación, filtrado de eventos y permisos fundamentalmente distintos.

### Conexión para Mozos

El punto de conexión destinado a los mozos permite que el personal de sala reciba notificaciones sobre nuevas rondas de pedidos, llamados de servicio de los comensales y cambios en el estado de las mesas. La particularidad de esta conexión radica en el filtrado por sectores: un mozo solamente recibe eventos correspondientes a los sectores del salón que tiene asignados para la jornada del día. Sin embargo, ciertos eventos de naturaleza general, como el inicio de una nueva sesión de mesa o la llegada de un pedido pendiente, se distribuyen a todos los mozos de la sucursal independientemente de su sector asignado, ya que representan información que todo el personal de sala necesita conocer.

Los mozos pueden actualizar sus asignaciones de sector sin necesidad de desconectarse y reconectarse. Mediante un comando especial de actualización, el gateway consulta nuevamente la base de datos para obtener las asignaciones vigentes y ajusta el filtrado de eventos en consecuencia. Esta funcionalidad resulta esencial cuando un encargado reasigna sectores durante el transcurso del servicio.

Los usuarios con rol de gerente o administrador también pueden conectarse a través de este punto, recibiendo en ese caso todos los eventos de la sucursal sin filtrado por sector.

### Conexión para Cocina

El punto de conexión de cocina está diseñado para que el personal de preparación de alimentos reciba exclusivamente los pedidos que requieren su atención. Un aspecto fundamental del diseño es que la cocina no recibe notificaciones sobre pedidos en estado pendiente ni confirmados por el mozo; únicamente comienza a ver los pedidos cuando estos alcanzan el estado de enviados a cocina o superior. Esta decisión responde a la necesidad operativa de no abrumar al personal de cocina con pedidos que aún no han sido validados por el personal de sala y la gerencia.

Los eventos que llegan a cocina incluyen la recepción de nuevos pedidos para preparar, las actualizaciones de estado de los tickets de cocina y las confirmaciones de entrega. Los roles autorizados para esta conexión son cocina, gerente y administrador.

### Conexión para Administración

El punto de conexión administrativo es el más amplio en cuanto a la variedad de eventos que recibe. Los usuarios del panel de administración obtienen visibilidad completa sobre todas las operaciones de sus sucursales asignadas: movimientos de pedidos en todos sus estados, llamados de servicio, operaciones de facturación y pagos, cambios en sesiones de mesa, y todas las operaciones de creación, modificación y eliminación de entidades del sistema.

Esta conexión no aplica filtrado por sector, ya que los administradores y gerentes necesitan una vista panorámica de toda la operación de la sucursal. Los eventos de tipo administrativo, como las notificaciones de cambios en el catálogo de productos o la estructura organizativa, se distribuyen exclusivamente a través de este canal.

### Conexión para Comensales

La conexión de comensales difiere fundamentalmente de las anteriores en su mecanismo de autenticación. Mientras que las conexiones de personal utilizan tokens de sesión basados en credenciales de usuario, los comensales se autentican mediante un token de mesa generado al escanear el código de la mesa. Este token vincula al dispositivo del comensal con una sesión de mesa específica, sin requerir la creación de una cuenta de usuario.

Los eventos que recibe un comensal están estrictamente limitados a su sesión de mesa: actualizaciones del carrito compartido cuando otros comensales de la misma mesa agregan o modifican ítems, cambios en el estado de los pedidos desde que ingresan a cocina en adelante, notificaciones sobre la cuenta y los pagos, y avisos sobre el estado de la mesa. Los comensales no reciben información sobre otras mesas ni sobre la operación general del restaurante.

---

## Sistema de Autenticación

La autenticación del gateway implementa un patrón de estrategias intercambiables que permite manejar los dos mecanismos de autenticación del sistema de manera uniforme.

### Autenticación por Token de Sesión

Las conexiones del personal (mozos, cocina, administración) se autentican mediante un token de sesión proporcionado como parámetro en la conexión. El gateway valida este token verificando su firma criptográfica, su vigencia temporal y los roles contenidos en él. Se rechaza explícitamente cualquier token de tipo renovación, ya que estos tokens tienen un propósito diferente y no deben utilizarse para establecer conexiones persistentes.

La validación de roles es estricta: el token debe contener al menos uno de los roles requeridos por el punto de conexión solicitado. Un token de mozo no puede establecer una conexión en el punto de cocina, y viceversa, salvo que el usuario posea múltiples roles.

Para mantener la seguridad durante conexiones de larga duración, el gateway revalida periódicamente el token de cada conexión activa. Esta revalidación ocurre cada cinco minutos y verifica que el token no haya sido revocado o que los permisos del usuario no hayan cambiado desde que se estableció la conexión.

### Autenticación por Token de Mesa

Los comensales se autentican mediante un token generado específicamente para su sesión de mesa. Este token contiene la información de la sesión, la mesa, la sucursal y el inquilino, y se verifica mediante un mecanismo de firma criptográfica diferente al de los tokens de sesión del personal. La revalidación de estos tokens ocurre cada treinta minutos, reflejando su mayor vigencia temporal.

### Validación de Origen

Como medida de seguridad adicional, el gateway verifica el origen de las conexiones WebSocket comparándolo contra una lista de orígenes permitidos. En entornos de desarrollo, se permiten conexiones desde los puertos locales habituales. En producción, los orígenes permitidos se configuran mediante una variable de entorno, y las conexiones desde orígenes no autorizados se rechazan con un código de cierre específico por violación de política.

Las conexiones de comensales reciben un tratamiento más flexible en cuanto a la validación de origen, dado que las aplicaciones móviles pueden no enviar un encabezado de origen consistente.

---

## Gestión de Conexiones

El sistema de gestión de conexiones representa una de las áreas más sofisticadas del gateway, diseñada para manejar eficientemente cientos de conexiones simultáneas con aislamiento multi-inquilino garantizado.

### Índices de Conexiones

El gateway mantiene múltiples índices que permiten localizar conexiones de manera eficiente según distintos criterios. Estos índices funcionan como mapas bidireccionales: dado un usuario, se pueden encontrar todas sus conexiones activas; dada una sucursal, se pueden localizar todas las conexiones de esa sucursal; dado un sector, se identifican los mozos asignados; y dada una sesión de mesa, se encuentran todos los comensales conectados.

Adicionalmente, se mantienen índices especializados para administradores y personal de cocina por sucursal, lo que permite dirigir eventos específicos a estos grupos sin necesidad de filtrar el conjunto completo de conexiones.

Los mapeos inversos garantizan que la desconexión de un usuario sea una operación eficiente: en lugar de recorrer todos los índices para eliminar referencias, el sistema consulta directamente qué sucursales, sectores y sesiones tiene asociados cada conexión y los elimina de forma atómica.

Cada conexión está asociada a un inquilino específico, lo que garantiza el aislamiento absoluto entre restaurantes. Un evento generado en el contexto de un inquilino jamás llega a conexiones pertenecientes a otro inquilino, independientemente del canal por el que se distribuya.

### Límites y Protecciones

El gateway impone un límite máximo de tres conexiones simultáneas por usuario, lo que permite que un mismo usuario tenga el sistema abierto en múltiples dispositivos sin consumir recursos excesivos. El límite total de conexiones del gateway es de mil conexiones simultáneas; al alcanzar este umbral, las nuevas conexiones se rechazan con un código indicativo de sobrecarga del servidor.

Las operaciones de conexión y desconexión se realizan de manera atómica mediante un sistema de bloqueos que previene condiciones de carrera. El orden de adquisición de bloqueos está rigurosamente definido para evitar interbloqueos: primero el contador global de conexiones, luego el bloqueo por usuario, seguido del bloqueo por sucursal, y finalmente los bloqueos de sector y sesión.

### Detección y Limpieza de Conexiones

El gateway implementa un mecanismo de latido cardíaco para detectar conexiones que han dejado de responder. Los clientes deben enviar un mensaje de tipo ping cada treinta segundos, y el gateway responde con un mensaje pong. Las conexiones que no envían un latido durante sesenta segundos se consideran obsoletas y son candidatas a limpieza.

El proceso de limpieza opera en dos fases para minimizar la contención de recursos. En la primera fase, se identifican las conexiones obsoletas sin realizar modificaciones en los índices. En la segunda fase, se procede a cerrar las conexiones identificadas y a eliminar sus referencias de todos los índices. Este ciclo se ejecuta cada treinta segundos.

Además de las conexiones obsoletas, el gateway rastrea las conexiones que han fallado durante un intento de envío. Estas conexiones se marcan como muertas y se eliminan en el siguiente ciclo de limpieza, evitando que los intentos fallidos de envío bloqueen la distribución de eventos al resto de los usuarios.

---

## Sistema de Bloqueos Fragmentados

Para manejar la concurrencia de cientos de conexiones simultáneas sin degradar el rendimiento, el gateway utiliza un sistema de bloqueos fragmentados que distribuye la contención entre múltiples bloqueos independientes en lugar de utilizar un único bloqueo global.

Los bloqueos se organizan por categoría: existe un bloqueo global para el contador de conexiones, bloqueos individuales por sucursal para las operaciones que afectan a conexiones de una sucursal específica, bloqueos individuales por usuario para las operaciones que afectan a un usuario particular, y bloqueos globales para sectores y sesiones.

El sistema mantiene un caché de hasta quinientos bloqueos activos. Cuando el número de bloqueos se acerca a este límite, se activa un proceso de limpieza que elimina los bloqueos no utilizados, reduciendo el conjunto al ochenta por ciento del umbral de limpieza. Este mecanismo de histéresis previene oscilaciones frecuentes entre creación y limpieza de bloqueos.

La limpieza de bloqueos se ejecuta como una tarea diferida para evitar que el proceso de limpieza en sí mismo genere contención adicional. Las operaciones principales pueden continuar sin esperar a que la limpieza finalice.

---

## Limitación de Velocidad

Cada conexión individual está sujeta a un limitador de velocidad que controla la cantidad de mensajes que puede enviar por segundo. El algoritmo utilizado es una ventana deslizante que permite hasta veinte mensajes por segundo por conexión. Cuando un cliente excede este límite, sus mensajes adicionales son rechazados hasta que la ventana se desplace lo suficiente para permitir nuevos mensajes.

El limitador de velocidad también controla la tasa global de difusión del gateway, permitiendo un máximo de diez operaciones de difusión por segundo para prevenir la saturación de los recursos del servidor durante ráfagas de actividad intensa.

Un aspecto notable del diseño del limitador es su mecanismo de penalización por evasión. Si un usuario se desconecta y reconecta intentando restablecer su contador de mensajes, el sistema retiene un registro de penalización que inyecta marcas de tiempo artificiales en el nuevo contador, neutralizando el intento de eludir el límite. Estas penalizaciones tienen una vigencia de una hora, tras la cual expiran automáticamente.

El limitador puede rastrear hasta dos mil conexiones simultáneamente. Cuando alcanza su capacidad máxima, elimina el diez por ciento de las entradas más antiguas, aplicando penalizaciones a las conexiones desalojadas para que, en caso de reaparecer, no obtengan un tratamiento preferencial.

---

## Canales de Comunicación con Redis

La comunicación entre el servidor principal y el gateway se realiza a través de Redis utilizando dos mecanismos complementarios, cada uno optimizado para diferentes garantías de entrega.

### Publicación y Suscripción

El mecanismo principal de distribución de eventos utiliza el sistema de publicación y suscripción de Redis. El gateway se suscribe a patrones de canales organizados por tipo de destinatario: canales por sucursal para mozos, cocina y administración, canales por sector para mozos con filtrado sectorial, y canales por sesión para comensales.

Cuando el servidor principal genera un evento, lo publica en el canal apropiado según el destinatario. El gateway recibe la publicación, valida su estructura, y la encola para su procesamiento. Este mecanismo ofrece la menor latencia posible pero no garantiza la entrega si el gateway no está conectado en el momento de la publicación.

Los eventos que utilizan este canal incluyen las actualizaciones de estado de rondas confirmadas y en cocina, los eventos del carrito compartido, los cambios de estado de mesas, y las notificaciones administrativas de cambios en entidades. Estos eventos toleran la pérdida ocasional, ya que el estado siempre puede recuperarse consultando el servidor principal.

### Flujos de Redis

Para los eventos donde la pérdida es inaceptable, el sistema utiliza flujos de Redis que proporcionan entrega garantizada al menos una vez. Los eventos financieros como solicitudes de cuenta, confirmaciones de pago y estados de transacciones se transmiten a través de este canal, al igual que los eventos operativos críticos como el envío de pedidos a cocina, los avisos de pedidos listos para servir y la creación de llamados de servicio.

El consumidor de flujos opera como un grupo de consumidores, lo que permite que múltiples instancias del gateway procesen eventos del mismo flujo sin duplicación. Cada mensaje procesado exitosamente se confirma explícitamente; los mensajes que fallan se reintentan hasta un máximo de tres veces antes de ser derivados a una cola de mensajes fallidos para revisión manual.

Al reiniciarse, el consumidor primero procesa los mensajes pendientes que quedaron sin confirmar de la ejecución anterior, garantizando que ningún evento crítico se pierda durante un reinicio del servicio. Periódicamente, el consumidor también reclama mensajes que han permanecido en estado pendiente por más de treinta segundos sin ser procesados, cubriendo el escenario de un consumidor que falló sin confirmar sus mensajes.

---

## Enrutamiento de Eventos

El enrutador de eventos constituye el componente que determina, para cada evento recibido, a cuáles conexiones debe distribuirse. Esta decisión se basa en el tipo de evento, la sucursal de origen, el sector asociado y la sesión de mesa involucrada.

### Eventos del Ciclo de Pedidos

Los eventos de pedidos siguen una distribución progresiva que refleja el flujo operativo del restaurante. Cuando un pedido se encuentra pendiente, la notificación llega a todos los administradores de la sucursal y a todos los mozos sin distinción de sector, ya que cualquier mozo podría necesitar intervenir. Cuando el pedido es confirmado por un mozo, la notificación se dirige a administradores y a los mozos del sector correspondiente. Al ser enviado a cocina, el evento se amplía para incluir al personal de cocina. Desde el momento en que el pedido entra en preparación, los comensales de la mesa también comienzan a recibir actualizaciones sobre su progreso. Este patrón garantiza que cada actor reciba la información en el momento adecuado de su participación en el proceso.

### Eventos de Llamados de Servicio

Los llamados de servicio generados por los comensales se dirigen al sector correspondiente de la mesa que realizó el llamado. Los administradores siempre reciben estos eventos. Cuando un mozo acusa recibo del llamado, los comensales de la mesa reciben la confirmación. Al cerrarse el llamado, tanto administradores como comensales son notificados.

### Eventos del Carrito Compartido

Los eventos del carrito son exclusivos de la sesión de mesa. Cuando un comensal agrega, modifica o elimina un ítem del carrito, todos los demás comensales de la misma mesa reciben la actualización instantáneamente. Estos eventos no se distribuyen al personal del restaurante, ya que el carrito representa una etapa previa al envío formal del pedido.

### Eventos de Facturación y Pagos

Las solicitudes de cuenta, las confirmaciones de pago y los estados de transacciones se distribuyen a los administradores de la sucursal y a los comensales de la sesión involucrada. Estos eventos utilizan el canal de flujos de Redis para garantizar su entrega, dada la naturaleza financiera de la información.

### Eventos Administrativos

Las operaciones de creación, modificación y eliminación de entidades del sistema generan eventos que se distribuyen exclusivamente a las conexiones administrativas de la sucursal afectada. Estos eventos permiten que múltiples administradores mantengan sus interfaces sincronizadas sin necesidad de recargar la información manualmente. Las eliminaciones en cascada generan un evento específico que detalla todas las entidades afectadas por la operación.

---

## Difusión de Mensajes

El sistema de difusión está optimizado para manejar el envío simultáneo de mensajes a cientos de conexiones con la menor latencia posible.

### Grupo de Trabajadores

La arquitectura de difusión utiliza un grupo de diez trabajadores paralelos que procesan envíos desde una cola centralizada con capacidad para cinco mil operaciones pendientes. Cuando se necesita enviar un mensaje a un conjunto de conexiones, el sistema crea una promesa de resultado para cada envío, coloca las operaciones en la cola, y los trabajadores las procesan en paralelo. Este enfoque reduce drásticamente la latencia de difusión: en un escenario con cuatrocientos usuarios conectados, el tiempo de difusión se reduce de aproximadamente cuatro segundos con envío secuencial a menos de doscientos milisegundos con el grupo de trabajadores.

Si el grupo de trabajadores no está activo, el sistema recurre a un modo de envío por lotes donde agrupa las conexiones de destino en grupos de cincuenta y envía a cada grupo de manera concurrente antes de pasar al siguiente. Este modo sirve como mecanismo de respaldo durante el arranque o en caso de fallo del grupo de trabajadores.

### Manejo de Fallos

Las conexiones que fallan durante un intento de envío no interrumpen la difusión al resto de los destinatarios. El fallo se registra, la conexión se marca como muerta para su posterior limpieza, y el proceso continúa con las conexiones restantes. Las métricas de difusión registran tanto los envíos exitosos como los fallidos, proporcionando visibilidad sobre la salud del sistema de distribución.

---

## Patrón de Disyuntor

El gateway implementa un patrón de disyuntor para protegerse contra fallos en cascada cuando la conexión con Redis se interrumpe. El disyuntor opera en tres estados que regulan el comportamiento del sistema ante fallos sostenidos.

En estado cerrado, el sistema opera normalmente y cada fallo incrementa un contador. Tras cinco fallos consecutivos, el disyuntor se abre. En estado abierto, todas las operaciones que dependen de Redis se rechazan inmediatamente sin intentar la conexión, evitando la acumulación de solicitudes bloqueadas que podrían agotar los recursos del servidor. Tras treinta segundos en estado abierto, el disyuntor pasa a un estado de semi-apertura donde permite un máximo de tres operaciones de prueba. Si todas tienen éxito, el disyuntor se cierra y el sistema retoma la operación normal. Si cualquiera de las pruebas falla, el disyuntor se abre nuevamente por otros treinta segundos.

Este mecanismo previene que un fallo temporal de Redis provoque una degradación generalizada del gateway, permitiendo una recuperación gradual y controlada cuando el servicio se restablece.

---

## Asignación de Sectores

El sistema de asignación de sectores determina qué eventos recibe cada mozo basándose en las asignaciones diarias configuradas por la gerencia. Cuando un mozo se conecta, el gateway consulta sus asignaciones de sector para el día actual. Si el token de sesión ya contiene esta información, se utiliza directamente; de lo contrario, se realiza una consulta a la base de datos.

Los resultados de estas consultas se almacenan en un caché con una vigencia de cinco minutos, reduciendo la carga sobre la base de datos durante períodos de alta actividad donde múltiples mozos pueden conectarse y desconectarse frecuentemente. Un mozo puede tener asignados hasta diez sectores simultáneamente; si se supera este número, el sistema emite una advertencia indicando una posible configuración anómala.

La funcionalidad de actualización de sectores en caliente permite que los cambios de asignación realizados durante el servicio se reflejen sin interrumpir las conexiones existentes. El mozo envía un comando de actualización, el gateway invalida el caché y consulta las asignaciones vigentes, y actualiza los índices de conexión para reflejar los nuevos sectores.

---

## Ciclo de Vida del Servicio

### Arranque

Al iniciarse, el gateway ejecuta una secuencia ordenada de inicialización. Primero configura el sistema de registro de eventos. Luego arranca el grupo de trabajadores de difusión que procesará los envíos a las conexiones. A continuación, inicia tres tareas de fondo concurrentes: el suscriptor de publicación y suscripción de Redis que escucha los eventos del canal principal, el consumidor de flujos de Redis que procesa los eventos críticos con entrega garantizada, y el proceso de limpieza periódica de conexiones.

### Operación

Durante la operación normal, el gateway acepta conexiones WebSocket en sus cuatro puntos de conexión, las autentica según la estrategia correspondiente, las registra en los índices apropiados, y comienza a distribuir eventos. Los tres procesos de fondo operan continuamente: el suscriptor recibe y enruta eventos del canal principal, el consumidor procesa eventos críticos del flujo, y el limpiador elimina conexiones obsoletas y muertas cada treinta segundos. Cada cinco ciclos de limpieza, equivalentes a dos minutos y medio, se ejecuta también la limpieza de bloqueos en desuso.

### Apagado

El proceso de apagado sigue una secuencia cuidadosa para garantizar que no se pierdan eventos en tránsito ni se dejen recursos sin liberar. Primero se cancelan las tres tareas de fondo, esperando que cada una finalice su ciclo actual. Luego se detiene el grupo de trabajadores de difusión con un tiempo límite de cinco segundos para drenar la cola de envíos pendientes. Se esperan las tareas de limpieza de bloqueos pendientes, se limpia el caché de asignaciones de sector, se cierra el grupo de conexiones de Redis, y finalmente se cierran todas las conexiones WebSocket activas notificando a los clientes del cierre del servicio.

---

## Validación de Eventos

Cada evento recibido a través de los canales de Redis pasa por un proceso de validación antes de ser enrutado. La validación verifica que el evento contenga los campos obligatorios, principalmente el tipo de evento y el identificador de inquilino, y que el tipo de evento sea uno de los tipos reconocidos por el sistema.

Los eventos con campos desconocidos se procesan normalmente pero se registran para monitoreo, hasta un máximo de cien tipos desconocidos y diez campos desconocidos por evento. Esta tolerancia permite que el sistema evolucione gradualmente: el servidor principal puede comenzar a emitir nuevos tipos de eventos antes de que el gateway se actualice para manejarlos específicamente.

Los eventos que fallan la validación se descartan y se registran como eventos descartados, incrementando las métricas de eventos no procesados para su monitoreo.

---

## Contrapresión y Manejo de Sobrecarga

El suscriptor de Redis implementa un mecanismo de contrapresión mediante una cola interna con capacidad máxima de cinco mil eventos. Cuando la cola está llena, los eventos más antiguos se descartan automáticamente para hacer lugar a los nuevos. Un rastreador de tasa de descarte monitorea la proporción de eventos descartados en una ventana de sesenta segundos. Si la tasa de descarte supera el cinco por ciento, el sistema emite una alerta con un período de enfriamiento de cinco minutos entre alertas consecutivas para evitar la saturación de registros.

El procesamiento de eventos se realiza en lotes de hasta cincuenta eventos por ciclo, con un tiempo límite de treinta segundos por evento individual. Los eventos que exceden este tiempo se reencolan para un intento posterior, y la tasa de fallos se contabiliza en el rastreador de descartes.

---

## Observabilidad y Métricas

El gateway proporciona múltiples vías para monitorear su estado y rendimiento.

### Puntos de Verificación de Salud

Un punto de verificación básico devuelve el estado general del gateway junto con el conteo de conexiones activas. Un punto de verificación detallado amplía esta información con el estado de la conexión a Redis, el estado del disyuntor, las estadísticas del limitador de velocidad y los contadores de eventos procesados y descartados.

### Métricas para Monitoreo

El gateway expone un punto de métricas compatible con el formato de Prometheus que incluye contadores acumulativos de conexiones totales, conexiones rechazadas por motivo, difusiones realizadas y fallidas, eventos procesados y descartados, y mensajes limitados por velocidad. También incluye medidores instantáneos de conexiones activas desglosadas por punto de conexión, conexiones por usuario y por sucursal, el estado del disyuntor y las estadísticas del limitador de velocidad.

### Registro Estructurado

Todas las operaciones significativas generan registros estructurados que incluyen el contexto relevante: identificador de usuario, sucursal, inquilino, tipo de evento y resultado de la operación. Las transiciones de estado del disyuntor, las alertas de tasa de descarte y los errores de autenticación se registran con nivel de advertencia o error para facilitar su identificación en los sistemas de monitoreo.

---

## Reintentos y Recuperación

El gateway implementa una estrategia de reintentos con retroceso exponencial y fluctuación aleatoria para las reconexiones con Redis. La demora inicial es de un segundo y se duplica con cada intento fallido hasta un máximo de treinta segundos. La fluctuación aleatoria del treinta por ciento previene que múltiples instancias del gateway intenten reconectarse simultáneamente, evitando el fenómeno de avalancha que podría sobrecargar el servidor de Redis durante su recuperación.

El número máximo de intentos de reconexión consecutivos es de veinte. Si se agotan todos los intentos, el suscriptor genera un error fatal que detiene el servicio, delegando al sistema de orquestación de contenedores la responsabilidad de reiniciar el proceso.

---

## Códigos de Cierre

El gateway utiliza códigos de cierre estandarizados para comunicar a los clientes el motivo de la desconexión. Los códigos estándar del protocolo WebSocket incluyen el cierre normal, la salida del servidor, la violación de política por origen no autorizado, el mensaje excesivamente grande que supera los sesenta y cuatro kilobytes, y la sobrecarga del servidor cuando se alcanza el límite de conexiones.

Los códigos personalizados del sistema incluyen el fallo de autenticación cuando el token es inválido o ha expirado, el acceso prohibido cuando el token es válido pero los permisos son insuficientes, y la limitación de velocidad cuando el cliente envía demasiados mensajes por segundo. Estos códigos permiten que los clientes implementen lógica de reconexión inteligente: un fallo de autenticación requiere obtener un nuevo token antes de reintentar, mientras que una sobrecarga temporal podría resolverse esperando unos segundos.

---

## Aislamiento Multi-Inquilino

El aislamiento entre inquilinos es una garantía fundamental del gateway. Cada conexión está asociada a un inquilino específico determinado durante la autenticación, y este dato se almacena en los índices de conexiones. Cuando el enrutador de eventos distribuye un mensaje, verifica que el inquilino del evento coincida con el inquilino de cada conexión destinataria, descartando silenciosamente los envíos que violarían el aislamiento.

Este mecanismo opera como una capa de seguridad adicional sobre el filtrado por canal de Redis. Aunque los canales ya están segmentados por sucursal, el filtrado por inquilino en el gateway protege contra escenarios donde un error en la publicación de eventos pudiera dirigir un mensaje al canal incorrecto.

---

## Consideraciones de Rendimiento

El gateway está diseñado para manejar entre cuatrocientas y seiscientas conexiones simultáneas con latencias de difusión inferiores a doscientos milisegundos. Los principales factores que contribuyen a este rendimiento son el grupo de trabajadores paralelos para la difusión, los bloqueos fragmentados que minimizan la contención entre operaciones independientes, los índices multidimensionales que permiten localizar conexiones en tiempo constante, y el procesamiento por lotes de eventos que amortiza el costo de las operaciones de Redis.

La arquitectura modular del gateway también facilita la escalabilidad horizontal. Múltiples instancias del gateway pueden operar simultáneamente, cada una suscrita a los mismos canales de Redis, distribuyendo la carga de conexiones entre ellas. El sistema de grupos de consumidores de flujos de Redis garantiza que los eventos críticos se procesen exactamente por una instancia, evitando la duplicación de notificaciones.
