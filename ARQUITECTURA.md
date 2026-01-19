# Arquitectura del Sistema - Centro Llantero EmirS

## 📐 Visión General

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENTE (Navegador Web)                       │
│                    http://localhost:5173                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP/HTTPS
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      FRONTEND - React SPA                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  - React 18 + Vite                                       │   │
│  │  - TailwindCSS (estilos)                                 │   │
│  │  - React Router (navegación)                             │   │
│  │  - TanStack Query (estado)                               │   │
│  │  - Axios (peticiones HTTP)                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ REST API (JSON)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    BACKEND - Django REST API                     │
│                    http://localhost:8000/api                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  API Layer (Django REST Framework)                       │   │
│  │  - ViewSets                                              │   │
│  │  - Serializers                                           │   │
│  │  - JWT Authentication                                    │   │
│  │  - Permissions & Filters                                 │   │
│  └────────────────────┬─────────────────────────────────────┘   │
│                       │                                          │
│  ┌────────────────────▼─────────────────────────────────────┐   │
│  │  Business Logic Layer                                    │   │
│  │  - apps.usuarios (autenticación)                         │   │
│  │  - apps.inventario (productos)                           │   │
│  │  - apps.ventas (POS)                                     │   │
│  │  - apps.caja (arqueo)                                    │   │
│  │  - apps.gastos (egresos)                                 │   │
│  │  - apps.nomina (empleados)                               │   │
│  │  - apps.clientes (CRM)                                   │   │
│  │  - apps.reportes (analytics)                             │   │
│  └────────────────────┬─────────────────────────────────────┘   │
└───────────────────────┼──────────────────────────────────────────┘
                        │
                        │ ORM (Django Models)
                        │
┌───────────────────────▼──────────────────────────────────────────┐
│                   BASE DE DATOS                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL / SQLite                                     │   │
│  │  - Tablas normalizadas                                   │   │
│  │  - Relaciones (Foreign Keys)                             │   │
│  │  - Índices para performance                              │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Modelo de Datos

### Diagrama de Relaciones Principales

```
┌──────────────┐
│   Usuario    │
│ (CustomUser) │
└──────┬───────┘
       │
       │ created_by
       │
┌──────▼───────┐     ┌──────────────┐     ┌──────────────┐
│   Producto   │◄────┤  EntradaInv  │────►│  Proveedor   │
└──────┬───────┘     └──────────────┘     └──────────────┘
       │                                   
       │ producto                          
       │                                   
┌──────▼───────┐     ┌──────────────┐     ┌──────────────┐
│  SalidaInv   │◄────┤    Venta     │────►│   Cliente    │
└──────────────┘     └──────┬───────┘     └──────┬───────┘
                            │                     │
                            │                     │ vehiculos
                     ┌──────▼───────┐     ┌──────▼───────┐
                     │ DetalleVenta │     │   Vehiculo   │
                     └──────────────┘     └──────────────┘

┌──────────────┐     ┌──────────────┐
│   Empleado   │◄────┤  PagoNomina  │
└──────┬───────┘     └──────────────┘
       │
       │ comisiones
       │
┌──────▼───────┐
│   Comision   │
└──────────────┘

┌──────────────┐     ┌──────────────┐
│CategoriaGasto│◄────┤    Egreso    │
└──────────────┘     └──────────────┘

┌──────────────┐     ┌──────────────┐
│  ArqueoCaja  │◄────┤ ContBilletes │
└──────────────┘     └──────────────┘
```

---

## 🔗 Flujo de Datos

### 1. Flujo de Venta (POS)

```
1. Usuario busca producto en Frontend
         ↓
2. Frontend: GET /api/inventario/productos/?search=225/65r17
         ↓
3. Backend: Serializa y retorna productos
         ↓
4. Frontend: Usuario agrega productos al carrito
         ↓
5. Frontend: POST /api/ventas/
   Body: {
     empleado: 1,
     detalles: [{producto: 5, cantidad: 4, precio: 1500}],
     metodo_pago: 'efectivo',
     total: 6000
   }
         ↓
6. Backend: 
   - Crea registro en tabla Venta
   - Crea registros en DetalleVenta
   - Crea SalidaInventario (automático)
   - Calcula utilidad
         ↓
7. Backend: Retorna venta creada con ID
         ↓
8. Frontend: Redirige a impresión de ticket
```

### 2. Flujo de Arqueo

```
1. Usuario accede a módulo de Caja
         ↓
2. Frontend: GET /api/caja/resumen-dia/?fecha=2026-01-19
         ↓
3. Backend: Calcula:
   - Suma de ventas en efectivo
   - Suma de ventas electrónicas
   - Suma de egresos
   - Efectivo esperado = ventas_efectivo - egresos
         ↓
4. Frontend: Muestra contador de billetes
         ↓
5. Usuario ingresa cantidad de cada denominación
         ↓
6. Frontend: POST /api/caja/arqueos/
   Body: {
     fecha: '2026-01-19',
     total_esperado: 10274.00,
     total_contado: 10200.00,
     diferencia: -74.00,
     billetes: {1000: 0, 500: 0, 200: 8, ...},
     notas: 'Faltaron $74'
   }
         ↓
7. Backend: Guarda arqueo y genera alerta si diferencia > $100
```

---

## 🔐 Seguridad

### Autenticación JWT

```
1. Login: POST /api/auth/login/
   Body: {username: 'admin', password: 'password'}
         ↓
2. Backend valida credenciales
         ↓
3. Backend genera tokens:
   {
     access: 'eyJ0eXAiOiJKV1QiLC...',  // 8 horas
     refresh: 'eyJ0eXAiOiJKV1QiLC...'  // 7 días
   }
         ↓
4. Frontend guarda tokens en localStorage
         ↓
5. Cada petición incluye header:
   Authorization: Bearer eyJ0eXAiOiJKV1QiLC...
         ↓
6. Backend valida token y permisos
```

### Niveles de Permisos

```python
# Ejemplo en views.py
class ProductoViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    
    def destroy(self, request, *args, **kwargs):
        # Solo admin puede eliminar
        if request.user.rol != 'admin':
            return Response(
                {'error': 'No tiene permisos'}, 
                status=403
            )
        return super().destroy(request, *args, **kwargs)
```

---

## 📡 API Endpoints

### Estructura de URLs

```
/api/
├── auth/
│   ├── login/                  POST   - Obtener tokens JWT
│   └── refresh/                POST   - Refrescar access token
│
├── usuarios/
│   ├── usuarios/               GET/POST   - Listar/crear usuarios
│   ├── usuarios/{id}/          GET/PUT/DELETE
│   └── logs/                   GET    - Logs de auditoría
│
├── inventario/
│   ├── productos/              GET/POST   - CRUD productos
│   ├── productos/{id}/         GET/PUT/DELETE
│   ├── productos/stock_bajo/   GET    - Productos con stock bajo
│   ├── productos/agotados/     GET    - Productos agotados
│   ├── entradas/               GET/POST   - Entradas de inventario
│   ├── salidas/                GET    - Salidas (solo lectura)
│   ├── marcas/                 GET/POST   - CRUD marcas
│   └── proveedores/            GET/POST   - CRUD proveedores
│
├── ventas/
│   ├── ventas/                 GET/POST   - CRUD ventas
│   ├── ventas/{id}/            GET
│   ├── servicios/              GET/POST   - Catálogo de servicios
│   └── estadisticas/           GET    - Stats de ventas
│
├── caja/
│   ├── arqueos/                GET/POST   - CRUD arqueos
│   ├── resumen-dia/            GET    - Resumen del día
│   └── historial/              GET    - Historial de arqueos
│
├── gastos/
│   ├── gastos/                 GET/POST   - CRUD gastos
│   ├── categorias/             GET/POST   - Categorías
│   └── estadisticas/           GET    - Gastos por categoría
│
├── nomina/
│   ├── empleados/              GET/POST   - CRUD empleados
│   ├── pagos/                  GET/POST   - Pagos de nómina
│   ├── comisiones/             GET    - Cálculo de comisiones
│   └── generar-nomina/         POST   - Generar nómina semanal
│
├── clientes/
│   ├── clientes/               GET/POST   - CRUD clientes
│   ├── vehiculos/              GET/POST   - CRUD vehículos
│   └── historial/{id}/         GET    - Historial de servicios
│
└── reportes/
    ├── dashboard/              GET    - Datos del dashboard
    ├── ventas-periodo/         GET    - Reporte de ventas
    ├── inventario-valorizado/  GET    - Inventario con valores
    ├── flujo-efectivo/         GET    - Flujo de caja
    └── exportar/{tipo}/        GET    - Exportar a Excel/PDF
```

---

## 🎨 Estructura del Frontend

```
frontend/src/
├── components/              # Componentes reutilizables
│   ├── common/
│   │   ├── Button.jsx
│   │   ├── Input.jsx
│   │   ├── Table.jsx
│   │   └── Modal.jsx
│   ├── forms/
│   │   ├── ProductoForm.jsx
│   │   └── VentaForm.jsx
│   └── charts/
│       ├── LineChart.jsx
│       └── PieChart.jsx
│
├── layouts/                 # Layouts de la aplicación
│   ├── MainLayout.jsx       # Layout principal con sidebar
│   └── AuthLayout.jsx       # Layout para login
│
├── pages/                   # Páginas/Vistas
│   ├── auth/
│   │   └── Login.jsx
│   ├── Dashboard.jsx
│   ├── inventario/
│   │   ├── Inventario.jsx
│   │   ├── ProductoDetalle.jsx
│   │   └── EntradaInventario.jsx
│   ├── ventas/
│   │   ├── Ventas.jsx       # POS
│   │   └── HistorialVentas.jsx
│   ├── caja/
│   │   ├── Caja.jsx
│   │   └── Arqueo.jsx
│   └── reportes/
│       └── Reportes.jsx
│
├── services/                # Servicios API
│   ├── api.js               # Configuración Axios
│   ├── auth.service.js
│   ├── inventario.service.js
│   ├── ventas.service.js
│   └── reportes.service.js
│
├── hooks/                   # Custom Hooks
│   ├── useAuth.js
│   ├── useProducts.js
│   └── useSales.js
│
├── utils/                   # Utilidades
│   ├── format.js            # Formateo de fechas, moneda
│   ├── validation.js        # Validaciones
│   └── constants.js         # Constantes
│
├── App.jsx                  # Componente raíz
└── main.jsx                 # Entry point
```

---

## ⚙️ Configuración del Entorno

### Variables de Entorno Backend (.env)

```env
# Django
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DB_NAME=sistema_llantero_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432

# JWT
JWT_ACCESS_TOKEN_LIFETIME=480  # 8 horas en minutos
JWT_REFRESH_TOKEN_LIFETIME=10080  # 7 días en minutos

# Redis/Celery (opcional)
CELERY_BROKER_URL=redis://localhost:6379/0
```

### Configuración Frontend (vite.config.js)

```javascript
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

---

## 🚀 Despliegue Local (Producción)

### Opción 1: Despliegue Simple

```bash
# Backend
python manage.py collectstatic
python manage.py runserver 0.0.0.0:8000

# Frontend (compilado)
npm run build
# Servir carpeta dist/ con nginx o servidor web
```

### Opción 2: Con Docker (futuro)

```yaml
version: '3.8'
services:
  db:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  backend:
    build: ./backend
    depends_on:
      - db
    ports:
      - "8000:8000"
  
  frontend:
    build: ./frontend
    ports:
      - "80:80"
```

---

## 📊 Rendimiento y Optimización

### Backend
- **ORM Optimization**: `select_related()` y `prefetch_related()` en queries
- **Caching**: Redis para datos frecuentes
- **Pagination**: Máximo 50 registros por página
- **Database Indexing**: Índices en campos de búsqueda frecuente

### Frontend
- **Code Splitting**: Lazy loading de rutas
- **Memoization**: React.memo para componentes pesados
- **Virtual Scrolling**: Para tablas grandes
- **Debouncing**: En campos de búsqueda

---

## 🔧 Herramientas de Desarrollo

### Backend
- Django Debug Toolbar (desarrollo)
- pytest (testing)
- black (formateo de código)
- flake8 (linting)

### Frontend
- React DevTools
- Vite DevTools
- ESLint
- Prettier

---

**Documento Técnico v1.0**  
**Fecha**: Enero 2026  
**Equipo**: Desarrollo Sistema EmirS
