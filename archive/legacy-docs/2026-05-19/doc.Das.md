# Documento Funcional del Dashboard — Sistema de Gestión Gastronómica "Buen Sabor"

## Introducción

El Dashboard de Buen Sabor constituye el centro de comando administrativo del sistema integral de gestión gastronómica. Se trata de una aplicación web progresiva diseñada para que los responsables de un restaurante —desde el administrador general hasta el personal de cocina— puedan controlar la totalidad de las operaciones: la estructura de sucursales, la composición del menú, la fijación de precios, la gestión del personal, el seguimiento de pedidos en tiempo real, la creación de fichas técnicas de cocina y la administración de promociones comerciales.

La interfaz se presenta íntegramente en español, con una estética oscura de fondo zinc y acentos en naranja como color institucional. El sistema opera bajo un modelo multisucursal y multirol, lo que significa que un único restaurante puede administrar varias sucursales desde el mismo panel, y cada usuario accede únicamente a las funciones que su rol le permite.

---

## Acceso y autenticación

El ingreso al sistema se realiza mediante un formulario de inicio de sesión que solicita correo electrónico y contraseña. El correo debe tener un formato válido y la contraseña debe contar con al menos cuatro caracteres. Una vez autenticado, el sistema emite un token de acceso con una vigencia de quince minutos, que se renueva automáticamente de forma proactiva cada catorce minutos para evitar interrupciones en la sesión. El token de refresco, con una vigencia de siete días, se almacena en una cookie segura.

Si el usuario introduce credenciales incorrectas, el sistema muestra un mensaje de error claro. Si la sesión expira y el refresco falla, se redirige al usuario a la pantalla de inicio de sesión. La autenticación se sincroniza entre pestañas del navegador: si el usuario cierra sesión en una pestaña, las demás pestañas lo reflejan de inmediato.

El sistema contempla cuatro roles con distintos niveles de acceso: Administrador, Gerente, Cocinero y Mozo. Cada rol determina qué secciones del panel son visibles y qué operaciones están habilitadas.

---

## Pantalla principal y selección de sucursal

Al ingresar, el usuario es recibido con un mensaje de bienvenida personalizado con el nombre del restaurante. La pantalla principal presenta una cuadrícula de tarjetas, una por cada sucursal registrada. Cada tarjeta muestra la imagen de la sucursal (o un ícono genérico si no posee una), su nombre, dirección, número de teléfono, estado de actividad y un resumen estadístico con la cantidad de categorías y productos que contiene.

Al hacer clic en una tarjeta, se selecciona esa sucursal como contexto activo. Este paso es fundamental porque la mayoría de las operaciones de gestión —categorías, subcategorías, productos, mesas, personal— están vinculadas a una sucursal específica. Mientras no se seleccione una sucursal, las opciones del menú lateral que dependen de ella permanecen deshabilitadas con texto atenuado.

Si no existen sucursales registradas, la pantalla muestra un estado vacío con una invitación a crear la primera sucursal.

---

## Navegación

El panel lateral izquierdo organiza todas las secciones del sistema en grupos jerárquicos desplegables. La estructura es la siguiente:

El primer nivel contiene el acceso al panel principal, a la configuración del restaurante y a los grupos funcionales. El grupo de Cocina agrupa las comandas, las recetas y los ingredientes. El grupo de Gestión se subdivide en Sucursales (que incluye la vista general, mesas, personal con sus datos y roles, y pedidos) y Productos (que incluye categorías, subcategorías, platos y bebidas, exclusiones por sucursal, alérgenos, insignias y sellos). El grupo de Marketing contiene precios, tipos de promoción y promociones. El grupo de Estadísticas incluye ventas y el historial por sucursales y por clientes.

En la parte inferior del panel lateral se encuentra el acceso a la configuración del sistema, la información del usuario autenticado (correo y roles) y el botón para cerrar sesión. Los grupos se expanden automáticamente cuando el usuario navega a una ruta hija, y la ruta activa se distingue con un resaltado naranja y un borde lateral.

---

## Configuración del restaurante

Esta sección permite editar la información global del restaurante, que es compartida por todas las sucursales. Se divide en tres bloques.

El bloque de información general incluye el nombre del restaurante, un identificador amigable para URLs (slug) que puede generarse automáticamente a partir del nombre, una descripción opcional y un selector de color principal que define el acento visual de la marca.

El bloque de imágenes permite cargar o reemplazar el logotipo y el banner del restaurante, con vista previa de las imágenes seleccionadas.

El bloque de contacto permite registrar la dirección física, el teléfono y el correo electrónico del restaurante.

Todos los campos se validan al guardar: el nombre y el slug son obligatorios.

---

## Gestión de sucursales

La pantalla de sucursales presenta una tabla paginada con diez elementos por página. Cada fila muestra el nombre de la sucursal, su dirección, teléfono, horario de apertura y cierre, estado (activa o inactiva) y botones de acción.

Para crear una sucursal, se abre un formulario modal que solicita el nombre (obligatorio), la dirección, el teléfono, el correo electrónico, una imagen, los horarios de apertura y cierre (que por defecto son de nueve de la mañana a once de la noche), el estado de actividad y un número de orden para la presentación. Al guardar, el sistema crea automáticamente una categoría base asociada a la nueva sucursal.

La edición de una sucursal abre el mismo formulario con los datos precargados. La eliminación requiere confirmación explícita y ejecuta un borrado en cascada: al eliminar una sucursal, se eliminan todas sus categorías, subcategorías, productos, mesas y el historial de pedidos asociado. El diálogo de confirmación informa al usuario sobre el alcance de la eliminación antes de proceder.

---

## Categorías

Las categorías organizan el primer nivel del menú y están vinculadas a una sucursal específica. La pantalla muestra una tabla paginada con el ícono, el nombre, la imagen, el número de orden, el estado y las acciones disponibles. Existe una categoría especial del sistema llamada "Home" que se filtra automáticamente y no aparece en la lista.

El formulario de creación solicita un nombre (entre dos y cien caracteres), un ícono opcional (generalmente un emoji), una imagen, un número de orden (que se autoincrementa) y el estado de actividad. Para crear o ver categorías es necesario tener una sucursal seleccionada.

La eliminación de una categoría implica un borrado en cascada que afecta a todas sus subcategorías y productos. El diálogo de confirmación muestra la cantidad de elementos que serán eliminados.

---

## Subcategorías

Las subcategorías representan el segundo nivel de organización del menú, dentro de cada categoría. La tabla incluye la imagen, el nombre, la categoría padre, el número de orden, el estado, la cantidad de productos contenidos y las acciones. Se puede filtrar la tabla por categoría mediante un menú desplegable.

El formulario de creación requiere seleccionar la categoría padre (obligatorio), ingresar un nombre (entre dos y cien caracteres), una imagen, un orden (autoincremental dentro de la categoría) y el estado. La eliminación arrastra consigo todos los productos contenidos en la subcategoría.

---

## Productos (platos y bebidas)

La gestión de productos es la sección más compleja del Dashboard. La tabla principal muestra la imagen, el nombre, la categoría y subcategoría, el precio, distintivos de destacado o popular, el estado y las acciones. Se puede filtrar por categoría y subcategoría.

El formulario de creación y edición es extenso y se organiza en varias secciones.

La sección de información básica comprende el nombre (obligatorio, entre dos y cien caracteres), una descripción opcional de hasta quinientos caracteres, la categoría y la subcategoría (ambas obligatorias).

La sección de precios permite definir un precio base global y, opcionalmente, activar precios diferenciados por sucursal. Cuando esta opción está activa, aparece una grilla con una fila por cada sucursal activa donde se puede activar o desactivar la venta del producto en esa sucursal y fijar un precio específico.

La sección de medios permite cargar una imagen del producto con vista previa.

La sección de opciones de exhibición incluye interruptores para marcar el producto como destacado o popular.

La sección de alérgenos y etiquetas permite asociar alérgenos al producto mediante un editor que, para cada alérgeno vinculado, especifica el tipo de presencia (contiene, puede contener o libre de) y el nivel de riesgo (bajo, estándar o alto). También permite asignar una insignia y un sello al producto.

La sección avanzada, que se presenta como un bloque expandible, incluye métodos de cocción (selección múltiple entre opciones como horneado, frito, grillado, crudo, hervido, al vapor, salteado y braseado), perfiles de sabor (suave, intenso, dulce, salado, ácido, amargo, umami, picante), perfiles de textura (crocante, cremoso, tierno, firme, esponjoso, gelatinoso, granulado), un perfil dietario con interruptores individuales (vegetariano, vegano, sin gluten, sin lácteos, apto celíacos, keto, bajo en sodio), una tabla de ingredientes con cantidades y unidades, y la posibilidad de vincular una receta existente.

La eliminación de un producto lo retira automáticamente de todas las promociones que lo incluyan.

---

## Exclusiones por sucursal

Esta pantalla permite controlar qué categorías y subcategorías están disponibles en cada sucursal. El usuario selecciona una o más sucursales mediante casillas de verificación (con opciones de seleccionar todas o limpiar la selección), elige si desea ver categorías o subcategorías mediante un interruptor de vista, y luego utiliza interruptores individuales para activar o desactivar la disponibilidad de cada elemento en las sucursales seleccionadas. La tabla muestra el nombre del elemento, su estado de disponibilidad y la lista de sucursales donde está excluido.

---

## Precios

La pantalla de precios ofrece una vista consolidada de todos los productos de la sucursal seleccionada con sus valores. La tabla muestra la categoría, subcategoría, nombre del producto y el precio actual. Si el producto utiliza precios por sucursal, se muestra el rango de precios y la cantidad de sucursales donde está activo.

Al hacer clic en un producto, se abre un modal de edición de precios que permite modificar el precio base, activar o desactivar los precios por sucursal, y ajustar individualmente el precio y la disponibilidad en cada sucursal.

Una funcionalidad destacada es la actualización en lote: mediante un botón dedicado, se abre un modal que permite aplicar un aumento fijo (un monto en pesos) o un aumento porcentual a todos los productos filtrados en pantalla. El sistema muestra una previsualización de los nuevos precios antes de aplicar el cambio.

---

## Alérgenos

Los alérgenos se gestionan de forma global, sin depender de una sucursal. El sistema viene precargado con los catorce alérgenos de declaración obligatoria según la normativa europea (gluten, lácteos, huevos, pescado, mariscos, frutos secos, soja, apio, mostaza, sésamo, sulfitos y altramuces), cada uno con su ícono representativo.

La tabla muestra el ícono, nombre, descripción, nivel de severidad, indicación de obligatoriedad, cantidad de productos vinculados, estado y acciones. El formulario permite crear nuevos alérgenos especificando nombre, ícono, descripción, si es de declaración obligatoria, su severidad (leve, moderada, severa o potencialmente mortal) y su estado de actividad.

La eliminación de un alérgeno lo desvincula automáticamente de todos los productos que lo referenciaban, y el sistema informa la cantidad de productos afectados.

---

## Insignias y sellos

Las insignias son etiquetas visuales que destacan productos en el menú. El sistema incluye cuatro insignias predefinidas: Nuevo, Popular, Recomendado y Especial del Chef. Cada insignia tiene un nombre y un color asociado. Se pueden crear nuevas insignias y eliminar las existentes; la eliminación retira la insignia de todos los productos que la utilizaban.

Los sellos funcionan de manera similar pero indican propiedades especiales del producto. El sistema incluye seis sellos predefinidos: Vegano, Vegetariano, Sin Gluten, Orgánico, Sin Lactosa y Bajo en Sodio. Cada sello posee nombre, color e ícono. Su eliminación también retira la referencia de los productos asociados.

---

## Mesas

La gestión de mesas presenta una interfaz visual en forma de cuadrícula donde cada mesa aparece como una tarjeta coloreada según su estado. Los colores son: verde para libre, rojo para ocupada, amarillo para pedido solicitado, azul para pedido cumplido y violeta para cuenta solicitada. Las mesas inactivas aparecen en gris.

Cada tarjeta muestra el número de mesa, el estado con su etiqueta, la capacidad de comensales y, cuando corresponde, la hora del pedido. Las mesas con cuenta solicitada exhiben una animación pulsante para captar la atención.

El ordenamiento automático prioriza la urgencia: primero las mesas con cuenta solicitada, luego las que esperan pedido, las que tienen pedido cumplido, las ocupadas y finalmente las libres. Dentro de cada grupo, se ordenan por número de mesa.

Se pueden filtrar las mesas por sucursal y por estado mediante controles superiores. Una leyenda visual explica el significado de cada color.

La creación de mesas permite definir el número, la capacidad, el sector (como interior, terraza o VIP) y el estado inicial. Existe una función de creación en lote que permite generar múltiples mesas de una vez, especificando la cantidad, el sector, la capacidad base y el número de mesa inicial.

El cambio de estado de una mesa sigue reglas temporales específicas. Cuando una mesa pasa a "pedido solicitado", se registra automáticamente la hora del pedido. Cuando pasa a "pedido cumplido", se conserva la hora original del pedido. Cuando se solicita la cuenta, se conserva la hora del pedido y se registra la hora de cierre. Cuando la mesa vuelve a "libre" u "ocupada", ambas horas se reinician.

Las mesas con cuenta solicitada muestran un botón de archivo que crea un registro en el historial de pedidos (capturando la sucursal, la mesa y los datos de la sesión) y reinicia la mesa al estado libre.

---

## Personal

La gestión de personal muestra una tabla paginada con el nombre completo, correo electrónico, rol, DNI, fecha de ingreso, estado de actividad y acciones. Incluye un campo de búsqueda con filtrado en tiempo real que permite buscar por nombre, apellido, correo o DNI.

El formulario de creación solicita la sucursal, el rol (cuya lista varía según el rol del usuario que lo crea: un administrador puede asignar todos los roles, pero un gerente no puede asignar el rol de administrador), nombre, apellido, correo electrónico (único en el sistema), teléfono, DNI, fecha de ingreso (que por defecto es la fecha actual) y estado de actividad. El correo se valida por formato y unicidad.

---

## Roles

La pantalla de roles presenta una vista de solo lectura con la matriz de permisos del sistema. Muestra los cuatro roles predefinidos (Cocinero, Mozo, Administrativo y Gerente) con sus capacidades de creación, edición, eliminación y visualización. Los roles son definidos por el sistema y no pueden ser modificados por el usuario.

---

## Cocina y comandas

La vista de cocina es una interfaz especializada para el personal que trabaja en la línea de producción. Presenta los pedidos activos en un diseño de dos columnas: pedidos nuevos (recién enviados a cocina) y pedidos en preparación.

Cada pedido se muestra como una tarjeta compacta que indica el código de la mesa, la cantidad de ítems, el tiempo transcurrido desde que fue recibido y una insignia de estado. Los pedidos que llevan más de quince minutos en cocina se resaltan con un borde rojo pulsante para señalar urgencia.

Al hacer clic en una tarjeta, se abre un modal con el detalle completo del pedido: la lista de ítems con sus cantidades, el nombre del comensal que los ordenó (cuando está disponible), el tiempo transcurrido y un botón para avanzar al siguiente estado. El flujo de estados en cocina es: enviado a cocina, en preparación, listo para servir y servido.

La pantalla se actualiza en tiempo real mediante conexión WebSocket: cuando un nuevo pedido llega a cocina, cuando un pedido cambia de estado o cuando un pedido es cancelado, la interfaz se actualiza instantáneamente sin necesidad de recargar la página. Un indicador de conexión (ícono de wifi verde o rojo) informa al usuario si la conexión en tiempo real está activa.

---

## Pedidos (vista administrativa)

La vista administrativa de pedidos presenta un panel más amplio que el de cocina. En la parte superior muestra cuatro tarjetas de resumen con la cantidad total de pedidos activos, los pendientes, los que están en cocina y los que están listos.

Los pedidos se pueden filtrar por sucursal y por estado. Cuando no se aplica filtro de estado, la pantalla organiza los pedidos en tres columnas tipo Kanban: nuevos, en cocina y listos. Cuando se filtra por un estado específico, los pedidos se muestran en una cuadrícula.

Cada tarjeta de pedido muestra el código de la mesa, la insignia de estado, la hora de envío, el tiempo transcurrido (con resaltado rojo si supera los quince minutos), la lista de ítems con el nombre del comensal, los precios y un botón para avanzar al siguiente estado. Esta vista también recibe actualizaciones en tiempo real por WebSocket.

---

## Recetas (fichas técnicas)

El módulo de recetas permite crear fichas técnicas completas para la cocina, que además pueden ser ingeridas por un sistema de inteligencia artificial para asistencia al personal de cocina.

La tabla principal muestra el nombre de la receta, el nivel de dificultad (fácil en verde, media en amarillo, difícil en rojo), la sucursal asociada, el creador y las acciones disponibles.

El formulario de creación es el más extenso del sistema y se organiza en múltiples secciones. La información básica incluye sucursal, nombre, descripción, descripción corta para previsualización y nivel de dificultad. La sección de tiempos incluye tiempo de preparación, tiempo de cocción (el total se calcula automáticamente), número de porciones y calorías por porción. La sección de contenido incluye una tabla de ingredientes (con referencia al catálogo de ingredientes, cantidad, unidad y notas especiales), pasos de preparación numerados (con instrucción y tiempo estimado por paso), notas del chef, consejos de presentación e instrucciones de almacenamiento.

La sección de categorización incluye tipo de cocina, alérgenos asociados, notas sobre contaminación cruzada y etiquetas dietarias. El perfil sensorial permite especificar sabores, texturas y métodos de cocción. La sección de seguridad incluye indicación de aptitud para celíacos, modificaciones permitidas (con tipo de acción: quitar o sustituir) y advertencias con nivel de severidad.

Finalmente, la sección de costos incluye el costo de producción, el precio sugerido de venta, la cantidad y unidad de rendimiento, el tamaño de porción, el nivel de riesgo para el sistema de inteligencia artificial y un descargo de responsabilidad personalizado.

---

## Ingredientes

El catálogo de ingredientes organiza los insumos en grupos (como vegetales, proteínas, lácteos). La tabla muestra el nombre del grupo, el nombre del ingrediente, su descripción, si es un ingrediente procesado y su estado de actividad. Se puede filtrar por grupo mediante un menú desplegable.

Los ingredientes procesados tienen una funcionalidad adicional: al expandir su fila, se revelan los subingredientes que los componen. Por ejemplo, un ingrediente "Masa para empanadas" podría contener subingredientes como "harina", "grasa" y "sal". Se pueden agregar y eliminar subingredientes desde esta vista expandida.

La creación de grupos de ingredientes solicita nombre, descripción e ícono. La creación de ingredientes requiere nombre, grupo (opcional), descripción, indicación de si es procesado y estado.

---

## Tipos de promoción

Los tipos de promoción categorizan las ofertas comerciales. El sistema incluye cuatro tipos predefinidos: Happy Hour, Combo Familiar, 2x1 y Descuento. Cada tipo tiene nombre, descripción e ícono.

Se pueden crear nuevos tipos y eliminar los existentes. La eliminación de un tipo de promoción puede afectar a las promociones que lo utilizan, y el sistema informa la cantidad de promociones vinculadas antes de proceder.

---

## Promociones

Las promociones son ofertas comerciales con vigencia temporal que combinan productos en combos. La tabla muestra el nombre, el tipo de promoción, el precio, las sucursales donde aplica, el período de vigencia, el estado y las acciones.

El formulario de creación solicita nombre, descripción, tipo de promoción, precio del combo, imagen, fechas de inicio y fin, horarios de inicio y fin, selección de sucursales (por defecto todas las activas) y la composición del combo: una tabla donde se agregan productos con sus cantidades.

Las reglas de validación temporal son estrictas: para promociones nuevas, la fecha y hora de inicio deben ser futuras; la fecha de fin debe ser igual o posterior a la de inicio; no se puede activar una promoción cuya fecha de fin ya pasó; y si la promoción es de un solo día, la hora de fin debe ser posterior a la de inicio. Cuando se edita una promoción existente, la validación de fecha de inicio se relaja para permitir modificar promociones que ya comenzaron.

El estado de la promoción se muestra dinámicamente: activa (con insignia verde) si la fecha y hora actuales caen dentro del período de vigencia, o inactiva (con insignia gris) si la promoción expiró o aún no comenzó.

---

## Estadísticas de ventas

La pantalla de ventas presenta un panel analítico con datos reales del sistema. En la parte superior se encuentran filtros por sucursal y por rango de fechas (últimos siete, catorce, treinta o noventa días). Debajo, cinco tarjetas de resumen muestran el total de ventas, la cantidad de pedidos, la cantidad de sesiones, el ticket promedio y la hora pico.

Un gráfico de barras desplazable muestra las ventas diarias del período seleccionado. Una lista clasificatoria muestra los diez productos más vendidos con sus cantidades y recaudación. Una tabla de desglose diario permite ver fecha por fecha las ventas, los pedidos y el ticket promedio. Todos estos datos pueden exportarse a formato CSV mediante un botón dedicado.

---

## Reportes

La pantalla de reportes presenta una interfaz de visualización con filtros de rango de fechas (hoy, última semana, último mes o fechas personalizadas) y filtro por sucursal. Muestra tarjetas de resumen con ventas totales, cantidad de pedidos y valor promedio de pedido con tendencias porcentuales. Incluye un gráfico de barras de ventas por día y un ranking de los cinco productos más vendidos. Permite exportar tres tipos de informes en formato CSV: resumen general, ventas diarias y productos más vendidos. Actualmente esta sección opera con datos simulados como previsualización de la funcionalidad futura.

---

## Historial por sucursales y por clientes

Estas dos secciones se encuentran en estado de desarrollo futuro. La pantalla de historial por sucursales anuncia que próximamente permitirá consultar el historial de pedidos filtrado por sucursal, ver estadísticas de ventas y exportar reportes. La pantalla de historial por clientes anuncia que próximamente permitirá consultar el historial de pedidos por cliente, ver frecuencia de visitas y preferencias de consumo.

---

## Configuración del sistema

La pantalla de configuración ofrece tres funcionalidades de administración de datos.

La exportación de datos genera un archivo de respaldo en formato JSON que contiene la información del restaurante, todas las categorías, subcategorías y productos, junto con una marca de tiempo. El archivo se descarga con el nombre "buen-sabor-backup" seguido de la fecha.

La importación de datos permite restaurar información desde un archivo de respaldo. El sistema valida el archivo antes de importarlo: verifica que sea de tipo JSON, que no supere los cinco megabytes de tamaño, y que su estructura interna contenga los campos obligatorios (nombre y slug del restaurante, identificadores y nombres de categorías, subcategorías y productos). Si la validación es exitosa, los datos se cargan reemplazando la información actual.

La limpieza de caché borra todos los datos almacenados localmente en el navegador. El restablecimiento de datos es una operación destructiva que borra toda la información local y recarga la aplicación desde cero; requiere confirmación explícita y advierte que la acción es irreversible.

---

## Sistema de ayuda contextual

Cada pantalla del Dashboard incluye un botón de ayuda (representado con un signo de interrogación en rojo) que abre un modal con explicaciones detalladas sobre la funcionalidad de la página, la descripción de cada campo, consejos de uso y advertencias sobre acciones críticas. Además, cada formulario de creación y edición incluye un botón de ayuda más pequeño que explica los campos del formulario y sus reglas de validación.

---

## Control de acceso basado en roles

El sistema implementa un control de acceso granular que determina las operaciones permitidas según el rol del usuario.

El administrador tiene acceso completo a todas las funcionalidades sin restricciones: puede crear, editar y eliminar cualquier entidad, gestionar todas las sucursales, asignar cualquier rol al personal y acceder a todas las vistas del sistema.

El gerente puede gestionar el personal, las mesas, los alérgenos y las promociones, pero únicamente dentro de las sucursales a las que está asignado. No puede eliminar entidades principales ni asignar el rol de administrador a otros usuarios.

El cocinero tiene acceso a la vista de cocina, las recetas y los ingredientes. Puede ver y gestionar los pedidos en cocina, crear y editar fichas técnicas, pero no tiene permisos para modificar el menú, los precios ni la estructura del restaurante.

El mozo tiene acceso limitado dentro del Dashboard; su operación principal se desarrolla en la aplicación dedicada para mozos.

---

## Actualizaciones en tiempo real

Las pantallas de cocina y pedidos mantienen una conexión WebSocket permanente con el servidor que permite recibir notificaciones instantáneas. Cuando un comensal envía un pedido desde la aplicación de menú, este aparece inmediatamente en la vista de cocina. Cuando el personal de cocina marca un pedido como listo, la vista administrativa se actualiza al instante. El sistema muestra un indicador visual de estado de conexión para que el usuario sepa si la comunicación en tiempo real está activa.

Los eventos que se transmiten en tiempo real incluyen la creación, confirmación, envío a cocina, preparación, finalización y servicio de pedidos, así como las llamadas de servicio, las solicitudes de cuenta y los cambios de estado de las mesas. El sistema también notifica cuando se crean, modifican o eliminan entidades administrativas, permitiendo que múltiples usuarios trabajen simultáneamente sin conflictos de información.

---

## Notificaciones y retroalimentación

Todas las acciones del usuario producen retroalimentación visual mediante notificaciones emergentes (toasts) que aparecen brevemente en pantalla. Las notificaciones de éxito se muestran en verde, los errores en rojo, las advertencias en amarillo y los mensajes informativos en azul. El sistema limita a cinco notificaciones simultáneas para evitar saturación visual.

Toda operación destructiva (eliminación de sucursales, categorías, productos, personal) requiere confirmación explícita mediante un diálogo que describe el alcance de la acción y, en el caso de eliminaciones en cascada, detalla la cantidad de elementos que serán afectados.

---

## Accesibilidad

El sistema incorpora consideraciones de accesibilidad en toda su interfaz. Todos los elementos interactivos poseen etiquetas accesibles para lectores de pantalla. Los modales implementan captura de foco para que la navegación por teclado permanezca dentro del diálogo abierto. Se incluyen textos ocultos para lectores de pantalla en componentes visuales como insignias e indicadores de estado. La navegación por teclado está soportada en tablas, formularios y modales. Un enlace de salto al inicio permite a los usuarios de teclado acceder directamente al contenido principal.
