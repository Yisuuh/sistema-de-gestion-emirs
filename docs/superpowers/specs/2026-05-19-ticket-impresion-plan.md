# Plan de Implementación — Ticket de Impresión 58mm

**Spec:** `2026-05-19-ticket-impresion-design.md`  
**Fecha:** 2026-05-19

---

## Paso 1 — Crear `TicketImpresion.jsx`

**Archivo:** `frontend/src/components/TicketImpresion.jsx`  
**Acción:** Crear nuevo

Componente puro que renderiza el HTML del ticket. Nodo raíz con `id="ticket-print"`.

Constantes del negocio declaradas en la parte superior:
```js
const NEGOCIO = {
  nombre: 'EmirS Centro Llantero',
  direccion: 'Calle 42 #282 por 45, Fracc. Francisco de Montejo',
  telefono: '999 371 8502',
  cierre: '¡Gracias por su preferencia!',
};
```

Lógica de cambio a incluir en el componente:
- Si `metodo_pago === 'efectivo'`: `cambio = monto_efectivo - total`
- Si `metodo_pago === 'mixto'`: `cambio = monto_efectivo - (total - monto_electronico)`
- Solo mostrar cambio si `cambio > 0`

---

## Paso 2 — Crear `ModalTicket.jsx`

**Archivo:** `frontend/src/components/ModalTicket.jsx`  
**Acción:** Crear nuevo

Props: `{ venta, onClose }` — si `venta` es null no renderiza nada.

Incluye:
- Fondo semitransparente oscuro; clic fuera llama `onClose`
- Contenedor blanco ~380px de ancho con scroll si el ticket es largo
- Encabezado: "Vista Previa del Ticket" + botón ✕
- Cuerpo: `<TicketImpresion venta={venta} />`
- Footer: botón "Cerrar" + botón "🖨 Imprimir" que llama `window.print()`

---

## Paso 3 — Agregar CSS de impresión

**Archivo:** `frontend/src/index.css`  
**Acción:** Agregar al final

```css
/* ── Impresión Ticket 58mm ─────────────────────── */
@media print {
  body * { visibility: hidden; }
  #ticket-print, #ticket-print * { visibility: visible; }
  #ticket-print { position: fixed; top: 0; left: 0; width: 58mm; }
  @page { size: 58mm auto; margin: 2mm; }
}
```

---

## Paso 4 — Integrar modal en `TabPOS` (Ventas.jsx)

**Archivo:** `frontend/src/pages/ventas/Ventas.jsx`  
**Acción:** Modificar `TabPOS`

Cambios:
1. Importar `ModalTicket` al inicio del archivo.
2. Agregar `const [ticketVenta, setTicketVenta] = useState(null)` junto a los otros estados.
3. En `procesarVenta`, donde se llama `setVentaOk(venta)`, agregar también `setTicketVenta(venta)`.
4. En el banner verde de `ventaOk`, agregar botón "🖨 Reimprimir" → `setTicketVenta(ventaOk)`, junto al botón de cerrar existente.
5. Montar `<ModalTicket venta={ticketVenta} onClose={() => setTicketVenta(null)} />` justo antes del `return` (o al final del JSX).

---

## Paso 5 — Integrar botón de reimprimir en `Caja.jsx`

**Archivo:** `frontend/src/pages/caja/Caja.jsx`  
**Acción:** Modificar `CajaActiva`

La tabla "Ventas en esta caja" (línea ~500) ya muestra las ventas. Los datos de `ventas` en esa tabla provienen del `VentaListSerializer` (sin detalles). Para imprimir se necesitan los datos completos → llamar `GET /api/ventas/ventas/{id}/ticket/`.

Cambios en `CajaActiva`:
1. Importar `ModalTicket` al inicio del archivo.
2. Agregar estado local: `const [ticketVenta, setTicketVenta] = useState(null)`
3. Agregar función:
   ```js
   const abrirTicket = async (id) => {
     const r = await fetch(`/api/ventas/ventas/${id}/ticket/`, { headers: tok() });
     if (r.ok) setTicketVenta(await r.json());
   };
   ```
4. En la tabla de ventas (thead), agregar columna `<th>Ticket</th>` al final.
5. En cada `<tr>` de la tabla (tbody), agregar celda al final:
   ```jsx
   <td className="px-4 py-3 text-center">
     <button onClick={() => abrirTicket(v.id)} title="Imprimir ticket">
       🖨
     </button>
   </td>
   ```
6. Ajustar el `colSpan` del tfoot de 5 a 6 para mantener el alineado.
7. Montar `<ModalTicket venta={ticketVenta} onClose={() => setTicketVenta(null)} />` al final del JSX de `CajaActiva`.

---

## Orden de ejecución

1. Paso 1 (TicketImpresion) — sin dependencias
2. Paso 2 (ModalTicket) — depende de Paso 1
3. Paso 3 (CSS) — sin dependencias
4. Paso 4 (TabPOS) — depende de Paso 2
5. Paso 5 (Caja) — depende de Paso 2

Pasos 1 y 3 se pueden hacer en paralelo.
