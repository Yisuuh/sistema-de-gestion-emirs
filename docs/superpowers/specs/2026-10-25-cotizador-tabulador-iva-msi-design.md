# Especificación de Diseño Técnico: Tabulador de Utilidades, IVA de Proveedores y Calculadora MSI en Cotizador

**Fecha:** 2026-10-25  
**Autor:** Tech Lead & Software Architect  
**Estado:** Aprobado por el Usuario  

---

## 1. Resumen Ejecutivo de Requerimientos

A partir de los archivos de tabuladores reales proporcionados por el usuario ("Cotizador llantas con cotización" y "Formato de cotizaciones limpio"):

1. **Toggle de IVA en Costo de Proveedor:**
   - Opción para indicar si el costo capturado incluye IVA (`Sí`) o no (`No`).
   - Si es `No`, el costo efectivo con IVA se calcula automáticamente multiplicando por `1.16`.
2. **Tabulador de Utilidades Escalonado por Rin y Volumen (1, 2 y 4 llantas):**
   - Matriz oficial de utilidad por llanta según el Rin detectado:
     - **Rin 13, 14, 15:** 1 pza: +$400 | 2 pzas: +$350 c/u | 4 pzas: +$300 c/u
     - **Rin 16:** 1 pza: +$450 | 2 pzas: +$400 c/u | 4 pzas: +$350 c/u
     - **Rin 17 (Estándar/Camioneta) & Rin 18:** 1 pza: +$700 | 2 pzas: +$650 c/u | 4 pzas: +$600 c/u
     - **Rin 17A (Auto/Económico):** 1 pza: +$550 | 2 pzas: +$500 c/u | 4 pzas: +$450 c/u (conmutable en 1 clic)
     - **Rin 19 a Rin 24:** 1 pza: +$850 | 2 pzas: +$800 c/u | 4 pzas: +$750 c/u
   - Mientras más llantas compra el cliente, menor es el margen unitario (más barato el precio por llanta), logrando un precio más atractivo para el cliente y mayor ganancia global para EmirS.
3. **Calculadora de Meses Sin Intereses (MSI):**
   - Factores bancarios oficiales:
     - 3 Meses: `1.080000` (8%) $\to$ Pago mensual = Total / 3
     - 6 Meses: `1.097672` (9.77%) $\to$ Pago mensual = Total / 6
     - 9 Meses: `1.136184` (13.62%) $\to$ Pago mensual = Total / 9
     - 12 Meses: `1.172956` (17.30%) $\to$ Pago mensual = Total / 12
   - Checkbox opcional: `"Ofrecer financiamiento a Meses Sin Intereses (3, 6, 9 y 12 MSI)"`.
4. **Beneficios Exclusivos y Condiciones en PDF y WhatsApp:**
   - Incorporar automáticamente los beneficios oficiales de EmirS:
     - Desde 1 llanta: Montaje, válvula nueva, balanceo y nitrógeno.
     - En la compra de 2 llantas: 2 años de nitrógeno gratis y revisión periódica.
     - En la compra de 4 llantas: 2 años de mantenimiento completo + opción a pagar a Meses Sin Intereses.
   - En WhatsApp y PDF: Si está activo el checkbox de MSI, incluir el desglose mensual de financiamiento.

---

## 2. Cambios en Backend (`backend/apps/ventas/`)

1. **`models.py` (`OpcionCotizacion` y `Cotizacion`):**
   - En `Cotizacion`:
     - `mostrar_msi = models.BooleanField(default=True)`
   - En `OpcionCotizacion`:
     - `costo_incluye_iva = models.BooleanField(default=False)`
     - `costo_con_iva = models.DecimalField(max_digits=10, decimal_places=2, default=0)`
     - `utiliza_tabulador = models.BooleanField(default=True)`
     - `categoria_rin = models.CharField(max_length=20, blank=True, default='')`
     - `margen_unitario_1 = models.DecimalField(max_digits=10, decimal_places=2, default=0)`
     - `margen_unitario_2 = models.DecimalField(max_digits=10, decimal_places=2, default=0)`
     - `margen_unitario_4 = models.DecimalField(max_digits=10, decimal_places=2, default=0)`
2. **`serializers.py`:**
   - Exponer los campos nuevos y el método `get_desglose_msi` en `OpcionCotizacionSerializer`.
3. **`views.py` (`CotizacionViewSet.pdf`):**
   - Incluir la tabla de financiamiento a MSI (si `mostrar_msi` es True).
   - Incluir el recuadro formal de "Beneficios Exclusivos por Volumen".

---

## 3. Cambios en Frontend (`frontend/src/`)

1. **`frontend/src/lib/medidaUtils.js`:**
   - Constantes de tabulador por Rin: `TABULADOR_RINES` y factores MSI `FACTORES_MSI`.
   - Función `detectarCategoriaRin(medida)` y `calcularPreciosEscalonados(...)`.
2. **`frontend/src/pages/ventas/TabCotizador.jsx`:**
   - Toggle por opción: `[ ¿Costo incluye IVA?  ⚪ SÍ   🔴 NO (+16%) ]`.
   - Visualización de tabulador activo con selector rápido si es Rin 17 (Estándar vs Auto).
   - Calculadora interna con desglose de ganancia para 1, 2 y 4 llantas.
   - Desplegable interactivo de financiamiento a 3, 6, 9 y 12 Meses Sin Intereses con cálculo de mensualidad.
   - Formato estructurado del mensaje de WhatsApp con desglose de contado y financiamiento.
