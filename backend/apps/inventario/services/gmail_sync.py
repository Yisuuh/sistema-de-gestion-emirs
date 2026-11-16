"""
Servicio de integración con Gmail API (OAuth2) para descarga automática
de facturas XML CFDI (incluyendo adjuntos .zip) hacia la Bandeja XML.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import os
import re
import secrets
import zipfile
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import PurePosixPath
from typing import Any

import defusedxml.ElementTree as ET
from cryptography.fernet import Fernet, InvalidToken
from defusedxml import DefusedXmlException
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.db import IntegrityError
from django.utils import timezone
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from ..models import ConfiguracionCorreoXML, FacturaXMLBandeja, Proveedor
from .xml_import import MAX_XML_SIZE, parsear_cfdi

logger = logging.getLogger(__name__)

GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
OAUTH_STATE_SALT = 'gmail-oauth-state'
OAUTH_STATE_MAX_AGE = 600  # 10 minutos
MAX_ZIP_DOWNLOAD_SIZE = 15 * 1024 * 1024  # 15 MB comprimido máximo
MAX_ZIP_UNCOMPRESSED_SIZE = 10 * 1024 * 1024  # 10 MB descomprimido máximo
MAX_ZIP_FILES = 20
MAX_MESSAGES_PER_SYNC = 200


def obtener_fernet() -> Fernet:
    """
    Obtiene la instancia Fernet usando GMAIL_TOKEN_ENCRYPTION_KEY o,
    como respaldo en desarrollo, una clave derivada de SECRET_KEY vía SHA-256.
    """
    configured_key = (getattr(settings, 'GMAIL_TOKEN_ENCRYPTION_KEY', '') or '').strip()
    if configured_key:
        key_bytes = configured_key.encode('utf-8') if isinstance(configured_key, str) else configured_key
        return Fernet(key_bytes)

    if not getattr(settings, 'DEBUG', False):
        logger.warning('GMAIL_TOKEN_ENCRYPTION_KEY no está configurada; usando respaldo derivado de SECRET_KEY.')

    secret_bytes = (getattr(settings, 'SECRET_KEY', '') or 'emirs-fallback').encode('utf-8')
    digest = hashlib.sha256(secret_bytes).digest()
    derived_key = base64.urlsafe_b64encode(digest)
    return Fernet(derived_key)


def cifrar_token_json(token_data: dict[str, Any] | str) -> str:
    """Cifra el JSON de credenciales OAuth2 con Fernet."""
    raw = json.dumps(token_data) if isinstance(token_data, dict) else str(token_data)
    return obtener_fernet().encrypt(raw.encode('utf-8')).decode('utf-8')


def descifrar_token_json(token_enc: str) -> dict[str, Any]:
    """Descifra el JSON de credenciales OAuth2 almacenado con Fernet."""
    if not token_enc:
        raise ValueError('No existen credenciales OAuth2 almacenadas.')
    try:
        decrypted = obtener_fernet().decrypt(token_enc.encode('utf-8')).decode('utf-8')
        return json.loads(decrypted)
    except (InvalidToken, json.JSONDecodeError) as exc:
        raise ValueError('No fue posible descifrar las credenciales OAuth2 de Gmail.') from exc


def _build_client_config() -> dict[str, Any]:
    client_id = (getattr(settings, 'GOOGLE_OAUTH_CLIENT_ID', '') or '').strip()
    client_secret = (getattr(settings, 'GOOGLE_OAUTH_CLIENT_SECRET', '') or '').strip()
    redirect_uri = (getattr(settings, 'GOOGLE_OAUTH_REDIRECT_URI', '') or '').strip()

    if not client_id or not client_secret:
        raise ValueError(
            'Las credenciales de Google OAuth2 (GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET) '
            'no están configuradas en el servidor.'
        )

    return {
        'web': {
            'client_id': client_id,
            'client_secret': client_secret,
            'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
            'token_uri': 'https://oauth2.googleapis.com/token',
            'redirect_uris': [redirect_uri] if redirect_uri else [],
        }
    }


def _build_gmail_service(creds: Credentials) -> Any:
    return build('gmail', 'v1', credentials=creds, cache_discovery=False)


def _es_usuario_admin(usuario: Any) -> bool:
    return bool(
        usuario
        and getattr(usuario, 'is_active', False)
        and (getattr(usuario, 'rol', None) == 'admin' or usuario.is_staff or usuario.is_superuser)
    )


def generar_url_oauth_gmail(usuario: Any) -> str:
    """
    Genera la URL de autorización OAuth2 de Google con scope gmail.readonly,
    access_type='offline', prompt='consent' y parámetro state firmado.
    """
    if not _es_usuario_admin(usuario):
        raise PermissionError('Solo los administradores pueden vincular una cuenta de Gmail.')

    client_config = _build_client_config()
    flow = Flow.from_client_config(client_config, scopes=GMAIL_SCOPES)
    flow.redirect_uri = getattr(settings, 'GOOGLE_OAUTH_REDIRECT_URI', '')

    signer = TimestampSigner(salt=OAUTH_STATE_SALT)
    state = signer.sign_object({'uid': usuario.id, 'nonce': secrets.token_urlsafe(16)})

    auth_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',
        state=state,
    )
    return auth_url


def procesar_callback_oauth_gmail(code: str, state: str) -> ConfiguracionCorreoXML:
    """
    Valida el parámetro state firmado, verifica que el usuario sea administrador,
    intercambia el código por tokens OAuth2 y guarda las credenciales cifradas.
    """
    if not state or not code:
        raise ValueError('Parámetros OAuth2 incompletos (code/state requeridos).')

    signer = TimestampSigner(salt=OAUTH_STATE_SALT)
    try:
        payload = signer.unsign_object(state, max_age=OAUTH_STATE_MAX_AGE)
    except SignatureExpired as exc:
        raise ValueError('La sesión de autorización OAuth2 expiró. Intenta nuevamente.') from exc
    except BadSignature as exc:
        raise ValueError('Estado OAuth2 inválido.') from exc

    uid = payload.get('uid') if isinstance(payload, dict) else None
    if not uid:
        raise ValueError('Estado OAuth2 sin identificador de usuario.')

    Usuario = get_user_model()
    usuario = Usuario.objects.filter(pk=uid).first()
    if not _es_usuario_admin(usuario):
        raise PermissionError('El usuario no tiene permisos de administrador para vincular Gmail.')

    client_config = _build_client_config()
    flow = Flow.from_client_config(client_config, scopes=GMAIL_SCOPES)
    flow.redirect_uri = getattr(settings, 'GOOGLE_OAUTH_REDIRECT_URI', '')
    flow.fetch_token(code=code)

    creds = flow.credentials
    service = _build_gmail_service(creds)
    profile = service.users().getProfile(userId='me').execute()
    email_cuenta = (profile.get('emailAddress') or '').strip()
    if not email_cuenta:
        raise ValueError('No se pudo obtener el correo electrónico de la cuenta de Gmail.')

    token_dict = json.loads(creds.to_json())

    # Buscar cuenta existente para preservar refresh_token si Google no lo reenvió
    cuenta = (
        ConfiguracionCorreoXML.objects.filter(email_cuenta__iexact=email_cuenta, proveedor_tipo='gmail_oauth').first()
        or ConfiguracionCorreoXML.objects.filter(proveedor_tipo='gmail_oauth', email_cuenta='').first()
    )

    if cuenta and not token_dict.get('refresh_token') and cuenta.oauth_token_json_enc:
        try:
            prev_token = descifrar_token_json(cuenta.oauth_token_json_enc)
            if prev_token.get('refresh_token'):
                token_dict['refresh_token'] = prev_token['refresh_token']
        except ValueError:
            pass

    encrypted_token = cifrar_token_json(token_dict)

    if cuenta is None:
        cuenta = ConfiguracionCorreoXML(
            nombre=f'Gmail ({email_cuenta})',
            proveedor_tipo='gmail_oauth',
        )

    cuenta.nombre = cuenta.nombre or f'Gmail ({email_cuenta})'
    cuenta.email_cuenta = email_cuenta
    cuenta.activa = True
    cuenta.oauth_token_json_enc = encrypted_token
    cuenta.ultimo_history_id = str(profile.get('historyId') or cuenta.ultimo_history_id or '')
    cuenta.ultimo_error = ''
    cuenta.save()
    return cuenta


def construir_query_gmail(cuenta: ConfiguracionCorreoXML) -> str:
    """Construye el query de búsqueda para la API de Gmail."""
    partes = ['has:attachment (filename:xml OR filename:zip)']

    if cuenta.ultima_sincronizacion:
        fecha_desde = (cuenta.ultima_sincronizacion - timedelta(days=1)).date()
    else:
        dias = cuenta.dias_busqueda_inicial or 30
        fecha_desde = (timezone.now() - timedelta(days=dias)).date()

    partes.append(f'after:{fecha_desde.strftime("%Y/%m/%d")}')

    if cuenta.filtro_remitentes:
        remitentes = [
            r.strip()
            for r in re.split(r'[,;\s]+', cuenta.filtro_remitentes)
            if r.strip()
        ]
        if len(remitentes) == 1:
            partes.append(f'from:{remitentes[0]}')
        elif len(remitentes) > 1:
            or_clause = ' OR '.join(f'from:{r}' for r in remitentes)
            partes.append(f'({or_clause})')

    return ' '.join(partes)


def _es_ruta_zip_segura(entry_name: str) -> bool:
    """Valida que una ruta interna de ZIP no contenga traversal (zip-slip) ni rutas absolutas."""
    if not entry_name:
        return False
    normalized = entry_name.replace('\\', '/')
    if normalized.startswith('/') or re.match(r'^[A-Za-z]:', normalized):
        return False
    if '\x00' in normalized:
        return False
    parts = PurePosixPath(normalized).parts
    if any(part in ('..', '') for part in parts):
        return False
    if normalized.startswith('__MACOSX/'):
        return False
    return True


def _sanitizar_nombre_archivo(nombre: str, default: str = 'factura.xml') -> str:
    base = os.path.basename((nombre or '').replace('\\', '/'))
    limpio = re.sub(r'[^A-Za-z0-9._-]', '_', base).strip('._')
    if not limpio:
        limpio = default
    if not limpio.lower().endswith('.xml'):
        limpio = f'{limpio}.xml'
    return limpio[:200]


def extraer_xmls_de_zip(zip_bytes: bytes) -> list[tuple[str, bytes]]:
    """
    Extrae de forma segura los archivos .xml de un ZIP en memoria.
    Protege contra zip-slip, rutas absolutas y zip-bombs (máx. 10 MB descomprimido,
    máx. 5 MB por XML y máx. 20 archivos procesados).
    """
    resultados: list[tuple[str, bytes]] = []
    total_uncompressed = 0
    total_files = 0

    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                total_files += 1
                if total_files > MAX_ZIP_FILES:
                    break

                if not _es_ruta_zip_segura(info.filename):
                    logger.warning('Entrada ZIP rechazada por ruta insegura: %s', info.filename)
                    continue

                if not info.filename.lower().endswith('.xml'):
                    continue

                if info.file_size > MAX_XML_SIZE:
                    logger.warning('Archivo XML dentro de ZIP excede 5 MB: %s', info.filename)
                    continue

                with zf.open(info, 'r') as entry_stream:
                    data = entry_stream.read(MAX_XML_SIZE + 1)

                if len(data) > MAX_XML_SIZE:
                    logger.warning('Archivo XML descomprimido excede 5 MB: %s', info.filename)
                    continue

                total_uncompressed += len(data)
                if total_uncompressed > MAX_ZIP_UNCOMPRESSED_SIZE:
                    logger.warning('Tamaño descomprimido total del ZIP excede 10 MB; se detiene extracción.')
                    break

                resultados.append((info.filename, data))
    except zipfile.BadZipFile as exc:
        raise ValueError('Archivo ZIP inválido o corrupto.') from exc

    return resultados


def _iterar_adjuntos_mime(payload: dict[str, Any], prefix: str = '0') -> list[tuple[str, dict[str, Any]]]:
    """Recorre recursivamente el árbol MIME de un mensaje Gmail devolviendo partes con filename."""
    encontrados: list[tuple[str, dict[str, Any]]] = []
    if not payload:
        return encontrados

    filename = (payload.get('filename') or '').strip()
    body = payload.get('body') or {}
    if filename and (body.get('attachmentId') or body.get('data')):
        encontrados.append((prefix, payload))

    for idx, sub_part in enumerate(payload.get('parts') or []):
        encontrados.extend(_iterar_adjuntos_mime(sub_part, prefix=f'{prefix}.{idx}'))

    return encontrados


def _descargar_bytes_adjunto(service: Any, message_id: str, part: dict[str, Any]) -> bytes:
    body = part.get('body') or {}
    data_b64 = body.get('data')
    if not data_b64:
        attachment_id = body.get('attachmentId')
        if not attachment_id:
            return b''
        att = (
            service.users()
            .messages()
            .attachments()
            .get(userId='me', messageId=message_id, id=attachment_id)
            .execute()
        )
        data_b64 = att.get('data', '')

    if not data_b64:
        return b''
    return base64.urlsafe_b64decode(data_b64.encode('ascii'))


def _parsear_fecha_correo(headers_map: dict[str, str], internal_date: str | None) -> datetime:
    date_header = headers_map.get('date', '')
    if date_header:
        try:
            dt = parsedate_to_datetime(date_header)
            if dt is not None:
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, timezone.get_current_timezone())
                return dt
        except Exception:
            pass

    if internal_date:
        try:
            ts_ms = int(internal_date)
            return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.get_current_timezone())
        except (ValueError, TypeError):
            pass

    return timezone.now()


def _parsear_fecha_emision(fecha_str: str | None):
    if not fecha_str:
        return None
    try:
        return datetime.strptime(str(fecha_str)[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


def _parsear_decimal_seguro(valor: Any) -> Decimal | None:
    if valor is None or valor == '':
        return None
    try:
        return Decimal(str(valor)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return None


def _guardar_xml_en_bandeja(
    cuenta: ConfiguracionCorreoXML,
    msg_id: str,
    attachment_key: str,
    nombre_archivo: str,
    xml_bytes: bytes,
    remitente_email: str,
    remitente_nombre: str,
    asunto: str,
    fecha_correo: datetime,
) -> str:
    """
    Deduplica, pre-parsea el CFDI y guarda el registro FacturaXMLBandeja.
    Retorna 'nueva', 'duplicada' o 'error'.
    """
    if FacturaXMLBandeja.objects.filter(
        cuenta=cuenta,
        external_message_id=msg_id,
        attachment_key=attachment_key,
    ).exists():
        return 'duplicada'

    archivo_sha256 = hashlib.sha256(xml_bytes).hexdigest()
    if FacturaXMLBandeja.objects.filter(archivo_sha256=archivo_sha256).exists():
        return 'duplicada'

    safe_name = _sanitizar_nombre_archivo(nombre_archivo)
    estado = 'pendiente'
    error_detalle = ''
    cfdi_uuid = ''
    emisor_rfc = ''
    emisor_nombre = ''
    numero_factura = ''
    fecha_emision = None
    subtotal = None
    total = None
    total_items = 0
    proveedor_vinculado = None

    try:
        datos = parsear_cfdi(xml_bytes)
        if not datos.get('items'):
            raise ValueError('No se encontraron conceptos en el XML.')

        cfdi_uuid = (datos.get('cfdi_uuid') or '').strip()
        prov_data = datos.get('proveedor') or {}
        emisor_nombre = (prov_data.get('nombre') or '').strip()[:255]
        emisor_rfc = (prov_data.get('rfc') or '').strip()[:20]
        numero_factura = (datos.get('numero_factura') or '').strip()[:100]
        fecha_emision = _parsear_fecha_emision(datos.get('fecha_compra'))
        subtotal = _parsear_decimal_seguro(datos.get('subtotal'))
        total = _parsear_decimal_seguro(datos.get('total'))
        total_items = len(datos.get('items') or [])

        if emisor_nombre:
            proveedor_vinculado = Proveedor.objects.filter(nombre__iexact=emisor_nombre).first()

        if cfdi_uuid and FacturaXMLBandeja.objects.filter(
            cfdi_uuid__iexact=cfdi_uuid,
            estado='importada',
        ).exists():
            estado = 'importada'
    except (DefusedXmlException, ET.ParseError, ValueError) as exc:
        estado = 'error'
        error_detalle = str(exc)
    except Exception as exc:
        estado = 'error'
        error_detalle = f'Error inesperado al analizar XML: {exc}'

    registro = FacturaXMLBandeja(
        cuenta=cuenta,
        external_message_id=msg_id,
        attachment_key=attachment_key,
        archivo_sha256=archivo_sha256,
        remitente_email=remitente_email[:255],
        remitente_nombre=remitente_nombre[:255],
        asunto=asunto[:500],
        fecha_correo=fecha_correo,
        nombre_archivo=safe_name[:255],
        cfdi_uuid=cfdi_uuid[:64],
        emisor_rfc=emisor_rfc,
        emisor_nombre=emisor_nombre,
        numero_factura=numero_factura,
        fecha_emision=fecha_emision,
        subtotal=subtotal,
        total=total,
        total_items=total_items,
        estado=estado,
        error_detalle=error_detalle,
        proveedor_vinculado=proveedor_vinculado,
    )
    try:
        registro.archivo_xml.save(safe_name, ContentFile(xml_bytes), save=True)
    except IntegrityError:
        return 'duplicada'

    return 'error' if estado == 'error' else 'nueva'


def _sincronizar_cuenta(cuenta: ConfiguracionCorreoXML) -> dict[str, Any]:
    nuevas = 0
    duplicadas = 0
    errores_xml = 0
    error_conexion = ''

    try:
        token_dict = descifrar_token_json(cuenta.oauth_token_json_enc)
        creds = Credentials.from_authorized_user_info(token_dict, scopes=GMAIL_SCOPES)

        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            cuenta.oauth_token_json_enc = cifrar_token_json(json.loads(creds.to_json()))
            cuenta.save(update_fields=['oauth_token_json_enc', 'updated_at'])

        service = _build_gmail_service(creds)
        query = construir_query_gmail(cuenta)

        message_refs: list[dict[str, Any]] = []
        page_token: str | None = None
        while len(message_refs) < MAX_MESSAGES_PER_SYNC:
            list_kwargs: dict[str, Any] = {'userId': 'me', 'q': query, 'maxResults': 100}
            if page_token:
                list_kwargs['pageToken'] = page_token
            resp = service.users().messages().list(**list_kwargs).execute()
            message_refs.extend(resp.get('messages') or [])
            page_token = resp.get('nextPageToken')
            if not page_token:
                break

        for msg_ref in message_refs[:MAX_MESSAGES_PER_SYNC]:
            msg_id = msg_ref.get('id')
            if not msg_id:
                continue

            msg = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
            payload = msg.get('payload') or {}
            headers_map = {
                (h.get('name') or '').lower(): (h.get('value') or '')
                for h in (payload.get('headers') or [])
            }
            remitente_nombre, remitente_email = parseaddr(headers_map.get('from', ''))
            asunto = headers_map.get('subject', '')
            fecha_correo = _parsear_fecha_correo(headers_map, msg.get('internalDate'))

            adjuntos = _iterar_adjuntos_mime(payload)
            for part_path, part in adjuntos:
                filename = (part.get('filename') or '').strip()
                lower_name = filename.lower()
                body = part.get('body') or {}
                declared_size = int(body.get('size') or 0)

                if lower_name.endswith('.xml'):
                    if declared_size > MAX_XML_SIZE:
                        continue
                    raw_bytes = _descargar_bytes_adjunto(service, msg_id, part)
                    if not raw_bytes or len(raw_bytes) > MAX_XML_SIZE:
                        continue
                    att_key = f'xml:{part_path}:{_sanitizar_nombre_archivo(filename)}'[:255]
                    res = _guardar_xml_en_bandeja(
                        cuenta=cuenta,
                        msg_id=msg_id,
                        attachment_key=att_key,
                        nombre_archivo=filename,
                        xml_bytes=raw_bytes,
                        remitente_email=remitente_email,
                        remitente_nombre=remitente_nombre,
                        asunto=asunto,
                        fecha_correo=fecha_correo,
                    )
                    if res == 'nueva':
                        nuevas += 1
                    elif res == 'duplicada':
                        duplicadas += 1
                    else:
                        errores_xml += 1

                elif lower_name.endswith('.zip'):
                    if declared_size > MAX_ZIP_DOWNLOAD_SIZE:
                        continue
                    zip_bytes = _descargar_bytes_adjunto(service, msg_id, part)
                    if not zip_bytes or len(zip_bytes) > MAX_ZIP_DOWNLOAD_SIZE:
                        continue
                    try:
                        xml_entries = extraer_xmls_de_zip(zip_bytes)
                    except ValueError:
                        errores_xml += 1
                        continue

                    for entry_name, entry_bytes in xml_entries:
                        att_key = f'zip:{part_path}:{_sanitizar_nombre_archivo(filename)}:{entry_name}'[:255]
                        res = _guardar_xml_en_bandeja(
                            cuenta=cuenta,
                            msg_id=msg_id,
                            attachment_key=att_key,
                            nombre_archivo=os.path.basename(entry_name.replace('\\', '/')),
                            xml_bytes=entry_bytes,
                            remitente_email=remitente_email,
                            remitente_nombre=remitente_nombre,
                            asunto=asunto,
                            fecha_correo=fecha_correo,
                        )
                        if res == 'nueva':
                            nuevas += 1
                        elif res == 'duplicada':
                            duplicadas += 1
                        else:
                            errores_xml += 1

        cuenta.ultima_sincronizacion = timezone.now()
        cuenta.ultimo_error = ''
        cuenta.save(update_fields=['ultima_sincronizacion', 'ultimo_error', 'updated_at'])

    except Exception as exc:
        # Evitar filtrar credenciales o tokens en mensajes de error
        error_conexion = str(exc)[:500]
        logger.error('Error sincronizando cuenta Gmail %s: %s', cuenta.email_cuenta, error_conexion)
        cuenta.ultimo_error = error_conexion
        cuenta.save(update_fields=['ultimo_error', 'updated_at'])

    return {
        'cuenta_id': cuenta.id,
        'email_cuenta': cuenta.email_cuenta,
        'nuevas': nuevas,
        'duplicadas': duplicadas,
        'errores_xml': errores_xml,
        'error_conexion': error_conexion,
    }


def sincronizar_bandeja_xml(cuenta: ConfiguracionCorreoXML | None = None) -> dict[str, Any]:
    """
    Sincroniza la bandeja XML desde una cuenta específica o desde todas
    las cuentas activas vinculadas con Gmail OAuth2.
    """
    if cuenta is not None:
        cuentas = [cuenta] if cuenta.oauth_token_json_enc else []
    else:
        cuentas = list(
            ConfiguracionCorreoXML.objects
            .filter(activa=True)
            .exclude(oauth_token_json_enc='')
        )

    detalle = [_sincronizar_cuenta(c) for c in cuentas]
    return {
        'cuentas_procesadas': len(detalle),
        'nuevas': sum(d['nuevas'] for d in detalle),
        'duplicadas': sum(d['duplicadas'] for d in detalle),
        'errores': sum(d['errores_xml'] for d in detalle),
        'errores_conexion': sum(1 for d in detalle if d['error_conexion']),
        'detalle': detalle,
    }
