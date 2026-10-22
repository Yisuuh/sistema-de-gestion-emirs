"""
Views para el módulo de Ventas
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Sum, Count
from django.utils import timezone
from datetime import timedelta
from .models import Venta, DetalleVenta, Servicio, Cotizacion, OpcionCotizacion
from .serializers import (
    VentaSerializer, 
    VentaListSerializer,
    DetalleVentaSerializer, 
    ServicioSerializer,
    CotizacionSerializer,
    OpcionCotizacionSerializer,
)


class ServicioViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gestionar servicios
    """
    queryset = Servicio.objects.all()
    serializer_class = ServicioSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nombre', 'descripcion']
    ordering_fields = ['nombre', 'precio']
    ordering = ['nombre']
    
    def get_queryset(self):
        """
        Filtrar servicios activos por defecto en listados.
        En acciones de detalle (retrieve, update, partial_update, destroy)
        no se filtra para que los inactivos también sean accesibles.
        """
        queryset = super().get_queryset()

        # No filtrar en acciones de detalle para evitar 404 en inactivos
        if self.action in ('retrieve', 'update', 'partial_update', 'destroy'):
            return queryset

        solo_activos = self.request.query_params.get('activos', 'true')
        if solo_activos.lower() == 'true':
            queryset = queryset.filter(activo=True)

        return queryset


class VentaViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gestionar ventas (POS)
    """
    queryset = Venta.objects.select_related('empleado', 'cliente').prefetch_related('detalles')
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['folio', 'cliente__nombre']
    ordering_fields = ['fecha', 'total', 'folio']
    ordering = ['-fecha']
    
    def get_serializer_class(self):
        """
        Usar serializer simplificado para listado
        """
        if self.action == 'list':
            return VentaListSerializer
        return VentaSerializer
    
    def get_queryset(self):
        """
        Filtrar ventas por fecha, empleado, método de pago, etc.
        """
        queryset = super().get_queryset()
        
        # Filtrar por fecha
        fecha_inicio = self.request.query_params.get('fecha_inicio')
        fecha_fin = self.request.query_params.get('fecha_fin')
        
        if fecha_inicio:
            queryset = queryset.filter(fecha__gte=fecha_inicio)
        if fecha_fin:
            queryset = queryset.filter(fecha__lte=fecha_fin)
        
        # Filtrar por empleado
        empleado_id = self.request.query_params.get('empleado')
        if empleado_id:
            queryset = queryset.filter(empleado_id=empleado_id)
        
        # Filtrar por cliente
        cliente_id = self.request.query_params.get('cliente')
        if cliente_id:
            queryset = queryset.filter(cliente_id=cliente_id)

        # Filtrar por caja
        caja_id = self.request.query_params.get('caja')
        if caja_id:
            queryset = queryset.filter(caja_id=caja_id)
        
        # Filtrar por método de pago
        metodo_pago = self.request.query_params.get('metodo_pago')
        if metodo_pago:
            queryset = queryset.filter(metodo_pago=metodo_pago)

        # Filtrar por vehículo
        vehiculo_id = self.request.query_params.get('vehiculo')
        if vehiculo_id:
            queryset = queryset.filter(vehiculo_id=vehiculo_id)
        
        return queryset
    
    def update(self, request, *args, **kwargs):
        venta = self.get_object()
        
        es_admin = (
            getattr(request.user, 'rol', None) == 'admin' or 
            getattr(request.user, 'role', None) == 'admin' or 
            request.user.is_staff or 
            request.user.is_superuser
        )
        if not es_admin:
            return Response(
                {'error': 'Solo los administradores pueden modificar ventas'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if venta.caja and venta.caja.estado == 'cerrada':
            return Response(
                {'error': 'No se puede modificar una venta asociada a una caja cerrada'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        datos_anteriores = {
            'folio': venta.folio,
            'total': float(venta.total),
            'metodo_pago': venta.metodo_pago,
            'cliente': str(venta.cliente) if venta.cliente else None,
            'empleado': str(venta.empleado) if venta.empleado else None,
        }

        response = super().update(request, *args, **kwargs)

        try:
            from apps.usuarios.models import LogAuditoria
            venta.refresh_from_db()
            LogAuditoria.objects.create(
                usuario=request.user,
                accion='editar',
                tabla='ventas_venta',
                registro_id=venta.id,
                datos_anteriores=datos_anteriores,
                datos_nuevos={
                    'folio': venta.folio,
                    'total': float(venta.total),
                    'metodo_pago': venta.metodo_pago,
                    'cliente': str(venta.cliente) if venta.cliente else None,
                    'empleado': str(venta.empleado) if venta.empleado else None,
                }
            )
        except Exception:
            pass

        return response

    def destroy(self, request, *args, **kwargs):
        venta = self.get_object()
        
        es_admin = (
            getattr(request.user, 'rol', None) == 'admin' or 
            getattr(request.user, 'role', None) == 'admin' or 
            request.user.is_staff or 
            request.user.is_superuser
        )
        if not es_admin:
            return Response(
                {'error': 'Solo los administradores pueden eliminar ventas'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if venta.caja and venta.caja.estado == 'cerrada':
            return Response(
                {'error': 'No se puede eliminar una venta asociada a una caja cerrada'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from apps.usuarios.models import LogAuditoria
            LogAuditoria.objects.create(
                usuario=request.user,
                accion='eliminar',
                tabla='ventas_venta',
                registro_id=venta.id,
                datos_anteriores={
                    'folio': venta.folio,
                    'total': float(venta.total),
                    'metodo_pago': venta.metodo_pago,
                    'cliente': str(venta.cliente) if venta.cliente else None,
                    'empleado': str(venta.empleado) if venta.empleado else None,
                }
            )
        except Exception:
            pass

        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def ventas_hoy(self, request):
        """
        Obtener ventas del día actual
        """
        hoy = timezone.localdate()
        ventas = self.get_queryset().filter(fecha__date=hoy)
        serializer = self.get_serializer(ventas, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def estadisticas_hoy(self, request):
        """
        Estadísticas de ventas del día
        """
        hoy = timezone.localdate()
        ventas_hoy = self.get_queryset().filter(fecha__date=hoy)
        
        stats = ventas_hoy.aggregate(
            total_ventas=Count('id'),
            total_ingresos=Sum('total'),
            total_efectivo=Sum('monto_efectivo'),
            total_electronico=Sum('monto_electronico')
        )
        
        # Agregar desglose por método de pago
        metodos_pago = ventas_hoy.values('metodo_pago').annotate(
            cantidad=Count('id'),
            total=Sum('total')
        )
        
        return Response({
            'fecha': hoy,
            'resumen': stats,
            'por_metodo_pago': list(metodos_pago)
        })
    
    @action(detail=False, methods=['get'])
    def estadisticas_semana(self, request):
        """
        Estadísticas de ventas de la semana
        """
        hoy = timezone.localdate()
        hace_7_dias = hoy - timedelta(days=7)
        
        ventas_semana = self.get_queryset().filter(fecha__date__gte=hace_7_dias)
        
        stats = ventas_semana.aggregate(
            total_ventas=Count('id'),
            total_ingresos=Sum('total'),
            promedio_venta=Sum('total') / Count('id') if ventas_semana.exists() else 0
        )
        
        # Ventas por día
        por_dia = ventas_semana.extra(
            select={'dia': 'DATE(fecha)'}
        ).values('dia').annotate(
            cantidad=Count('id'),
            total=Sum('total')
        ).order_by('dia')
        
        return Response({
            'periodo': {
                'inicio': hace_7_dias,
                'fin': hoy
            },
            'resumen': stats,
            'por_dia': list(por_dia)
        })
    
    @action(detail=True, methods=['get'])
    def ticket(self, request, pk=None):
        """
        Obtener datos para impresión de ticket
        """
        venta = self.get_object()
        serializer = VentaSerializer(venta)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def productos_mas_vendidos(self, request):
        """
        Productos más vendidos en un periodo
        """
        # Parámetros de fecha
        fecha_inicio = request.query_params.get('fecha_inicio')
        fecha_fin = request.query_params.get('fecha_fin')
        limite = int(request.query_params.get('limite', 10))
        
        # Filtrar detalles de venta por fecha
        detalles = DetalleVenta.objects.filter(producto__isnull=False)
        
        if fecha_inicio:
            detalles = detalles.filter(venta__fecha__gte=fecha_inicio)
        if fecha_fin:
            detalles = detalles.filter(venta__fecha__lte=fecha_fin)
        
        # Agrupar por producto
        productos_vendidos = detalles.values(
            'producto__id',
            'producto__codigo',
            'producto__marca__nombre',
            'producto__modelo',
            'producto__medida',
            'producto__indice_carga',
            'producto__indice_velocidad',
            'descripcion',
        ).annotate(
            cantidad_total=Sum('cantidad'),
            ventas_total=Sum('subtotal'),
            num_ventas=Count('venta', distinct=True)
        ).order_by('-cantidad_total')[:limite]
        
        data = []
        for p in productos_vendidos:
            marca = p.get('producto__marca__nombre') or ''
            modelo = p.get('producto__modelo') or ''
            medida = p.get('producto__medida') or ''
            ic = p.get('producto__indice_carga') or ''
            iv = p.get('producto__indice_velocidad') or ''
            desc = f"{marca} {modelo} {medida} {ic}{iv}".strip() or p.get('descripcion')
            data.append({
                'producto__id': p['producto__id'],
                'producto__codigo': p['producto__codigo'],
                'producto__marca__nombre': marca,
                'producto__modelo': modelo,
                'producto__medida': medida,
                'producto__descripcion_completa': desc,
                'cantidad_total': p['cantidad_total'],
                'ventas_total': p['ventas_total'],
                'num_ventas': p['num_ventas'],
            })
        
        return Response(data)
    
    @action(detail=False, methods=['get'])
    def servicios_mas_vendidos(self, request):
        """
        Servicios más vendidos en un periodo
        """
        # Parámetros de fecha
        fecha_inicio = request.query_params.get('fecha_inicio')
        fecha_fin = request.query_params.get('fecha_fin')
        limite = int(request.query_params.get('limite', 10))
        
        # Filtrar detalles de venta por fecha
        detalles = DetalleVenta.objects.filter(servicio__isnull=False)
        
        if fecha_inicio:
            detalles = detalles.filter(venta__fecha__gte=fecha_inicio)
        if fecha_fin:
            detalles = detalles.filter(venta__fecha__lte=fecha_fin)
        
        # Agrupar por servicio
        servicios_vendidos = detalles.values(
            'servicio__id',
            'servicio__nombre'
        ).annotate(
            cantidad_total=Sum('cantidad'),
            ventas_total=Sum('subtotal'),
            num_ventas=Count('venta', distinct=True)
        ).order_by('-cantidad_total')[:limite]
        
        return Response(list(servicios_vendidos))

    @action(detail=False, methods=['get'])
    def acumulado_vendedor(self, request):
        """
        GET /api/ventas/ventas/acumulado_vendedor/?fecha_inicio=&fecha_fin=
        Acumulado de ventas agrupado por vendedor.
        """
        hoy = timezone.now().date()
        fecha_inicio = request.query_params.get('fecha_inicio', str(hoy.replace(day=1)))
        fecha_fin = request.query_params.get('fecha_fin', str(hoy))

        resultado = (
            self.get_queryset()
            .filter(fecha__date__range=[fecha_inicio, fecha_fin])
            .values('empleado__id', 'empleado__nombre', 'empleado__apellido', 'empleado__comision_porcentaje')
            .annotate(total_ventas=Sum('total'), num_ventas=Count('id'))
            .order_by('-total_ventas')
        )
        data = []
        for r in resultado:
            total = float(r['total_ventas'] or 0)
            pct = float(r['empleado__comision_porcentaje'] or 0)
            data.append({
                'empleado_id': r['empleado__id'],
                'nombre': f"{r['empleado__nombre']} {r['empleado__apellido']}".strip(),
                'total_ventas': total,
                'num_ventas': r['num_ventas'],
                'comision_porcentaje': pct,
                'comision_calculada': round(total * pct / 100, 2),
            })
        return Response({'periodo': {'inicio': fecha_inicio, 'fin': fecha_fin}, 'vendedores': data})

    @action(detail=False, methods=['get'])
    def pendientes_facturar(self, request):
        """Ventas con factura_pendiente=True o facturada=False."""
        ventas = self.get_queryset().filter(factura_pendiente=True, facturada=False)
        serializer = self.get_serializer(ventas, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['patch'])
    def marcar_facturada(self, request, pk=None):
        """PATCH /api/ventas/ventas/{id}/marcar_facturada/ — marca como facturada."""
        venta = self.get_object()
        cfdi_uuid = request.data.get('cfdi_uuid', '')
        venta.facturada = True
        venta.factura_pendiente = False
        venta.cfdi_uuid = cfdi_uuid
        venta.save(update_fields=['facturada', 'factura_pendiente', 'cfdi_uuid'])
        return Response({'ok': True, 'cfdi_uuid': cfdi_uuid})


class DetalleVentaViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet de solo lectura para detalles de venta
    (Los detalles se crean junto con las ventas)
    """
    queryset = DetalleVenta.objects.select_related('venta', 'producto', 'servicio')
    serializer_class = DetalleVentaSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter]
    ordering = ['-venta__fecha']


class CotizacionViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gestionar Cotizaciones Multimarca con calculadora de margen interna
    """
    queryset = (
        Cotizacion.objects
        .select_related('cliente', 'vehiculo', 'elaborado_por')
        .prefetch_related('opciones', 'opciones__producto', 'opciones__proveedor')
        .all()
    )
    serializer_class = CotizacionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'folio', 'nombre_cliente', 'telefono_cliente',
        'vehiculo_referencia', 'medida_solicitada', 'cliente__nombre'
    ]
    ordering_fields = ['fecha', 'folio', 'estado']
    ordering = ['-fecha']

    def get_queryset(self):
        qs = super().get_queryset()
        estado = self.request.query_params.get('estado')
        if estado:
            qs = qs.filter(estado=estado)
        cliente_id = self.request.query_params.get('cliente')
        if cliente_id:
            qs = qs.filter(cliente_id=cliente_id)
        vehiculo_id = self.request.query_params.get('vehiculo')
        if vehiculo_id:
            qs = qs.filter(vehiculo_id=vehiculo_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(elaborado_por=self.request.user)

    @action(detail=True, methods=['post'])
    def cambiar_estado(self, request, pk=None):
        """
        POST /api/ventas/cotizaciones/{id}/cambiar_estado/
        Cambia el estado de la cotización ('vigente', 'aceptada', 'vencida', 'cancelada').
        """
        cotizacion = self.get_object()
        nuevo_estado = request.data.get('estado')
        estados_validos = [e[0] for e in Cotizacion.ESTADOS]
        if nuevo_estado not in estados_validos:
            return Response(
                {'error': f"Estado inválido. Opciones permitidas: {', '.join(estados_validos)}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        cotizacion.estado = nuevo_estado
        cotizacion.save(update_fields=['estado'])
        return Response(self.get_serializer(cotizacion).data)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """
        GET /api/ventas/cotizaciones/{id}/pdf/
        Genera un PDF formal y profesional para el cliente.
        REGLA DE ORO DE SEGURIDAD: JAMÁS incluye costo_proveedor, valor_margen,
        tipo_margen, proveedor ni notas_internas.
        """
        import io
        import os
        from django.http import HttpResponse
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image
        )

        cotizacion = self.get_object()
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=letter,
            leftMargin=1.5 * cm,
            rightMargin=1.5 * cm,
            topMargin=1.5 * cm,
            bottomMargin=1.5 * cm,
        )

        styles = getSampleStyleSheet()
        NORMAL = styles['Normal']
        RED = colors.HexColor('#df000a')
        BLACK = colors.HexColor('#111827')
        ORANGE = colors.HexColor('#ef8701')
        ALT_BG = colors.HexColor('#f9fafb')
        WHITE = colors.white
        GRAY = colors.HexColor('#4b5563')
        GREEN = colors.HexColor('#15803d')

        title_style = ParagraphStyle(
            'CotTitle', parent=NORMAL, fontName='Helvetica-Bold',
            fontSize=18, leading=22, textColor=BLACK
        )
        sub_style = ParagraphStyle(
            'CotSub', parent=NORMAL, fontName='Helvetica',
            fontSize=9, leading=12, textColor=GRAY
        )
        section_h2 = ParagraphStyle(
            'CotH2', parent=NORMAL, fontName='Helvetica-Bold',
            fontSize=11, leading=14, textColor=RED, spaceBefore=10, spaceAfter=6
        )
        cell_style = ParagraphStyle(
            'CotCell', parent=NORMAL, fontName='Helvetica',
            fontSize=8.5, leading=11, textColor=BLACK
        )
        cell_bold = ParagraphStyle(
            'CotCellBold', parent=NORMAL, fontName='Helvetica-Bold',
            fontSize=8.5, leading=11, textColor=BLACK
        )

        story = []

        logo_path = os.path.normpath(os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            '..', '..', '..', 'frontend', 'public', 'images', 'logo_hd.png'
        ))

        fecha_emision = cotizacion.fecha.strftime('%d/%m/%Y') if cotizacion.fecha else timezone.localdate().strftime('%d/%m/%Y')
        fecha_venc = (
            (cotizacion.fecha.date() + timedelta(days=cotizacion.vigencia_dias or 5)).strftime('%d/%m/%Y')
            if cotizacion.fecha else ''
        )

        header_right = [
            Paragraph('Centro Llantero <font color="#df000a"><b>EmirS</b></font>', title_style),
            Paragraph('Especialistas en Llantas, Rines, Alineación, Balanceo y Auxilio Vial', sub_style),
            Paragraph('Calle 42 #282 por 45, Fracc. Francisco de Montejo, Mérida, Yuc. | Tel: 999 371 8502', sub_style),
        ]
        header_folio = [
            Paragraph('<b>COTIZACIÓN COMERCIAL</b>', ParagraphStyle('F1', parent=cell_bold, alignment=2, fontSize=10, textColor=RED)),
            Paragraph(f'<b>Folio: {cotizacion.folio}</b>', ParagraphStyle('F2', parent=cell_bold, alignment=2, fontSize=11)),
            Paragraph(f'Fecha: {fecha_emision}', ParagraphStyle('F3', parent=sub_style, alignment=2)),
            Paragraph(f'Vigencia: {cotizacion.vigencia_dias} días ({fecha_venc})', ParagraphStyle('F4', parent=sub_style, alignment=2)),
        ]

        if os.path.exists(logo_path):
            try:
                logo_img = Image(logo_path, width=3.6 * cm, height=1.3 * cm)
                header_tbl = Table([[logo_img, header_right, header_folio]], colWidths=[4.0 * cm, 9.0 * cm, 5.5 * cm])
            except Exception:
                header_tbl = Table([[header_right, header_folio]], colWidths=[12.5 * cm, 6.0 * cm])
        else:
            header_tbl = Table([[header_right, header_folio]], colWidths=[12.5 * cm, 6.0 * cm])

        header_tbl.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 2),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ]))
        story.append(header_tbl)
        story.append(Spacer(1, 0.25 * cm))
        story.append(HRFlowable(width='100%', thickness=3, color=RED, spaceAfter=2))
        story.append(HRFlowable(width='100%', thickness=1.5, color=ORANGE, spaceAfter=8))

        # Datos del cliente y vehículo
        cliente_display = cotizacion.nombre_cliente or (cotizacion.cliente.nombre if cotizacion.cliente else 'Cliente General')
        telefono_display = cotizacion.telefono_cliente or (cotizacion.cliente.telefono if cotizacion.cliente else '—')
        vehiculo_display = cotizacion.vehiculo_referencia or (
            f"{cotizacion.vehiculo.marca} {cotizacion.vehiculo.modelo} {cotizacion.vehiculo.año}"
            if cotizacion.vehiculo else '—'
        )
        medida_display = cotizacion.medida_solicitada or 'Varias'

        info_rows = [
            [
                Paragraph('<b>Cliente:</b>', cell_bold),
                Paragraph(cliente_display, cell_style),
                Paragraph('<b>Vehículo:</b>', cell_bold),
                Paragraph(vehiculo_display, cell_style),
            ],
            [
                Paragraph('<b>Teléfono:</b>', cell_bold),
                Paragraph(telefono_display, cell_style),
                Paragraph('<b>Medida Solicitada:</b>', cell_bold),
                Paragraph(f'<font color="#df000a"><b>{medida_display}</b></font> ({cotizacion.cantidad_requerida} pzas)', cell_style),
            ],
        ]
        info_tbl = Table(info_rows, colWidths=[2.8 * cm, 6.4 * cm, 3.3 * cm, 6.0 * cm])
        info_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), ALT_BG),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(info_tbl)
        story.append(Spacer(1, 0.35 * cm))

        # Tabla Comparativa de Opciones (SOLO PRECIOS AL PÚBLICO)
        story.append(Paragraph('Opciones Comparativas de Llantas', section_h2))

        gama_labels = {
            'economica': 'ECONÓMICA',
            'media': 'INTERMEDIA / CALIDAD',
            'premium': 'PREMIUM / ALTA GAMA',
        }

        cant_req = cotizacion.cantidad_requerida or 4
        headers = [
            'Gama',
            'Marca y Modelo',
            'Medida',
            'Entrega',
            'Precio Unitario',
            'Par (2 pzas)',
            'Juego (4 pzas)',
            f'Total ({cant_req} pzas)',
        ]
        table_data = [headers]

        for op in cotizacion.opciones.all():
            gama_txt = gama_labels.get(op.gama, op.gama.upper())
            if op.recomendada:
                gama_txt += ' ★ RECOMENDADA'
            marca_mod = f"<b>{op.marca}</b> {op.modelo}".strip()
            pu = float(op.precio_unitario_publico or 0)
            p_par = float(op.precio_par or (pu * 2))
            p_j4 = float(op.precio_juego_4 or (pu * 4))
            p_tot = float(op.precio_cantidad_solicitada or (pu * cant_req))

            table_data.append([
                Paragraph(f"<b>{gama_txt}</b>", cell_style),
                Paragraph(marca_mod, cell_style),
                Paragraph(op.medida, cell_style),
                Paragraph(op.tiempo_entrega or 'Inmediata', cell_style),
                f"${pu:,.2f}",
                f"${p_par:,.2f}",
                f"${p_j4:,.2f}",
                f"${p_tot:,.2f}",
            ])

        op_tbl = Table(
            table_data,
            colWidths=[2.8 * cm, 4.1 * cm, 2.2 * cm, 2.2 * cm, 1.8 * cm, 1.8 * cm, 1.8 * cm, 1.8 * cm],
            repeatRows=1
        )
        op_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), BLACK),
            ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 7.5),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, ALT_BG]),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#d1d5db')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (4, 1), (-1, -1), 'RIGHT'),
            ('FONTNAME', (7, 1), (7, -1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (7, 1), (7, -1), RED),
            ('PADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(op_tbl)
        story.append(Spacer(1, 0.4 * cm))

        # Beneficios Incluidos
        beneficios = []
        if cotizacion.incluye_montaje:
            beneficios.append('✔ Montaje profesional con equipo especializado')
        if cotizacion.incluye_balanceo:
            beneficios.append('✔ Balanceo computarizado')
        if cotizacion.incluye_valvula:
            beneficios.append('✔ Válvula nueva por llanta')
        if cotizacion.incluye_alineacion:
            beneficios.append('✔ Alineación incluida')
        if isinstance(cotizacion.servicios_adicionales, list):
            for srv in cotizacion.servicios_adicionales:
                if srv and str(srv).strip():
                    beneficios.append(f'✔ {str(srv).strip()}')

        if beneficios:
            story.append(Paragraph('Beneficios Incluidos en su Compra', section_h2))
            ben_text = "   |   ".join(beneficios)
            ben_tbl = Table([[Paragraph(f'<font color="#15803d"><b>{ben_text}</b></font>', cell_style)]], colWidths=[18.5 * cm])
            ben_tbl.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f0fdf4')),
                ('BOX', (0, 0), (-1, -1), 0.75, GREEN),
                ('PADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(ben_tbl)
            story.append(Spacer(1, 0.3 * cm))

        # Notas para el cliente (SOLO notas_cliente, NUNCA notas_internas)
        if cotizacion.notas_cliente:
            story.append(Paragraph('Observaciones y Condiciones Comerciales', section_h2))
            story.append(Paragraph(cotizacion.notas_cliente, cell_style))
            story.append(Spacer(1, 0.3 * cm))

        story.append(Spacer(1, 0.4 * cm))
        story.append(HRFlowable(width='100%', thickness=1, color=colors.HexColor('#d1d5db'), spaceAfter=6))
        story.append(Paragraph(
            'Precios sujetos a disponibilidad y vigentes durante el periodo indicado. '
            '¡Gracias por confiar en <b>Centro Llantero EmirS</b>!',
            ParagraphStyle('FooterCot', parent=sub_style, alignment=1)
        ))

        doc.build(story)
        pdf_bytes = buf.getvalue()
        buf.close()

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="Cotizacion_{cotizacion.folio}.pdf"'
        return response

