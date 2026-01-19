# Documento de Requerimientos del Sistema (SRS)
# Sistema de Gestión - Centro Llantero EmirS

## 1. INFORMACIÓN GENERAL

**Cliente**: Centro Llantero EmirS  
**Tipo de Negocio**: Taller llantero (venta de llantas y servicios)  
**Usuarios del Sistema**: 2 (Jefe + Secretaria/Operador)  
**Tipo de Despliegue**: Local (Red Interna)  
**Fecha**: Enero 2026  

## 2. OBJETIVO DEL SISTEMA

Reemplazar el sistema actual basado en múltiples archivos Excel por una solución web integrada que:
- Centralice la información de ventas, inventario, gastos y nómina
- Automatice cálculos y reportes
- Reduzca errores manuales
- Proporcione información en tiempo real
- Facilite la toma de decisiones

## 3. MÓDULOS DEL SISTEMA

### 3.1 MÓDULO DE AUTENTICACIÓN Y USUARIOS

**Objetivo**: Control de acceso al sistema con roles diferenciados

**Funcionalidades**:
- Login con usuario y contraseña
- 2 roles: Administrador y Operador
- Registro de auditoría de acciones
- Cambio de contraseña

**Permisos por Rol**:

| Acción | Administrador | Operador |
|--------|:-------------:|:--------:|
| Ver ventas | ✅ | ✅ |
| Crear ventas | ✅ | ✅ |
| Eliminar ventas | ✅ | ❌ |
| Gestionar inventario | ✅ | ❌ |
| Ver nómina | ✅ | ❌ |
| Gestionar gastos | ✅ | ✅ |
| Configurar sistema | ✅ | ❌ |
| Realizar arqueo | ✅ | ✅ |

---

### 3.2 MÓDULO DE INVENTARIO

**Objetivo**: Control de productos (llantas) y su movimiento

**Entidades**:
- **Producto**: Llantas con código, medida, marca, modelo, índices
- **Marca**: Fabricantes (Nexen, Pirelli, Bridgestone, etc.)
- **Proveedor**: Empresas que suministran llantas
- **Entrada de Inventario**: Compras a proveedores
- **Salida de Inventario**: Ventas (automático desde POS)

**Funcionalidades**:
1. Registro de productos con:
   - Código único (auto-generado)
   - Medida (ej: 225/65R17)
   - Marca y modelo
   - Índice de carga (82, 84, 87, etc.)
   - Índice de velocidad (T, H, V, W, Y)
   - Precio de venta y precio con descuento
   - Stock mínimo (para alertas)

2. Registro de entradas:
   - Producto
   - Proveedor
   - Cantidad
   - Precio de compra
   - Número de factura
   - Fecha de compra

3. Control de salidas (automático desde ventas):
   - Producto vendido
   - Cantidad
   - Precio de venta
   - Precio de costo
   - Utilidad calculada

4. Alertas:
   - Stock bajo (cuando stock ≤ mínimo)
   - Stock agotado (stock = 0)
   - Productos sin movimiento (> 60 días)

5. Reportes:
   - Inventario actual con valores
   - Historial de movimientos
   - Productos más vendidos
   - Utilidad por producto

**Proveedores Actuales**:
- TBC de México
- Prodinamics
- Paisa Llantas
- Tecnollantas
- LlantaMaya
- Radial Llantas

**Marcas Manejadas**:
Nexen, Pirelli, Bridgestone, Zmax, Goodride, Sumitomo, Sailun, Firestone, Cooper, Goodyear, Maxxis, Kumho, Hankook, Continental, Michelin, Fronwey

---

### 3.3 MÓDULO DE PUNTO DE VENTA (POS)

**Objetivo**: Registrar ventas de productos y servicios de forma rápida

**Funcionalidades**:
1. Búsqueda rápida de productos:
   - Por código
   - Por medida
   - Por marca/modelo

2. Agregar servicios:
   - Calibraje ($10)
   - Montaje y desmontaje ($35)
   - Balanceo ($40)
   - Reparación de llanta ($100)
   - Rotación ($80)
   - Alineación ($350)
   - Otros servicios

3. Métodos de pago:
   - Efectivo
   - Tarjeta
   - Transferencia
   - Mixto (efectivo + electrónico)

4. Descuentos:
   - Por producto
   - Descuento global

5. Funciones adicionales:
   - Asociar venta a cliente (opcional)
   - Vendedor (usuario logueado)
   - Impresión de ticket
   - Historial de ventas del día

**Flujo de Venta**:
1. Buscar y agregar productos/servicios
2. Definir cantidad y precio
3. Seleccionar método de pago
4. Aplicar descuentos si aplica
5. Cobrar e imprimir ticket
6. Actualizar inventario automáticamente

---

### 3.4 MÓDULO DE CAJA Y ARQUEO

**Objetivo**: Control del efectivo y conciliación diaria

**Funcionalidades**:

1. **Resumen del Día**:
   - Ventas en efectivo
   - Ventas con tarjeta
   - Ventas con transferencia
   - Egresos en efectivo
   - Efectivo esperado en caja

2. **Arqueo de Caja** (contador de billetes):
   - Billetes: $1000, $500, $200, $100, $50, $20
   - Monedas: $20, $10, $5, $2, $1, $0.50
   - Cantidad × Denominación = Subtotal
   - Total contado vs Total esperado
   - Diferencia (sobrante/faltante)
   - Fondo de caja (inicio del día)
   - Notas del arqueo

3. **Historial de Arqueos**:
   - Todos los arqueos realizados
   - Fecha, usuario, diferencias

**Reportes**:
- Flujo de efectivo diario
- Comparativa de arqueos
- Análisis de diferencias

---

### 3.5 MÓDULO DE GASTOS/EGRESOS

**Objetivo**: Registro y control de gastos operativos

**Categorías de Gastos**:
- **Operativos**: Reparaciones, herramientas
- **Servicios**: Agua, luz, teléfono
- **Renta**: Renta del local
- **Impuestos**: SAT, IMSS
- **Mantenimiento**: Plomería, limpieza
- **Publicidad**: Anuncios, promociones
- **Vehículos**: Gasolina, seguro
- **Contabilidad**: Contador
- **Suministros**: Materiales
- **Basura de llantas**: Recolección

**Funcionalidades**:
- Registro de gastos con:
  - Fecha
  - Categoría
  - Concepto/Subconcepto
  - Monto
  - Método de pago (efectivo/transferencia)
  - Comprobante (archivo)
  
- Gastos recurrentes:
  - Crear plantillas de gastos fijos
  - Programar recordatorios

**Reportes**:
- Gastos por categoría
- Gastos por período
- Comparativa mensual
- Gastos vs presupuesto

---

### 3.6 MÓDULO DE NÓMINA Y COMISIONES

**Objetivo**: Gestión de sueldos y comisiones de empleados

**Empleados Actuales**:
- Gaspar (Vendedor/Técnico)
- Gerardo (Técnico)
- Miguel (Técnico)
- Angel (Técnico)
- Roberto (Técnico)
- Jesus (Técnico)
- Reyna (Administrativo)
- Emir (Jefe/Vendedor)

**Estructura de Pago**:
- Sueldo base semanal
- Comisiones por ventas (% o monto fijo)
- Bono dominical (si aplica)
- Forma de pago: Efectivo y/o Transferencia

**Funcionalidades**:
1. Registro de empleados:
   - Nombre, puesto
   - Sueldo base
   - % de comisión
   - Método de pago preferido
   - Fecha de ingreso

2. Cálculo de nómina semanal:
   - Sueldo base
   - Comisiones automáticas (desde ventas)
   - Total a pagar
   - Desglose efectivo/transferencia

3. Generación de recibos de pago

**Reportes**:
- Nómina semanal/mensual
- Comisiones por empleado
- Productividad (ventas por empleado)
- Historial de pagos

---

### 3.7 MÓDULO DE CLIENTES Y VEHÍCULOS

**Objetivo**: Registro de clientes para seguimiento

**Funcionalidades**:

1. **Clientes**:
   - Nombre, teléfono, email
   - RFC (opcional, para facturación futura)
   - Dirección
   - Notas

2. **Vehículos**:
   - Marca, modelo, año
   - Placas
   - Medida de llantas requerida
   - Asociado a cliente

3. **Historial de Servicios**:
   - Servicios realizados
   - Fecha y kilometraje
   - Próxima rotación/mantenimiento

**Beneficios**:
- Recomendaciones de productos compatibles
- Recordatorios de mantenimiento
- Marketing dirigido (promociones)
- Programa de lealtad futuro

---

### 3.8 MÓDULO DE REPORTES Y DASHBOARD

**Objetivo**: Visualización de métricas y generación de reportes

**Dashboard Principal**:
- 💰 Ventas del día/semana/mes
- 📦 Alertas de stock
- 👤 Empleado del período
- 📈 Progreso de meta mensual
- 🔔 Notificaciones importantes

**Reportes Disponibles**:

| Reporte | Periodicidad | Formato |
|---------|--------------|---------|
| Ventas detalladas | Diario/Semanal/Mensual | Excel, PDF |
| Inventario actual | Tiempo real | Excel |
| Movimientos de inventario | Por rango de fechas | Excel |
| Utilidad por producto | Mensual | Excel, PDF |
| Gastos por categoría | Mensual | Excel, PDF |
| Nómina | Semanal | Excel, PDF |
| Flujo de efectivo | Diario/Mensual | PDF |
| Estado de resultados | Mensual | PDF |

**Gráficas**:
- Tendencia de ventas (líneas)
- Ventas por empleado (barras)
- Gastos vs Ingresos (pie)
- Top productos (barras)

---

## 4. REQUERIMIENTOS NO FUNCIONALES

### 4.1 Rendimiento
- Tiempo de carga de páginas: < 2 segundos
- Búsqueda de productos: < 1 segundo
- Generación de reportes: < 5 segundos

### 4.2 Usabilidad
- Interfaz intuitiva y fácil de usar
- Flujo de ventas optimizado (< 30 segundos por venta)
- Diseño responsive (adaptable)

### 4.3 Seguridad
- Autenticación obligatoria
- Encriptación de contraseñas
- Auditoría de acciones críticas
- Backup automático diario

### 4.4 Confiabilidad
- Disponibilidad: 99% (horario laboral)
- Backup automático a las 23:00
- Retención de backups: 30 días

### 4.5 Mantenibilidad
- Código documentado
- Estructura modular
- Logs de errores

---

## 5. RESTRICCIONES Y LIMITACIONES

### Técnicas
- Sistema local (no en nube)
- 2 usuarios concurrentes máximo
- Acceso solo desde red interna

### Funcionales
- Sin facturación electrónica (Fase 1)
- Sin cotizaciones (pendiente análisis)
- Sin integración bancaria

---

## 6. PLAN DE MIGRACIÓN

### Datos a Migrar desde Excel:
1. Productos existentes en inventario
2. Proveedores
3. Empleados
4. Clientes frecuentes (opcional)

### Proceso:
1. Limpieza de datos en Excel
2. Exportar a CSV
3. Importar mediante comando Django
4. Validación de datos
5. Ajustes manuales si necesario

---

## 7. PLAN DE CAPACITACIÓN

### Sesión 1 (2 horas): Operación Básica
- Login y navegación
- Registro de ventas
- Consulta de inventario
- Arqueo de caja

### Sesión 2 (2 horas): Gestión Avanzada
- Registro de entradas de inventario
- Gastos y egresos
- Generación de reportes
- Resolución de problemas

### Material de Apoyo:
- Manual de usuario (PDF)
- Videos tutoriales
- Guía rápida impresa

---

## 8. CRITERIOS DE ACEPTACIÓN

El sistema será considerado aceptado cuando:

1. ✅ Todos los módulos estén funcionales
2. ✅ Se realice migración exitosa de datos
3. ✅ Los usuarios puedan operar sin asistencia
4. ✅ Los reportes generen información correcta
5. ✅ El sistema esté operando en producción por 1 semana sin errores críticos

---

## 9. SOPORTE POST-IMPLEMENTACIÓN

- **Soporte inicial**: 1 mes incluido
- **Respuesta a incidencias**: 24-48 horas
- **Actualizaciones menores**: Incluidas
- **Nuevas funcionalidades**: Cotización aparte

---

**Documento preparado por**: Equipo de Desarrollo  
**Aprobado por**: Centro Llantero EmirS  
**Versión**: 1.0  
**Fecha**: Enero 2026
