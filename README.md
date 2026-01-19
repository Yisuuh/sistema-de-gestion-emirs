"# Sistema de Gestión - Centro Llantero EmirS

Sistema integral de gestión para taller llantero, desarrollado con Django REST Framework y React.

## 🚀 Características

### Módulos Principales

1. **👤 Autenticación y Usuarios**
   - Sistema de roles (Administrador/Operador)
   - Control de permisos por módulo
   - Auditoría de acciones

2. **📦 Inventario**
   - Gestión de productos (llantas)
   - Control de entradas y salidas
   - Alertas de stock bajo
   - Registro de marcas y proveedores

3. **💰 Punto de Venta (POS)**
   - Venta rápida de productos y servicios
   - Múltiples métodos de pago
   - Impresión de tickets

4. **🧮 Caja y Arqueo**
   - Arqueo diario con contador de billetes
   - Resumen de ingresos y egresos
   - Historial de movimientos

5. **💸 Gastos**
   - Categorización de egresos
   - Gastos recurrentes
   - Adjuntar comprobantes

6. **👥 Nómina**
   - Gestión de empleados
   - Cálculo de comisiones
   - Reportes de productividad

7. **📊 Reportes y Dashboard**
   - Métricas en tiempo real
   - Reportes exportables (Excel/PDF)
   - Gráficas de tendencias

8. **🚗 Clientes y Vehículos**
   - Registro de clientes
   - Historial de servicios
   - Recordatorios de mantenimiento

## 🛠️ Stack Tecnológico

### Backend
- Django 5.0
- Django REST Framework
- PostgreSQL / SQLite
- JWT Authentication
- Celery + Redis (tareas asíncronas)

### Frontend
- React 18
- Vite
- TailwindCSS
- React Router v6
- TanStack Query
- Axios

## 📋 Requisitos Previos

- Python 3.11 o superior
- Node.js 18 o superior
- PostgreSQL 15 o superior (opcional, puede usar SQLite para desarrollo)
- Redis (opcional, para tareas asíncronas)

## 🔧 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/Yisuuh/sistema-de-gestion-emirs.git
cd sistema-de-gestion-emirs
```

### 2. Configurar Backend (Django)

```bash
# Navegar a la carpeta backend
cd backend

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Copiar archivo de configuración
copy .env.example .env

# Editar .env con tus configuraciones
# Para desarrollo rápido, puede usar SQLite (ya configurado por defecto)

# Ejecutar migraciones
python manage.py makemigrations
python manage.py migrate

# Crear superusuario
python manage.py createsuperuser

# Iniciar servidor de desarrollo
python manage.py runserver
```

El backend estará disponible en: `http://localhost:8000`
Panel de administración: `http://localhost:8000/admin`

### 3. Configurar Frontend (React)

```bash
# Abrir nueva terminal y navegar a frontend
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

El frontend estará disponible en: `http://localhost:5173`

## 📚 Uso Básico

### Primer Inicio

1. Acceder al panel de administración: `http://localhost:8000/admin`
2. Crear usuarios operadores
3. Registrar marcas de llantas
4. Registrar proveedores
5. Cargar inventario inicial
6. Configurar servicios (calibraje, montaje, etc.)

### Operación Diaria

1. **Iniciar Sesión**: Usuario y contraseña
2. **Registrar Ventas**: Desde el módulo de Punto de Venta
3. **Controlar Inventario**: Registrar entradas de productos
4. **Arqueo de Caja**: Al final del día
5. **Generar Reportes**: Según necesidad

## 🗂️ Estructura del Proyecto

```
sistema-de-gestion-emirs/
├── backend/                    # Django Backend
│   ├── apps/                   # Aplicaciones Django
│   │   ├── usuarios/           # Autenticación y usuarios
│   │   ├── inventario/         # Gestión de inventario
│   │   ├── ventas/             # Punto de venta
│   │   ├── caja/               # Arqueo de caja
│   │   ├── gastos/             # Egresos
│   │   ├── nomina/             # Nómina y comisiones
│   │   ├── clientes/           # Clientes y vehículos
│   │   └── reportes/           # Reportes y dashboard
│   ├── config/                 # Configuración Django
│   ├── media/                  # Archivos subidos
│   ├── staticfiles/            # Archivos estáticos
│   ├── requirements.txt        # Dependencias Python
│   └── manage.py               # CLI Django
│
├── frontend/                   # React Frontend
│   ├── src/
│   │   ├── components/         # Componentes reutilizables
│   │   ├── layouts/            # Layouts de la app
│   │   ├── pages/              # Páginas/Vistas
│   │   ├── services/           # Servicios API
│   │   ├── utils/              # Utilidades
│   │   ├── App.jsx             # Componente principal
│   │   └── main.jsx            # Punto de entrada
│   ├── package.json            # Dependencias Node
│   └── vite.config.js          # Configuración Vite
│
├── .gitignore
└── README.md
```

## 🔐 Roles y Permisos

### Administrador
- Acceso total al sistema
- Gestión de usuarios
- Configuración del sistema
- Eliminación de registros
- Acceso a reportes financieros

### Operador
- Registro de ventas
- Consulta de inventario
- Arqueo de caja
- Registro de gastos operativos
- Reportes básicos

## 📊 API Endpoints

### Autenticación
- `POST /api/auth/login/` - Obtener token
- `POST /api/auth/refresh/` - Refrescar token

### Inventario
- `GET /api/inventario/productos/` - Listar productos
- `POST /api/inventario/productos/` - Crear producto
- `GET /api/inventario/productos/{id}/` - Detalle producto
- `GET /api/inventario/productos/stock_bajo/` - Productos con stock bajo
- `GET /api/inventario/entradas/` - Entradas de inventario
- `POST /api/inventario/entradas/` - Registrar entrada

### Ventas
- `GET /api/ventas/` - Listar ventas
- `POST /api/ventas/` - Registrar venta
- `GET /api/ventas/{id}/` - Detalle de venta

*(Ver documentación completa de API en `/api/docs/` una vez instalado)*

## 🧪 Testing

```bash
# Backend
cd backend
python manage.py test

# Frontend
cd frontend
npm run test
```

## 📦 Despliegue Local (Red Interna)

### Configuración para Producción Local

1. **Configurar PostgreSQL**
```bash
# Crear base de datos
createdb sistema_llantero_db
```

2. **Actualizar .env**
```env
DEBUG=False
ALLOWED_HOSTS=192.168.1.100,localhost
DB_NAME=sistema_llantero_db
DB_USER=postgres
DB_PASSWORD=tu_password_seguro
```

3. **Compilar Frontend**
```bash
cd frontend
npm run build
```

4. **Ejecutar Servidor**
```bash
cd backend
python manage.py collectstatic
python manage.py runserver 0.0.0.0:8000
```

## 🔄 Backup y Restauración

### Backup Automático
El sistema crea backups automáticos diarios en `backend/backups/`

### Backup Manual
```bash
python manage.py dumpdata > backup_$(date +%Y%m%d).json
```

### Restauración
```bash
python manage.py loaddata backup_20260119.json
```

## 🐛 Solución de Problemas

### Error de conexión a base de datos
- Verificar que PostgreSQL esté corriendo
- Revisar credenciales en `.env`
- Para desarrollo, cambiar a SQLite en `settings.py`

### Error de CORS
- Verificar que el frontend esté en `CORS_ALLOWED_ORIGINS` en `settings.py`

### Módulos no encontrados
```bash
pip install -r requirements.txt
npm install
```

## 📝 Roadmap

### Fase 1 - MVP (Semanas 1-4) ✅
- [x] Setup del proyecto
- [x] Módulo de autenticación
- [x] Modelos base de inventario
- [x] Estructura de ventas
- [ ] POS funcional

### Fase 2 - Core (Semanas 5-8)
- [ ] Sistema de caja completo
- [ ] Registro de gastos
- [ ] Impresión de tickets
- [ ] Integración inventario-ventas

### Fase 3 - Avanzado (Semanas 9-12)
- [ ] Nómina con comisiones
- [ ] Clientes y vehículos
- [ ] Dashboard interactivo
- [ ] Reportes exportables

### Fase 4 - Pulido (Semanas 13-14)
- [ ] Migración de datos Excel
- [ ] Pruebas de usuario
- [ ] Capacitación
- [ ] Despliegue

## 🤝 Contribuciones

Este es un proyecto privado para Centro Llantero EmirS.

## 📄 Licencia

Proyecto propietario - Todos los derechos reservados © 2026 Centro Llantero EmirS

## 👥 Equipo

- **Desarrollador**: Yisuuh
- **Cliente**: Centro Llantero EmirS

## 📞 Soporte

Para soporte técnico, contactar al equipo de desarrollo.

---

**Última actualización**: Enero 2026" 
