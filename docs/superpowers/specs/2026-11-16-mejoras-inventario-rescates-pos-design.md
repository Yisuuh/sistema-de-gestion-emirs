# Especificación de Diseño: Mejoras Operativas en Inventario, Rescates y POS

**Fecha:** 2026-11-16  
**Estado:** Aprobado por el Usuario  
**Equipo:** Orquestador + `architect` + `builder-backend` + `builder-frontend` + `tester-qa` + `tester-security`

---

## 1. Alcance (Bloque 1)

1. **Importación XML CFDI con IVA explícito:** Mostrar en vista previa costo **sin IVA** y **con IVA**, y guardar `EntradaInventario.precio_compra` **con IVA** para operaciones (adeudos a proveedores, salidas/costos y tabulador sin doble IVA).
2. **Auto-refresco tras importar XML:** Invalidar todas las query keys de TanStack Query afectadas al confirmar un XML para evitar recargar la página.
3. **Búsqueda por número de factura en Historial de Entradas:** Buscador en `TabEntradas` conectado al backend (`numero_factura`, `folio_remision`, código, medida, proveedor, marca) con paginación adecuada.
4. **Notas y contraste del Ticket de Rescate:** Corregir contraste en `TicketRescateModal.jsx` (evitar remapeo oscuro de `index.css` sobre texto negro) y renderizar `rescate.notas` en el modal visual, WhatsApp y comprobante PDF.
5. **Precios escalonados por volumen en POS (misma lógica que Cotización):**
   - Aplicar el tabulador oficial por Rin (`medidaUtils.js`) al agregar o cambiar la cantidad de llantas en `Ventas.jsx` (`TabPOS`) y `POSRescateModal.jsx`.
   - **Regla confirmada para 3 llantas:** Tanto en Cotizador (`calcularPreciosEscalonados`) como en POS, **3 llantas** utiliza el escalón de **2 llantas (`m2`, -$50 de utilidad por llanta)**, y **4 o más llantas** usa **`m4` (-$100 de utilidad por llanta)**.

---

## 2. Diseño Técnico — Backend

### 2.1 `backend/apps/inventario/models.py`
- En `EntradaInventario`: agregar `precio_incluye_iva = models.BooleanField(default=False)` + migración.
  - Garantiza compatibilidad con registros históricos (`False`) y evita doble aplicación de 16% al reutilizar `ultimo_precio_compra` en Cotizador/POS.

### 2.2 `backend/apps/inventario/views.py` y `serializers.py`
1. **`_calcular_precio_venta_sugerido(precio_compra, medida='', incluye_iva=False)`:**
   - Si `incluye_iva=True`, usa `costo_con_iva = precio_compra` directo; si `False`, `costo_con_iva = precio_compra * Decimal('1.16')`.
2. **`_parsear_cfdi(xml_bytes)`:**
   - Extraer tasa de IVA por `<cfdi:Concepto>` leyendo `<cfdi:Impuestos>/<cfdi:Traslados>/<cfdi:Traslado Impuesto="002" TipoFactor="Tasa">` (`TasaOCuota`, fallback `0.16` si a nivel comprobante `Total > SubTotal` y no hay nodo de impuestos por concepto, o `0.00` si `Total <= SubTotal`).
   - Devolver por cada ítem:
     - `precio_compra_sin_iva` (`ValorUnitario`)
     - `precio_compra_con_iva` (`precio_compra_sin_iva * (1 + tasa_iva)`)
     - `tasa_iva`
     - `precio_compra`: igual a `precio_compra_con_iva` (para operaciones)
     - `precio_venta_sugerido`: calculado sobre `precio_compra_con_iva` con `incluye_iva=True` (sin duplicar el 16%).
3. **`ImportarXMLView._guardar(datos, usuario)`:**
   - Si viene `precio_compra_con_iva`, guardar `EntradaInventario.precio_compra = Decimal(str(item['precio_compra_con_iva'])).quantize(Decimal('0.01'))` con `precio_incluye_iva=True`, y calcular `precio_venta_sugerido` con `incluye_iva=True`.
   - Mantener fallback compatible si un llamador legacy solo envía `precio_compra` sin `precio_compra_con_iva`.
4. **`EntradaInventarioViewSet`:**
   - Agregar `pagination_class = StandardPagination`.
   - Ampliar `search_fields = ['producto__codigo', 'numero_factura', 'folio_remision', 'producto__medida', 'producto__modelo', 'proveedor__nombre', 'producto__marca__nombre']`.
   - Soportar filtro directo `?numero_factura=` (`icontains`) en `get_queryset`.
5. **`ProductoViewSet` y `ProductoSerializer`:**
   - Anotar con `Subquery` `ultimo_precio_compra` y `ultimo_precio_incluye_iva` desde la última `EntradaInventario` (`order_by('-fecha_compra', '-created_at')`) para que POS y Cotizador reciban el costo real sin estimar `* 0.75`.

### 2.3 `backend/apps/ventas/serializers.py` y `backend/apps/rescates/views.py`
- **`DetalleVentaSerializer.validate`:** Mantener integridad `cantidad * precio_unitario`, permitiendo hasta `$0.05` de tolerancia cuando el subtotal enviado provenga de redondeo de paquete a múltiplo de 5, o validar consistencia exacta `cantidad * round(precio_unitario, 2)` desde frontend.
- **`RescateViewSet.pdf`:** Si `rescate.notas`, renderizar bloque de notas/observaciones en el PDF térmico antes del pie de página.

---

## 3. Diseño Técnico — Frontend

### 3.1 `frontend/src/pages/inventario/Inventario.jsx`
1. **`TabXml` e `Inventario`:**
   - Mostrar en la tabla de vista previa columnas claras **`P. Compra (s/IVA)`** y **`P. Compra (c/IVA)`** (usando `c/IVA` para el costo operativo).
   - Usar `useQueryClient()` al confirmar importación XML para invalidar: `['inventario-consolidado']`, `['inventario-entradas']`, `['inventario-productos']`, `['inventario-kardex']`, `['inventario-proveedores']`, `['inventario-proveedores-catalogo']`, `['inventario-marcas']`, `['inventario-marcas-catalogo']`, `['pos-productos']`, `['dashboard-resumen']`.
2. **`TabEntradas`:**
   - Agregar buscador en barra de filtros (`search` con debounce de 300ms) con placeholder `"Buscar por no. factura, remisión, código, medida o proveedor…"`, enviando `?search=` al backend y soportando paginación/botón actualizar.

### 3.2 `frontend/src/pages/rescates/TicketRescateModal.jsx` y `Rescates.jsx`
- Blindar el modal de ticket contra el remapeo oscuro de `index.css` usando estilos inline explícitos en el área de vista previa (`backgroundColor: '#f3f4f6'` en wrapper, `backgroundColor: '#ffffff'`, `color: '#000000'` en ticket) y en el bloque de **`Notas`**.
- Extraer `const notas = r.notas || ''` y renderizar sección de notas dentro de `#ticket-rescate-print` (`background: '#f8fafc'`, `border: '1px solid #cbd5e1'`, `color: '#111827'`) e incluirlo en `handleShareWhatsApp`.
- Agregar campo opcional `notas` en creación/cobro de rescate si hace falta capturar notas operativas para el ticket.

### 3.3 Precios Escalonados de Llantas (`medidaUtils.js`, `TabCotizador.jsx`, `Ventas.jsx`, `POSRescateModal.jsx`)
1. **`medidaUtils.js`:**
   - Corregir `calcularPreciosEscalonados` para `q === 3`: usar `m2Final` (escalón de 2 llantas) en lugar de `m4Final`, alineado con `margenUnitarioEfectivo = m2`.
   - Agregar helper `calcularPrecioPosLlanta({ producto, cantidad, preciosCotizados, tabulador })`:
     - Si `producto.precio_descuento` existe y es `> 0`, o el ítem fue editado manualmente por el cajero (`precioEditadoManual`), o es un servicio, respetar ese precio sin recalcular.
     - Para cantidad `1`: usar `producto.precio_venta` (precio de lista).
     - Para cantidad `2` o `3` (escalón `m2`): si tiene `ultimo_precio_compra > 0`, calcular total escalonado con `calcularPreciosEscalonados` (o aplicar diferencial oficial `(m1 - m2) * 1.079` por llanta sobre `precio_venta` si el producto no tiene entrada o su precio de lista difiere por ajuste manual, redondeado a múltiplo de 5).
     - Para cantidad `>= 4` (escalón `m4`): aplicar escalón `m4` (diferencial `(m1 - m4) * 1.079` por llanta redondeado a múltiplo de 5).
     - Si viene de **Cotizador → POS**, conservar los precios exactos cotizados (`precio_1`, `precio_2`, `precio_4`, `categoria_rin`, `costo_incluye_iva`, `costo`) en el ítem del carrito para recalcular fielmente al subir/bajar cantidad.
2. **`TabCotizador.jsx`:**
   - Usar `ultimo_precio_compra` y `ultimo_precio_incluye_iva` del endpoint de productos en `seleccionarProductoDeStock`.
   - En `handleEnviarOpcionAlPOS`, enviar `precios_cotizados` junto con la cantidad solicitada.
3. **`Ventas.jsx` (`TabPOS`) y `POSRescateModal.jsx`:**
   - Integrar `calcularPrecioPosLlanta` en `agregarAlCarrito`, `actualizarCantidad`, `itemPrecargado`, `handleAddProducto` y `handleUpdateCantidad`.
   - Mostrar un badge sutil en el renglón del carrito cuando aplique tarifa de volumen (`Tarifa 2-3 pzas` / `Tarifa 4+ pzas`).
