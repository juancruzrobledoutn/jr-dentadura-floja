import type { ReactNode } from 'react'

/**
 * Union of every Dashboard page that should have help content.
 *
 * See openspec/help-system-roadmap.md for the full initiative plan.
 * Change #7 will tighten this typing to a full `Record<DashboardPageKey, ReactNode>`
 * once every entry is filled by changes #2–#6.
 */
export type DashboardPageKey =
  // --- change #1 baseline (16 keys, already implemented) ---
  | 'dashboard'
  | 'restaurant'
  | 'branches'
  | 'categories'
  | 'subcategories'
  | 'products'
  | 'prices'
  | 'allergens'
  | 'badges'
  | 'promotionTypes'
  | 'promotions'
  | 'tables'
  | 'sales'
  | 'historyBranches'
  | 'historyCustomers'
  | 'settings'
  // --- change #2: half-done pages (8 keys) ---
  | 'customizations'
  | 'delivery'
  | 'ingredients'
  | 'recipes'
  | 'reservations'
  | 'seals'
  | 'suppliers'
  | 'kitchen'
  // --- change #3: read-only pages (4 keys) ---
  | 'orders'
  | 'inventory'
  | 'cashRegister'
  | 'productExclusions'
  // --- change #4: reports pages (4 keys) ---
  | 'reports'
  | 'fiscal'
  | 'auditLog'
  | 'tips'
  // --- change #5: crm / layout pages (3 keys) ---
  | 'crm'
  | 'floorPlan'
  | 'scheduling'
  // --- change #6: staff / roles refactor (2 keys) ---
  | 'staff'
  | 'roles'

export const helpContent: Partial<Record<DashboardPageKey, ReactNode>> = {
  dashboard: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Bienvenido al Panel de Control</p>
      <p>
        Este es el punto central de administracion de tu restaurante. Desde aqui puedes:
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Ver estadisticas generales:</strong> Resumen rapido de sucursales, categorias, productos y promociones activas.</li>
        <li><strong>Seleccionar una sucursal:</strong> Haz clic en el boton "Ver Menu" de cualquier sucursal para activarla y poder gestionar sus categorias, subcategorias y productos.</li>
        <li><strong>Navegar rapidamente:</strong> Accede a cualquier seccion del sistema desde el menu lateral izquierdo.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Importante:</p>
        <p className="text-sm mt-1">
          Para gestionar categorias, subcategorias, productos o precios, primero debes seleccionar una sucursal haciendo clic en "Ver Menu".
          La sucursal activa aparecera indicada en el menu lateral.
        </p>
      </div>
    </div>
  ),

  restaurant: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Configuracion del Restaurante</p>
      <p>
        En esta seccion puedes configurar la informacion general de tu restaurante:
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Nombre del restaurante:</strong> El nombre que aparecera en todo el sistema y menu publico.</li>
        <li><strong>Slug:</strong> Identificador unico para la URL de tu menu (solo letras minusculas, numeros y guiones).</li>
        <li><strong>Descripcion:</strong> Breve descripcion de tu restaurante para los clientes.</li>
        <li><strong>Logo:</strong> Imagen representativa de tu marca.</li>
        <li><strong>Color principal:</strong> El color que se usara como acento en tu menu publico.</li>
        <li><strong>Datos de contacto:</strong> Telefono, email y direccion principal.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Consejo:</p>
        <p className="text-sm mt-1">
          Asegurate de completar toda la informacion antes de crear sucursales.
          Esta informacion es compartida por todas las sucursales.
        </p>
      </div>
    </div>
  ),

  branches: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Sucursales</p>
      <p>
        Administra todas las sucursales de tu restaurante. Cada sucursal tiene su propio menu con categorias, subcategorias y productos independientes.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Crear sucursal:</strong> Haz clic en "Nueva Sucursal" para agregar una nueva ubicacion.</li>
        <li><strong>Editar sucursal:</strong> Modifica nombre, direccion, telefono, email e imagen.</li>
        <li><strong>Ver menu:</strong> Haz clic en el icono de enlace externo para activar la sucursal y gestionar su menu.</li>
        <li><strong>Activar/Desactivar:</strong> Controla si la sucursal esta visible para los clientes.</li>
        <li><strong>Ordenar:</strong> Define el orden de aparicion de las sucursales.</li>
      </ul>
      <div className="bg-red-900/50 p-4 rounded-lg mt-4 border border-red-700">
        <p className="text-[var(--danger-text)] font-medium">Advertencia:</p>
        <p className="text-sm mt-1">
          Al eliminar una sucursal se eliminaran TODAS las categorias, subcategorias y productos asociados a ella.
          Esta accion no se puede deshacer.
        </p>
      </div>
    </div>
  ),

  categories: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Categorias</p>
      <p>
        Las categorias son las secciones principales del menu de una sucursal (ej: Comidas, Bebidas, Postres).
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Crear categoria:</strong> Haz clic en "Nueva Categoria" para agregar una seccion al menu.</li>
        <li><strong>Editar categoria:</strong> Modifica nombre, icono, imagen y estado.</li>
        <li><strong>Ordenar:</strong> Define el orden de aparicion en el menu.</li>
        <li><strong>Subcategorias:</strong> Visualiza cuantas subcategorias tiene cada categoria.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          Cada sucursal tiene su propio conjunto de categorias. Primero selecciona una sucursal desde el Dashboard
          para ver y gestionar sus categorias.
        </p>
      </div>
      <div className="bg-red-900/50 p-4 rounded-lg mt-2 border border-red-700">
        <p className="text-[var(--danger-text)] font-medium">Advertencia:</p>
        <p className="text-sm mt-1">
          Al eliminar una categoria se eliminaran todas sus subcategorias y productos.
        </p>
      </div>
    </div>
  ),

  subcategories: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Subcategorias</p>
      <p>
        Las subcategorias permiten organizar los productos dentro de cada categoria (ej: dentro de "Comidas" puedes tener "Hamburguesas", "Pastas", "Ensaladas").
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Crear subcategoria:</strong> Selecciona la categoria padre y agrega una nueva subcategoria.</li>
        <li><strong>Filtrar:</strong> Usa el filtro para ver subcategorias de una categoria especifica.</li>
        <li><strong>Editar:</strong> Modifica nombre, imagen y estado de la subcategoria.</li>
        <li><strong>Productos:</strong> Visualiza cuantos productos tiene cada subcategoria.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Consejo:</p>
        <p className="text-sm mt-1">
          Organiza tus productos en subcategorias para que los clientes encuentren facilmente lo que buscan.
          Por ejemplo: Bebidas &gt; Cervezas, Bebidas &gt; Jugos, Bebidas &gt; Gaseosas.
        </p>
      </div>
    </div>
  ),

  products: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Productos</p>
      <p>
        Administra todos los productos del menu de la sucursal seleccionada.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Crear producto:</strong> Agrega nuevos items al menu con nombre, descripcion, precio e imagen.</li>
        <li><strong>Categoria y Subcategoria:</strong> Asigna cada producto a su ubicacion en el menu.</li>
        <li><strong>Precio:</strong> Define un precio unico o precios diferentes por sucursal.</li>
        <li><strong>Alergenos:</strong> Indica que alergenos contiene el producto para informar a los clientes.</li>
        <li><strong>Destacado/Popular:</strong> Marca productos especiales que apareceran resaltados.</li>
        <li><strong>Badge:</strong> Agrega etiquetas como "NUEVO", "VEGANO", "PROMO".</li>
        <li><strong>Filtros:</strong> Filtra productos por categoria y subcategoria.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Precios por sucursal:</p>
        <p className="text-sm mt-1">
          Activa "Precios diferentes por sucursal" para definir precios especificos en cada ubicacion.
          Puedes desmarcar sucursales donde el producto no se vende.
        </p>
      </div>
    </div>
  ),

  prices: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Precios</p>
      <p>
        Vista especializada para gestionar y actualizar precios de productos de forma eficiente.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Vista rapida:</strong> Ve todos los precios de productos en una tabla.</li>
        <li><strong>Filtrar:</strong> Filtra por categoria y subcategoria para encontrar productos rapidamente.</li>
        <li><strong>Editar precio:</strong> Haz clic en "Editar" para modificar el precio de un producto.</li>
        <li><strong>Modo precio unico:</strong> Un solo precio para todas las sucursales.</li>
        <li><strong>Modo por sucursal:</strong> Precios diferentes segun la ubicacion.</li>
        <li><strong>Actualizacion masiva:</strong> Usa "Actualizar Precios" para aplicar cambios a multiples productos.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Actualizacion masiva:</p>
        <p className="text-sm mt-1">
          Puedes aumentar o disminuir precios por porcentaje (ej: +10%) o por monto fijo (ej: +$500).
          Los cambios se aplican a todos los productos filtrados actualmente.
        </p>
      </div>
    </div>
  ),

  allergens: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Alergenos</p>
      <p>
        Administra la lista de alergenos que pueden contener tus productos. Esta informacion es importante para la seguridad alimentaria de tus clientes.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Alergenos predefinidos:</strong> El sistema incluye los 12 alergenos principales (Gluten, Lacteos, Huevos, etc.).</li>
        <li><strong>Crear alergeno:</strong> Agrega nuevos alergenos con nombre, icono (emoji) y descripcion.</li>
        <li><strong>Editar/Eliminar:</strong> Modifica o elimina alergenos existentes.</li>
        <li><strong>Uso en productos:</strong> Ve cuantos productos tienen asignado cada alergeno.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Consejo:</p>
        <p className="text-sm mt-1">
          Usa emojis representativos para cada alergeno. Apareceran junto a los productos en el menu
          para informar rapidamente a los clientes.
        </p>
      </div>
    </div>
  ),

  badges: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Insignias</p>
      <p>
        Administra las insignias (badges) que puedes asignar a tus productos para destacarlos y atraer la atencion de los clientes.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Insignias predefinidas:</strong> El sistema incluye 4 insignias comunes (Nuevo, Popular, Chef's Choice, Especial del Día).</li>
        <li><strong>Crear insignia:</strong> Agrega nuevas insignias con nombre personalizado y color.</li>
        <li><strong>Color personalizable:</strong> Elige el color que mejor represente cada insignia.</li>
        <li><strong>Vista previa:</strong> Ve como se vera la insignia antes de guardarla.</li>
        <li><strong>Uso en productos:</strong> Ve cuantos productos tienen asignada cada insignia.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Consejo:</p>
        <p className="text-sm mt-1">
          Usa insignias para destacar productos especiales, nuevos o recomendados. Apareceran como etiquetas coloridas en el menu
          del cliente para captar su atencion rapidamente.
        </p>
      </div>
    </div>
  ),

  promotionTypes: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Tipos de Promocion</p>
      <p>
        Define los tipos de promociones que ofrece tu restaurante. Estos tipos te ayudan a categorizar y filtrar tus promociones.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Tipos predefinidos:</strong> Happy Hour, Combo Familiar, 2x1, Descuento.</li>
        <li><strong>Crear tipo:</strong> Agrega nuevos tipos de promocion con nombre, icono y descripcion.</li>
        <li><strong>Color:</strong> Asigna un color distintivo para identificar facilmente cada tipo.</li>
        <li><strong>Uso:</strong> Ve cuantas promociones activas usan cada tipo.</li>
      </ul>
      <div className="bg-red-900/50 p-4 rounded-lg mt-4 border border-red-700">
        <p className="text-[var(--danger-text)] font-medium">Advertencia:</p>
        <p className="text-sm mt-1">
          Al eliminar un tipo de promocion se eliminaran TODAS las promociones que lo usen.
          Considera desactivar el tipo en lugar de eliminarlo.
        </p>
      </div>
    </div>
  ),

  promotions: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Promociones</p>
      <p>
        Crea y administra promociones y combos para atraer mas clientes. Las promociones pueden aplicarse a multiples sucursales.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Crear promocion:</strong> Define nombre, precio del combo y selecciona los productos incluidos.</li>
        <li><strong>Tipo de promocion:</strong> Categoriza la promocion (Happy Hour, 2x1, Combo, etc.).</li>
        <li><strong>Programacion:</strong> Establece fechas y horarios de vigencia.</li>
        <li><strong>Sucursales:</strong> Selecciona en que sucursales estara disponible.</li>
        <li><strong>Productos:</strong> Elige que productos forman parte del combo y en que cantidad.</li>
        <li><strong>Activar/Desactivar:</strong> Controla la visibilidad de cada promocion.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Horarios:</p>
        <p className="text-sm mt-1">
          Puedes definir horarios especificos para promociones como Happy Hour (17:00 - 20:00).
          La promocion solo sera visible durante el horario configurado.
        </p>
      </div>
    </div>
  ),

  tables: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Mesas</p>
      <p>
        Administra las mesas de cada sucursal. Las mesas estan vinculadas a las ordenes de pedido y rondas de servicio.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Crear mesa:</strong> Selecciona una sucursal y agrega nuevas mesas con numero, capacidad y sector.</li>
        <li><strong>Numero de mesa:</strong> Identificador unico dentro de cada sucursal.</li>
        <li><strong>Capacidad:</strong> Cantidad maxima de comensales que puede recibir la mesa.</li>
        <li><strong>Sector:</strong> Ubicacion dentro del local (Interior, Terraza, VIP, Barra, etc.).</li>
        <li><strong>Estado:</strong> Controla el estado actual de la mesa (Libre, Solicito Pedido, Pedido Cumplido, Ocupada).</li>
        <li><strong>Filtrar:</strong> Usa el filtro para ver mesas de una sucursal especifica.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Estados de mesa:</p>
        <ul className="text-sm mt-2 space-y-1">
          <li><strong>Libre:</strong> Mesa disponible para nuevos clientes.</li>
          <li><strong>Solicito Pedido:</strong> Cliente esperando para ordenar.</li>
          <li><strong>Pedido Cumplido:</strong> Pedido entregado, cliente consumiendo.</li>
          <li><strong>Ocupada:</strong> Mesa en uso.</li>
        </ul>
      </div>
      <div className="bg-red-900/50 p-4 rounded-lg mt-2 border border-red-700">
        <p className="text-[var(--danger-text)] font-medium">Importante:</p>
        <p className="text-sm mt-1">
          Las mesas estan vinculadas a las ordenes de pedido. Antes de eliminar una mesa, asegurate de que no tenga ordenes pendientes.
        </p>
      </div>
    </div>
  ),

  sales: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Estadisticas de Ventas</p>
      <p>
        Visualiza y analiza las ventas de tu restaurante por sucursal y periodo de tiempo.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Resumen general:</strong> Ve el total de ventas, promedio por dia y comparativas.</li>
        <li><strong>Filtrar por sucursal:</strong> Selecciona una sucursal especifica o ve datos consolidados.</li>
        <li><strong>Rango de fechas:</strong> Define el periodo a analizar (dia, semana, mes, personalizado).</li>
        <li><strong>Graficos:</strong> Visualiza tendencias con graficos de linea y barras.</li>
        <li><strong>Productos mas vendidos:</strong> Identifica los productos estrella de cada sucursal.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Consejo:</p>
        <p className="text-sm mt-1">
          Usa las estadisticas de ventas para identificar horarios pico, productos populares
          y oportunidades de mejora en tu menu.
        </p>
      </div>
    </div>
  ),

  historyBranches: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Historial por Sucursales</p>
      <p>
        Consulta el historial completo de ordenes y actividad de cada sucursal.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Seleccionar sucursal:</strong> Elige la sucursal para ver su historial.</li>
        <li><strong>Historial de ordenes:</strong> Ve todas las ordenes procesadas con detalles.</li>
        <li><strong>Filtrar por fecha:</strong> Busca ordenes de un dia o rango especifico.</li>
        <li><strong>Estado de mesas:</strong> Revisa el historial de ocupacion de mesas.</li>
        <li><strong>Comandas:</strong> Consulta el detalle de cada comanda procesada.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Uso tipico:</p>
        <p className="text-sm mt-1">
          Usa este historial para revisar ordenes pasadas, resolver disputas con clientes
          o analizar el rendimiento operativo de cada sucursal.
        </p>
      </div>
    </div>
  ),

  historyCustomers: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Historial de Clientes</p>
      <p>
        Visualiza el historial de visitas y consumo de tus clientes frecuentes.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Clientes frecuentes:</strong> Identifica a tus clientes mas leales.</li>
        <li><strong>Historial de visitas:</strong> Ve cuando y que ordenaron en cada visita.</li>
        <li><strong>Preferencias:</strong> Conoce los productos favoritos de cada cliente.</li>
        <li><strong>Gasto promedio:</strong> Analiza el ticket promedio por cliente.</li>
        <li><strong>Tendencias:</strong> Identifica patrones de consumo y frecuencia.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Programa de fidelidad:</p>
        <p className="text-sm mt-1">
          Usa esta informacion para crear programas de fidelidad, ofertas personalizadas
          y mejorar la experiencia de tus clientes frecuentes.
        </p>
      </div>
    </div>
  ),

  settings: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Configuracion</p>
      <p>
        Ajusta las preferencias generales del sistema y tu cuenta de usuario.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Perfil:</strong> Modifica tu informacion de usuario.</li>
        <li><strong>Notificaciones:</strong> Configura que alertas deseas recibir.</li>
        <li><strong>Apariencia:</strong> Personaliza el tema visual del panel.</li>
        <li><strong>Idioma:</strong> Cambia el idioma de la interfaz.</li>
        <li><strong>Datos:</strong> Exporta o importa datos del sistema.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          Los cambios de configuracion se guardan automaticamente.
          Algunas opciones pueden requerir recargar la pagina para aplicarse.
        </p>
      </div>
    </div>
  ),

  // --- change #2: half-done pages ---

  customizations: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Personalizaciones</p>
      <p>
        Administra las opciones de personalizacion que los clientes pueden aplicar a los productos del menu.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Filtrar por categoria:</strong> Usa el selector para ver opciones de una categoria especifica.</li>
        <li><strong>Crear personalizacion:</strong> Haz clic en "Nueva personalizacion" para agregar una opcion (ej: "Sin cebolla", "Extra queso").</li>
        <li><strong>Categoria:</strong> Agrupa la opcion en una categoria para facilitar su busqueda (ej: "Extras", "Restricciones").</li>
        <li><strong>Costo extra:</strong> Define cuanto suma al precio base (en centavos). Cero si no tiene costo adicional.</li>
        <li><strong>Orden:</strong> Controla el orden de aparicion de la opcion en el menu del cliente.</li>
        <li><strong>Vincular productos:</strong> Asocia la opcion a los productos donde puede aplicarse.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Consejo:</p>
        <p className="text-sm mt-1">
          Agrupa las opciones por categoria para localizarlas rapidamente.
          Una buena estructura de categorias (ej: "Carnes", "Salsas", "Acompanantes") mejora la experiencia del personal al tomar pedidos.
        </p>
      </div>
    </div>
  ),

  delivery: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Pedidos a Domicilio y Retiro</p>
      <p>
        Administra los pedidos de delivery (entrega a domicilio) y takeout (retiro en local) de la sucursal seleccionada.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Filtrar por tipo:</strong> Selecciona TAKEOUT (retiro) o DELIVERY (envio a domicilio) para ver solo ese tipo.</li>
        <li><strong>Filtrar por estado:</strong> Filtra pedidos por su estado actual (Recibido, Preparando, Listo, etc.).</li>
        <li><strong>Crear pedido:</strong> Haz clic en "Nuevo Pedido" para registrar un pedido telefónico o presencial.</li>
        <li><strong>Avanzar estado:</strong> Usa los botones en cada tarjeta para mover el pedido al siguiente estado.</li>
        <li><strong>Cancelar pedido:</strong> Cancela un pedido activo desde la tarjeta correspondiente.</li>
        <li><strong>Ver detalle:</strong> Consulta la informacion completa del pedido, incluyendo items y datos de entrega.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          Debes seleccionar una sucursal desde el Dashboard antes de gestionar pedidos.
          Cada sucursal tiene su propia lista de pedidos activos.
        </p>
      </div>
    </div>
  ),

  ingredients: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Ingredientes</p>
      <p>
        Administra el catalogo de ingredientes del restaurante, organizados en grupos y con soporte para sub-ingredientes.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Filtrar por grupo:</strong> Usa el selector para ver solo los ingredientes de un grupo especifico (ej: "Carnes", "Verduras").</li>
        <li><strong>Crear ingrediente:</strong> Agrega nuevos ingredientes con nombre, descripcion y grupo al que pertenece.</li>
        <li><strong>Ingrediente procesado:</strong> Activa este toggle si el ingrediente es compuesto o elaborado (ej: Salsa BBQ, Guacamole).</li>
        <li><strong>Sub-ingredientes:</strong> Expande una fila para ver y agregar los componentes de un ingrediente procesado.</li>
        <li><strong>Editar:</strong> Modifica nombre, descripcion, grupo o estado procesado de un ingrediente existente.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Consejo:</p>
        <p className="text-sm mt-1">
          Marca como "procesado" los ingredientes que son preparaciones compuestas (ej: Salsa BBQ contiene tomate, azucar y vinagre).
          Esto permite registrar sus componentes para control de inventario y alergenos.
        </p>
      </div>
    </div>
  ),

  recipes: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Recetas</p>
      <p>
        Administra las fichas tecnicas de recetas del restaurante, organizadas por sucursal y accesibles por el equipo de cocina.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Filtrar por sucursal:</strong> Selecciona una sucursal para ver sus recetas o deja en blanco para ver todas.</li>
        <li><strong>Crear receta:</strong> Haz clic en "Nueva Receta" para abrir el formulario de ficha tecnica.</li>
        <li><strong>Datos basicos:</strong> Nombre, sucursal, descripcion, tiempo de preparacion, porciones y nivel de dificultad.</li>
        <li><strong>Ingredientes:</strong> Lista de ingredientes con cantidades y unidades de medida.</li>
        <li><strong>Instrucciones:</strong> Pasos del proceso de elaboracion.</li>
        <li><strong>Notas de cocina:</strong> Observaciones adicionales para el equipo.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Consejo:</p>
        <p className="text-sm mt-1">
          Define la receta una vez por sucursal y replícala manualmente si necesitas variaciones.
          Las recetas pueden integrarse con el asistente de IA para consultas del equipo de cocina.
        </p>
      </div>
    </div>
  ),

  reservations: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Reservas</p>
      <p>
        Administra las reservas de mesas por sucursal, con filtros por fecha y estado para un control diario eficiente.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Filtrar por sucursal:</strong> Selecciona la sucursal para ver sus reservas del dia.</li>
        <li><strong>Filtrar por fecha:</strong> Consulta reservas de una fecha especifica o rango.</li>
        <li><strong>Filtrar por estado:</strong> Filtra por Pendiente, Confirmada, Sentada, Completada o Cancelada.</li>
        <li><strong>Crear reserva:</strong> Haz clic en "Nueva Reserva" para registrar una reserva con datos del cliente y preferencias.</li>
        <li><strong>Avanzar estado:</strong> Usa los botones de accion en cada tarjeta para confirmar, sentar o completar una reserva.</li>
        <li><strong>Editar / Cancelar:</strong> Modifica los datos de una reserva o cancelala desde su tarjeta.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Importante:</p>
        <p className="text-sm mt-1">
          Debes seleccionar una sucursal antes de crear o ver reservas.
          El boton "Nueva Reserva" permanece deshabilitado hasta que se elija una sucursal.
        </p>
      </div>
    </div>
  ),

  seals: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Sellos</p>
      <p>
        Administra los sellos de caracteristicas especiales que puedes asignar a los productos para informar a los clientes (ej: Vegano, Sin Gluten, Organico).
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Crear sello:</strong> Haz clic en "Nuevo Sello" para agregar un sello con nombre, emoji e icono de color.</li>
        <li><strong>Emoji:</strong> Elige un emoji representativo que aparecera junto al nombre del sello en el menu.</li>
        <li><strong>Color:</strong> Selecciona el color de fondo del sello para identificarlo visualmente.</li>
        <li><strong>Vista previa:</strong> Ve como se vera el sello antes de guardarlo.</li>
        <li><strong>Uso en productos:</strong> Consulta cuantos productos tienen asignado cada sello.</li>
        <li><strong>Activar/Desactivar:</strong> Controla si el sello es visible en el menu.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Consejo:</p>
        <p className="text-sm mt-1">
          Usa emojis representativos para reforzar el mensaje del sello (ej: hoja para vegano, espiga tachada para sin gluten).
          Los sellos aparecen como etiquetas de colores en el menu del cliente.
        </p>
      </div>
    </div>
  ),

  suppliers: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Proveedores</p>
      <p>
        Administra el directorio de proveedores del restaurante con datos de contacto y notas internas para agilizar los pedidos.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Crear proveedor:</strong> Haz clic en "Nuevo Proveedor" para agregar un nuevo proveedor al directorio.</li>
        <li><strong>Nombre:</strong> Razon social o nombre comercial del proveedor. Es obligatorio.</li>
        <li><strong>Contacto:</strong> Nombre de la persona de contacto dentro del proveedor.</li>
        <li><strong>Telefono y Email:</strong> Datos para comunicarse rapidamente ante pedidos urgentes.</li>
        <li><strong>Direccion:</strong> Ubicacion del proveedor para retiros o referencias.</li>
        <li><strong>Notas:</strong> Observaciones internas (dias de entrega, condiciones especiales, etc.).</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Consejo:</p>
        <p className="text-sm mt-1">
          Completa contacto y telefono para acelerar pedidos urgentes.
          Las notas internas son ideales para registrar condiciones especiales o acuerdos de pago.
        </p>
      </div>
    </div>
  ),

  orders: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Pedidos en Tiempo Real</p>
      <p>
        Tablero en tiempo real para monitorear y gestionar las rondas activas de todas las mesas, organizadas por estado de preparacion.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Columnas de estado:</strong> Las rondas se agrupan en Nuevos (SUBMITTED), En Cocina (IN_KITCHEN) y Listos (READY).</li>
        <li><strong>Filtro de sucursal:</strong> Selecciona una sucursal para ver solo sus pedidos o deja en blanco para ver todas.</li>
        <li><strong>Filtro de estado:</strong> Filtra el tablero por un estado especifico para enfocarte en rondas prioritarias.</li>
        <li><strong>Indicador de conexion:</strong> El icono Wifi/WifiOff muestra si la actualizacion en tiempo real via WebSocket esta activa.</li>
        <li><strong>Avanzar estado:</strong> Cada tarjeta de pedido incluye un boton para mover la ronda al siguiente estado del flujo.</li>
        <li><strong>Alerta de tiempo:</strong> Las rondas que superan 15 minutos sin avanzar muestran un indicador visual urgente.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          El tablero muestra solo rondas SUBMITTED en adelante. Las rondas PENDING o CONFIRMED viven en pwaMenu y pwaWaiter, no en el dashboard.
        </p>
      </div>
    </div>
  ),

  inventory: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Inventario</p>
      <p>
        Vista de control de stock, alertas de abastecimiento y costos de ingredientes, organizada en tres pestanas para facilitar el seguimiento diario.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Pestana Stock:</strong> Lista todos los ingredientes con cantidad actual, minimo requerido, costo por unidad, ubicacion y estado.</li>
        <li><strong>Pestana Alertas:</strong> Muestra unicamente los ingredientes con stock bajo o agotado para priorizar reposicion.</li>
        <li><strong>Pestana Costos:</strong> Tabla de food cost por receta con el porcentaje de costo destacado para analisis de rentabilidad.</li>
        <li><strong>Recalcular Costos:</strong> Boton en la pestana Costos que dispara el recalculo del food cost contra los precios actuales de ingredientes.</li>
        <li><strong>Requiere sucursal:</strong> Debes seleccionar una sucursal desde el Dashboard para ver el inventario correspondiente.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Consejo:</p>
        <p className="text-sm mt-1">
          Revisa la pestana Alertas a diario para anticipar quiebres de stock antes del servicio.
        </p>
      </div>
    </div>
  ),

  cashRegister: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Caja</p>
      <p>
        Interfaz para administrar el ciclo completo de una sesion de caja: apertura, registro de movimientos, cierre y consulta de historial.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Abrir caja:</strong> Ingresa el monto inicial de apertura para iniciar la sesion de caja del dia.</li>
        <li><strong>Registrar movimientos:</strong> Agrega movimientos por tipo (Venta, Reintegro, Gasto, Deposito, Retiro, Propina) y metodo de pago (Efectivo, Tarjeta, Transferencia, MercadoPago).</li>
        <li><strong>Totales por metodo:</strong> Visualiza el resumen de movimientos agrupados por metodo de pago durante la sesion activa.</li>
        <li><strong>Cerrar caja:</strong> Ingresa el monto real contado al cierre; el sistema calcula la diferencia entre lo esperado y lo real.</li>
        <li><strong>Historial de sesiones:</strong> La pestana Historial muestra todas las sesiones de caja cerradas anteriormente.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          Esta vista esta en proceso de integracion con el backend. Hoy permite ensayar el flujo completo de caja (apertura, movimientos, cierre, historial) en la interfaz.
        </p>
      </div>
    </div>
  ),

  productExclusions: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Exclusiones de Productos por Sucursal</p>
      <p>
        Permite a los usuarios ADMIN marcar categorias y subcategorias como no disponibles en sucursales especificas, sin eliminar los datos del catalogo global.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Solo ADMIN:</strong> Unicamente los usuarios con rol ADMIN pueden operar esta pagina; el resto ve una pantalla de acceso denegado.</li>
        <li><strong>Seleccion de sucursales:</strong> Elige una o varias sucursales como contexto de operacion usando los botones Seleccionar todas o Limpiar.</li>
        <li><strong>Vista Categorias / Subcategorias:</strong> Alterna entre ver la lista de categorias o subcategorias para gestionar exclusiones en cada nivel.</li>
        <li><strong>Filtro por categoria padre:</strong> Al visualizar subcategorias, filtra por categoria para acotar la lista y encontrar items rapidamente.</li>
        <li><strong>Toggle de exclusion:</strong> Cada fila incluye un toggle para activar o desactivar la exclusion en las sucursales seleccionadas.</li>
        <li><strong>Badge de disponibilidad:</strong> Resume cuantas sucursales tienen cada categoria/subcategoria disponible (Todas, Ninguna o X de Y).</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Importante:</p>
        <p className="text-sm mt-1">
          Solo los usuarios con rol ADMIN pueden gestionar exclusiones. Excluir una categoria deshabilita automaticamente sus subcategorias y productos en las sucursales seleccionadas.
        </p>
      </div>
    </div>
  ),

  kitchen: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Vista de Cocina</p>
      <p>
        Panel en tiempo real para el equipo de cocina con todas las rondas activas organizadas en columnas por estado.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>En Espera:</strong> Rondas enviadas desde la sala (SUBMITTED) que aun no fueron tomadas por cocina.</li>
        <li><strong>En Preparacion:</strong> Rondas que el equipo tomo y esta elaborando actualmente (IN_KITCHEN).</li>
        <li><strong>Listos:</strong> Rondas terminadas esperando ser retiradas por el mozo (READY).</li>
        <li><strong>Avanzar estado:</strong> Usa los botones en cada ticket para mover la ronda al siguiente estado.</li>
        <li><strong>Sonido:</strong> Activa o desactiva el beep de alerta al llegar nuevas rondas.</li>
        <li><strong>Indicador WebSocket:</strong> El icono Wifi/WifiOff muestra si la conexion en tiempo real esta activa.</li>
        <li><strong>Anular item:</strong> Selecciona un item en un ticket para registrar su anulacion con motivo.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          La cocina solo ve rondas SUBMITTED en adelante. Las rondas en estado PENDING o CONFIRMED (aun no confirmadas por el mozo) nunca aparecen en este panel.
        </p>
      </div>
      <div className="bg-red-900/50 p-4 rounded-lg mt-2 border border-red-700">
        <p className="text-[var(--danger-text)] font-medium">Advertencia:</p>
        <p className="text-sm mt-1">
          Anular un item es irreversible. La anulacion queda registrada en el log de auditoria con el motivo ingresado.
        </p>
      </div>
    </div>
  ),

  // --- change #4: reports / compliance pages ---

  reports: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Reportes de Ventas</p>
      <p>
        Vista de analisis de ventas con filtros de periodo y sucursal, graficos de barras, ranking de productos y exportacion a CSV.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Filtro de periodo:</strong> Selecciona Hoy, Ultima semana, Ultimo mes o un rango personalizado con fechas desde y hasta.</li>
        <li><strong>Filtro de sucursal:</strong> Filtra por sucursal especifica o elige "Todas las sucursales" para una vision consolidada.</li>
        <li><strong>Tarjetas de resumen:</strong> Muestra Total Ventas, Pedidos y Valor Promedio, cada una con un indicador de tendencia porcentual.</li>
        <li><strong>Grafico de barras:</strong> Visualiza las ventas diarias de las ultimas 14 entradas del periodo seleccionado.</li>
        <li><strong>Top 5 productos:</strong> Ranking de los productos mas vendidos por cantidad, con barra de progreso y monto total.</li>
        <li><strong>Exportar a CSV:</strong> Tres acciones de exportacion — Resumen (boton del encabezado), Ventas Diarias (dentro del grafico) y Top Productos (dentro del ranking).</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          Esta vista esta en proceso de integracion con el backend. Los numeros que se muestran hoy son ilustrativos; cuando se conecten los endpoints de ventas se reflejaran los datos reales del periodo seleccionado.
        </p>
      </div>
    </div>
  ),

  fiscal: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion Fiscal</p>
      <p>
        Interfaz de cuatro pestanas para gestionar el ciclo fiscal del restaurante: facturas, puntos de venta, notas de credito y reporte IVA mensual.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Pestana Facturas:</strong> Lista de facturas con filtros por tipo (A / B / C) y por estado (AUTHORIZED, DRAFT, REJECTED, VOIDED); accion Emitir Factura con id de Check, tipo y documento del cliente.</li>
        <li><strong>Pestana Puntos de Venta:</strong> ABM de puntos de venta con numero, tipo (Electronico / Impresora Fiscal), CUIT, razon social y condicion frente al IVA.</li>
        <li><strong>Pestana Notas de Credito:</strong> Tabla de solo lectura con factura original, monto, razon y estado de cada nota.</li>
        <li><strong>Pestana Reporte IVA:</strong> Generador mensual de reporte IVA; filtra por anio y mes y devuelve total neto, total IVA, total general y detalle agrupado por tipo de factura.</li>
        <li><strong>Requiere sucursal:</strong> Debes seleccionar una sucursal desde el Dashboard para acceder a la gestion fiscal.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Importante:</p>
        <p className="text-sm mt-1">
          Esta vista esta en proceso de integracion con AFIP. Hoy permite ensayar el flujo completo (emision, puntos de venta, notas de credito, reporte IVA mensual) pero los CAE que se muestran son simulados — la integracion real con WSFE requiere certificados de AFIP.
        </p>
      </div>
    </div>
  ),

  auditLog: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Log de Auditoria</p>
      <p>
        Lista cronologica e inmutable de todas las operaciones realizadas en el tenant, con filtros, vista expandible de cambios y carga incremental.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Filtro por entidad:</strong> Filtra eventos por tipo de entidad (product, category, branch, staff, table, round, check, payment, tip, etc.).</li>
        <li><strong>Filtro por accion:</strong> Filtra por tipo de accion (CREATE, UPDATE, DELETE, SOFT_DELETE, PAYMENT, SUBMIT, CANCEL, VOID, REFUND, STOCK_ADJUSTMENT, ROLE_CHANGE).</li>
        <li><strong>Vista expandible:</strong> Haz clic en una fila para ver los JSON antes (old_values) y despues (new_values) del cambio.</li>
        <li><strong>Colores por accion:</strong> Cada tipo de accion tiene un color diferenciado para identificarlo de un vistazo.</li>
        <li><strong>Boton Actualizar:</strong> Recarga la lista desde el backend para ver los eventos mas recientes.</li>
        <li><strong>Paginacion incremental:</strong> Carga 50 entradas por pagina; el boton "Cargar mas" agrega la siguiente tanda sin perder el contexto.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          El log de auditoria es solo lectura e inmutable. Cada operacion en el sistema genera un registro automatico que no se puede editar ni borrar, por lo que sirve como evidencia frente a inspecciones internas o externas.
        </p>
      </div>
    </div>
  ),

  tips: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Propinas</p>
      <p>
        Interfaz de cuatro pestanas para registrar propinas, configurar pools de reparto, distribuir montos y consultar reportes por rango de fechas.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Pestana Propinas:</strong> Lista de propinas registradas con mesa, mozo, monto, metodo y estado; accion Registrar Propina con id de sesion, monto, metodo de pago e id de mozo.</li>
        <li><strong>Pestana Distribucion:</strong> Lista de propinas ya distribuidas con el monto asignado a mozos, cocina y otros; accion Distribuir Propina para asociar una propina pendiente a un pool.</li>
        <li><strong>Pestana Pools:</strong> ABM de pools de reparto con nombre y porcentajes para mozos, cocina y otros (deben sumar 100).</li>
        <li><strong>Pestana Reportes:</strong> Filtro por rango de fechas con total de propinas, promedio diario, periodo en dias, desglose por mozo y desglose por metodo de pago.</li>
        <li><strong>Requiere sucursal:</strong> Debes seleccionar una sucursal desde el Dashboard para gestionar propinas.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          Esta vista esta en proceso de integracion con el backend. Hoy permite ensayar el flujo completo de propinas (registro, configuracion de pools, distribucion y reporte) pero los datos se mantienen en memoria hasta refrescar la pagina.
        </p>
      </div>
    </div>
  ),

  // --- change #5: crm / layout pages ---

  crm: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Clientes (CRM)</p>
      <p>
        Panel de administracion de clientes con cuatro pestanas: Clientes, Top Clientes, Programa de Lealtad y Reportes.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Pestana Clientes:</strong> Lista con busqueda por nombre, email o telefono; tabla con nivel BRONZE / SILVER / GOLD / PLATINUM, puntos, visitas y total gastado; acciones Ver, Editar, Exportar Datos, Anonimizar y Eliminar por cliente.</li>
        <li><strong>Crear / Editar cliente:</strong> Modal con campos Nombre (obligatorio), Email (opcional) y Telefono (opcional).</li>
        <li><strong>Pestana Top Clientes:</strong> Ranking ordenable por gasto total o por cantidad de visitas, con tarjetas que muestran nivel y estadisticas.</li>
        <li><strong>Pestana Programa de Lealtad:</strong> ABM de Reglas de Lealtad con Nombre, Descripcion, Puntos por unidad y Monto minimo; boton Ver Estadisticas que genera reporte con miembros activos, puntos emitidos, puntos canjeados y tasa de canje.</li>
        <li><strong>Pestana Reportes:</strong> Generador de reporte general de clientes con tasa de retencion, promedio de visitas por mes, gasto promedio y top spenders.</li>
        <li><strong>Exportar Datos / Anonimizar:</strong> Acciones disponibles en el modal Detalle Cliente para cada registro.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          Esta vista esta en proceso de integracion con el backend. Hoy las acciones de Exportar Datos y Anonimizar generan resultados a partir del estado local — cuando se conecten los endpoints de GDPR documentados en el backend se aplicaran las politicas reales de exportacion y anonimizacion.
        </p>
      </div>
    </div>
  ),

  floorPlan: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Plano del Salon</p>
      <p>
        Visualizacion y edicion del plano de mesas de una sucursal con soporte para multiples planos y modos de vista.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Requiere sucursal:</strong> Debes seleccionar una sucursal desde el Dashboard para acceder al plano.</li>
        <li><strong>Selector de plano:</strong> Cuando la sucursal tiene mas de un plano, aparece un selector para elegir cual visualizar.</li>
        <li><strong>Toggle Vista en Vivo / Modo Edicion:</strong> Vista en Vivo muestra el estado actual de las mesas; Modo Edicion habilita el arrastre de mesas y los botones Auto Layout y Guardar.</li>
        <li><strong>Auto Layout:</strong> Reposiciona todas las mesas en una grilla automatica dentro del canvas.</li>
        <li><strong>Canvas con mesas arrastrables:</strong> Cada mesa muestra su numero, capacidad y forma (RECTANGLE / SQUARE / CIRCLE); en mesas ocupadas tambien se indica la cantidad de minutos transcurridos.</li>
        <li><strong>Leyenda de estados:</strong> Colores diferenciados por estado: FREE (verde), OPEN (rojo), PAYING (violeta), OUT_OF_SERVICE (gris).</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          Esta vista es una version preliminar. La persistencia del plano con el backend esta pendiente — al presionar Guardar hoy solo se muestra un toast de confirmacion pero la posicion de las mesas no se persiste.
        </p>
      </div>
    </div>
  ),

  scheduling: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Planificacion de Turnos</p>
      <p>
        Herramienta de planificacion del personal con cuatro pestanas: Semana, Plantillas, Asistencia y Costos.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Requiere sucursal:</strong> Debes seleccionar una sucursal desde el Dashboard para acceder a la planificacion.</li>
        <li><strong>Pestana Semana:</strong> Grilla semanal (Lun-Dom) con una fila por empleado; cada celda muestra los turnos del dia y al hacer clic abre el modal de Nuevo Turno con campos Empleado, Dia, Entrada, Salida y Rol (WAITER / KITCHEN / MANAGER / ADMIN / CASHIER).</li>
        <li><strong>Pestana Plantillas:</strong> ABM de Plantillas reutilizables con Nombre; accion Aplicar Plantilla desde la pestana Semana para volcar una plantilla sobre una semana especifica.</li>
        <li><strong>Pestana Asistencia:</strong> Registro de Clock In y Clock Out con calculo automatico de horas trabajadas y horas extra por empleado.</li>
        <li><strong>Pestana Costos:</strong> Reporte de costos laborales por rango de fechas (Desde / Hasta) con desglose de Total Horas, Horas Extra, Costo Estimado y detalle agrupado por rol.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          Esta vista esta en proceso de integracion con el backend. Hoy permite ensayar el flujo completo (planificacion semanal, plantillas, asistencia y reporte de costos) pero los turnos, las plantillas y los registros de asistencia se mantienen en memoria hasta refrescar la pagina.
        </p>
      </div>
    </div>
  ),

  // --- change #6: staff / roles refactor ---

  staff: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Personal</p>
      <p>
        Administra los empleados asignados a la sucursal seleccionada, con busqueda avanzada, control de permisos por rol y ABM completo.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Requiere sucursal:</strong> Debes seleccionar una sucursal desde el Dashboard para ver y gestionar el personal.</li>
        <li><strong>Busqueda:</strong> Filtra empleados por nombre, apellido, email o DNI con debounce automatico.</li>
        <li><strong>Tabla de empleados:</strong> Columnas Nombre, Rol, Email, Telefono, DNI, Fecha de Ingreso, Estado y Acciones con paginacion automatica.</li>
        <li><strong>Acciones por fila:</strong> Editar y Eliminar disponibles segun los permisos del usuario actual.</li>
        <li><strong>Nuevo / Editar Empleado:</strong> Modal con campos Nombre, Apellido, Sucursal, Rol, Email, Telefono, DNI, Fecha de Ingreso y Empleado activo.</li>
        <li><strong>Validacion:</strong> Detecta duplicados por DNI y email dentro del personal de la sucursal.</li>
        <li><strong>Restricciones por rol:</strong> Los selectores de Sucursal y Rol se filtran segun los permisos del usuario que opera la pagina.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Importante:</p>
        <p className="text-sm mt-1">
          Los permisos del usuario actual filtran las sucursales y los roles disponibles en el formulario. Un usuario MANAGER solo ve sus sucursales asignadas y no puede asignar el rol ADMIN. Un usuario ADMIN ve todas las sucursales activas y puede asignar cualquier rol incluyendo ADMIN.
        </p>
      </div>
    </div>
  ),

  roles: (
    <div className="space-y-4 text-zinc-300">
      <p className="text-lg font-medium text-[var(--text-inverse)]">Gestion de Roles</p>
      <p>
        Administra los roles disponibles en el sistema, con busqueda, grid responsivo de tarjetas y ABM completo.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>Busqueda:</strong> Filtra roles por nombre o descripcion con debounce automatico.</li>
        <li><strong>Grid responsivo:</strong> Las tarjetas se organizan en 1, 2 o 3 columnas segun el ancho de pantalla.</li>
        <li><strong>Tarjeta por rol:</strong> Muestra Nombre, Descripcion, Badge de estado y acciones Editar y Eliminar.</li>
        <li><strong>Estado vacio:</strong> Mensaje informativo cuando la busqueda no devuelve resultados.</li>
        <li><strong>Nuevo / Editar Rol:</strong> Modal con campos Nombre, Descripcion y Rol activo.</li>
        <li><strong>Validacion:</strong> Valida nombre y descripcion antes de guardar via validateRole.</li>
      </ul>
      <div className="bg-zinc-800 p-4 rounded-lg mt-4">
        <p className="text-orange-400 font-medium">Nota:</p>
        <p className="text-sm mt-1">
          Esta vista esta en proceso de integracion con el backend. Hoy los roles se gestionan en estado local y se persisten en el navegador; cuando se conecten los endpoints, los cambios se sincronizaran automaticamente con el servidor.
        </p>
      </div>
    </div>
  ),
}

/**
 * Runtime set of keys that are currently present in `helpContent`.
 * Built from `Object.keys(helpContent)` so it cannot drift from the map.
 * Use this in tests or at runtime to check which pages have help content defined.
 */
export const definedKeys: ReadonlySet<DashboardPageKey> = new Set(
  Object.keys(helpContent) as DashboardPageKey[],
)
