# 🚀 Guía de Inicio Rápido - Sistema de Gestión EmirS

## ✅ Estado del Proyecto

**✔️ Estructura del proyecto creada**  
**✔️ Backend Django configurado**  
**✔️ Frontend React configurado**  
**✔️ Documentación completa**  
**⏳ Pendiente: Configuración inicial**

---

## 📁 Archivos y Documentos Disponibles

### Documentación
- **README.md** - Introducción y guía general del proyecto
- **CONFIGURACION.md** - Pasos detallados para configurar el proyecto
- **REQUERIMIENTOS.md** - Documento de requerimientos del sistema (SRS)
- **ARQUITECTURA.md** - Arquitectura técnica detallada
- **INICIO_RAPIDO.md** - Este archivo

### Código
- **backend/** - Aplicación Django con 8 módulos
- **frontend/** - Aplicación React con Vite

---

## 🎯 Próximos Pasos (EN ORDEN)

### 1️⃣ Configurar Backend (15 minutos)

```powershell
# Abrir PowerShell en la carpeta del proyecto
cd backend

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
.\venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt

# Crear archivo .env
copy .env.example .env

# Ejecutar migraciones
python manage.py makemigrations
python manage.py migrate

# Crear superusuario
python manage.py createsuperuser
# Username: admin
# Email: admin@emirs.com
# Password: (tu password seguro)

# Iniciar servidor
python manage.py runserver
```

**✅ Verificar**: Abrir http://localhost:8000/admin y hacer login

---

### 2️⃣ Configurar Frontend (10 minutos)

**En NUEVA terminal PowerShell:**

```powershell
# Ir a carpeta frontend
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

**✅ Verificar**: Abrir http://localhost:5173 y ver la pantalla de login

---

### 3️⃣ Cargar Datos Iniciales (5 minutos)

**En terminal del backend (con venv activado):**

```powershell
python manage.py shell
```

**Copiar y pegar:**

```python
from apps.inventario.models import Marca, Proveedor
from apps.ventas.models import Servicio

# Crear marcas
marcas = ['Nexen', 'Pirelli', 'Bridgestone', 'Zmax', 'Goodride', 'Sailun', 'Firestone', 'Cooper', 'Goodyear', 'Maxxis', 'Kumho', 'Hankook', 'Continental', 'Michelin', 'Fronwey']
for marca in marcas:
    Marca.objects.get_or_create(nombre=marca)
    print(f"✅ Marca creada: {marca}")

# Crear proveedores
proveedores = ['TBC de México', 'Prodinamics', 'Paisa Llantas', 'Tecnollantas', 'LlantaMaya', 'Radial Llantas']
for proveedor in proveedores:
    Proveedor.objects.get_or_create(nombre=proveedor)
    print(f"✅ Proveedor creado: {proveedor}")

# Crear servicios
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
    print(f"✅ Servicio creado: {nombre} - ${precio}")

print("\n🎉 ¡Datos iniciales cargados correctamente!")
exit()
```

---

### 4️⃣ Crear Usuario Operador (Opcional)

**En http://localhost:8000/admin:**

1. Ir a "Usuarios"
2. Click en "Agregar Usuario"
3. Llenar datos:
   - Username: `secretaria`
   - Password: (contraseña segura)
   - Rol: `Operador`
   - Guardar

---

## 🧪 Probar el Sistema

### Backend
1. ✅ Admin panel: http://localhost:8000/admin
2. ✅ API Usuarios: http://localhost:8000/api/usuarios/usuarios/
3. ✅ API Productos: http://localhost:8000/api/inventario/productos/
4. ✅ API Marcas: http://localhost:8000/api/inventario/marcas/

### Frontend
1. ✅ Login: http://localhost:5173/auth/login
2. ✅ Dashboard: http://localhost:5173/dashboard
3. ✅ Inventario: http://localhost:5173/inventario

---

## 📊 Módulos Disponibles

| Módulo | Backend | Frontend | Estado |
|--------|:-------:|:--------:|:------:|
| Autenticación | ✅ | 🔧 | Parcial |
| Inventario | ✅ | 🔧 | Parcial |
| Ventas (POS) | ✅ | ❌ | Por desarrollar |
| Caja | ⚠️ | ❌ | Por desarrollar |
| Gastos | ⚠️ | ❌ | Por desarrollar |
| Nómina | ⚠️ | ❌ | Por desarrollar |
| Clientes | ✅ | ❌ | Por desarrollar |
| Reportes | ⚠️ | ❌ | Por desarrollar |

**Leyenda:**
- ✅ Completo
- 🔧 En desarrollo
- ⚠️ Estructura creada
- ❌ Por iniciar

---

## 🔨 Comandos Útiles

### Backend

```powershell
# Activar entorno virtual
.\venv\Scripts\activate

# Crear migraciones
python manage.py makemigrations

# Aplicar migraciones
python manage.py migrate

# Crear superusuario
python manage.py createsuperuser

# Shell interactivo
python manage.py shell

# Iniciar servidor
python manage.py runserver

# Ver usuarios creados
python manage.py shell
>>> from apps.usuarios.models import Usuario
>>> Usuario.objects.all()
```

### Frontend

```powershell
# Instalar dependencias
npm install

# Iniciar desarrollo
npm run dev

# Compilar para producción
npm run build

# Preview de build
npm run preview
```

---

## 🐛 Solución de Problemas Comunes

### "No module named 'django'"
```powershell
# Asegúrate de activar el entorno virtual
cd backend
.\venv\Scripts\activate
pip install -r requirements.txt
```

### "Port 8000 is already in use"
```powershell
# Ver qué proceso usa el puerto
netstat -ano | findstr :8000
# Matar el proceso (reemplaza PID)
taskkill /PID <PID> /F
```

### "CORS error" en Frontend
- Verificar que el backend esté corriendo en puerto 8000
- Verificar configuración en `backend/config/settings.py` (CORS_ALLOWED_ORIGINS)

### Error al hacer migraciones
```powershell
# Si hay errores, eliminar base de datos y empezar de nuevo
cd backend
del db.sqlite3
python manage.py migrate
python manage.py createsuperuser
```

---

## 📚 Recursos Adicionales

### Para Aprender
- Django Docs: https://docs.djangoproject.com/
- Django REST Framework: https://www.django-rest-framework.org/
- React Docs: https://react.dev/
- Vite Docs: https://vitejs.dev/

### Herramientas Recomendadas
- **VS Code** con extensiones:
  - Python
  - ES7+ React/Redux/React-Native snippets
  - Tailwind CSS IntelliSense
  - REST Client (para probar API)

---

## 🎯 Plan de Desarrollo Sugerido

### Semana 1-2: MVP Básico
- [ ] Completar autenticación en frontend
- [ ] Desarrollar pantalla de inventario completa
- [ ] Crear formularios de entrada de productos
- [ ] Implementar búsqueda de productos

### Semana 3-4: Punto de Venta
- [ ] Interfaz de POS
- [ ] Carrito de compra
- [ ] Métodos de pago
- [ ] Actualización automática de inventario
- [ ] Vista previa de ticket

### Semana 5-6: Caja y Gastos
- [ ] Módulo de arqueo de caja
- [ ] Contador de billetes interactivo
- [ ] Registro de gastos
- [ ] Categorías de gastos

### Semana 7-8: Reportes y Dashboard
- [ ] Dashboard con métricas
- [ ] Gráficas de ventas
- [ ] Reportes exportables
- [ ] Alertas y notificaciones

---

## ✅ Checklist de Configuración Inicial

Marca cada item cuando lo completes:

**Backend:**
- [ ] Entorno virtual creado y activado
- [ ] Dependencias instaladas
- [ ] Archivo .env configurado
- [ ] Migraciones ejecutadas
- [ ] Superusuario creado
- [ ] Datos iniciales cargados
- [ ] Servidor corriendo en http://localhost:8000

**Frontend:**
- [ ] Dependencias instaladas con npm
- [ ] Servidor corriendo en http://localhost:5173
- [ ] Puede acceder a pantalla de login

**Verificación:**
- [ ] Puedo acceder al admin panel
- [ ] Puedo ver marcas en http://localhost:8000/api/inventario/marcas/
- [ ] El frontend carga correctamente
- [ ] No hay errores en la consola

---

## 🎉 ¡Listo para Empezar!

Una vez que hayas completado todos los pasos anteriores, estás listo para comenzar el desarrollo.

**Siguiente paso recomendado:**
1. Familiarizarse con la estructura del código
2. Revisar los modelos en `backend/apps/*/models.py`
3. Empezar a desarrollar el módulo de Inventario (frontend)

---

## 📞 Soporte

Si encuentras problemas durante la configuración:
1. Revisa la sección de "Solución de Problemas"
2. Consulta CONFIGURACION.md para detalles
3. Contacta al equipo de desarrollo

---

**¡Éxito con el proyecto! 🚀**

---

Creado: Enero 2026  
Última actualización: Enero 2026
