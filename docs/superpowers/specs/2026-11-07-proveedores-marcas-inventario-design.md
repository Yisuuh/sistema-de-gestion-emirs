# Especificación Técnica: Gestión de Proveedores y Marcas en Inventario

**Fecha:** 2026-11-07  
**Estado:** Aprobado (Enfoque 1)  
**Autor:** Tech Lead & Equipo Multi-Agente  

---

## 1. Contexto y Objetivos

En una base de datos limpia o durante la operación diaria, cuando se recibe mercancía por nota de remisión o factura comercial con proveedores o marcas que aún no están en el catálogo, el usuario quedaba bloqueado en el formulario de entradas de inventario porque:
1. El selector de `Proveedor` es obligatorio y no permitía registrar un nuevo proveedor al vuelo sin salir del formulario.
2. No existía una pantalla o pestaña dentro de Inventario para consultar, crear, editar o desactivar Proveedores y Marcas.

### Objetivos:
1. Permitir la creación inmediata de Proveedores al vuelo desde el modal de "Registrar entrada de inventario" (idéntico a como funciona `+ Nuevo Producto`).
2. Implementar una pestaña dedicada en Inventario: **"Proveedores y Marcas"** que permita la administración integral (CRUD) de proveedores y marcas.
3. Proteger la integridad referencial (`PROTECT` en Django) informando con claridad si un registro tiene productos o entradas asociadas en lugar de lanzar errores crudos.

---

## 2. Arquitectura y Contratos de API

### 2.1 Backend (Django REST Framework)
Los ViewSets existentes en `backend/apps/inventario/views.py`:
- `MarcaViewSet` (`/api/inventario/marcas/`):
  - Soporta `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
  - Mejorar el método `destroy()` para capturar `django.db.models.ProtectedError` y retornar HTTP 400 con mensaje claro: *"No se puede eliminar la marca porque tiene productos registrados. Puedes desactivarla."*
- `ProveedorViewSet` (`/api/inventario/proveedores/`):
  - Soporta `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
  - Filtro por `activo` y búsqueda por `nombre`, `contacto`, `telefono`.
  - Mejorar el método `destroy()` para capturar `ProtectedError` y retornar HTTP 400 con mensaje claro: *"No se puede eliminar el proveedor porque tiene entradas registradas. Puedes desactivarlo."*

### 2.2 Frontend (React 18 + TailwindCSS)
1. **Modal `ModalProveedor.jsx` (Creación y edición rápida):**
   - Campos:
     - Nombre del proveedor (requerido)
     - Contacto / RFC (opcional)
     - Teléfono (opcional)
     - Email (opcional)
     - Días de crédito (número, default 0)
     - Dirección (opcional)
     - Activo (booleano, default true)
   - Permite tanto el modo "creación al vuelo" (devuelve el objeto creado al formulario de entrada para auto-seleccionarlo) como el modo "administración" (crear/editar desde la pestaña de catálogos).

2. **Integración en `TabEntradas` (`Inventario.jsx`):**
   - Junto a la etiqueta `Proveedor *`, agregar botón `+ Nuevo Proveedor` (estilo idéntico a `+ Nuevo Producto`).
   - Al guardar el proveedor, invalidar query `['inventario-proveedores']`, auto-seleccionarlo en el formulario de entrada y mostrar mensaje de éxito.

3. **Pestaña "Proveedores y Marcas" en `Inventario.jsx`:**
   - Nueva opción en `TABS`: `{ id: 'catalogos', label: 'Proveedores y Marcas', icon: BuildingStorefrontIcon }`.
   - Componente `TabCatalogos`:
     - Sub-tab o selector: **Proveedores** / **Marcas**.
     - **Proveedores:** Buscador rápido, botón `+ Nuevo Proveedor`, tabla con columnas: Nombre, Contacto, Teléfono, Días de crédito, Estado (badge activo/inactivo), y menú de acciones (Editar, Cambiar estado activo/inactivo, Eliminar).
     - **Marcas:** Buscador rápido, botón `+ Nueva Marca`, tabla/cards con: Nombre, Estado (badge activa/inactiva), y acciones (Editar nombre, Activar/Desactivar, Eliminar).

---

## 3. Plan de Asignación a Subagentes

1. **`builder-backend`:**
   - Auditar `MarcaViewSet` y `ProveedorViewSet` en `backend/apps/inventario/views.py`.
   - Agregar manejo elegante de `ProtectedError` en el método `destroy` de ambos ViewSets.
2. **`builder-frontend`:**
   - Crear `frontend/src/pages/inventario/ModalProveedor.jsx`.
   - Integrar botón `+ Nuevo Proveedor` y apertura de modal en `TabEntradas` en `Inventario.jsx`.
   - Crear componente `TabCatalogos` (o `TabProveedoresMarcas`) e integrarlo en la barra de pestañas de `Inventario.jsx`.
3. **`tester-qa`:**
   - Ejecutar suite de pruebas de inventario en Django (`python manage.py test apps.inventario`).
   - Verificar compilación del frontend con `npm run build`.
4. **`tester-security`:**
   - Auditar permisos de los endpoints de Marca y Proveedor (asegurar autenticación y validación de tipos).
