# Especificación de Diseño: Bandeja de Facturas XML desde Gmail (OAuth2)

**Fecha:** 2026-11-16  
**Estado:** Aprobado por el Usuario (Opción A: Gmail API + OAuth2)  
**Equipo:** Orquestador + `architect` + `builder-backend` + `builder-frontend` + `tester-qa` + `tester-security`

---

## 1. Objetivo y Alcance

Permitir vincular una cuenta de Gmail/Google Workspace mediante **Gmail API + OAuth2 (`gmail.readonly`)** para descargar automáticamente los archivos `.xml` CFDI de proveedores (incluyendo `.xml` empacados en `.zip`), mostrarlos en una **Bandeja de XML** dentro del módulo de Inventario, y permitir **previsualizar e importar** directamente al flujo de compras o **descargar** el `.xml` original.

---

## 2. Arquitectura y Seguridad

1. **Autenticación OAuth2 (Opción A):**
   - Credenciales de app Google (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`) configuradas en `.env`.
   - Flujo `access_type=offline`, `prompt=consent`, scope mínimo `https://www.googleapis.com/auth/gmail.readonly` y `state` firmado criptográficamente (anti-CSRF) validado en callback.
   - El `refresh_token` / credenciales OAuth se guardan **cifrados con Fernet** (`GMAIL_TOKEN_ENCRYPTION_KEY` en `.env`) en `ConfiguracionCorreoXML` y **jamás** se exponen en serializers ni logs.
2. **Protección XXE y adjuntos seguros:**
   - Refactorizar parser CFDI a `backend/apps/inventario/services/xml_import.py` usando `defusedxml.ElementTree` para evitar ataques XXE / XML bombs en correos externos.
   - Límite de tamaño por adjunto (5 MB) y extracción segura en memoria de `.zip` (anti zip-slip / zip-bomb, máx. 10 MB descomprimido).
3. **Deduplicación e Idempotencia:**
   - Extraer `UUID` de `<tfd:TimbreFiscalDigital>` en el CFDI y calcular `SHA-256` del archivo `.xml`.
   - Evitar duplicados en bandeja por `(cuenta, external_message_id, attachment_key)` y `archivo_sha256`.
   - Al importar, bloquear el registro con `select_for_update()` dentro de `transaction.atomic()` para impedir doble entrada de stock.
4. **Sincronización Híbrida:**
   - Manual inmediato desde botón **"Sincronizar ahora"** en la UI.
   - Automática periódica vía endpoint `POST /api/inventario/xml-bandeja/cron/` protegido por `X-Cron-Key` (compatible con Programador de Tareas de Windows / Celery Beat opcional).

---

## 3. Modelos y API (`/api/inventario/`)

### 3.1 Modelos nuevos en `backend/apps/inventario/models.py`
- **`ConfiguracionCorreoXML`**: `nombre`, `email_cuenta`, `activa`, `oauth_token_json_enc`, `ultimo_history_id`, `ultima_sincronizacion`, `ultimo_error`, `dias_busqueda_inicial` (default 30), `filtro_remitentes`.
- **`FacturaXMLBandeja`**: `cuenta` (FK), `external_message_id`, `attachment_key`, `archivo_sha256`, `remitente_email`, `remitente_nombre`, `asunto`, `fecha_correo`, `nombre_archivo`, `archivo_xml` (`upload_to='xml_bandeja/%Y/%m/'`), `cfdi_uuid`, `emisor_rfc`, `emisor_nombre`, `numero_factura`, `fecha_emision`, `subtotal`, `total`, `total_items`, `estado` (`pendiente` | `importada` | `descartada` | `error`), `error_detalle`, `importado_por` (FK), `importado_at`, `proveedor_vinculado` (FK SET_NULL).

### 3.2 Endpoints REST
- `GET /api/inventario/xml-bandeja/` — Lista paginada (`StandardPagination`) con filtros `?estado=` y `?search=`.
- `POST /api/inventario/xml-bandeja/sincronizar/` — Admin only. Consulta Gmail (`has:attachment (filename:xml OR filename:zip)`), descarga adjuntos nuevos, pre-parsea metadatos CFDI y guarda registros en bandeja.
- `POST /api/inventario/xml-bandeja/cron/` — Protegido por `X-Cron-Key`, ejecuta sincronización de cuentas activas.
- `GET /api/inventario/xml-bandeja/{id}/preview/` — Devuelve el mismo contrato `{ accion: 'preview', datos: ... }` que `ImportarXMLView`.
- `POST /api/inventario/xml-bandeja/{id}/importar/` — Admin only. Ejecuta `guardar_factura_cfdi`, marca `importada` y retorna `{ accion: 'guardado', resultado: ... }`.
- `GET /api/inventario/xml-bandeja/{id}/descargar/` — Descarga el `.xml` con `Content-Disposition: attachment`.
- `PATCH /api/inventario/xml-bandeja/{id}/descartar/` — Admin only. Marca como `descartada`.
- OAuth2 Gmail (Admin only):
  - `GET /api/inventario/xml-bandeja/gmail/status/`
  - `GET /api/inventario/xml-bandeja/gmail/auth-url/`
  - `GET /api/inventario/xml-bandeja/gmail/callback/`
  - `POST /api/inventario/xml-bandeja/gmail/disconnect/`

---

## 4. Interfaz de Usuario (`frontend/src/pages/inventario/`)

- Sub-pestaña **"Bandeja Gmail"** junto a **"Subir XML manual"** en `TabXml` (`Inventario.jsx` / `TabBandejaXml.jsx`).
- Cabecera con estado de conexión Gmail (`Conectado como ...` / botón `Conectar Gmail` + `Desconectar`), fecha de última sincronización y botón **`Sincronizar ahora`**.
- Tabla de facturas XML recibidas con tabs/filtros (`Pendientes`, `Importadas`, `Descartadas`, `Todos`) y buscador por proveedor, RFC o factura.
- Acciones por fila:
  - **Revisar e Importar** → abre la misma vista previa de factura (con `P. Compra s/IVA`, `P. Compra c/IVA` y `P. Venta Sugerido`) y confirma importación invalidando las queries de inventario.
  - **Descargar XML** → descarga autenticada mediante `fetch` + `Blob`.
  - **Descartar** → oculta XMLs que no son compras de mercancía.
