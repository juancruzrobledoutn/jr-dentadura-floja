11. Patrones Aplicados en el Proyecto
Patrón	Capa	Descripción
Repository Pattern	Backend	Abstracción del acceso a BD. BaseRepository[T] genérico. Facilita testing con mocks.
Unit of Work	Backend	Gestión de transacciones atómicas. El Service opera dentro del contexto UoW sin gestionar la sesión directamente.
Service Layer	Backend	Lógica de negocio centralizada, stateless. Consume el UoW. Independiente del framework.
Snapshot Pattern	Backend/BD	Precios y nombres de producto inmutables al crear el pedido. Garantiza integridad histórica.
Soft Delete	Backend/BD	deleted_at TIMESTAMPTZ — registros lógicamente eliminados. Nunca DELETE físico en entidades de negocio.
Audit Trail Append-Only	Backend/BD	HistorialEstadoPedido: solo INSERT, nunca UPDATE/DELETE (RN-03). Trazabilidad completa.
State Machine (FSM)	Backend	Transiciones del pedido validadas en la capa de servicio contra el mapa de transiciones permitidas.
Idempotent Payments	Backend	UUID como idempotency_key enviado a MercadoPago. Evita cobros duplicados por reintentos.
Feature-Sliced Design	Frontend	Organización por features con límites de importación claros. Cada feature es autocontenida.
Custom Hooks	Frontend	Encapsulan lógica de TanStack Query en hooks reutilizables por dominio.
Optimistic Updates	Frontend	Actualización inmediata de UI antes de confirmar respuesta del servidor. Rollback en error.
Webhook / IPN	Backend	MercadoPago notifica de forma asíncrona el resultado del pago. Evita polling constante.


