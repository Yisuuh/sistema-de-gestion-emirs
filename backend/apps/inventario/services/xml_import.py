"""
Servicio compartido de parseo e importación de facturas CFDI en formato XML.
Utilizado tanto por ImportarXMLView (subida manual) como por la Bandeja XML de Gmail.
"""
from __future__ import annotations

import math
import os
import re
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

import defusedxml.ElementTree as ET
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from ..models import EntradaInventario, Marca, Producto, Proveedor

INDICES_VELOCIDAD_VALIDOS = ['T', 'H', 'V', 'W', 'Y', 'Z']
MAX_XML_SIZE = 5 * 1024 * 1024  # 5 MB
TFD_NAMESPACE = 'http://www.sat.gob.mx/TimbreFiscalDigital'
CFDI4_NAMESPACE = 'http://www.sat.gob.mx/cfd/4'
CFDI3_NAMESPACE = 'http://www.sat.gob.mx/cfd/3'


def calcular_precio_venta_sugerido(
    precio_compra: Decimal | float | int | str,
    medida: str = '',
    incluye_iva: bool = False,
) -> Decimal:
    """
    Calcula el precio de venta sugerido basado en el Tabulador de Utilidad por Rin oficial de EmirS.
    """
    precio_dec = Decimal(str(precio_compra))
    if precio_dec <= Decimal('0'):
        raise ValueError("El precio de compra debe ser mayor a 0.")

    rin = 16
    if medida:
        match_r = re.search(r'R\s*(\d{2}(?:\.\d+)?)', medida, re.IGNORECASE)
        if match_r:
            try:
                rin = int(float(match_r.group(1)))
            except ValueError:
                pass
        else:
            matches = re.findall(r'\b(1[3-9]|2[0-4])\b', medida)
            if matches:
                rin = int(matches[-1])
            else:
                match_digits = re.search(r'(1[3-9]|2[0-4])', medida)
                if match_digits:
                    rin = int(match_digits.group(1))

    if rin <= 15:
        m1 = 400
    elif rin == 16:
        m1 = 450
    elif rin in (17, 18):
        m1 = 700
    elif rin >= 19:
        m1 = 850
    else:
        m1 = 450

    factor_financiamiento = Decimal('1.0790')
    costo_con_iva = precio_dec if incluye_iva else precio_dec * Decimal('1.16')
    costo_financiado = costo_con_iva * factor_financiamiento
    m1_financiado = Decimal(str(m1)) * factor_financiamiento
    base_total = float(costo_financiado + m1_financiado)
    precio_redondeado = math.ceil(math.floor(base_total) / 5.0) * 5
    return Decimal(str(precio_redondeado)).quantize(Decimal('0.01'))


def parsear_descripcion_llanta(descripcion: str, codigo: str) -> dict[str, Any]:
    """
    Extrae medida, índice de carga, índice de velocidad, marca y modelo
    a partir de la descripción de un concepto CFDI.
    """
    desc = (descripcion or '').strip()
    if codigo and desc.upper().startswith(codigo.upper()):
        desc = desc[len(codigo):].strip()

    medida_match = re.search(r'(\d{3}/\d{2}R\d{2}(?:\.\d+)?)', desc)
    medida = medida_match.group(1) if medida_match else ''

    indice_carga = 82
    indice_velocidad = 'H'
    marca_nombre = ''
    modelo = ''

    if medida and medida_match:
        resto = desc[medida_match.end():].strip()

        load_speed = re.match(r'^(\d+)\s*([A-Z])\b', resto)
        if load_speed:
            indice_carga = int(load_speed.group(1))
            indice_velocidad = load_speed.group(2)
            resto = resto[load_speed.end():].strip()

        if indice_velocidad not in INDICES_VELOCIDAD_VALIDOS:
            indice_velocidad = 'H'

        partes = resto.split()
        if partes:
            marca_nombre = partes[0]
            modelo = ' '.join(partes[1:])

    return {
        'medida': medida,
        'indice_carga': indice_carga,
        'indice_velocidad': indice_velocidad,
        'marca_nombre': marca_nombre,
        'modelo': modelo,
    }


def extraer_tasa_iva_concepto(
    concepto: Any,
    ns: dict[str, str],
    fallback_tasa_iva: Decimal,
) -> Decimal:
    """
    Extrae la tasa de IVA (Impuesto="002", TipoFactor="Tasa") de un nodo <cfdi:Concepto>.
    Si el concepto no incluye nodo <cfdi:Impuestos>, aplica fallback_tasa_iva.
    """
    impuestos_node = concepto.find('cfdi:Impuestos', ns)
    if impuestos_node is None:
        return fallback_tasa_iva

    for traslado in impuestos_node.findall('cfdi:Traslados/cfdi:Traslado', ns):
        if traslado.get('Impuesto') == '002' and traslado.get('TipoFactor') == 'Tasa':
            tasa_raw = traslado.get('TasaOCuota')
            if tasa_raw is not None:
                try:
                    tasa = Decimal(str(tasa_raw))
                except InvalidOperation:
                    return Decimal('0.00')
                if tasa < Decimal('0'):
                    raise ValueError("La tasa de IVA (TasaOCuota) no puede ser negativa.")
                return tasa
    return Decimal('0.00')


def parsear_cfdi(xml_bytes: bytes) -> dict[str, Any]:
    """
    Parsea un archivo XML CFDI (4.0 o 3.3) usando defusedxml y devuelve los datos relevantes,
    incluyendo el UUID del TimbreFiscalDigital.
    """
    root = ET.fromstring(xml_bytes)

    cfdi_ns = CFDI3_NAMESPACE if root.tag.startswith(f'{{{CFDI3_NAMESPACE}}}') else CFDI4_NAMESPACE
    ns = {
        'cfdi': cfdi_ns,
        'tfd': TFD_NAMESPACE,
    }

    serie = root.get('Serie', '')
    folio = root.get('Folio', '')
    fecha = root.get('Fecha', '')
    subtotal = root.get('SubTotal', '0')
    total = root.get('Total', '0')

    try:
        subtotal_dec = Decimal(str(subtotal or '0'))
    except InvalidOperation:
        subtotal_dec = Decimal('0')
    try:
        total_dec = Decimal(str(total or '0'))
    except InvalidOperation:
        total_dec = Decimal('0')

    fallback_tasa_iva = Decimal('0.16') if total_dec > subtotal_dec else Decimal('0.00')

    numero_factura = f"{serie}{folio}".strip() or folio
    fecha_compra = fecha[:10] if fecha else None

    condiciones_pago = root.get('CondicionesDePago', '').strip()
    metodo_pago_cfdi = root.get('MetodoPago', '').strip()
    dias_credito = None
    if condiciones_pago:
        match_dias = re.search(r'(\d+)\s*(?:d[ií]as|d\b)?', condiciones_pago, re.IGNORECASE)
        if match_dias:
            try:
                dias_credito = int(match_dias.group(1))
            except ValueError:
                pass

    fecha_vencimiento = None
    if fecha_compra and dias_credito and dias_credito > 0:
        try:
            base_date = datetime.strptime(fecha_compra, '%Y-%m-%d').date()
            fecha_vencimiento = (base_date + timedelta(days=dias_credito)).isoformat()
        except Exception:
            pass

    emisor = root.find('cfdi:Emisor', ns)
    proveedor_nombre = emisor.get('Nombre', '').strip() if emisor is not None else ''
    proveedor_rfc = emisor.get('Rfc', '').strip() if emisor is not None else ''

    tfd = root.find('.//tfd:TimbreFiscalDigital', ns)
    cfdi_uuid = (tfd.get('UUID') or '').strip() if tfd is not None else ''

    items = []
    for concepto in root.findall('cfdi:Conceptos/cfdi:Concepto', ns):
        codigo = concepto.get('NoIdentificacion', '').strip()
        descripcion = concepto.get('Descripcion', '').strip()
        cantidad_raw = concepto.get('Cantidad', '0')
        valor_unitario_raw = concepto.get('ValorUnitario', '0')

        try:
            cantidad = int(float(cantidad_raw))
        except (ValueError, TypeError):
            raise ValueError(f"La cantidad del concepto '{codigo or descripcion}' no es válida.")
        if cantidad <= 0:
            raise ValueError(f"La cantidad del concepto '{codigo or descripcion}' debe ser mayor a 0.")

        try:
            precio_sin_iva_dec = Decimal(str(valor_unitario_raw or '0'))
        except InvalidOperation:
            raise ValueError(f"El ValorUnitario del concepto '{codigo or descripcion}' no es válido.")
        if precio_sin_iva_dec < Decimal('0'):
            raise ValueError(f"El ValorUnitario del concepto '{codigo or descripcion}' no puede ser negativo.")

        tasa_iva = extraer_tasa_iva_concepto(concepto, ns, fallback_tasa_iva)
        precio_con_iva_dec = precio_sin_iva_dec * (Decimal('1') + tasa_iva)

        precio_compra_sin_iva = round(float(precio_sin_iva_dec), 4)
        precio_compra_con_iva = round(float(precio_con_iva_dec), 4)

        info = parsear_descripcion_llanta(descripcion, codigo)
        if precio_con_iva_dec > Decimal('0'):
            precio_sug = calcular_precio_venta_sugerido(
                precio_con_iva_dec,
                info.get('medida', ''),
                incluye_iva=True,
            )
        else:
            precio_sug = Decimal('0.00')

        items.append({
            'codigo': codigo,
            'descripcion': descripcion,
            'cantidad': cantidad,
            'precio_compra_sin_iva': precio_compra_sin_iva,
            'precio_compra_con_iva': precio_compra_con_iva,
            'tasa_iva': float(tasa_iva),
            'precio_compra': precio_compra_con_iva,
            'precio_venta_sugerido': float(precio_sug),
            **info,
        })

    return {
        'cfdi_uuid': cfdi_uuid,
        'numero_factura': numero_factura,
        'fecha_compra': fecha_compra,
        'fecha_vencimiento': fecha_vencimiento,
        'dias_credito': dias_credito,
        'condiciones_de_pago': condiciones_pago,
        'metodo_pago_cfdi': metodo_pago_cfdi,
        'subtotal': subtotal,
        'total': total,
        'proveedor': {
            'nombre': proveedor_nombre,
            'rfc': proveedor_rfc,
        },
        'items': items,
    }


@transaction.atomic
def guardar_factura_cfdi(
    datos: dict[str, Any],
    usuario: Any,
    xml_content: bytes | str | None = None,
    nombre_archivo: str | None = None,
) -> dict[str, Any]:
    """
    Persiste de forma atómica el proveedor, marcas, productos y entradas de inventario
    correspondientes a una factura CFDI parseada.
    """
    prov_data = datos['proveedor']
    prov_nombre = (prov_data.get('nombre') or '').strip()
    if not prov_nombre:
        raise ValueError("El nombre del proveedor no puede estar vacío.")

    proveedor, _ = Proveedor.objects.get_or_create(
        nombre=prov_nombre,
        defaults={
            'contacto': prov_data.get('rfc', ''),
            'activo': True,
        },
    )
    if proveedor.dias_credito == 0 and datos.get('dias_credito'):
        proveedor.dias_credito = datos['dias_credito']
        proveedor.save(update_fields=['dias_credito'])

    xml_bytes: bytes | None = None
    if xml_content is not None:
        xml_bytes = xml_content.encode('utf-8') if isinstance(xml_content, str) else xml_content

    safe_filename = None
    if xml_bytes:
        raw_name = nombre_archivo or f"{datos.get('numero_factura') or 'factura'}.xml"
        safe_filename = re.sub(r'[^A-Za-z0-9._-]', '_', os.path.basename(raw_name)) or 'factura.xml'
        if not safe_filename.lower().endswith('.xml'):
            safe_filename = f'{safe_filename}.xml'

    fecha_compra = datos.get('fecha_compra') or timezone.localdate()
    archivo_guardado_nombre: str | None = None
    resultados = []

    for item in datos['items']:
        codigo = (item.get('codigo') or '').strip()
        if not codigo:
            raise ValueError("El código del producto no puede estar vacío.")

        marca_nombre = (item.get('marca_nombre') or 'SIN MARCA').strip()
        marca, _ = Marca.objects.get_or_create(nombre=marca_nombre)

        iv = item.get('indice_velocidad', 'H')
        if iv not in INDICES_VELOCIDAD_VALIDOS:
            iv = 'H'

        cantidad = int(item.get('cantidad', 0))
        if cantidad <= 0:
            raise ValueError(f"La cantidad para el producto '{codigo}' debe ser mayor a 0.")

        if 'precio_compra_con_iva' in item and item['precio_compra_con_iva'] is not None:
            precio_compra = Decimal(str(item['precio_compra_con_iva'])).quantize(Decimal('0.01'))
            precio_incluye_iva = True
        else:
            precio_compra = Decimal(str(item['precio_compra']))
            precio_incluye_iva = False

        if precio_compra <= Decimal('0'):
            raise ValueError(f"El precio de compra para el producto '{codigo}' debe ser mayor a 0.")

        precio_venta_sugerido = calcular_precio_venta_sugerido(
            precio_compra,
            item.get('medida', ''),
            incluye_iva=precio_incluye_iva,
        )
        precio_venta_final = (
            Decimal(str(item['precio_venta'])).quantize(Decimal('0.01'))
            if item.get('precio_venta')
            else precio_venta_sugerido
        )
        if precio_venta_final <= Decimal('0'):
            raise ValueError(f"El precio de venta para el producto '{codigo}' debe ser mayor a 0.")

        producto, producto_creado = Producto.objects.get_or_create(
            codigo=codigo,
            defaults={
                'medida': item.get('medida', ''),
                'marca': marca,
                'modelo': item.get('modelo', ''),
                'indice_carga': item.get('indice_carga', 82),
                'indice_velocidad': iv,
                'precio_venta': precio_venta_final,
                'stock_minimo': 2,
                'activo': True,
            },
        )
        if not producto_creado:
            producto.precio_venta = precio_venta_final
            producto.save(update_fields=['precio_venta'])

        entrada = EntradaInventario(
            producto=producto,
            proveedor=proveedor,
            cantidad=item['cantidad'],
            precio_compra=precio_compra,
            precio_incluye_iva=precio_incluye_iva,
            fecha_compra=fecha_compra,
            fecha_vencimiento=datos.get('fecha_vencimiento'),
            numero_factura=datos.get('numero_factura', ''),
            en_inventario=True,
            created_by=usuario,
        )
        if archivo_guardado_nombre:
            entrada.archivo_factura = archivo_guardado_nombre
            entrada.save()
        elif xml_bytes and safe_filename:
            entrada.archivo_factura.save(safe_filename, ContentFile(xml_bytes), save=True)
            archivo_guardado_nombre = entrada.archivo_factura.name
        else:
            entrada.save()

        resultados.append({
            'codigo': item['codigo'],
            'descripcion': item['descripcion'],
            'cantidad': item['cantidad'],
            'precio_compra': float(precio_compra),
            'precio_incluye_iva': precio_incluye_iva,
            'precio_venta': float(precio_venta_final),
            'producto_creado': producto_creado,
            'producto_id': producto.id,
            'entrada_id': entrada.id,
        })

    return {
        'proveedor': proveedor.nombre,
        'proveedor_id': proveedor.id,
        'cfdi_uuid': datos.get('cfdi_uuid', ''),
        'numero_factura': datos.get('numero_factura', ''),
        'fecha_compra': datos.get('fecha_compra'),
        'total_items': len(resultados),
        'items': resultados,
    }
