# Ticket de Impresión — Diseño

**Fecha:** 2026-05-19  
**Módulo:** Ventas (POS)  
**Prioridad:** Alta

---

## Resumen

Implementar la generación y impresión de tickets de venta para impresora térmica de 58mm conectada por USB, usando el Browser Print API (`window.print()`) con CSS `@media print`. El ticket se muestra en un modal de vista previa después de confirmar una venta, y también puede reimprimirse desde el historial de ventas.

---

## Enfoque Técnico

**Browser Print API + CSS `@media print`.**

- Sin librerías externas.
- El ticket se renderiza como HTML/CSS en el navegador.
- `window.print()` abre el diálogo de impresión del sistema operativo.
- CSS `@page { size: 58mm auto; }` ajusta el tamaño exacto de la impresora.
- El backend no requiere cambios — el endpoint `GET /api/ventas/ventas/{id}/ticket/` ya existe.

---

## Componentes Nuevos

### `frontend/src/components/TicketImpresion.jsx`

Componente de solo presentación (no tiene estado propio). Recibe un objeto `venta` con la forma del serializer existente y renderiza el HTML del ticket.

**Props:**
```js
{
  venta: {
    folio, fecha, empleado_nombre, cliente_nombre,
    detalles: [{ descripcion, cantidad, precio_unitario, subtotal }],
    subtotal, descuento, total,
    metodo_pago, monto_efectivo, monto_electronico,
    num_operacion, num_referencia
  }
}
```

**Estructura del ticket renderizado:**
1. Logo (`/images/logo_hd.png`) — centrado, ancho máximo 40mm
2. Nombre del negocio: "EmirS Centro Llantero"
3. Dirección y teléfono del negocio (hardcoded como constantes configurables en el componente)
4. Separador `─────`
5. "TICKET DE VENTA" — centrado
6. Folio, fecha/hora formateada, vendedor, cliente (o "Público General" si null)
7. Separador
8. Tabla de ítems: cantidad | descripción | subtotal de línea
9. Separador
10. Subtotal, descuento (si > 0), **TOTAL** en negrita
11. Separador
12. Detalle de pago:
    - Efectivo + cambio (si aplica)
    - Tarjeta o transferencia + referencia/operación (si aplica)
    - Pago mixto: ambos montos
13. Separador
14. Mensaje de cierre: "¡Gracias por su preferencia!"

**ID del nodo raíz:** `id="ticket-print"` — necesario para el CSS de impresión.

---

### `frontend/src/components/ModalTicket.jsx`

Modal que contiene `TicketImpresion` en modo vista previa y un botón que llama `window.print()`.

**Props:**
```js
{
  venta: object | null,   // null = modal cerrado
  onClose: () => void
}
```

**Comportamiento:**
- Si `venta` es `null`, no renderiza nada.
- Muestra la vista previa del ticket a escala de pantalla (no a escala real de 58mm — se usa un contenedor de ~320px para que sea legible).
- Botón **"Imprimir"** llama `window.print()`.
- Botón **"Cerrar"** llama `onClose`.
- El fondo oscuro con clic fuera también cierra el modal.
- Al imprimir, el CSS `@media print` oculta el modal mismo y solo muestra `#ticket-print` a tamaño 58mm real.

---

## Cambios en Archivos Existentes

### `frontend/src/index.css`

Agregar al final:

```css
/* ── Impresión Ticket 58mm ─────────────────────── */
@media print {
  body * { visibility: hidden; }
  #ticket-print, #ticket-print * { visibility: visible; }
  #ticket-print { position: fixed; top: 0; left: 0; width: 58mm; }
  @page { size: 58mm auto; margin: 2mm; }
}
```

Se usa `visibility: hidden/visible` en lugar de `display: none` porque React monta los modales como portales directamente en `body`. Con `display: none` en el ancestro, el hijo no puede revertirlo; con `visibility` sí. El elemento `#ticket-print` debe existir en el DOM en el momento de imprimir — `ModalTicket` lo monta mientras está abierto.

### `frontend/src/pages/ventas/Ventas.jsx` — función `TabPOS`

**Cambio 1 — Estado adicional:**
```js
const [ticketVenta, setTicketVenta] = useState(null); // controla ModalTicket
```

**Cambio 2 — Al confirmar venta con éxito:**
```js
// Donde actualmente está: setVentaOk(venta)
setVentaOk(venta);
setTicketVenta(venta);  // abre el modal de ticket automáticamente
```

**Cambio 3 — Botón "Reimprimir" en banner de éxito:**
```jsx
{ventaOk && (
  <div className="...banner verde existente...">
    <span>✓ Venta <strong>{ventaOk.folio}</strong> registrada...</span>
    <div className="flex items-center gap-2">
      <button onClick={() => setTicketVenta(ventaOk)}>🖨 Reimprimir</button>
      <button onClick={() => setVentaOk(null)}>✕</button>
    </div>
  </div>
)}
```

**Cambio 4 — Montar ModalTicket:**
```jsx
<ModalTicket venta={ticketVenta} onClose={() => setTicketVenta(null)} />
```

### `frontend/src/pages/caja/` — Historial de ventas

El historial de ventas vive en el módulo de Caja. En la tabla de ventas de ese módulo, agregar un botón de acción por fila que:
1. Llama `GET /api/ventas/ventas/{id}/ticket/` para obtener los datos completos de la venta.
2. Abre `ModalTicket` con esos datos.

`ModalTicket` se importa desde `components/ModalTicket.jsx` y se monta en ese mismo archivo. El estado `ticketVenta` se maneja localmente en el componente de caja que contiene el historial.

---

## Datos del Negocio (Configurables)

En `TicketImpresion.jsx` se declaran como constantes en la parte superior del archivo:

```js
const NEGOCIO = {
  nombre: 'EmirS Centro Llantero',
  direccion: 'Calle 42 #282 por 45, Fracc. Francisco de Montejo',
  telefono: '999 371 8502',
  cierre: '¡Gracias por su preferencia!',
};
```

El usuario puede actualizar estos valores directamente en el archivo. No se necesita un endpoint de configuración para esta primera versión.

---

## Lógica del Cambio (Cálculo en Ticket)

El cambio solo aplica cuando el método de pago incluye efectivo:

```
cambio = monto_efectivo - total        (si metodo_pago === 'efectivo')
cambio = monto_efectivo - (total - monto_electronico)  (si metodo_pago === 'mixto')
```

El valor se muestra solo si `cambio > 0`.

---

## Consideraciones sobre el Logo

- Se usa `<img src="/images/logo_hd.png" />` — ruta pública de Vite.
- Las impresoras térmicas de 58mm imprimen en blanco y negro. El logo se verá en escala de grises en papel.
- Si el logo tiene fondo transparente o blanco con buen contraste, funciona correctamente.
- En la vista previa del modal (pantalla) el logo se verá en color.

---

## Archivos Afectados

| Archivo | Tipo de cambio |
|---|---|
| `frontend/src/components/TicketImpresion.jsx` | **Nuevo** |
| `frontend/src/components/ModalTicket.jsx` | **Nuevo** |
| `frontend/src/index.css` | Agregar reglas `@media print` |
| `frontend/src/pages/ventas/Ventas.jsx` | Integrar modal en `TabPOS` + botón "Reimprimir" en banner |
| `frontend/src/pages/caja/` (archivo con historial de ventas) | Agregar botón de reimprimir por fila + montar `ModalTicket` |

---

## Fuera de Alcance (esta versión)

- Configuración de datos del negocio desde UI (dirección, teléfono, RFC).
- Impresión de segunda copia del ticket.
- Envío del ticket por WhatsApp/email.
- Soporte para impresoras de 80mm.
