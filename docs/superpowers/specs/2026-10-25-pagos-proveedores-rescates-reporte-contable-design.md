# Especificación de Diseño Técnico: Pagos a Proveedores, Vencimientos, Reporte Contable y Reingeniería de Rescates

**Fecha:** 2026-10-25  
**Autor:** Tech Lead & Software Architect  
**Estado:** Pendiente de Aprobación del Usuario (HARD GATE)  

---

## 1. Resumen Ejecutivo de Requerimientos

El usuario solicitó 6 mejoras operativas y financieras clave:

1. **Separación de Métodos de Pago a Proveedores:** Distinguir explícitamente entre **Tarjeta de Débito** y **Tarjeta de Crédito**, además de Efectivo, Transferencia y Cheque.
2. **Desglose de Pagos por Proveedor en UI:** Al hacer clic en un proveedor en el módulo de Adeudos, ver su historial completo de pagos desglosado con badges visuales por método de pago.
3. **Reporte Contable de Pagos a Proveedores (PDF y Excel .xlsx):** Generación de reporte formal para enviar al contador con filtros de fecha, proveedor y método, totales por método y detalle de comprobantes/facturas.
4. **Fecha de Vencimiento de Facturas de Proveedores y Alertas:** Campo configurable de `fecha_vencimiento` en compras/facturas, cálculo automático si el proveedor tiene días de crédito o del XML (CFDI 4.0), con semáforo de alertas (Vencida, Por Vencer en 7 días, Al Día).
5. **Eliminar la Hora en la Minuta PDF:** Quitar la hora (`%H:%M`) del encabezado y pie de página de la minuta, dejando únicamente la fecha (`%d/%m/%Y`).
6. **Reingeniería de Rescates Viales:**
   - **Precio de traslado variable (por distancia):** Permitir al operador/cajero ingresar libremente el monto del rescate/traslado, al cual se le suman los servicios realizados.
   - **Venta de llantas en rescates exclusiva del Taller:** Cuando se venda una llanta durante un rescate, ese importe ingresa y se contabiliza 100% para el Taller (inventario y ventas generales), sin figurar como ingreso ni comisión del servicio de rescate en la minuta.

---

## 2. Arquitectura de Datos y Modelos

### 2.1. Backend (`apps/inventario`)
- **`PagoProveedor`**:
  ```python
  METODO_PAGO_CHOICES = [
      ('efectivo', 'Efectivo'),
      ('transferencia', 'Transferencia'),
      ('cheque', 'Cheque'),
      ('tarjeta_debito', 'Tarjeta de Débito'),
      ('tarjeta_credito', 'Tarjeta de Crédito'),
      ('tarjeta', 'Tarjeta Bancaria (General)'), # Compatibilidad
  ]
  ```
- **`EntradaInventario`**:
  - Agregar campo `fecha_vencimiento = models.DateField(null=True, blank=True)`.
  - En `save()`: Si está vacía, calcular `(fecha_factura or fecha_compra) + timedelta(days=proveedor.dias_credito)`.
  - En `_parsear_cfdi`: Leer `CondicionesDePago` o `MetodoPago` (`PPD`/`PUE`).
- **Endpoint de Alertas de Vencimiento**:
  - `GET /api/inventario/adeudos/facturas-vencimiento/?dias=7`: Retorna facturas pendientes agrupadas por estado (`vencidas`, `por_vencer`, `al_dia`).

### 2.2. Backend (`apps/rescates`)
- **`Rescate`**:
  - `costo_traslado = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)`
  - `distancia_km = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)`
  - `total_servicios = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)` (servicios + traslado)
  - `total_productos = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)` (llantas e insumos)
  - `total = models.DecimalField(...)` (total_servicios + total_productos - descuento)

### 2.3. Backend (`apps/reportes`)
- **Minuta PDF**:
  - Sustituir en encabezado y pie de página `%d/%m/%Y %H:%M` por `%d/%m/%Y`.
- **Separación Contable en Balance y Minuta**:
  - `Ventas Taller`: Suma de `Ventas POS` + `Llantas vendidas en rescates`.
  - `Ingresos Rescates`: Únicamente mano de obra de auxilio vial y costo de traslado.
- **Nuevos Endpoints Contables**:
  - `GET /api/reportes/pagos-proveedores/pdf/?fecha_inicio=...&fecha_fin=...&proveedor_id=...`
  - `GET /api/reportes/pagos-proveedores/excel/?fecha_inicio=...&fecha_fin=...&proveedor_id=...` (usando `openpyxl`).

---

## 3. Frontend y Experiencia de Usuario (UI/UX)

1. **`Adeudos.jsx`**:
   - `ModalPago`: Selector de método de pago (`Efectivo`, `Transferencia`, `Tarjeta de Débito`, `Tarjeta de Crédito`, `Cheque`).
   - `DetalleProveedor`: Badges coloreados por método y desglose de subtotales por forma de pago.
   - Pestaña / Botón de exportación: "Exportar Pagos (PDF)" y "Exportar Pagos (Excel)".
   - Banner o sección de "Facturas próximas a vencer o vencidas" con indicador de días restantes.
2. **`POSRescateModal.jsx`**:
   - Campo editable de "Costo de Traslado / Desplazamiento ($)" con botones rápidos (`$150`, `$250`, `$350`, `$500`).
   - Desglose visual en el ticket y modal: `Traslado: $X`, `Servicios: $Y`, `Llantas (Taller): $Z`, `Total: $Total`.

---

## 4. Plan de Ejecución por Agentes

1. **Fase 1: Backend (`builder-backend`)**
   - Modificar modelos y ejecutar migraciones en `apps/inventario` y `apps/rescates`.
   - Implementar endpoints de reporte en Excel y PDF en `apps/reportes`.
   - Ajustar `BalanceGlobalView` y `ReportePDF` (quitar hora y desglosar llantas de rescates al taller).
2. **Fase 2: Frontend (`builder-frontend`)**
   - Actualizar `ModalPago` y desglose de proveedor en `Adeudos.jsx`.
   - Añadir botones de descarga PDF/Excel de pagos a proveedores.
   - Actualizar `POSRescateModal.jsx` con el costo de traslado por distancia.
   - Añadir alertas de facturas próximas a vencer.
3. **Fase 3: Calidad y Seguridad (`tester-qa` y `tester-security`)**
   - Tests de modelos, serializers y exportación en Excel/PDF.
   - Auditoría de permisos (solo administradores pueden exportar reportes contables).
