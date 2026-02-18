#!/usr/bin/env bash
# Script de build para Render
# Se ejecuta una sola vez al hacer deploy.
set -o errexit

# ── 1. Dependencias Python ──────────────────────────────────────────────────
pip install -r backend/requirements.txt

# ── 2. Compilar el frontend (React/Vite) ───────────────────────────────────
cd frontend
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
