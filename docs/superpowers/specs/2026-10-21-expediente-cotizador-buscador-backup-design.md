# Especificación de Diseño: Expediente Clínico Vehicular, Cotizador Multimarca, Buscador Inteligente y Respaldos 1-Clic

**Fecha:** 2026-10-21  
**Estado:** Aprobado por el Usuario  
**Arquitectura:** Multi-Agente (Tech Lead, Architect, Builder Backend, Builder Frontend, QA, Security)

---

## 1. Expediente Clínico del Vehículo (CRM por Placas)
- **Modelo `Vehiculo` (`apps/clientes/models.py`):**
  - Campos adicionales: `color`, `medida_llanta_delantera`, `medida_llanta_trasera`, `kilometraje_ultimo`, `fecha_ultimo_servicio`, `fecha_proximo_servicio`, `notas`.
  - Vinculación opcional `vehiculo` FK en `Venta` (`apps/ventas/models.py`) y `Rescate` (`apps/rescates/models.py`), más `kilometraje_actual` en `Venta`.
  - Automatización: Al registrar una venta o cobrar un rescate vinculado a un vehículo, se actualiza `fecha_ultimo_servicio = hoy` y `fecha_proximo_servicio = hoy + 180 días` (6 meses).
- **Endpoints:**
  - `GET /api/clientes/vehiculos/{id}/expediente/`: Historial clínico unificado (ventas de mostrador + rescates en ruta) y semáforo de mantenimiento con enlace de recordatorio por WhatsApp.
  - `GET /api/clientes/vehiculos/alertas_servicio/`: Lista de vehículos con servicio próximo o vencido.
  - Búsqueda de clientes por placas, marca, modelo o medida de llanta.

## 2. Cotizador Multimarca con Calculadora de Margen de Proveedor (Stock + Sobre Pedido)
- **Modelos `Cotizacion` y `OpcionCotizacion` (`apps/ventas/models.py`):**
  - Folio secuencial atómico `COT-000001`.
  - Permite cotizar una medida solicitada presentando una lista comparativa de varias marcas (Gama Económica, Media, Premium), tanto de productos en Stock como Sobre Pedido con proveedores.
  - **Calculadora Dual de Utilidad (Confidencial):** Soporta tanto **Porcentaje (`%`)** como **Monto Fijo (`$`)** sobre el `costo_proveedor`, calculando automáticamente precio unitario público, precio por par (2 llantas), precio por juego (4 llantas) y utilidad neta para el taller.
  - **Privacidad Total al Cliente:** El PDF descargable (`/api/ventas/cotizaciones/{id}/pdf/`) y el mensaje de WhatsApp (`/api/ventas/cotizaciones/{id}/whatsapp/`) muestran únicamente las marcas, gamas, disponibilidad, precios al público y servicios incluidos (montaje, balanceo, válvula, alineación), ocultando por completo costos de proveedor y márgenes.

## 3. Buscador Inteligente de Medidas Llanteras
- Normalizador en backend (`apps/inventario/views.py`) y frontend (`src/lib/medidaUtils.js`) que transforma entradas como `2055516`, `205 55 16`, `205-55-16` o `205/55R16` para coincidir con cualquier variante de medida almacenada en el catálogo.

## 4. Respaldo de Base de Datos en 1 Clic
- Endpoint exclusivo para Administradores (`GET /api/reportes/backup/` y `POST /api/reportes/backup/descargar/`) que empaqueta en un archivo `.zip` comprimido el volcado íntegro de la base de datos (`full_database_dump.json`), respaldos modulares y `manifest.json`, registrando la acción en `LogAuditoria`.
