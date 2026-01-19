# Guía de Configuración Inicial del Proyecto

## 📋 Pasos para Configurar el Proyecto por Primera Vez

### 1. Configurar Backend Django

#### a) Crear y activar entorno virtual

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
```

#### b) Instalar dependencias

```powershell
pip install -r requirements.txt
```

#### c) Configurar variables de entorno

```powershell
# Copiar el archivo de ejemplo
copy .env.example .env

# Editar .env con un editor de texto y configurar:
# - SECRET_KEY (generar una clave segura)
# - DB_NAME, DB_USER, DB_PASSWORD (si usas PostgreSQL)
# - Para desarrollo rápido, puedes usar SQLite (ya configurado por defecto)
```

**Nota**: Para generar una SECRET_KEY segura:
```powershell
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

#### d) Ejecutar migraciones

```powershell
python manage.py makemigrations
python manage.py migrate
```

#### e) Crear superusuario (administrador)

```powershell
python manage.py createsuperuser
# Seguir las instrucciones:
# - Username: admin (o el que prefieras)
# - Email: tu@email.com
# - Password: (contraseña segura)
```

#### f) Cargar datos iniciales (opcional)

```powershell
# Crear marcas iniciales
python manage.py shell
```

```python
from apps.inventario.models import Marca, Proveedor
from apps.ventas.models import Servicio

# Crear marcas
marcas = ['Nexen', 'Pirelli', 'Bridgestone', 'Zmax', 'Goodride', 'Sailun', 'Firestone', 'Cooper', 'Goodyear', 'Maxxis', 'Kumho', 'Hankook', 'Continental', 'Michelin']
for marca in marcas:
    Marca.objects.get_or_create(nombre=marca)

# Crear proveedores
proveedores = [
    'TBC de México',
    'Prodinamics',
    'Paisa Llantas',
    'Tecnollantas',
    'LlantaMaya',
    'Radial Llantas'
]
for proveedor in proveedores:
    Proveedor.objects.get_or_create(nombre=proveedor)

# Crear servicios comunes
servicios = [
    ('Calibraje', 10.00),
    ('Montaje y desmontaje', 35.00),
    ('Balanceo', 40.00),
    ('Reparación de llanta', 100.00),
    ('Rotación', 80.00),
    ('Alineación', 350.00),
    ('Cambio de válvula', 25.00),
    ('Llenado de nitrógeno', 30.00),
]
for nombre, precio in servicios:
    Servicio.objects.get_or_create(nombre=nombre, defaults={'precio': precio})

print("✅ Datos iniciales cargados correctamente")
exit()
```

#### g) Iniciar servidor de desarrollo

```powershell
python manage.py runserver
```

Acceder a:
- API: http://localhost:8000
- Admin: http://localhost:8000/admin

---

### 2. Configurar Frontend React

**Abrir una NUEVA terminal/PowerShell** (dejar el backend corriendo)

#### a) Instalar dependencias

```powershell
cd frontend
npm install
```

#### b) Iniciar servidor de desarrollo

```powershell
npm run dev
```

Acceder a: http://localhost:5173

---

## 🔍 Verificación

### Backend
1. ✅ Acceder a http://localhost:8000/admin
2. ✅ Iniciar sesión con superusuario creado
3. ✅ Ver que aparecen los módulos: Usuarios, Inventario, Ventas, etc.

### Frontend
1. ✅ Acceder a http://localhost:5173
2. ✅ Ver pantalla de login
3. ✅ Navegar por las secciones (aunque estén en desarrollo)

---

## 🛠️ Configuración Opcional

### PostgreSQL (Producción Local)

Si quieres usar PostgreSQL en lugar de SQLite:

1. Instalar PostgreSQL
2. Crear base de datos:
```sql
CREATE DATABASE sistema_llantero_db;
CREATE USER postgres WITH PASSWORD 'tu_password';
GRANT ALL PRIVILEGES ON DATABASE sistema_llantero_db TO postgres;
```

3. Actualizar `.env`:
```env
DB_NAME=sistema_llantero_db
DB_USER=postgres
DB_PASSWORD=tu_password
DB_HOST=localhost
DB_PORT=5432
```

4. Comentar SQLite y descomentar PostgreSQL en `config/settings.py`

### Redis y Celery (Tareas Asíncronas)

Para reportes pesados y backups automáticos:

1. Instalar Redis (Windows: https://github.com/microsoftarchive/redis/releases)
2. Iniciar Redis: `redis-server`
3. En otra terminal:
```powershell
cd backend
.\venv\Scripts\activate
celery -A config worker -l info
```

---

## 📝 Próximos Pasos

1. ✅ **Configurar Backend** (seguir pasos 1.a-1.g)
2. ✅ **Configurar Frontend** (seguir pasos 2.a-2.b)
3. ⏳ **Desarrollo de Módulos**:
   - Completar módulo de Ventas (POS)
   - Completar módulo de Caja
   - Completar módulo de Gastos
   - Completar módulo de Nómina
4. ⏳ **Migración de Datos** desde Excel
5. ⏳ **Pruebas con Usuario Final**

---

## ❓ Problemas Comunes

### "No module named 'django'"
```powershell
# Asegúrate de tener el entorno virtual activado
.\venv\Scripts\activate
pip install -r requirements.txt
```

### "Port 8000 already in use"
```powershell
# Encontrar proceso usando el puerto
netstat -ano | findstr :8000
# Matar proceso (reemplazar PID con el número obtenido)
taskkill /PID <PID> /F
```

### "npm: command not found"
- Instalar Node.js desde: https://nodejs.org/

### Errores de migraciones
```powershell
# Eliminar base de datos y empezar de nuevo
del db.sqlite3
python manage.py migrate
python manage.py createsuperuser
```

---

## 📞 Contacto

Si tienes problemas con la configuración, contacta al equipo de desarrollo.
