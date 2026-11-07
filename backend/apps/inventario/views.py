import re
import csv
import math
import xml.etree.ElementTree as ET
from decimal import Decimal

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from datetime import datetime, timedelta
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Sum, Max, OuterRef, Subquery, Q, F, ProtectedError
from django.http import HttpResponse

from .models import Marca, Proveedor, Producto, EntradaInventario, SalidaInventario, PagoProveedor
from .serializers import (
    MarcaSerializer, ProveedorSerializer, ProductoSerializer,
    EntradaInventarioSerializer, SalidaInventarioSerializer,
    PagoProveedorSerializer,
)
from apps.ventas.views import StandardPagination

INDICES_VELOCIDAD_VALIDOS = ['T', 'H', 'V', 'W', 'Y', 'Z']


def _calcular_precio_venta_sugerido(precio_compra, medida: str = '') -> Decimal:
    """
    Calcula el precio de venta sugerido basado en el Tabulador de Utilidad por Rin oficial de EmirS.
    """
    precio_compra = Decimal(str(precio_compra))
    if precio_compra <= Decimal('0'):
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
            # Si no detecta letra R, buscar 2 dígitos de rin (13 a 24)
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
    costo_con_iva = precio_compra * Decimal('1.16')
    costo_financiado = costo_con_iva * factor_financiamiento
    m1_financiado = Decimal(str(m1)) * factor_financiamiento
    base_total = float(costo_financiado + m1_financiado)
    precio_redondeado = math.ceil(math.floor(base_total) / 5.0) * 5
    return Decimal(str(precio_redondeado)).quantize(Decimal('0.01'))


def _parsear_descripcion_llanta(descripcion: str, codigo: str) -> dict:
    """
    Extrae medida, índice de carga, índice de velocidad, marca y modelo
    a partir de la descripción de un concepto CFDI.

    Ejemplo de entrada:
        descripcion = "NEXN-13826NX 215/70R15 98T Nexen N Priz SH9i"
        codigo      = "NEXN-13826NX"
    """
    # Quitar el código al inicio si la descripción lo repite
    desc = descripcion.strip()
    if codigo and desc.upper().startswith(codigo.upper()):
        desc = desc[len(codigo):].strip()

    # Buscar medida: 215/70R15 o 235/65R17.5
    medida_match = re.search(r'(\d{3}/\d{2}R\d{2}(?:\.\d+)?)', desc)
    medida = medida_match.group(1) if medida_match else ''

    indice_carga = 82       # valor por defecto razonable
    indice_velocidad = 'H'  # valor por defecto
    marca_nombre = ''
    modelo = ''

    if medida and medida_match:
        resto = desc[medida_match.end():].strip()

        # "98T" → carga=98, velocidad=T
        load_speed = re.match(r'^(\d+)\s*([A-Z])\b', resto)
        if load_speed:
            indice_carga = int(load_speed.group(1))
            indice_velocidad = load_speed.group(2)
            resto = resto[load_speed.end():].strip()

        if indice_velocidad not in INDICES_VELOCIDAD_VALIDOS:
            indice_velocidad = 'H'

        # Primera palabra = marca, el resto = modelo
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


def _parsear_cfdi(xml_bytes: bytes) -> dict:
    """Parsea un archivo XML CFDI 4.0 y devuelve los datos relevantes."""
    ns = {'cfdi': 'http://www.sat.gob.mx/cfd/4'}
    root = ET.fromstring(xml_bytes)

    serie = root.get('Serie', '')
    folio = root.get('Folio', '')
    fecha = root.get('Fecha', '')
    subtotal = root.get('SubTotal', '0')
    total = root.get('Total', '0')

    numero_factura = f"{serie}{folio}".strip() or folio
    fecha_compra = fecha[:10] if fecha else None  # YYYY-MM-DD

    # Condiciones de pago y crédito en CFDI
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

    items = []
    for concepto in root.findall('cfdi:Conceptos/cfdi:Concepto', ns):
        codigo = concepto.get('NoIdentificacion', '').strip()
        descripcion = concepto.get('Descripcion', '').strip()
        cantidad_raw = concepto.get('Cantidad', '0')
        valor_unitario_raw = concepto.get('ValorUnitario', '0')

        cantidad = int(float(cantidad_raw))
        precio_compra = round(float(valor_unitario_raw), 4)

        info = _parsear_descripcion_llanta(descripcion, codigo)
        precio_sug = _calcular_precio_venta_sugerido(Decimal(str(precio_compra)), info.get('medida', ''))

        items.append({
            'codigo': codigo,
            'descripcion': descripcion,
            'cantidad': cantidad,
            'precio_compra': precio_compra,
            'precio_venta_sugerido': float(precio_sug),
            **info,
        })

    return {
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


class ImportarXMLView(APIView):
    """
    Endpoint para importar facturas CFDI en formato XML.

    POST /api/inventario/importar-xml/
        - accion = 'preview'  → parsea el XML y devuelve los datos (sin guardar)
        - accion = 'guardar'  → parsea y persiste proveedor, productos y entradas
    """
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        xml_file = request.FILES.get('xml')
        if not xml_file:
            return Response({'error': 'No se proporcionó el archivo XML.'}, status=400)

        accion = request.data.get('accion', 'preview')

        try:
            xml_bytes = xml_file.read()
            datos = _parsear_cfdi(xml_bytes)
        except ET.ParseError as exc:
            return Response({'error': f'El archivo no es un XML válido: {exc}'}, status=400)
        except Exception as exc:
            return Response({'error': f'Error al procesar el XML: {exc}'}, status=400)

        if not datos['items']:
            return Response({'error': 'No se encontraron conceptos en el XML.'}, status=400)

        if accion == 'preview':
            return Response({'accion': 'preview', 'datos': datos})

        if accion == 'guardar':
            if not (getattr(request.user, 'rol', None) == 'admin' or request.user.is_staff or request.user.is_superuser):
                raise PermissionDenied('Solo los administradores pueden importar facturas y registrar productos en inventario.')
            try:
                resultado = self._guardar(datos, request.user)
                return Response({'accion': 'guardado', 'resultado': resultado})
            except Exception as exc:
                return Response({'error': f'Error al guardar: {exc}'}, status=400)

        return Response({'error': 'Acción no reconocida. Use "preview" o "guardar".'}, status=400)

    @transaction.atomic
    def _guardar(self, datos: dict, usuario) -> dict:
        # ── Proveedor ────────────────────────────────────────────────────────────
        prov_data = datos['proveedor']
        proveedor, _ = Proveedor.objects.get_or_create(
            nombre=prov_data['nombre'],
            defaults={
                'contacto': prov_data.get('rfc', ''),
                'activo': True,
            },
        )
        if proveedor.dias_credito == 0 and datos.get('dias_credito'):
            proveedor.dias_credito = datos['dias_credito']
            proveedor.save(update_fields=['dias_credito'])

        resultados = []
        for item in datos['items']:
            # ── Marca ─────────────────────────────────────────────────────────────
            marca_nombre = (item.get('marca_nombre') or 'SIN MARCA').strip()
            marca, _ = Marca.objects.get_or_create(nombre=marca_nombre)

            # ── Producto ──────────────────────────────────────────────────────────
            iv = item.get('indice_velocidad', 'H')
            if iv not in INDICES_VELOCIDAD_VALIDOS:
                iv = 'H'

            cantidad = int(item.get('cantidad', 0))
            if cantidad <= 0:
                raise ValueError(f"La cantidad para el producto '{item.get('codigo', '')}' debe ser mayor a 0.")

            precio_compra = Decimal(str(item['precio_compra']))
            if precio_compra <= Decimal('0'):
                raise ValueError(f"El precio de compra para el producto '{item.get('codigo', '')}' debe ser mayor a 0.")

            precio_venta_sugerido = _calcular_precio_venta_sugerido(precio_compra, item.get('medida', ''))
            precio_venta_final = (
                Decimal(str(item['precio_venta'])).quantize(Decimal('0.01'))
                if item.get('precio_venta')
                else precio_venta_sugerido
            )
            if precio_venta_final <= Decimal('0'):
                raise ValueError(f"El precio de venta para el producto '{item.get('codigo', '')}' debe ser mayor a 0.")

            producto, producto_creado = Producto.objects.get_or_create(
                codigo=item['codigo'],
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

            # ── Entrada de inventario ─────────────────────────────────────────────
            entrada = EntradaInventario.objects.create(
                producto=producto,
                proveedor=proveedor,
                cantidad=item['cantidad'],
                precio_compra=precio_compra,
                fecha_compra=datos['fecha_compra'],
                fecha_vencimiento=datos.get('fecha_vencimiento'),
                numero_factura=datos['numero_factura'],
                en_inventario=True,
                created_by=usuario,
            )

            resultados.append({
                'codigo': item['codigo'],
                'descripcion': item['descripcion'],
                'cantidad': item['cantidad'],
                'precio_compra': float(precio_compra),
                'precio_venta': float(precio_venta_final),
                'producto_creado': producto_creado,
                'producto_id': producto.id,
                'entrada_id': entrada.id,
            })

        return {
            'proveedor': proveedor.nombre,
            'numero_factura': datos['numero_factura'],
            'fecha_compra': datos['fecha_compra'],
            'total_items': len(resultados),
            'items': resultados,
        }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _calcular_adeudo_proveedor(proveedor):
    """
    Devuelve el resumen de adeudo del proveedor.
    La deuda total = suma de todas las EntradaInventario (sin importar si fue
    pagada o no con productos vendidos: las ventas no amortizan la deuda,
    sólo los PagoProveedor).
    Para cada línea de factura se muestra cuánto del total comprado ya fue
    vendido (proporcionalmente respecto al stock total del producto).
    """
    entradas = (
        EntradaInventario.objects
        .filter(proveedor=proveedor)
        .select_related('producto', 'producto__marca')
        .order_by('fecha_compra', 'created_at')
    )

    # Pre-cálculo de salidas totales por producto (una sola consulta)
    productos_ids = entradas.values_list('producto_id', flat=True).distinct()
    salidas_por_producto = {}
    for pid in productos_ids:
        total = (
            SalidaInventario.objects
            .filter(producto_id=pid)
            .aggregate(total=Sum('cantidad'))['total'] or 0
        )
        salidas_por_producto[pid] = total

    # Agrupar entradas por número de factura
    facturas: dict = {}
    monto_total_deuda = Decimal('0')
    hoy = timezone.localdate()

    for entrada in entradas:
        num_factura = (entrada.numero_factura or '').strip()
        fol_remision = (entrada.folio_remision or '').strip()

        if num_factura:
            key = f"FAC-{num_factura}"
            etiqueta = num_factura
        elif fol_remision:
            key = f"REM-{fol_remision}"
            etiqueta = f"Remisión: {fol_remision}"
        else:
            key = f"ENT-{entrada.id}"
            etiqueta = f"Entrada #{entrada.id} (Sin Factura)"

        if key not in facturas:
            fv = entrada.fecha_vencimiento
            if not fv and proveedor and proveedor.dias_credito > 0:
                base_d = entrada.fecha_factura or entrada.fecha_compra or hoy
                fv = base_d + timedelta(days=proveedor.dias_credito)

            facturas[key] = {
                'key': key,
                'numero_factura': etiqueta,
                'folio_remision': fol_remision,
                'fecha_compra': str(entrada.fecha_compra),
                'fecha_vencimiento': fv,
                'monto_total': Decimal('0'),
                'monto_vendido': Decimal('0'),
                'items': [],
            }
        else:
            if entrada.fecha_vencimiento and not facturas[key].get('fecha_vencimiento'):
                facturas[key]['fecha_vencimiento'] = entrada.fecha_vencimiento
            if fol_remision and not facturas[key].get('folio_remision'):
                facturas[key]['folio_remision'] = fol_remision

        monto_linea = entrada.cantidad * entrada.precio_compra

        # Ventas proporcionales atribuibles a esta entrada
        salidas_totales_prod = salidas_por_producto.get(entrada.producto_id, 0)
        entradas_totales_prod = (
            EntradaInventario.objects
            .filter(producto_id=entrada.producto_id)
            .aggregate(t=Sum('cantidad'))['t'] or 1
        )
        ratio = min(Decimal('1'), Decimal(salidas_totales_prod) / Decimal(entradas_totales_prod))
        vendido_linea = (ratio * Decimal(entrada.cantidad)).quantize(Decimal('1'))
        monto_vendido_linea = vendido_linea * entrada.precio_compra

        stock_actual = entrada.producto.stock_actual

        if stock_actual <= 0:
            estado_stock = 'agotado'
        elif stock_actual < entrada.producto.stock_minimo:
            estado_stock = 'bajo'
        else:
            estado_stock = 'disponible'

        facturas[key]['items'].append({
            'key': key,
            'numero_factura': etiqueta,
            'entrada_id': entrada.id,
            'producto_id': entrada.producto_id,
            'producto_codigo': entrada.producto.codigo,
            'producto_descripcion': str(entrada.producto),
            'medida': entrada.producto.medida,
            'cantidad_comprada': entrada.cantidad,
            'precio_compra': float(entrada.precio_compra),
            'monto_linea': float(monto_linea),
            'vendido': int(vendido_linea),
            'monto_vendido_linea': float(monto_vendido_linea),
            'stock_actual': stock_actual,
            'estado_stock': estado_stock,
        })
        facturas[key]['monto_total'] += monto_linea
        facturas[key]['monto_vendido'] += monto_vendido_linea
        monto_total_deuda += monto_linea

    # Pagos registrados
    pagos_qs = PagoProveedor.objects.filter(proveedor=proveedor).order_by('-fecha', '-created_at')

    for f in facturas.values():
        num_fac = f.get('numero_factura', '').strip()
        key = f.get('key', '').strip()
        folio_rem = f.get('folio_remision', '').strip() if f.get('folio_remision') else ''

        candidatos = {c.strip().upper() for c in [num_fac, key, folio_rem, f"REM-{folio_rem}" if folio_rem else ""] if c and c.strip()}
        pagos_factura = [p for p in pagos_qs if p.numero_factura and p.numero_factura.strip().upper() in candidatos]

        monto_pagado_fac = sum(Decimal(str(p.monto)) for p in pagos_factura)
        saldo_pendiente_fac = max(Decimal('0.00'), f['monto_total'] - monto_pagado_fac)

        fv = f.get('fecha_vencimiento')
        if fv:
            if isinstance(fv, str):
                try:
                    fv = datetime.strptime(fv, '%Y-%m-%d').date()
                except Exception:
                    pass
            try:
                dias_restantes = (fv - hoy).days
            except Exception:
                dias_restantes = None
        else:
            dias_restantes = None

        if saldo_pendiente_fac <= Decimal('0.00'):
            estado_fac = 'pagada'
        elif dias_restantes is not None and dias_restantes < 0 and saldo_pendiente_fac > Decimal('0.00'):
            estado_fac = 'vencida'
        elif monto_pagado_fac > Decimal('0.00') and saldo_pendiente_fac > Decimal('0.00'):
            estado_fac = 'abono_parcial'
        else:
            estado_fac = 'vigente'

        f['monto_pagado'] = float(monto_pagado_fac)
        f['saldo_pendiente'] = float(saldo_pendiente_fac)
        f['fecha_vencimiento'] = str(fv) if fv else None
        f['dias_restantes'] = dias_restantes
        f['estado'] = estado_fac
        f['pagos'] = [
            {
                'id': p.id,
                'fecha': str(p.fecha),
                'monto': float(p.monto),
                'metodo_pago': p.metodo_pago,
                'referencia': p.referencia,
                'comprobante': p.comprobante.url if p.comprobante else None,
                'notas': p.notas,
            }
            for p in pagos_factura
        ]

    monto_total_deuda = sum(Decimal(str(f['monto_total'])) for f in facturas.values())
    monto_total_pagado = pagos_qs.aggregate(t=Sum('monto'))['t'] or Decimal('0.00')
    saldo_pendiente_total = max(Decimal('0.00'), monto_total_deuda - monto_total_pagado)
    cuenta_vencida = sum(Decimal(str(f['saldo_pendiente'])) for f in facturas.values() if f.get('estado') == 'vencida')
    cuenta_vencida = min(cuenta_vencida, saldo_pendiente_total)
    cuenta_corriente = max(Decimal('0.00'), saldo_pendiente_total - cuenta_vencida)

    # Convertir montos a float para la respuesta JSON
    for f in facturas.values():
        f['monto_total'] = float(f['monto_total'])
        f['monto_vendido'] = float(f['monto_vendido'])

    pagos_lista = [
        {
            'id': p.id,
            'fecha': str(p.fecha),
            'monto': float(p.monto),
            'metodo_pago': p.metodo_pago,
            'numero_factura': p.numero_factura,
            'referencia': p.referencia,
            'comprobante': p.comprobante.url if p.comprobante else None,
            'notas': p.notas,
        }
        for p in pagos_qs
    ]

    return {
        'proveedor_id': proveedor.id,
        'proveedor_nombre': proveedor.nombre,
        'proveedor_telefono': proveedor.telefono,
        'total_facturas': len(facturas),
        'monto_total_deuda': float(monto_total_deuda),
        'monto_pagado': float(monto_total_pagado),
        'saldo_pendiente': float(saldo_pendiente_total),
        'cuenta_vencida': float(cuenta_vencida),
        'cuenta_corriente': float(cuenta_corriente),
        'saldo_pendiente_total': float(saldo_pendiente_total),
        'facturas': sorted(facturas.values(), key=lambda x: x['fecha_compra'], reverse=True),
        'pagos': pagos_lista,
    }


class AdeudosResumenView(APIView):
    """
    GET /api/inventario/adeudos/
    Resumen de adeudos agrupado por proveedor.
    Solo muestra proveedores que tienen entradas registradas.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        proveedores_con_entradas = (
            Proveedor.objects
            .filter(entradas__isnull=False)
            .distinct()
            .order_by('nombre')
        )
        resultado = [_calcular_adeudo_proveedor(p) for p in proveedores_con_entradas]
        # Totales globales
        total_deuda_global = sum(r['monto_total_deuda'] for r in resultado)
        total_pagado_global = sum(r['monto_pagado'] for r in resultado)
        saldo_global = sum(r['saldo_pendiente'] for r in resultado)
        total_cuenta_corriente_global = sum(r['cuenta_corriente'] for r in resultado)
        total_cuenta_vencida_global = sum(r['cuenta_vencida'] for r in resultado)
        return Response({
            'total_deuda_global': total_deuda_global,
            'total_pagado_global': total_pagado_global,
            'saldo_global': saldo_global,
            'total_cuenta_corriente_global': total_cuenta_corriente_global,
            'total_cuenta_vencida_global': total_cuenta_vencida_global,
            'proveedores': resultado,
        })


class AdeudoProveedorDetalleView(APIView):
    """
    GET /api/inventario/adeudos/<proveedor_id>/
    Detalle completo de un proveedor: todas sus facturas, líneas y pagos.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, proveedor_id):
        try:
            proveedor = Proveedor.objects.get(pk=proveedor_id)
        except Proveedor.DoesNotExist:
            return Response({'error': 'Proveedor no encontrado.'}, status=404)
        return Response(_calcular_adeudo_proveedor(proveedor))


class PagoProveedorViewSet(viewsets.ModelViewSet):
    """
    CRUD para pagos a proveedores (GET, POST, PUT, PATCH, DELETE).
    Soporta subida de archivos comprobante (multipart/form-data) y JSON.
    """
    queryset = PagoProveedor.objects.select_related('proveedor', 'registrado_por').all()
    serializer_class = PagoProveedorSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['proveedor']
    ordering_fields = ['fecha', 'monto']
    ordering = ['-fecha']

    def _verificar_rol_admin(self, user):
        if not (getattr(user, 'rol', None) == 'admin' or user.is_staff or user.is_superuser):
            raise PermissionDenied('Solo los administradores pueden modificar o eliminar pagos a proveedores.')

    def update(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user)


# ── ViewSets de catálogos ───────────────────────────────────────────────────

class MarcaViewSet(viewsets.ModelViewSet):
    queryset = Marca.objects.all()
    serializer_class = MarcaSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nombre']
    ordering_fields = ['nombre']
    ordering = ['nombre']

    def _verificar_rol_admin(self, user):
        if not (getattr(user, 'rol', None) == 'admin' or user.is_staff or user.is_superuser):
            raise PermissionDenied('Solo los administradores pueden gestionar las marcas de catálogo.')

    def create(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            mensaje = 'No se puede eliminar la marca porque tiene productos asociados en catálogo. Puedes desactivarla.'
            return Response({'detail': mensaje, 'error': mensaje}, status=status.HTTP_400_BAD_REQUEST)


class ProveedorViewSet(viewsets.ModelViewSet):
    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['activo']
    search_fields = ['nombre', 'contacto', 'telefono', 'email']
    ordering_fields = ['nombre', 'dias_credito', 'created_at']
    ordering = ['nombre']

    def _verificar_rol_admin(self, user):
        if not (getattr(user, 'rol', None) == 'admin' or user.is_staff or user.is_superuser):
            raise PermissionDenied('Solo los administradores pueden gestionar los proveedores.')

    def create(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            mensaje = 'No se puede eliminar el proveedor porque tiene entradas o facturas asociadas en inventario. Puedes desactivarlo.'
            return Response({'detail': mensaje, 'error': mensaje}, status=status.HTTP_400_BAD_REQUEST)



def normalizar_termino_medida(termino: str) -> list:
    """
    Normaliza búsquedas rápidas de medidas de llantas como:
    '2055516', '205 55 16', '205-55-16', '205/55R16', '205/55 R16'
    Retorna una lista de variantes equivalentes si detecta el patrón
    (ancho: 3 dígitos)(perfil: 2 dígitos)(rin: 2 dígitos), o lista vacía si no coincide.
    """
    if not termino:
        return []
    limpio = termino.strip().upper()
    match = re.match(r'^(\d{3})[\s/\-]*(\d{2})[\s/\-R]*(\d{2}(?:\.\d+)?)$', limpio)
    if not match:
        solo_digitos = re.sub(r'[^0-9]', '', limpio)
        if len(solo_digitos) == 7:
            ancho, perfil, rin = solo_digitos[:3], solo_digitos[3:5], solo_digitos[5:7]
        else:
            return []
    else:
        ancho, perfil, rin = match.group(1), match.group(2), match.group(3)

    return [
        f"{ancho}/{perfil} R{rin}",
        f"{ancho}/{perfil}R{rin}",
        f"{ancho}-{perfil}-{rin}",
        f"{ancho} {perfil} {rin}",
        f"{ancho}{perfil}{rin}",
        f"{ancho}/{perfil}-{rin}",
    ]


class ProductoViewSet(viewsets.ModelViewSet):
    queryset = Producto.objects.select_related('marca').all()
    serializer_class = ProductoSerializer
    pagination_class = StandardPagination
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['marca', 'activo', 'indice_velocidad']
    search_fields = ['codigo', 'medida', 'modelo', 'marca__nombre']
    ordering_fields = ['medida', 'precio_venta', 'codigo']

    def get_queryset(self):
        qs = super().get_queryset()
        medida = self.request.query_params.get('medida')
        if medida:
            variantes = normalizar_termino_medida(medida)
            if variantes:
                q_med = Q(medida__icontains=medida)
                for v in variantes:
                    q_med |= Q(medida__icontains=v)
                qs = qs.filter(q_med)
            else:
                qs = qs.filter(medida__icontains=medida)

        search = self.request.query_params.get('search')
        if search:
            termino = search.strip()
            q_filter = (
                Q(codigo__icontains=termino) |
                Q(medida__icontains=termino) |
                Q(modelo__icontains=termino) |
                Q(marca__nombre__icontains=termino)
            )
            variantes = normalizar_termino_medida(termino)
            for v in variantes:
                q_filter |= Q(medida__icontains=v)
            qs = qs.filter(q_filter)

        activos = self.request.query_params.get('activos')
        if activos is not None:
            if activos.lower() in ('true', '1', 't'):
                qs = qs.filter(activo=True)
            elif activos.lower() in ('false', '0', 'f'):
                qs = qs.filter(activo=False)

        return qs

    def _verificar_rol_admin(self, user):
        if not (getattr(user, 'rol', None) == 'admin' or user.is_staff or user.is_superuser):
            raise PermissionDenied('Solo los administradores pueden crear, modificar o eliminar productos.')

    def create(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        instance = self.get_object()
        if instance.entradas.exists() or instance.salidas.exists():
            return Response(
                {'error': 'No se puede eliminar definitivamente un producto con historial de entradas o ventas. Desactívelo o archívelo en su lugar.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def stock_bajo(self, request):
        """Productos con stock bajo (stock_actual <= stock_minimo)"""
        productos_stock_bajo = [p for p in self.get_queryset() if p.tiene_stock_bajo and not p.stock_agotado]
        serializer = self.get_serializer(productos_stock_bajo, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def agotados(self, request):
        """Productos agotados"""
        productos_agotados = [p for p in self.get_queryset() if p.stock_agotado]
        serializer = self.get_serializer(productos_agotados, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def consolidado(self, request):
        """
        GET /api/inventario/productos/consolidado/
        Vista consolidada: entradas_total, salidas_total, stock_actual,
        ultimo_precio_compra, precio_venta, precio_descuento por producto.
        """
        activo_param = (request.query_params.get('activo') or 'true').strip().lower()
        if activo_param in ('false', '0'):
            productos = self.get_queryset().filter(activo=False)
        elif activo_param in ('all', 'todos'):
            productos = self.get_queryset()
        else:
            productos = self.get_queryset().filter(activo=True)

        # Último precio de compra por producto
        ultimo_precio_qs = (
            EntradaInventario.objects
            .filter(producto=OuterRef('pk'))
            .order_by('-fecha_compra', '-created_at')
            .values('precio_compra')[:1]
        )
        ultima_factura_qs = (
            EntradaInventario.objects
            .filter(producto=OuterRef('pk'))
            .order_by('-fecha_compra', '-created_at')
            .values('numero_factura')[:1]
        )

        resultado = []
        for p in productos:
            entradas_total = p.entradas.aggregate(t=Sum('cantidad'))['t'] or 0
            salidas_total = p.salidas.aggregate(t=Sum('cantidad'))['t'] or 0
            stock = entradas_total - salidas_total

            ultimo_precio = (
                p.entradas.order_by('-fecha_compra', '-created_at')
                .values_list('precio_compra', flat=True)
                .first()
            )
            ultima_factura = (
                p.entradas.order_by('-fecha_compra', '-created_at')
                .values_list('numero_factura', flat=True)
                .first()
            )

            if stock <= 0:
                estado_stock = 'agotado'
            elif stock <= p.stock_minimo:
                estado_stock = 'stock_bajo'
            else:
                estado_stock = 'disponible'

            resultado.append({
                'id': p.id,
                'codigo': p.codigo,
                'medida': p.medida,
                'marca': p.marca.nombre,
                'marca_id': p.marca_id,
                'modelo': p.modelo,
                'indice_carga': p.indice_carga,
                'indice_velocidad': p.indice_velocidad,
                'activo': p.activo,
                'entradas_total': entradas_total,
                'salidas_total': salidas_total,
                'stock_actual': stock,
                'stock_minimo': p.stock_minimo,
                'precio_venta': float(p.precio_venta),
                'precio_descuento': float(p.precio_descuento) if p.precio_descuento else None,
                'ultimo_precio_compra': float(ultimo_precio) if ultimo_precio else None,
                'ultima_factura': ultima_factura,
                'estado_stock': estado_stock,
                'valor_inventario': round(float(ultimo_precio or 0) * stock, 2),
            })

        # Ordenar por estado (agotados primero para visibilidad)
        orden = {'agotado': 0, 'stock_bajo': 1, 'disponible': 2}
        resultado.sort(key=lambda x: (orden.get(x['estado_stock'], 3), x['medida']))

        total_valor = sum(r['valor_inventario'] for r in resultado)
        total_piezas = sum(r['stock_actual'] for r in resultado)

        return Response({
            'productos': resultado,
            'totales': {
                'total_productos': len(resultado),
                'total_piezas': total_piezas,
                'valor_inventario_total': round(total_valor, 2),
                'agotados': sum(1 for r in resultado if r['estado_stock'] == 'agotado'),
                'stock_bajo': sum(1 for r in resultado if r['estado_stock'] == 'stock_bajo'),
            },
        })

    @action(detail=True, methods=['get'])
    def kardex(self, request, pk=None):
        """
        GET /api/inventario/productos/{id}/kardex/
        Movimientos cronológicos completos de un producto (entradas + salidas).
        """
        producto = self.get_object()
        movimientos = []

        for e in producto.entradas.select_related('proveedor').order_by('fecha_compra', 'created_at'):
            movimientos.append({
                'tipo': 'entrada',
                'fecha': str(e.fecha_compra),
                'cantidad': e.cantidad,
                'precio_unitario': float(e.precio_compra),
                'total': float(e.total_compra),
                'referencia': e.numero_factura,
                'proveedor': e.proveedor.nombre,
                'estado': e.estado,
                'notas': e.notas,
            })

        for s in producto.salidas.select_related('venta').order_by('fecha_venta', 'created_at'):
            movimientos.append({
                'tipo': 'salida',
                'fecha': str(s.fecha_venta),
                'cantidad': s.cantidad,
                'precio_unitario': float(s.precio_venta),
                'total': float(s.total_venta),
                'referencia': s.venta.folio if s.venta else '',
                'utilidad': float(s.utilidad),
                'notas': '',
            })

        movimientos.sort(key=lambda m: m['fecha'])

        # Calcular saldo acumulado
        saldo = 0
        for m in movimientos:
            if m['tipo'] == 'entrada':
                saldo += m['cantidad']
            else:
                saldo -= m['cantidad']
            m['saldo'] = saldo

        return Response({
            'producto': {
                'id': producto.id,
                'codigo': producto.codigo,
                'descripcion': str(producto),
                'medida': producto.medida,
                'stock_actual': producto.stock_actual,
            },
            'movimientos': movimientos,
        })

    @action(detail=False, methods=['get'])
    def exportar_csv(self, request):
        """
        GET /api/inventario/productos/exportar_csv/
        Exporta el inventario consolidado como CSV.
        """
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="inventario.csv"'
        response.write('\ufeff')  # BOM para Excel

        writer = csv.writer(response)
        writer.writerow([
            'Código', 'Medida', 'Marca', 'Modelo', 'IC/IV',
            'Entradas', 'Salidas', 'Stock Actual', 'Stock Mín.',
            'Precio Venta', 'Precio Compra', 'Valor Inventario',
            'Última Factura', 'Estado',
        ])

        for p in self.get_queryset().filter(activo=True).order_by('medida', 'modelo'):
            entradas = p.entradas.aggregate(t=Sum('cantidad'))['t'] or 0
            salidas = p.salidas.aggregate(t=Sum('cantidad'))['t'] or 0
            stock = entradas - salidas
            ultimo_precio = (
                p.entradas.order_by('-fecha_compra', '-created_at')
                .values_list('precio_compra', flat=True).first()
            )
            ultima_factura = (
                p.entradas.order_by('-fecha_compra', '-created_at')
                .values_list('numero_factura', flat=True).first()
            )
            if stock <= 0:
                estado = 'Agotado'
            elif stock <= p.stock_minimo:
                estado = 'Stock Bajo'
            else:
                estado = 'Disponible'

            writer.writerow([
                p.codigo, p.medida, p.marca.nombre, p.modelo,
                f"{p.indice_carga}{p.indice_velocidad}",
                entradas, salidas, stock, p.stock_minimo,
                float(p.precio_venta),
                float(ultimo_precio) if ultimo_precio else '',
                round(float(ultimo_precio or 0) * stock, 2),
                ultima_factura or '',
                estado,
            ])

        return response


class EntradaInventarioViewSet(viewsets.ModelViewSet):
    queryset = EntradaInventario.objects.select_related('producto', 'producto__marca', 'proveedor', 'created_by').all()
    serializer_class = EntradaInventarioSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['proveedor', 'en_inventario', 'factura_consumida', 'estado', 'factura_pendiente']
    search_fields = ['producto__codigo', 'numero_factura', 'folio_remision', 'producto__medida', 'producto__modelo']
    ordering_fields = ['fecha_compra', 'created_at']
    ordering = ['-fecha_compra', '-created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        fecha_inicio = self.request.query_params.get('fecha_inicio')
        fecha_fin = self.request.query_params.get('fecha_fin')
        if fecha_inicio:
            qs = qs.filter(fecha_compra__gte=fecha_inicio)
        if fecha_fin:
            qs = qs.filter(fecha_compra__lte=fecha_fin)
        return qs

    def _verificar_rol_admin(self, user):
        if not (getattr(user, 'rol', None) == 'admin' or user.is_staff or user.is_superuser):
            raise PermissionDenied('Solo los administradores pueden crear o modificar entradas de inventario.')

    def create(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._verificar_rol_admin(request.user)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser, JSONParser])
    def vincular_factura(self, request, pk=None):
        """
        POST /api/inventario/entradas/{id}/vincular_factura/
        Vincula número de factura, fecha y/o archivo de factura a una entrada.
        """
        self._verificar_rol_admin(request.user)
        entrada = self.get_object()
        numero_factura = request.data.get('numero_factura')
        if not numero_factura:
            return Response({'error': 'El número de factura es requerido.'}, status=status.HTTP_400_BAD_REQUEST)
        
        entrada.numero_factura = numero_factura
        entrada.factura_pendiente = False
        
        fecha_factura = request.data.get('fecha_factura')
        if fecha_factura:
            entrada.fecha_factura = fecha_factura
            
        archivo_factura = request.FILES.get('archivo_factura')
        if archivo_factura:
            entrada.archivo_factura = archivo_factura
            
        folio_remision = request.data.get('folio_remision')
        if folio_remision is not None:
            entrada.folio_remision = folio_remision

        entrada.save()
        serializer = self.get_serializer(entrada)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def vincular_factura_lote(self, request):
        """
        POST /api/inventario/entradas/vincular_factura_lote/
        Vincula una misma factura a múltiples entradas.
        """
        self._verificar_rol_admin(request.user)
        entrada_ids = request.data.get('entrada_ids', [])
        numero_factura = request.data.get('numero_factura')
        fecha_factura = request.data.get('fecha_factura')
        folio_remision = request.data.get('folio_remision')

        if not entrada_ids or not isinstance(entrada_ids, list):
            return Response({'error': 'Debe proporcionar una lista de IDs de entradas.'}, status=status.HTTP_400_BAD_REQUEST)
        if not numero_factura:
            return Response({'error': 'El número de factura es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

        entradas = EntradaInventario.objects.filter(id__in=entrada_ids)
        if not entradas.exists():
            return Response({'error': 'No se encontraron entradas con los IDs proporcionados.'}, status=status.HTTP_404_NOT_FOUND)

        update_fields = {'numero_factura': numero_factura, 'factura_pendiente': False}
        if fecha_factura:
            update_fields['fecha_factura'] = fecha_factura
        if folio_remision is not None:
            update_fields['folio_remision'] = folio_remision

        actualizados = entradas.update(**update_fields)
        return Response({
            'ok': True,
            'mensaje': f'Se actualizaron {actualizados} entradas de inventario.',
            'actualizados': actualizados,
            'numero_factura': numero_factura,
        })

    @action(detail=False, methods=['get'])
    def facturas_vencimiento(self, request):
        """
        GET /api/inventario/entradas/facturas_vencimiento/?dias=7
        Retorna las facturas con saldo pendiente > 0, calculando:
        id, numero_factura, folio_remision, proveedor_nombre, proveedor_id,
        monto_total, saldo_pendiente, fecha_factura, fecha_vencimiento,
        dias_restantes y estado_alerta ('vencida', 'por_vencer', 'al_dia').
        """
        try:
            dias_limite = int(request.query_params.get('dias', 7))
        except (ValueError, TypeError):
            dias_limite = 7

        hoy = timezone.localdate()

        entradas = (
            EntradaInventario.objects
            .select_related('proveedor')
            .order_by('fecha_compra', 'created_at')
        )

        facturas_map = {}
        for entrada in entradas:
            clave = (
                entrada.proveedor_id,
                entrada.numero_factura.strip() if entrada.numero_factura else (
                    f"REM-{entrada.folio_remision.strip()}" if entrada.folio_remision else f"ENT-{entrada.id}"
                )
            )
            monto_linea = entrada.cantidad * entrada.precio_compra

            if clave not in facturas_map:
                fv = entrada.fecha_vencimiento
                if not fv and entrada.proveedor and entrada.proveedor.dias_credito > 0:
                    base_d = entrada.fecha_factura or entrada.fecha_compra or hoy
                    fv = base_d + timedelta(days=entrada.proveedor.dias_credito)

                facturas_map[clave] = {
                    'id': entrada.id,
                    'numero_factura': entrada.numero_factura or '',
                    'folio_remision': entrada.folio_remision or '',
                    'proveedor_id': entrada.proveedor_id,
                    'proveedor_nombre': entrada.proveedor.nombre,
                    'monto_total': Decimal('0.00'),
                    'fecha_factura': entrada.fecha_factura or entrada.fecha_compra,
                    'fecha_vencimiento': fv,
                }

            facturas_map[clave]['monto_total'] += monto_linea
            if entrada.fecha_vencimiento and not facturas_map[clave]['fecha_vencimiento']:
                facturas_map[clave]['fecha_vencimiento'] = entrada.fecha_vencimiento

        resultado = []
        for clave, fac in facturas_map.items():
            prov_id = fac['proveedor_id']
            num_fac = fac['numero_factura']
            monto_total = fac['monto_total']

            pagos_directos = Decimal('0.00')
            if num_fac:
                pagos_directos = PagoProveedor.objects.filter(
                    proveedor_id=prov_id,
                    numero_factura__iexact=num_fac
                ).aggregate(t=Sum('monto'))['t'] or Decimal('0.00')

            saldo_pendiente = max(Decimal('0.00'), monto_total - pagos_directos)

            total_deuda_prov = EntradaInventario.objects.filter(proveedor_id=prov_id).aggregate(
                t=Sum(F('cantidad') * F('precio_compra'))
            )['t'] or Decimal('0.00')
            total_pagos_prov = PagoProveedor.objects.filter(proveedor_id=prov_id).aggregate(
                t=Sum('monto')
            )['t'] or Decimal('0.00')
            saldo_global_prov = max(Decimal('0.00'), total_deuda_prov - total_pagos_prov)

            if saldo_global_prov == Decimal('0.00'):
                saldo_pendiente = Decimal('0.00')
            elif saldo_pendiente > saldo_global_prov:
                saldo_pendiente = saldo_global_prov

            if saldo_pendiente <= Decimal('0.00'):
                continue

            fv = fac['fecha_vencimiento']
            if fv:
                dias_restantes = (fv - hoy).days
                if dias_restantes < 0:
                    estado_alerta = 'vencida'
                elif dias_restantes <= dias_limite:
                    estado_alerta = 'por_vencer'
                else:
                    estado_alerta = 'al_dia'
            else:
                dias_restantes = None
                estado_alerta = 'al_dia'

            resultado.append({
                'id': fac['id'],
                'numero_factura': fac['numero_factura'],
                'folio_remision': fac['folio_remision'],
                'proveedor_nombre': fac['proveedor_nombre'],
                'proveedor_id': fac['proveedor_id'],
                'monto_total': float(monto_total),
                'saldo_pendiente': float(saldo_pendiente),
                'fecha_factura': str(fac['fecha_factura']) if fac['fecha_factura'] else None,
                'fecha_vencimiento': str(fv) if fv else None,
                'dias_restantes': dias_restantes,
                'estado_alerta': estado_alerta,
            })

        vencidas = [f for f in resultado if f['estado_alerta'] == 'vencida']
        vencidas.sort(key=lambda x: x['dias_restantes'] if x['dias_restantes'] is not None else -9999)

        por_vencer = [f for f in resultado if f['estado_alerta'] != 'vencida']
        por_vencer.sort(key=lambda x: x['dias_restantes'] if x['dias_restantes'] is not None else 9999)

        resultado = vencidas + por_vencer

        return Response(resultado)



class SalidaInventarioViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Las salidas se crean automáticamente desde el módulo de ventas.
    Solo lectura — para historial y reportes.
    """
    queryset = SalidaInventario.objects.select_related('producto', 'producto__marca', 'venta').all()
    serializer_class = SalidaInventarioSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['producto']
    search_fields = ['producto__codigo', 'producto__medida', 'venta__folio']
    ordering_fields = ['fecha_venta', 'created_at']
    ordering = ['-fecha_venta', '-created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        fecha_inicio = self.request.query_params.get('fecha_inicio')
        fecha_fin = self.request.query_params.get('fecha_fin')
        if fecha_inicio:
            qs = qs.filter(fecha_venta__gte=fecha_inicio)
        if fecha_fin:
            qs = qs.filter(fecha_venta__lte=fecha_fin)
        return qs
