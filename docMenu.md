# Documentación Funcional del Menú Digital (pwaMenu)

## Introducción

El Menú Digital constituye la aplicación web progresiva orientada al comensal dentro del sistema de gestión gastronómica Buen Sabor. Su propósito es transformar la experiencia de pedido en el restaurante, permitiendo que los comensales exploren el menú, gestionen un carrito compartido con los demás integrantes de su mesa, envíen pedidos a la cocina en tiempo real y soliciten la cuenta, todo desde sus propios dispositivos móviles sin necesidad de crear una cuenta de usuario ni descargar una aplicación nativa.

La aplicación opera como una experiencia completamente autónoma para el comensal. Desde el momento en que escanea el código de su mesa hasta que solicita la cuenta y realiza el pago, el sistema guía al usuario a través de un flujo intuitivo que combina la inmediatez de una carta física con las ventajas de la tecnología: sincronización en tiempo real entre dispositivos, filtrado inteligente de alérgenos, historial de pedidos visible y división automatizada de la cuenta.

---

## Ingreso a la Mesa

### Identificación del Comensal

El proceso de incorporación a una mesa se estructura en dos pasos secuenciales que equilibran la rapidez de acceso con la necesidad de identificación mínima del comensal.

En el primer paso, el comensal ingresa el número o código de su mesa. El sistema acepta tanto identificadores numéricos directos como códigos alfanuméricos que pueden incluir guiones, como por ejemplo los códigos de formato compuesto que combinan prefijos de sector con numeración de mesa. Dado que los códigos de mesa no son únicos a nivel global del sistema sino dentro de cada sucursal, la aplicación utiliza internamente el identificador de sucursal configurado para desambiguar la mesa correcta.

En el segundo paso, el comensal puede ingresar opcionalmente su nombre, con un límite de cincuenta caracteres. Si decide omitir este dato, el sistema genera automáticamente un nombre secuencial basado en el orden de llegada a la mesa. Cada comensal recibe además un color de avatar asignado de manera secuencial a partir de una paleta de dieciséis colores predefinidos, lo que permite identificar visualmente quién agregó cada ítem al carrito compartido.

### Establecimiento de la Sesión

Al completar la identificación, la aplicación inicia una secuencia de conexión con el servidor que establece la sesión de mesa. El sistema solicita al servidor la creación o recuperación de una sesión existente para la mesa indicada, recibiendo a cambio un token de mesa que servirá como credencial durante toda la estancia del comensal. Este token se almacena localmente en el dispositivo y se incluye automáticamente en todas las comunicaciones posteriores con el servidor.

Simultáneamente, la aplicación registra al comensal en el servidor proporcionando su nombre, color de avatar, un identificador local único y un identificador de dispositivo que permite el reconocimiento en visitas futuras. Si el registro falla por un problema transitorio de red, el sistema reintenta automáticamente hasta tres veces con intervalos crecientes antes de señalar el error.

Una vez completado el registro, la aplicación establece una conexión WebSocket persistente que permitirá recibir actualizaciones en tiempo real sobre el carrito compartido, el estado de los pedidos y las notificaciones del servicio.

### Duración y Expiración

La sesión de mesa tiene una vigencia de ocho horas medidas desde la última actividad, no desde la creación. Cada operación sobre el carrito actualiza la marca temporal de última actividad, extendiendo efectivamente la sesión mientras el comensal permanezca activo. Cuando la sesión expira, la aplicación presenta un aviso informando al comensal que debe escanear nuevamente el código de la mesa, limpiando automáticamente todos los datos locales y desconectando el canal de comunicación en tiempo real.

La sesión sobrevive al cierre del navegador y a la recarga de la página gracias al almacenamiento persistente en el dispositivo. Al reabrir la aplicación, el sistema detecta la sesión almacenada, verifica su validez con el servidor y reconecta automáticamente el canal WebSocket sin requerir intervención del comensal.

---

## Exploración del Menú

### Estructura Jerárquica

El menú se organiza en una jerarquía de tres niveles que refleja la estructura definida por el restaurante. El nivel superior corresponde a las categorías principales, como alimentos, bebidas o postres, que se presentan como pestañas de navegación en la parte superior de la pantalla. Al seleccionar una categoría, se despliega una cuadrícula de subcategorías que agrupan los productos de manera más específica, como hamburguesas, pastas o ensaladas dentro de la categoría de alimentos. Finalmente, al elegir una subcategoría, se presenta la lista de productos individuales disponibles.

La navegación entre niveles es fluida y reversible. En cada nivel se proporcionan indicadores visuales que permiten al comensal regresar al nivel anterior, y la interfaz mantiene el contexto de navegación para que el usuario siempre sepa dónde se encuentra dentro de la estructura del menú.

### Vista Inicial y Contenido Destacado

Al ingresar al menú, antes de seleccionar cualquier categoría, la pantalla principal muestra dos elementos promocionales. El primero es un banner promocional configurable que puede anunciar ofertas especiales, descuentos por horario u otras campañas del restaurante, con la capacidad de dirigir al comensal hacia una sección específica del menú al tocarlo. El segundo es un carrusel de productos destacados que presenta horizontalmente aquellos ítems que el restaurante ha marcado como productos estrella o recomendaciones especiales, permitiendo al comensal acceder rápidamente a los platos más populares sin necesidad de navegar por la estructura completa del menú.

### Búsqueda y Filtrado

La barra de búsqueda permite localizar productos por nombre o descripción con un mecanismo de respuesta diferida que espera trescientos milisegundos después de la última pulsación antes de ejecutar la búsqueda, evitando consultas innecesarias mientras el comensal aún está escribiendo. Los resultados se actualizan dinámicamente y pueden incluir productos de cualquier categoría o subcategoría.

El sistema de filtrado avanzado ofrece tres dimensiones de personalización. La primera es el filtrado por alérgenos, que permite al comensal excluir del menú todos los productos que contengan sustancias a las que es sensible. La segunda es el filtrado dietético, que permite seleccionar preferencias como vegano, vegetariano o sin gluten. La tercera es el filtrado por método de cocción, que permite descartar productos preparados de maneras que el comensal prefiere evitar. Estas tres dimensiones operan en cascada, aplicándose simultáneamente para mostrar únicamente los productos que satisfacen todos los criterios seleccionados. Un indicador visual junto al icono de filtros muestra la cantidad de filtros activos en todo momento.

### Caché del Menú

Los datos del menú se almacenan en caché con una vigencia de cinco minutos, lo que permite una navegación fluida sin necesidad de consultar al servidor en cada cambio de categoría. Cuando el comensal regresa a una categoría previamente visitada, los datos se muestran instantáneamente desde la caché local. Si la caché ha expirado, se realiza una nueva consulta al servidor en segundo plano, actualizando la información sin interrumpir la experiencia de navegación.

---

## Detalle del Producto

Al seleccionar un producto de la lista, se despliega un panel modal que presenta toda la información relevante para la decisión de compra del comensal.

### Información del Producto

El panel muestra la imagen del producto en formato ampliado, su nombre completo, una descripción detallada y el precio expresado en la moneda local. Si el producto no dispone de imagen, se utiliza una imagen genérica de respaldo que mantiene la coherencia visual de la interfaz.

### Información de Alérgenos

La sección de alérgenos presenta tres categorías claramente diferenciadas por código de color. Los alérgenos confirmados, señalados en rojo, indican sustancias que el producto definitivamente contiene. Los alérgenos posibles, señalados en amarillo, indican sustancias que podrían estar presentes como trazas debido al proceso de elaboración o al entorno de preparación. Los alérgenos ausentes, señalados en verde, confirman explícitamente que el producto está libre de determinadas sustancias, lo que resulta especialmente útil para comensales con restricciones alimentarias que buscan opciones seguras.

Cada alérgeno asociado incluye un nivel de riesgo que puede ser alto, medio o bajo, proporcionando información adicional sobre la probabilidad de presencia o la gravedad potencial de la exposición.

### Distintivos y Sellos

Los productos pueden exhibir distintivos especiales como indicadores de popularidad, novedad, edición limitada u otros sellos personalizados que el restaurante defina. Estos distintivos se presentan como sobreposiciones visuales sobre la imagen o como etiquetas junto al nombre del producto.

### Selección de Cantidad y Notas

El comensal puede ajustar la cantidad deseada mediante controles numéricos que permiten valores entre uno y noventa y nueve unidades. Adicionalmente, un campo de texto permite agregar notas especiales para la cocina, como solicitudes de preparación particular, exclusión de ingredientes específicos o cualquier otra indicación que el comensal considere relevante.

### Adición al Carrito

Al confirmar la selección, el sistema añade el producto al carrito compartido de la mesa con retroalimentación visual inmediata. El mecanismo de adición inteligente detecta si el comensal ya tiene el mismo producto en el carrito y, en ese caso, incrementa la cantidad existente en lugar de crear una entrada duplicada. Un anuncio accesible informa a los lectores de pantalla sobre la acción realizada.

---

## Carrito Compartido

### Concepto de Carrito Compartido

El carrito compartido representa una de las funcionalidades más distintivas de la aplicación. A diferencia de un carrito individual convencional, este carrito es visible y accesible para todos los comensales de la mesa simultáneamente. Cuando un comensal agrega un producto, todos los demás comensales de la mesa ven la actualización en tiempo real en sus propios dispositivos. Los ítems de cada comensal se identifican visualmente mediante el nombre y el color de avatar de quien los agregó.

### Actualización Optimista

La experiencia de usuario prioriza la inmediatez mediante un patrón de actualización optimista. Cuando el comensal realiza una acción sobre el carrito, la interfaz se actualiza instantáneamente antes de que el servidor confirme la operación. Si el servidor rechaza la operación por algún motivo, el sistema revierte automáticamente el cambio local. Este enfoque elimina la percepción de latencia y proporciona una experiencia comparable a la de una aplicación nativa.

La sincronización con el servidor se realiza de manera asíncrona: tras la actualización local inmediata, se envía la solicitud al servidor, que a su vez difunde el cambio a los demás dispositivos de la mesa a través del canal WebSocket. Cuando el dispositivo del comensal recibe la notificación de su propio cambio, la descarta para evitar duplicación, ya que el estado local ya refleja la modificación.

### Sincronización entre Dispositivos

La sincronización del carrito opera a través de eventos WebSocket específicos para cada tipo de operación: adición de ítem, actualización de cantidad, eliminación de ítem y vaciado completo del carrito. Cada evento incluye la información completa del ítem y del comensal que realizó la acción, permitiendo que los demás dispositivos actualicen su estado local de manera precisa.

Para prevenir el procesamiento duplicado de eventos, el sistema mantiene un registro temporal de eventos recientes con una vigencia de cinco segundos. Si un evento idéntico llega dentro de ese período, se descarta silenciosamente. Adicionalmente, una caché de conversiones optimiza la transformación de los datos del servidor al formato local, almacenando hasta doscientas conversiones recientes con una vigencia de treinta segundos.

Cuando un dispositivo se reconecta después de una desconexión, solicita el estado completo del carrito al servidor para garantizar la coherencia, reemplazando el estado local con la versión autoritativa del servidor.

### Sincronización entre Pestañas

Si el comensal tiene la aplicación abierta en múltiples pestañas del navegador, los cambios realizados en una pestaña se propagan automáticamente a las demás mediante el mecanismo de eventos de almacenamiento local. El sistema fusiona inteligentemente los estados para evitar sobrescribir actualizaciones que estén en curso en otra pestaña.

### Operaciones del Carrito

El comensal puede modificar la cantidad de cualquiera de sus propios ítems, eliminarlo si establece la cantidad en cero, o vaciar completamente su selección. No es posible modificar los ítems agregados por otros comensales, reforzando la autonomía individual dentro del carrito compartido. El total del carrito se recalcula automáticamente con cada modificación, mostrando tanto el subtotal individual de cada comensal como el total general de la mesa.

---

## Confirmación Grupal y Envío de Pedidos

### Mecanismo de Votación

El envío de un pedido a la cocina no puede ser una acción unilateral de un solo comensal, ya que el carrito contiene ítems de todos los comensales de la mesa. Para garantizar que todos estén de acuerdo con el contenido del pedido antes de enviarlo, el sistema implementa un mecanismo de confirmación grupal basado en votación.

Cualquier comensal puede proponer el envío del pedido. Al hacerlo, se activa un panel de confirmación visible para todos los comensales de la mesa que muestra quién realizó la propuesta, el momento en que fue realizada, y el estado de confirmación de cada comensal con su nombre y color de avatar. Un contador muestra cuántos comensales han confirmado su disposición sobre el total de comensales en la mesa, y un temporizador indica el tiempo restante antes de que la propuesta expire, volviéndose rojo cuando queda menos de un minuto.

Cada comensal puede marcar su conformidad tocando el botón de confirmación, que cambia su estado visual de "esperando" a "listo". Si un comensal cambia de opinión, puede revertir su confirmación. La propuesta tiene una vigencia de cinco minutos; si no todos los comensales confirman dentro de ese plazo, la propuesta se cancela automáticamente. Únicamente el comensal que realizó la propuesta puede cancelarla manualmente antes de su expiración.

### Envío Automático

Cuando todos los comensales de la mesa han confirmado su disposición, el sistema activa automáticamente el envío del pedido tras una breve pausa de un segundo y medio que permite visualizar la confirmación completa. Durante el envío, el panel muestra un indicador de progreso.

El pedido se construye combinando todos los ítems del carrito compartido en una única ronda, independientemente de qué comensal haya agregado cada ítem. Al completarse exitosamente el envío, el carrito se vacía automáticamente y se muestra una animación de celebración antes de cerrar el panel. El número de ronda se incrementa secuencialmente, permitiendo a los comensales realizar múltiples rondas de pedidos durante su estancia.

---

## Seguimiento de Pedidos

### Ciclo de Vida del Pedido

Desde la perspectiva del comensal, el pedido atraviesa una serie de estados que reflejan su progreso desde el envío hasta la entrega en la mesa.

Tras el envío, el pedido se registra como enviado y queda a la espera de ser procesado. Cuando la gerencia o el personal de sala lo valida, el pedido pasa al estado de confirmado. Al ingresar al área de cocina, transiciona a un estado de preparación que informa al comensal que su pedido está siendo elaborado. Cuando la cocina completa la preparación, el pedido se marca como listo, indicando que está esperando ser servido. Finalmente, al ser entregado en la mesa, alcanza el estado de servido.

Cada transición de estado llega al dispositivo del comensal a través del canal WebSocket en tiempo real, acompañada de una notificación sonora para las transiciones más relevantes, como cuando el pedido está listo o ha sido confirmado.

### Historial de Pedidos

El historial de pedidos presenta todas las rondas realizadas durante la sesión de mesa, organizadas cronológicamente y mostrando para cada una el número de ronda, los ítems incluidos con sus cantidades y precios, el subtotal, el estado actual, quién realizó el envío y las marcas temporales de cada transición de estado. Esta información permite a los comensales llevar un seguimiento completo de su consumo acumulado.

---

## Llamados de Servicio

### Llamar al Mozo

El comensal puede solicitar la asistencia de un mozo mediante un botón dedicado en la barra de navegación inferior. Al activarlo, se presenta un panel de confirmación que, tras la aceptación del comensal, envía la solicitud al servidor. El servidor registra el llamado y lo difunde al mozo asignado al sector de la mesa.

El llamado atraviesa tres estados: pendiente mientras espera la atención del mozo, acusado cuando el mozo ve la notificación y la reconoce, y cerrado cuando el mozo resuelve la solicitud. El comensal recibe retroalimentación visual y sonora cuando el mozo acusa recibo del llamado, con un mensaje que confirma que el mozo está en camino.

El historial de llamados de servicio se persiste durante toda la sesión, permitiendo al comensal consultar el estado de solicitudes anteriores.

### Solicitar la Cuenta

La solicitud de cuenta se realiza desde un botón dedicado en la barra de navegación inferior. Esta acción transiciona la sesión de mesa al estado de pago e inicia el flujo de cierre de mesa y facturación.

---

## Cierre de Mesa y Facturación

### Visualización de la Cuenta

La pantalla de cierre presenta un resumen completo del consumo de la mesa organizado en tres pestañas. La primera muestra el resumen de pagos con la participación de cada comensal, calculada según el método de división seleccionado. La segunda presenta el historial de pedidos con el detalle de todas las rondas realizadas. La tercera desglosa el consumo individual de cada comensal, mostrando específicamente qué ítems ordenó cada persona y el monto correspondiente.

Antes de presentar esta información, el sistema sincroniza los pedidos con el servidor para garantizar que todos los comensales vean la información más actualizada, incluyendo cualquier ronda que pudiera haberse procesado mientras se navegaba hacia esta pantalla.

### Métodos de División

El sistema ofrece tres métodos para dividir la cuenta entre los comensales. La división igualitaria reparte el total en partes iguales entre todos los comensales de la mesa, independientemente de lo que cada uno haya consumido. La división por consumo asigna a cada comensal exactamente el monto correspondiente a los ítems que ordenó personalmente. La división personalizada permite ajustes manuales para situaciones donde los comensales desean distribuir el monto de manera diferente a las opciones automáticas.

### Propina

El selector de propina permite elegir entre porcentajes predefinidos del cero, diez, quince y veinte por ciento, además de un monto personalizado. La propina se calcula sobre el total de la mesa y se distribuye proporcionalmente según la participación de cada comensal en la cuenta.

### Métodos de Pago

La aplicación presenta las opciones de pago disponibles una vez que el personal del restaurante ha procesado la solicitud de cuenta. La integración con Mercado Pago permite realizar pagos electrónicos: al seleccionar esta opción, la aplicación solicita al servidor la creación de una preferencia de pago y redirige al comensal a la pasarela de Mercado Pago, donde completa la transacción. Al finalizar, Mercado Pago devuelve al comensal a la aplicación, que presenta el resultado del pago indicando si fue aprobado, está pendiente o fue rechazado, junto con los detalles de la transacción.

Para entornos de desarrollo, la aplicación ofrece un modo simulado que permite probar el flujo completo de pago sin interactuar con la pasarela real, generando respuestas de prueba que replican los diferentes escenarios posibles.

Los pagos en efectivo, tarjeta física o transferencia se registran manualmente por parte del personal del restaurante, y la aplicación refleja estos pagos a través de las notificaciones en tiempo real.

### Registro de Pagos por Comensal

El sistema rastrea los pagos individuales de cada comensal, permitiendo que la mesa se cierre progresivamente a medida que cada persona realiza su aporte. La interfaz muestra el estado de pago de cada comensal, indicando si ya pagó, cuánto pagó y cuánto resta por pagar según el método de división seleccionado.

Cuando el servidor confirma que la cuenta ha sido saldada completamente, la aplicación recibe una notificación a través del canal WebSocket y transiciona automáticamente a un estado de cuenta pagada, cerrando el ciclo de la sesión de mesa.

---

## Sistema de Alérgenos

### Filtrado por Alérgenos

El sistema de filtrado de alérgenos permite al comensal definir qué sustancias desea excluir del menú visible. Al activar la exclusión de un alérgeno, todos los productos que contengan esa sustancia desaparecen de la vista del menú, proporcionando una experiencia de navegación segura para personas con sensibilidades alimentarias.

El nivel de rigurosidad del filtrado es configurable en dos grados. El modo estricto oculta únicamente los productos que definitivamente contienen el alérgeno excluido. El modo muy estricto amplía la exclusión a los productos que también podrían contener trazas de la sustancia, cubriendo situaciones de contaminación cruzada en la cocina o líneas de producción compartidas.

### Reacciones Cruzadas

Una funcionalidad avanzada del sistema de alérgenos es la consideración de reacciones cruzadas entre sustancias. Ciertos alérgenos están biológicamente relacionados de manera que la sensibilidad a uno puede implicar sensibilidad a otros. El ejemplo clásico es el síndrome látex-fruta, donde la alergia al látex puede provocar reacciones al consumir banana, kiwi o aguacate.

El comensal puede activar opcionalmente esta funcionalidad, que consulta al servidor las relaciones de reactividad cruzada conocidas y amplía automáticamente las exclusiones del filtro. La sensibilidad de esta expansión es configurable: puede incluir todas las reacciones cruzadas conocidas, solo las de probabilidad alta y media, o exclusivamente las de probabilidad alta. Los resultados de esta consulta se almacenan en caché durante cinco minutos para evitar consultas repetitivas al servidor.

### Persistencia de Preferencias

Los filtros de alérgenos se almacenan en el almacenamiento de sesión del navegador, lo que significa que persisten mientras el comensal mantenga la pestaña abierta pero se reinician al cerrar el navegador. Esta decisión equilibra la conveniencia de mantener los filtros durante la navegación con la privacidad de no retener información de salud a largo plazo sin consentimiento explícito.

En una fase posterior del sistema, las preferencias de filtrado se sincronizan opcionalmente con el servidor para permitir su recuperación en visitas futuras, siempre vinculadas al dispositivo del comensal y no a una cuenta personal.

---

## Filtrado Dietético y por Método de Cocción

### Preferencias Dietéticas

Además del filtrado por alérgenos, el comensal puede activar filtros dietéticos que limitan el menú visible a productos compatibles con sus preferencias alimentarias, como opciones veganas, vegetarianas, sin gluten u otros criterios que el restaurante defina. Estos filtros operan de manera independiente pero complementaria al filtrado de alérgenos, aplicándose en cascada para mostrar únicamente los productos que satisfacen todos los criterios activos simultáneamente.

### Filtrado por Método de Cocción

El tercer eje de filtrado permite al comensal excluir productos preparados mediante métodos de cocción específicos. Esta funcionalidad resulta útil para comensales que, por razones de salud o preferencia personal, desean evitar alimentos fritos, asados u otros métodos de preparación particulares.

### Sincronización Implícita

Un mecanismo de sincronización diferida captura automáticamente las preferencias de filtrado del comensal y las envía al servidor con un retardo de dos segundos desde la última modificación. Esta sincronización implícita permite al sistema aprender las preferencias del comensal a lo largo del tiempo sin requerir acciones explícitas de guardado. En visitas futuras, si el dispositivo es reconocido, las preferencias se cargan automáticamente, personalizando la experiencia de navegación del menú desde el primer momento.

---

## Internacionalización

### Idiomas Soportados

La aplicación está completamente internacionalizada en tres idiomas: español, inglés y portugués. El español es el idioma principal y el que posee la cobertura más completa de traducciones. Los demás idiomas utilizan el español como respaldo cuando una clave de traducción específica no está disponible en el idioma seleccionado.

### Detección Automática

Al cargar la aplicación por primera vez, el sistema detecta el idioma configurado en el navegador del comensal y lo compara contra los idiomas soportados. Si el idioma detectado es uno de los tres disponibles, se selecciona automáticamente. En caso contrario, se utiliza el español como idioma predeterminado. La detección incluye una validación de seguridad que previene la inyección de valores de idioma inválidos.

### Selección Manual

El comensal puede cambiar el idioma en cualquier momento a través del menú de configuración, donde se presentan banderas representativas de cada idioma disponible. La selección se almacena en el dispositivo y se recuerda en visitas futuras. La interfaz se actualiza instantáneamente al cambiar de idioma, sin necesidad de recargar la página.

### Cobertura de Traducciones

Todas las cadenas de texto visibles para el comensal están externalizadas en archivos de traducción. Esto incluye los textos de navegación, los títulos y contenidos de los paneles modales, los mensajes de error y confirmación, las etiquetas de los formularios, los nombres de los estados de los pedidos, las descripciones de los alérgenos, las instrucciones del sistema de confirmación grupal, los textos de la pantalla de pago, y cualquier otro elemento textual de la interfaz. No existe texto codificado directamente en los componentes.

---

## Comunicación en Tiempo Real

### Conexión WebSocket

La aplicación mantiene una conexión WebSocket persistente con el servidor de eventos del sistema, autenticada mediante el token de mesa del comensal. Esta conexión se establece automáticamente al incorporarse a la mesa y se mantiene activa durante toda la sesión.

### Reconexión Automática

Si la conexión se interrumpe, el sistema ejecuta un proceso de reconexión automática con intervalos progresivamente más largos: comenzando en un segundo y duplicándose hasta un máximo de treinta segundos, con una variación aleatoria del treinta por ciento para evitar que múltiples dispositivos intenten reconectarse simultáneamente. El sistema realiza hasta cincuenta intentos de reconexión antes de considerar la conexión como irrecuperable.

Ciertos códigos de cierre indican situaciones que no pueden resolverse mediante reconexión, como la autenticación fallida, los permisos insuficientes o la limitación de velocidad. En estos casos, el sistema no intenta reconectar y presenta al comensal una indicación apropiada del problema.

### Latido Cardíaco

Para detectar conexiones que han dejado de funcionar silenciosamente, la aplicación envía un pulso cada treinta segundos al servidor. Si no recibe respuesta dentro de los diez segundos siguientes, cierra la conexión y activa el proceso de reconexión. Este mecanismo es esencial para dispositivos móviles que pueden perder la conexión al entrar en modo de ahorro de energía o al cambiar de red.

### Detección de Visibilidad

La aplicación detecta cuando el navegador pasa a segundo plano o regresa al primer plano. Al regresar de segundo plano, verifica el estado de la conexión WebSocket y, si ha quedado obsoleta, inicia una reconexión limpia. Esta funcionalidad es particularmente relevante en dispositivos móviles donde el sistema operativo puede suspender las actividades de red de las aplicaciones en segundo plano.

### Eventos Recibidos

Los eventos que llega al comensal a través del canal WebSocket cubren cuatro áreas funcionales. Los eventos del carrito sincronizan las operaciones de adición, modificación, eliminación y vaciado realizadas por otros comensales de la mesa. Los eventos de pedidos informan sobre cada transición de estado de las rondas enviadas. Los eventos de servicio notifican cuando un mozo acusa recibo de un llamado o lo cierra. Los eventos de facturación informan sobre solicitudes de cuenta procesadas y resultados de pagos.

---

## Características de Aplicación Web Progresiva

### Instalabilidad

La aplicación cumple con los requisitos para ser instalada como una aplicación independiente en el dispositivo del comensal. Al detectar que el navegador soporta la instalación, se presenta un banner que invita al comensal a añadir la aplicación a su pantalla de inicio. Una vez instalada, la aplicación se ejecuta en modo de pantalla completa sin la barra de direcciones del navegador, proporcionando una experiencia visual comparable a la de una aplicación nativa.

### Almacenamiento en Caché

La estrategia de almacenamiento en caché se adapta al tipo de recurso. Las imágenes de productos y los archivos estáticos se almacenan con prioridad al contenido local, consultando al servidor solo si no se encuentran en caché, con una vigencia de treinta días. Las tipografías se almacenan con una vigencia extendida de un año. Los datos del menú y las sesiones utilizan una estrategia que prioriza la red pero recurre a la caché local si la red no está disponible, con un tiempo de espera de cinco a diez segundos antes de recurrir al contenido almacenado.

### Funcionamiento Sin Conexión

Cuando el dispositivo pierde conectividad, la aplicación continúa funcionando con las capacidades disponibles localmente. El menú previamente consultado permanece accesible para navegación. El carrito local se mantiene operativo, almacenando las operaciones pendientes para sincronizarlas cuando se restablezca la conexión. Las páginas de resultado de pago y éxito de pedido son accesibles sin conexión.

Un indicador visual de estado de red informa al comensal sobre su conectividad actual, ayudándole a comprender por qué ciertas operaciones podrían no estar disponibles temporalmente.

### Actualizaciones

La aplicación verifica la disponibilidad de nuevas versiones cada hora. Cuando detecta una actualización, presenta un banner que permite al comensal actualizar con un solo toque, garantizando que siempre utilice la versión más reciente del menú y sus funcionalidades.

---

## Reconocimiento de Clientes y Fidelización

### Identificación por Dispositivo

El sistema de fidelización se basa en el reconocimiento del dispositivo del comensal sin requerir la creación de una cuenta de usuario. Al registrarse como comensal en una mesa, la aplicación genera un identificador único de dispositivo que se almacena permanentemente en el navegador. Este identificador se complementa con una huella digital del dispositivo calculada a partir de las características del navegador, la resolución de pantalla y otros atributos técnicos.

En visitas posteriores, el servidor puede reconocer al dispositivo y asociarlo con el historial de visitas anteriores, permitiendo ofrecer una experiencia personalizada sin el peso de un proceso de registro formal.

### Preferencias Implícitas

Las preferencias de filtrado del comensal, incluyendo alérgenos excluidos, opciones dietéticas y métodos de cocción evitados, se sincronizan automáticamente con el servidor y se asocian al identificador de dispositivo. En visitas futuras, estas preferencias se cargan automáticamente, personalizando el menú visible sin que el comensal deba configurar nuevamente sus filtros.

### Registro Voluntario

En una fase avanzada del sistema, los comensales pueden optar voluntariamente por crear un perfil que incluya su nombre, correo electrónico y número de teléfono, con consentimiento explícito para el tratamiento de sus datos conforme a las normativas de protección de datos personales. Este perfil permite un reconocimiento más robusto que sobrevive al cambio de dispositivo, además de habilitar funcionalidades como recomendaciones personalizadas basadas en el historial de pedidos y las preferencias acumuladas.

---

## Accesibilidad

### Estructura Semántica

La aplicación implementa atributos de accesibilidad en todos los elementos interactivos. Los paneles modales se identifican correctamente como diálogos con su título asociado. Los iconos decorativos se ocultan de los lectores de pantalla. Los campos de formulario tienen etiquetas asociadas mediante identificadores únicos. Las acciones importantes generan anuncios accesibles que informan a los lectores de pantalla sobre el resultado de la operación.

### Navegación por Teclado

Los paneles modales pueden cerrarse mediante la tecla de escape. Los estados de deshabilitación se comunican correctamente a las tecnologías asistivas durante las operaciones asíncronas. El orden de tabulación se mantiene coherente a través de los diferentes niveles de la interfaz.

### Diseño Inclusivo

Los objetivos táctiles cumplen con el tamaño mínimo recomendado de cuarenta y cuatro por cuarenta y cuatro píxeles para facilitar la interacción en pantallas táctiles. El contraste de colores está verificado para garantizar la legibilidad. Las unidades de medida tipográfica son relativas, permitiendo que el texto se escale correctamente cuando el comensal ajusta el tamaño de fuente del sistema. Los márgenes de seguridad para dispositivos con muesca se respetan en la barra de navegación inferior.

---

## Interfaz de Usuario

### Tema Visual

La aplicación utiliza un tema oscuro como base visual, con tonalidades de fondo que varían desde el negro profundo hasta grises elevados según la jerarquía del elemento. El color de acento principal es el naranja, utilizado para botones de acción, estados activos y elementos de navegación seleccionados. Los estados de confirmación utilizan verde, los errores rojo, y los estados pendientes amarillo.

### Animaciones y Transiciones

Los paneles modales aparecen con una transición de desvanecimiento de doscientos milisegundos. Los botones responden al toque con una transición de doscientos milisegundos. Los indicadores de carga utilizan una animación de rotación continua. Los avisos temporales se cierran automáticamente con un desvanecimiento después de dos a tres segundos. Al completarse exitosamente un pedido, se presenta una animación de celebración.

### Navegación Inferior

La barra de navegación fija en la parte inferior de la pantalla presenta tres botones funcionales: llamar al mozo, ver el historial de pedidos y solicitar la cuenta. Sobre la barra central se posiciona un botón flotante de asistente inteligente con un diseño elevado que lo distingue visualmente de los demás controles. Todos los botones se deshabilitan cuando no existe una sesión de mesa activa.

### Diseño Adaptativo

La interfaz está diseñada con un enfoque de prioridad móvil que se adapta a pantallas más grandes. La cuadrícula de productos se reorganiza desde dos columnas en dispositivos móviles hasta seis columnas en pantallas de escritorio. Los espaciados internos y los tamaños tipográficos se ajustan progresivamente según el ancho disponible. El contenido evita el desbordamiento horizontal mediante restricciones de ancho máximo en todos los contenedores.

---

## Gestión de Errores

### Clasificación de Errores

El sistema clasifica los errores en tres categorías. Los errores de red o del servidor se identifican como errores de la interfaz de programación y pueden incluir un código de estado y un código de error específico. Los errores de autenticación se producen cuando el token de mesa expira o es invalidado. Los errores de validación ocurren cuando los datos ingresados por el comensal no cumplen con las restricciones del sistema.

Cada error incluye una clave de internacionalización que permite mostrar el mensaje apropiado en el idioma seleccionado por el comensal, y un indicador que señala si la operación puede reintentarse.

### Deduplicación de Solicitudes

Para prevenir solicitudes duplicadas que puedan surgir de toques rápidos repetidos o de componentes que se montan múltiples veces, la capa de comunicación con el servidor rastrea las solicitudes en curso. Si se detecta una solicitud idéntica a otra que ya está siendo procesada, se reutiliza la promesa de la solicitud existente en lugar de enviar una nueva. Este mecanismo se complementa con una limpieza periódica del registro de solicitudes para prevenir fugas de memoria en sesiones prolongadas.

### Recuperación por Secciones

La aplicación implementa un mecanismo de contención de errores a nivel de sección que evita que un fallo en una parte de la interfaz colapse la aplicación completa. Si una sección individual falla, se presenta un mensaje de error localizado con la opción de reintentar, mientras el resto de la aplicación continúa funcionando normalmente.

---

## Promociones y Ofertas

### Banner Promocional

La pantalla principal del menú puede mostrar un banner configurable que anuncia promociones activas del restaurante. Este banner puede incluir un título, un porcentaje de descuento, una imagen de fondo y un llamado a la acción que dirige al comensal hacia los productos promocionados al tocarlo.

### Productos Destacados

El carrusel de productos destacados presenta los ítems que el restaurante ha señalado como recomendaciones especiales. Estos productos se identifican mediante un atributo específico en su configuración y se presentan de manera prominente al inicio de la navegación del menú, antes de que el comensal seleccione cualquier categoría.

### Distintivos de Producto

Cada producto puede exhibir distintivos personalizados que el restaurante define libremente, como indicadores de novedad, popularidad, oferta por tiempo limitado o cualquier otra categorización comercial que desee destacar. Estos distintivos se renderizan como elementos visuales sobreimpresos sobre la presentación del producto.

---

## Asistente Inteligente

La aplicación incluye un componente de asistente basado en inteligencia artificial que permite al comensal interactuar mediante lenguaje natural para recibir sugerencias de productos basadas en sus preferencias, restricciones alimentarias y el contexto del menú disponible. El asistente utiliza un patrón de estrategias para procesar diferentes tipos de respuestas, adaptando su comportamiento según la naturaleza de la consulta del comensal. Esta funcionalidad se encuentra en desarrollo activo y se carga bajo demanda para no impactar el rendimiento inicial de la aplicación.

---

## Seguridad

### Prevención de Ataques

La capa de comunicación con el servidor implementa validaciones de seguridad que previenen ataques de falsificación de solicitudes del lado del servidor. Antes de cada solicitud, la dirección del servidor se verifica contra una lista de servidores permitidos, rechazando direcciones que apunten a redes internas, direcciones de bucle local o que incluyan credenciales embebidas en la dirección.

### Autenticación por Token de Mesa

El token de mesa constituye la única credencial del comensal y se transmite en un encabezado dedicado en cada solicitud al servidor. Su vigencia de tres horas cubre holgadamente la duración típica de una comida. Si el token expira durante la sesión, la aplicación detecta la expiración a través de la respuesta del servidor y presenta al comensal la indicación de escanear nuevamente el código de la mesa.

### Protección contra Operaciones Duplicadas

Múltiples mecanismos previenen la ejecución duplicada de operaciones sensibles. Los botones de envío se deshabilitan durante el procesamiento de la solicitud. Las pulsaciones rápidas se filtran mediante un mecanismo de estrangulamiento de cincuenta milisegundos. Las solicitudes duplicadas al servidor se fusionan en una única solicitud real. Los eventos WebSocket duplicados se filtran mediante el registro temporal de cinco segundos.
