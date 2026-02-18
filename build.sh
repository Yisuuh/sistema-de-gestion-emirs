#!/usr/bin/env bash
# Script de build para Render
# Se ejecuta una sola vez al hacer deploy.
set -o errexit

# ── 1. Dependencias Python ──────────────────────────────────────────────────
pip install -r backend/requirements.txt

# ── 2. Compilar el frontend (React/Vite) ───────────────────────────────────
cd frontend
# Eliminar package-lock.json generado en Windows para que npm lo regenere
# en Linux e incluya las dependencias nativas correctas (rollup-linux-x64-gnu)
rm -f package-lock.json
npm install
npm run build          # genera frontend/dist/
cd ..

# ── 3. Copiar el build de React dentro del proyecto Django ──────────────────
# Django lo buscará en backend/frontend_build/
rm -rf backend/frontend_build
cp -r frontend/dist backend/frontend_build

# ── 4. Migraciones y archivos estáticos ────────────────────────────────────
cd backend

# El modelo de usuario personalizado debe migrarse PRIMERO para evitar
# que post_migrate de contenttypes/auth referencie una tabla inexistente.
python manage.py migrate usuarios --no-input
python manage.py migrate --no-input
python manage.py collectstatic --no-input

# Crear superusuario si las variables de entorno están definidas
if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  python manage.py shell -c "
from apps.usuarios.models import Usuario
if not Usuario.objects.filter(username='$DJANGO_SUPERUSER_USERNAME').exists():
    Usuario.objects.create_superuser('$DJANGO_SUPERUSER_USERNAME', '$DJANGO_SUPERUSER_EMAIL', '$DJANGO_SUPERUSER_PASSWORD')
    print('Superusuario creado.')
else:
    print('El superusuario ya existe.')
"
fi
