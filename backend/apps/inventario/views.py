import re
import xml.etree.ElementTree as ET
from decimal import Decimal

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Sum

from .models import Marca, Proveedor, Producto, EntradaInventario, SalidaInventario, PagoProveedor
from .serializers import (
    MarcaSerializer, ProveedorSerializer, ProductoSerializer,
    EntradaInventarioSerializer, SalidaInventarioSerializer,
    PagoProveedorSerializer,
)

INDICES_VELOCIDAD_VALIDOS = ['T', 'H', 'V', 'W', 'Y', 'Z']


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

        items.append({
            'codigo': codigo,
            'descripcion': descripcion,
            'cantidad': cantidad,
            'precio_compra': precio_compra,
            **info,
        })

    return {
        'numero_factura': numero_factura,
        'fecha_compra': fecha_compra,
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

        resultados = []
        for item in datos['items']:
            # ── Marca ─────────────────────────────────────────────────────────────
            marca_nombre = (item.get('marca_nombre') or 'SIN MARCA').strip()
            marca, _ = Marca.objects.get_or_create(nombre=marca_nombre)

            # ── Producto ──────────────────────────────────────────────────────────
            iv = item.get('indice_velocidad', 'H')
            if iv not in INDICES_VELOCIDAD_VALIDOS:
                iv = 'H'

            precio_compra = Decimal(str(item['precio_compra']))
            # Precio de venta sugerido con 30 % de margen (ajustable)
            precio_venta_sugerido = (precio_compra * Decimal('1.30')).quantize(Decimal('0.01'))

            producto, producto_creado = Producto.objects.get_or_create(
                codigo=item['codigo'],
                defaults={
                    'medida': item.get('medida', ''),
                    'marca': marca,
                    'modelo': item.get('modelo', ''),
                    'indice_carga': item.get('indice_carga', 82),
                    'indice_velocidad': iv,
                    'precio_venta': precio_venta_sugerido,
                    'stock_minimo': 2,
                    'activo': True,
                },
            )

            # ── Entrada de inventario ─────────────────────────────────────────────
            entrada = EntradaInventario.objects.create(
                producto=producto,
                proveedor=proveedor,
                cantidad=item['cantidad'],
                precio_compra=precio_compra,
                fecha_compra=datos['fecha_compra'],
                numero_factura=datos['numero_factura'],
                en_inventario=True,
                created_by=usuario,
            )

            resultados.append({
                'codigo': item['codigo'],
                'descripcion': item['descripcion'],
                'cantidad': item['cantidad'],
                'precio_compra': float(precio_compra),
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

    for entrada in entradas:
        key = entrada.numero_factura
        if key not in facturas:
            facturas[key] = {
                'numero_factura': entrada.numero_factura,
                'fecha_compra': str(entrada.fecha_compra),
                'monto_total': Decimal('0'),
                'monto_vendido': Decimal('0'),
                'items': [],
            }

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

    # Convertir montos a float para la respuesta JSON
    for f in facturas.values():
        f['monto_total'] = float(f['monto_total'])
        f['monto_vendido'] = float(f['monto_vendido'])

    # Pagos registrados
    pagos_qs = PagoProveedor.objects.filter(proveedor=proveedor).order_by('-fecha')
    monto_pagado = pagos_qs.aggregate(t=Sum('monto'))['t'] or Decimal('0')
    saldo_pendiente = monto_total_deuda - monto_pagado

    pagos_lista = [
        {
            'id': p.id,
            'fecha': str(p.fecha),
            'monto': float(p.monto),
            'referencia': p.referencia,
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
        'monto_pagado': float(monto_pagado),
        'saldo_pendiente': float(saldo_pendiente),
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
        return Response({
            'total_deuda_global': total_deuda_global,
            'total_pagado_global': total_pagado_global,
            'saldo_global': saldo_global,
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
    CRUD para pagos a proveedores.
    POST /api/inventario/pagos-proveedores/
    """
    queryset = PagoProveedor.objects.select_related('proveedor', 'registrado_por').all()
    serializer_class = PagoProveedorSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['proveedor']
    ordering_fields = ['fecha', 'monto']
    ordering = ['-fecha']

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user)


# ── ViewSets de catálogos ───────────────────────────────────────────────────

class MarcaViewSet(viewsets.ModelViewSet):
    queryset = Marca.objects.all()
    serializer_class = MarcaSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nombre']
    ordering_fields = ['nombre']


class ProveedorViewSet(viewsets.ModelViewSet):
    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['activo']
    search_fields = ['nombre', 'contacto']


class ProductoViewSet(viewsets.ModelViewSet):
    queryset = Producto.objects.select_related('marca').all()
    serializer_class = ProductoSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['marca', 'activo', 'indice_velocidad']
    search_fields = ['codigo', 'medida', 'modelo', 'marca__nombre']
    ordering_fields = ['medida', 'precio_venta', 'stock_actual']
    
    @action(detail=False, methods=['get'])
    def stock_bajo(self, request):
        """Productos con stock bajo"""
        productos_stock_bajo = [p for p in self.get_queryset() if p.tiene_stock_bajo and not p.stock_agotado]
        serializer = self.get_serializer(productos_stock_bajo, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def agotados(self, request):
        """Productos agotados"""
        productos_agotados = [p for p in self.get_queryset() if p.stock_agotado]
        serializer = self.get_serializer(productos_agotados, many=True)
        return Response(serializer.data)


class EntradaInventarioViewSet(viewsets.ModelViewSet):
    queryset = EntradaInventario.objects.select_related('producto', 'proveedor', 'created_by').all()
    serializer_class = EntradaInventarioSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['proveedor', 'en_inventario', 'factura_consumida', 'fecha_compra']
    search_fields = ['producto__codigo', 'numero_factura']
    ordering_fields = ['fecha_compra']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class SalidaInventarioViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Las salidas se crean automáticamente desde el módulo de ventas
    """
    queryset = SalidaInventario.objects.select_related('producto', 'venta').all()
    serializer_class = SalidaInventarioSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['fecha_venta', 'producto']
    ordering_fields = ['fecha_venta']
