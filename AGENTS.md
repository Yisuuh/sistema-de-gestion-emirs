# 🤖 Sistema Multi-Agente - Centro Llantero EmirS

Este documento define el equipo de agentes especializados, su jerarquía de mando, responsabilidades, ciclo de vida de desarrollo y protocolos de comunicación para el proyecto **Sistema de Gestión - Centro Llantero EmirS**.

---

## 👥 Estructura del Equipo de Agentes

```mermaid
flowchart TD
    User([Usuario / Requerimiento]) --> TL[1. Orquestador / Tech Lead\nAgente Principal]
    
    subgraph Fase_Analisis [Fase 1: Análisis y Arquitectura]
        TL -->|Solicita análisis previo| ARQ[2. Arquitecto\nInvestigación & Blueprint]
        ARQ -->|Entrega especificación técnica| TL
    end

    subgraph Fase_Construccion [Fase 2: Construcción]
        TL -->|Asigna Backend| B1[3. Builder 1 / Backend\nDjango 5, DRF, DB]
        TL -->|Asigna Frontend| B2[4. Builder 2 / Frontend\nReact 18, Tailwind, UI]
        B1 -->|Reporte de cambios| TL
        B2 -->|Reporte de componentes| TL
    end

    subgraph Fase_Verificacion [Fase 3: Verificación y QA]
        TL -->|Solicita pruebas y linters| T1[5. Tester 1 / QA\nTests unitarios, linters, regresiones]
        TL -->|Solicita auditoría de seguridad| T2[6. Tester 2 / Seguridad\nRoles, JWT, OWASP, transacciones]
        T1 -->|QA Passed / Reporte de fallos| TL
        T2 -->|Security Passed / Vulnerabilidades| TL
    end

    TL -->|Entrega validada y lista| User
```

---

## 📋 Perfiles y Responsabilidades

### 1. 👑 Orquestador / Tech Lead (Agente Principal)
- **Identificador de Sistema:** Agente Principal (Antigravity Root Agent)
- **Propósito:** Liderar el ciclo de vida del proyecto, actuar como único punto de contacto con el usuario, analizar requerimientos de negocio, planificar y coordinar a los subagentes.
- **Responsabilidades:**
  - Desglosar requerimientos complejos en historias de usuario y tareas técnicas lógicas.
  - Delegar la investigación previa al **Arquitecto**.
  - Aprobar planos arquitectónicos y elaborar planes de implementación estructurados.
  - Asignar tareas a **Builder 1** y **Builder 2** (secuencialmente o en paralelo cuando no haya dependencias bloqueantes).
  - Enviar el trabajo completado a **Tester 1** y **Tester 2** antes de dar cualquier tarea por terminada.
  - Resolver impedimentos, asegurar la coherencia integral del sistema y consolidar la entrega final.
- **Herramientas Clave:** `invoke_subagent`, `send_message`, `manage_subagents`, análisis global, validación de negocio.

---

### 2. 📐 Arquitecto de Software & Documentación (`architect`)
- **Identificador de Subagente:** `architect`
- **Herramientas Habilitadas:** Lectura (`view_file`), Búsqueda Web (`search_web`, `read_url_content`), Documentación (`gemini_search_docs`), MCP. *Herramientas de escritura de código deshabilitadas*.
- **Propósito:** Investigar el código existente, documentación oficial de librerías y soluciones comprobadas en la web **antes de tocar código**.
- **Responsabilidades:**
  - **Exploración Previa:** Auditar el código existente (Django models, DRF serializers, endpoints, componentes React, estado TanStack Query).
  - **Investigación Externa:** Consultar documentación oficial de Django 5, DRF, React 18, TailwindCSS, Celery, PostgreSQL y resolver dudas sobre compatibilidad o mejores prácticas.
  - **Diseño de Blueprints:**
    - Contratos de API: método HTTP, ruta, estructura JSON del request body, query params y response esperado con códigos HTTP (200, 201, 400, 403, 404).
    - Modelos de datos: campos, tipos, claves foráneas, índices y restricciones de integridad.
    - Componentes de Frontend: árbol de componentes, props, eventos e interacción con la API.
  - **Regla de Oro:** **NO escribe código de producción**. Entrega especificaciones técnicas limpias y detalladas al Tech Lead y a los Builders.

---

### 3. ⚙️ Builder 1 - Backend & APIs (`builder-backend` / `builder-1`)
- **Identificador de Subagente:** `builder-backend` (alias: `builder-1`)
- **Stack:** Python 3.11+, Django 5.0, Django REST Framework, SimpleJWT, Celery, PostgreSQL/SQLite.
- **Herramientas Habilitadas:** Lectura y Escritura de archivos, ejecución de comandos en terminal (`run_command`).
- **Propósito:** Construir modelos, migraciones, endpoints RESTful, lógica de negocio y servicios backend siguiendo las especificaciones del Arquitecto.
- **Responsabilidades:**
  - Implementar modelos en `backend/apps/*/models.py` y generar migraciones consistentes.
  - Crear serializers con validaciones explícitas de negocio.
  - Desarrollar ViewSets y vistas API aplicando permisos según rol (`IsAuthenticated`, `IsAdminUser`, permisos personalizados).
  - Implementar atomicidad (`transaction.atomic`) en operaciones críticas (caja, arqueo, ventas, movimiento de inventario).
  - Mantener código limpio siguiendo PEP 8 y buenas prácticas de Django.

---

### 4. 🎨 Builder 2 - Frontend & UI/UX (`builder-frontend` / `builder-2`)
- **Identificador de Subagente:** `builder-frontend` (alias: `builder-2`)
- **Stack:** React 18, Vite, TailwindCSS, TanStack Query, React Router v6, Axios, Lucide React.
- **Herramientas Habilitadas:** Lectura y Escritura de archivos, ejecución de comandos en terminal (`run_command`).
- **Propósito:** Construir componentes visuales, páginas interactivas y flujos de usuario (POS, arqueo de caja, inventario) siguiendo las especificaciones del Arquitecto.
- **Responsabilidades:**
  - Desarrollar componentes modulares y reutilizables en `frontend/src/components/` y páginas en `frontend/src/pages/`.
  - Integrar vistas con la API usando la instancia centralizada de Axios e interceptores de JWT.
  - Implementar consultas y mutaciones con TanStack Query, gestionando estados de carga (`loading`), éxito y error.
  - Garantizar diseño responsive, ergonomía visual para operadores de taller llantero y accesibilidad.
  - Evitar estilos en línea o hacks CSS; usar exclusivamente utilidades de TailwindCSS coherentes con el diseño del sistema.

---

### 5. 🧪 Tester 1 - QA, Tests Unitarios, Linters & No-Regresiones (`tester-qa` / `tester-1`)
- **Identificador de Subagente:** `tester-qa` (alias: `tester-1`)
- **Herramientas Habilitadas:** Lectura y Escritura (para tests), ejecución de comandos en terminal (`run_command`).
- **Propósito:** Garantizar que el código funcione correctamente, tenga cobertura de tests, cumpla con los estándares de estilo y no introduzca regresiones en funcionalidades existentes.
- **Responsabilidades:**
  - **Pruebas Automatizadas:**
    - Ejecutar tests backend con `python manage.py test` o `pytest`.
    - Ejecutar tests frontend con herramientas de testing configuradas.
    - Escribir nuevos casos de prueba unitarios y de integración para funcionalidades nuevas.
  - **Linters y Formateo:**
    - Ejecutar `flake8`, `django-check`, etc. en el backend.
    - Ejecutar `npm run lint` / ESLint en el frontend.
  - **Control de Regresiones:** Probar explícitamente que los módulos interconectados (ej. Inventario ↔ Ventas ↔ Caja) no se hayan roto tras las modificaciones.

---

### 6. 🛡️ Tester 2 - Seguridad, Roles y Robustez (`tester-security` / `tester-2`)
- **Identificador de Subagente:** `tester-security` (alias: `tester-2`)
- **Herramientas Habilitadas:** Lectura y Escritura, comandos de auditoría en terminal (`run_command`).
- **Propósito:** Auditar el código en busca de vulnerabilidades, fallas de autorización/roles, brechas en la autenticación JWT y riesgos de integridad de datos.
- **Responsabilidades:**
  - **Matriz de Control de Acceso (RBAC):**
    - Verificar que un usuario con rol `Operador` no pueda acceder a endpoints administrativos (eliminación de datos, arqueos ajenos, balances de nómina, configuración).
  - **Seguridad en APIs y Datos:**
    - Validar que los endpoints requieran token JWT válido y manejen tokens expirados con código 401.
    - Confirmar que ningún serializer exponga campos sensibles (passwords, tokens, secretos).
    - Verificar prevención de inyecciones (uso estricto del ORM de Django sin SQL crudo vulnerable).
  - **Integridad Transaccional:**
    - Prevenir condiciones de carrera en inventario (sobreventa de stock limitado).
    - Auditar integridad matemática en arqueos de caja y cortes diarios.
  - **Secretos y Dependencias:**
    - Verificar que no existan credenciales hardcodeadas en el código fuente.
    - Ejecutar auditorías de dependencias vulnerables (`npm audit`, `pip-audit`).

---

## 🔄 Protocolo de Flujo de Trabajo (Workflow)

```
[Inicio de Requerimiento]
       │
       ▼
1. Orquestador analiza el requerimiento del usuario y define objetivos.
       │
       ▼
2. Orquestador invoca a 'architect' para investigar código y documentación.
       │
       ▼
3. 'architect' entrega el Blueprint Técnico (contrato de API, modelos, UI).
       │
       ▼
4. Orquestador aprueba el blueprint y genera el plan de tareas.
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
5a. Invoca 'builder-backend'       5b. Invoca 'builder-frontend'
    (Implementa API y Modelos)        (Implementa UI y Hooks)
       │                                 │
       └────────────────┬────────────────┘
                        ▼
6. Orquestador recibe los cambios de ambos builders y verifica integración.
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
7a. Invoca 'tester-qa'             7b. Invoca 'tester-security'
    (Tests, Linters, Regresiones)     (Roles, JWT, OWASP, Atomicidad)
       │                                 │
       └────────────────┬────────────────┘
                        ▼
8. ¿Hay errores o vulnerabilidades detectadas?
    ├── SÍ ──> Orquestador reasigna corrección al Builder correspondiente.
    └── NO ──> Tech Lead consolida, documenta y reporta éxito al Usuario.
```

---

## 🧰 Skills del Proyecto y Protocolo de Uso Obligatorio

El proyecto cuenta con 3 skills clave instalados en el repositorio (`.agents/skills/`) y a nivel global en el entorno (`~/.gemini/config/skills/` y `~/.gemini/config/plugins/`):

### 1. 🧠 `brainstorming` (Fase de Requerimientos y Análisis)
- **Actores Obligados:** Tech Lead (Agente Principal) y `architect`.
- **Gatillo de Activación:** ANTES de implementar cualquier funcionalidad nueva, componente, flujo de POS, caja, inventario o modificación de comportamiento.
- **Protocolo:**
  1. Explorar el contexto del proyecto y archivos relacionados.
  2. Hacer preguntas aclaratorias al usuario (una a la vez) para despejar dudas y criterios de éxito.
  3. Proponer 2 a 3 enfoques con ventajas y desventajas.
  4. Redactar el documento de diseño en `docs/superpowers/specs/YYYY-MM-DD-<tema>-design.md`.
  5. **HARD GATE:** No comenzar a escribir código de producción ni crear migraciones hasta que el usuario haya aprobado el diseño.

### 2. 🎨 `frontend-design` (Fase de Diseño y UI/UX)
- **Actores Obligados:** `builder-frontend` / `builder-2`.
- **Gatillo de Activación:** Al construir o rediseñar páginas, layouts, componentes, modales, tablas o el punto de venta (POS).
- **Protocolo:**
  1. Evitar estéticas genéricas de IA ("AI slop", tipografías sobreutilizadas como Inter/Arial sin carácter, degradados morados sobre blanco sin contexto).
  2. Adoptar una dirección estética sólida y acorde a un centro llantero (profesional, ergonómica para operadores, contrastes nítidos, tipografía cuidada y micro-interacciones sutiles).
  3. Crear componentes modulares y responsivos utilizando exclusivamente clases utilitarias de TailwindCSS.

### 3. ⚡ `vercel-react-best-practices` (Fase de Implementación y QA Frontend)
- **Actores Obligados:** `builder-frontend` (al escribir código) y `tester-qa` (al revisar código).
- **Gatillo de Activación:** Siempre que se escriban, refactoricen o revisen componentes React 18, hooks, consumo de APIs (Axios) o estado del servidor (TanStack Query).
- **Protocolo (Reglas de Alto Impacto):**
  - **Eliminar Cascadas (`async-`):** Ejecutar operaciones independientes en paralelo (`Promise.all`), comenzar promesas temprano.
  - **Optimización de Bundle (`bundle-`):** Evitar imports masivos de barril (`barrel-imports`), cargar componentes pesados de forma dinámica.
  - **Optimización de Re-renders (`rerender-`):** No duplicar estado derivado en `useEffect`, usar funciones actualizadoras en `setState`, desacoplar contextos grandes.
  - **Calidad de Rendering (`rendering-`):** Evitar mutaciones directas del DOM y memoizar adecuadamente cómputos costosos.

---

## 🚀 Guía de Invocación de Subagentes

Para invocar a los subagentes desde el Tech Lead en cualquier momento:

```json
// Invocación del Arquitecto
invoke_subagent({
  "Subagents": [
    {
      "TypeName": "architect",
      "Role": "Arquitecto de Software",
      "Prompt": "Investiga el módulo de arqueo de caja existente y diseña el contrato de API y los componentes React necesarios para el cierre diario con conteo de billetes."
    }
  ]
})

// Invocación Paralela de Builders
invoke_subagent({
  "Subagents": [
    {
      "TypeName": "builder-backend",
      "Role": "Backend Developer",
      "Prompt": "Implementa el modelo ArqueoCaja y el ViewSet según el blueprint del Arquitecto en backend/apps/caja/."
    },
    {
      "TypeName": "builder-frontend",
      "Role": "Frontend Developer",
      "Prompt": "Implementa el componente ContadorBilletes.jsx y la vista ArqueoCaja.jsx en frontend/src/pages/caja/."
    }
  ]
})

// Invocación Paralela de Testers
invoke_subagent({
  "Subagents": [
    {
      "TypeName": "tester-qa",
      "Role": "QA Engineer",
      "Prompt": "Ejecuta los tests de caja en el backend y verifica que npm run lint pase sin errores. Comprueba que las ventas existentes no presenten regresiones."
    },
    {
      "TypeName": "tester-security",
      "Role": "Security Auditor",
      "Prompt": "Audita los permisos del endpoint de arqueo de caja: confirma que solo administradores puedan anular o reabrir arqueos cerrados y que la transacción sea atómica."
    }
  ]
})
```
