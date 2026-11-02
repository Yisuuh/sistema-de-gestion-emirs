"""
Views para el módulo de Ventas
"""
from rest_framework import viewsets, status, filters, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Sum, Count
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta
from .models import (
    Venta, DetalleVenta, Servicio, Cotizacion, OpcionCotizacion,
    SolicitudAutorizacion
)
from .serializers import (
    VentaSerializer, 
    VentaListSerializer,
    DetalleVentaSerializer, 
    ServicioSerializer,
    CotizacionSerializer,
    OpcionCotizacionSerializer,
    SolicitudAutorizacionSerializer,
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
        from django.db import transaction
        from apps.usuarios.models import LogAuditoria

        partial = kwargs.pop('partial', False)
        venta = self.get_object()
        
        # Control de autorización (Admin libre, Vendedor/Operador con PIN admin u OTP)
        autorizado, autorizador, error_resp = self._verificar_autorizacion_venta(request, venta, accion='editar')
        if not autorizado:
            return error_resp
        
        if venta.caja and venta.caja.estado == 'cerrada':
            return Response(
                {'error': 'No se puede modificar una venta asociada a una caja cerrada'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        motivo = (
            request.data.get('motivo') or 
            request.data.get('motivo_edicion') or 
            request.query_params.get('motivo') or 
            getattr(venta, 'motivo_edicion', '') or 
            'Edición de venta'
        )

        datos_anteriores = {
            'folio': venta.folio,
            'total': float(venta.total),
            'metodo_pago': venta.metodo_pago,
            'cliente': str(venta.cliente) if venta.cliente else None,
            'empleado': str(venta.empleado) if venta.empleado else None,
        }

        with transaction.atomic():
            total_anterior = Decimal(str(venta.total))

            serializer = self.get_serializer(venta, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)

            venta.refresh_from_db()
            nuevo_total = Decimal(str(venta.total))
            diferencia = nuevo_total - total_anterior

            # Sincronizar caja abierta si aplica
            caja = venta.caja
            if caja and caja.estado == 'abierta':
                try:
                    caja.save()
                except Exception:
                    pass

            # Registrar trazabilidad de edición en el modelo Venta
            venta.fue_editada = True
            venta.fecha_edicion = timezone.now()
            if not venta.total_original:
                venta.total_original = total_anterior
            venta.diferencia_monetaria = diferencia
            if request.user.is_authenticated:
                venta.editada_por = request.user
            if autorizador:
                venta.autorizada_por = autorizador
            venta.motivo_edicion = motivo
            venta.save(update_fields=[
                'fue_editada', 'fecha_edicion', 'total_original',
                'diferencia_monetaria', 'editada_por', 'autorizada_por', 'motivo_edicion'
            ])

            try:
                LogAuditoria.objects.create(
                    usuario=request.user if request.user.is_authenticated else None,
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
                        'motivo': motivo,
                        'autorizado_por': autorizador.username if autorizador else None,
                        'diferencia_monetaria': float(diferencia),
                    }
                )
            except Exception:
                pass

        return Response(self.get_serializer(venta).data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        from django.db import transaction
        from apps.usuarios.models import LogAuditoria

        venta = self.get_object()
        
        # Control de autorización (Admin libre, Vendedor/Operador con PIN admin u OTP)
        autorizado, autorizador, error_resp = self._verificar_autorizacion_venta(request, venta, accion='eliminar')
        if not autorizado:
            return error_resp
        
        if venta.caja and venta.caja.estado == 'cerrada':
            return Response(
                {'error': 'No se puede eliminar una venta asociada a una caja cerrada'},
                status=status.HTTP_400_BAD_REQUEST
            )

        motivo = (
            request.data.get('motivo') or 
            request.data.get('motivo_edicion') or 
            request.query_params.get('motivo') or 
            'Eliminación autorizada de venta'
        )

        with transaction.atomic():
            # 1. Revertir todas las salidas de inventario de la venta (reintegrando stock)
            salidas = list(venta.salidas_inventario.all())
            for salida in salidas:
                prod = salida.producto
                salida.delete()
                if prod:
                    prod.refresh_from_db()

            # 2. Descuento automático en caja abierta
            caja = venta.caja
            if caja and caja.estado == 'abierta':
                try:
                    caja.save()
                except Exception:
                    pass

            # 3. Registrar en LogAuditoria la eliminación con motivo y quién autorizó
            try:
                LogAuditoria.objects.create(
                    usuario=request.user if request.user.is_authenticated else None,
                    accion='eliminar',
                    tabla='ventas_venta',
                    registro_id=venta.id,
                    datos_anteriores={
                        'folio': venta.folio,
                        'total': float(venta.total),
                        'metodo_pago': venta.metodo_pago,
                        'cliente': str(venta.cliente) if venta.cliente else None,
                        'empleado': str(venta.empleado) if venta.empleado else None,
                        'motivo': motivo,
                        'autorizado_por': autorizador.username if autorizador else None,
                    }
                )
            except Exception:
                pass

            # 4. Proceder con el borrado de la venta
            venta.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)

    def _verificar_autorizacion_venta(self, request, venta, accion='editar'):
        """
        Verifica autorización para editar o eliminar una venta.
        Retorna: (autorizado: bool, autorizador: Usuario | None, error_response: Response | None)
        """
        es_admin = (
            getattr(request.user, 'rol', None) == 'admin' or 
            getattr(request.user, 'role', None) == 'admin' or 
            request.user.is_staff or 
            request.user.is_superuser
        )
        if es_admin:
            return True, request.user, None

        # Vendedor u operador: requiere autorización presencial (PIN admin) o remota (OTP)
        pin_admin = request.data.get('pin_admin') or request.query_params.get('pin_admin')
        codigo_autorizacion = request.data.get('codigo_autorizacion') or request.query_params.get('codigo_autorizacion')

        if not pin_admin and not codigo_autorizacion:
            return False, None, Response(
                {'error': 'Se requiere autorización del administrador para editar o eliminar esta venta'},
                status=status.HTTP_403_FORBIDDEN
            )

        from apps.usuarios.models import Usuario

        # 1. Validar por PIN de Administrador
        if pin_admin:
            admins = Usuario.objects.filter(
                Q(rol='admin') | Q(is_superuser=True) | Q(is_staff=True),
                activo=True,
                is_active=True
            )
            admin_autorizador = None
            for admin in admins:
                if hasattr(admin, 'check_pin') and admin.check_pin(pin_admin):
                    admin_autorizador = admin
                    break
                pin_hash = getattr(admin, 'pin_seguridad', None)
                if pin_hash:
                    from django.contrib.auth.hashers import check_password
                    if check_password(str(pin_admin), pin_hash):
                        admin_autorizador = admin
                        break

            if admin_autorizador:
                return True, admin_autorizador, None
            else:
                return False, None, Response(
                    {'error': 'PIN de administrador inválido o no autorizado'},
                    status=status.HTTP_403_FORBIDDEN
                )

        # 2. Validar por Código OTP de Solicitud de Autorización
        if codigo_autorizacion:
            from django.apps import apps
            SolicitudModel = None
            for app_label in ['ventas', 'caja', 'usuarios']:
                try:
                    SolicitudModel = apps.get_model(app_label, 'SolicitudAutorizacion')
                    if SolicitudModel:
                        break
                except LookupError:
                    continue

            if SolicitudModel:
                solicitud = SolicitudModel.objects.filter(
                    venta=venta,
                    codigo_otp=str(codigo_autorizacion).strip(),
                    estado='aprobada',
                    expires_at__gte=timezone.now()
                ).first()

                if solicitud:
                    solicitud.estado = 'consumida'
                    solicitud.save(update_fields=['estado'])
                    autorizador = solicitud.autorizado_por or solicitud.solicitado_por
                    return True, autorizador, None

            return False, None, Response(
                {'error': 'Código de autorización inválido, expirado o ya utilizado'},
                status=status.HTTP_403_FORBIDDEN
            )

        return False, None, Response(
            {'error': 'Se requiere autorización del administrador para editar o eliminar esta venta'},
            status=status.HTTP_403_FORBIDDEN
        )

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
            topMargin=1.2 * cm,
            bottomMargin=1.2 * cm,
        )

        styles = getSampleStyleSheet()
        NORMAL = styles['Normal']
        RED = colors.HexColor('#df000a')
        DARK_NAVY = colors.HexColor('#0f172a')
        GOLD = colors.HexColor('#fbbf24')
        BLACK = colors.HexColor('#111827')
        ORANGE = colors.HexColor('#ef8701')
        ALT_BG = colors.HexColor('#f8fafc')
        WHITE = colors.white
        GRAY = colors.HexColor('#4b5563')
        GREEN = colors.HexColor('#15803d')
        BORDER_COLOR = colors.HexColor('#cbd5e1')

        title_style = ParagraphStyle(
            'CotTitle', parent=NORMAL, fontName='Helvetica-Bold',
            fontSize=17, leading=20, textColor=BLACK
        )
        sub_style = ParagraphStyle(
            'CotSub', parent=NORMAL, fontName='Helvetica',
            fontSize=8.5, leading=11, textColor=GRAY
        )
        section_h2 = ParagraphStyle(
            'CotH2', parent=NORMAL, fontName='Helvetica-Bold',
            fontSize=10, leading=13, textColor=RED, spaceBefore=6, spaceAfter=4
        )
        cell_style = ParagraphStyle(
            'CotCell', parent=NORMAL, fontName='Helvetica',
            fontSize=8, leading=10.5, textColor=BLACK
        )
        cell_bold = ParagraphStyle(
            'CotCellBold', parent=NORMAL, fontName='Helvetica-Bold',
            fontSize=8, leading=10.5, textColor=BLACK
        )
        bank_header_style = ParagraphStyle(
            'CotBankHeader', parent=NORMAL, fontName='Helvetica-Bold',
            fontSize=9, leading=12, textColor=GOLD, alignment=1
        )
        footer_title_style = ParagraphStyle(
            'CotFooterTitle', parent=NORMAL, fontName='Helvetica-Bold',
            fontSize=8, leading=10.5, textColor=GOLD
        )
        footer_cell_style = ParagraphStyle(
            'CotFooterCell', parent=NORMAL, fontName='Helvetica',
            fontSize=7.5, leading=10, textColor=WHITE
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

        cant_req = cotizacion.cantidad_requerida or 4
        if cant_req in (1, 2, 4):
            headers = [
                'Marca y Modelo',
                'Medida',
                'Entrega',
                'P. Unitario',
                'Par (2 pzas)',
                'Juego (4 pzas)',
            ]
            col_widths = [5.5 * cm, 2.8 * cm, 2.7 * cm, 2.3 * cm, 2.4 * cm, 2.4 * cm]
        else:
            headers = [
                'Marca y Modelo',
                'Medida',
                'Entrega',
                'P. Unitario',
                'Par (2 pzas)',
                'Juego (4 pzas)',
                f'Total ({cant_req} pzas)',
            ]
            col_widths = [4.8 * cm, 2.5 * cm, 2.4 * cm, 2.1 * cm, 2.1 * cm, 2.1 * cm, 2.1 * cm]

        table_data = [headers]

        for op in cotizacion.opciones.all():
            marca_mod = f"<b>{op.marca}</b> {op.modelo}".strip()
            if op.recomendada:
                marca_mod += ' <font color="#df000a"><b>★ RECOMENDADA</b></font>'
            pu = float(op.precio_unitario_publico or 0)
            p_par = float(op.precio_par) if (op.precio_par is not None and float(op.precio_par) > 0) else float(pu * 2)
            p_j4 = float(op.precio_juego_4) if (op.precio_juego_4 is not None and float(op.precio_juego_4) > 0) else float(pu * 4)

            if op.precio_cantidad_solicitada is not None and float(op.precio_cantidad_solicitada) > 0:
                p_tot = float(op.precio_cantidad_solicitada)
            elif cant_req == 4:
                p_tot = p_j4
            elif cant_req == 2:
                p_tot = p_par
            elif cant_req == 1:
                p_tot = pu
            else:
                p_tot = float(pu * cant_req)

            row = [
                Paragraph(marca_mod, cell_style),
                Paragraph(op.medida, cell_style),
                Paragraph(op.tiempo_entrega or 'Inmediata', cell_style),
                f"${pu:,.2f}",
                f"${p_par:,.2f}",
                f"${p_j4:,.2f}",
            ]
            if cant_req not in (1, 2, 4):
                row.append(f"${p_tot:,.2f}")

            table_data.append(row)

        op_tbl = Table(
            table_data,
            colWidths=col_widths,
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
            ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),
            ('FONTNAME', (-1, 1), (-1, -1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (-1, 1), (-1, -1), RED),
            ('PADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(op_tbl)
        story.append(Spacer(1, 0.35 * cm))

        # Financiamiento a Meses Sin Intereses (si está activo mostrar_msi)
        if getattr(cotizacion, 'mostrar_msi', True):
            story.append(Paragraph('Opciones de Financiamiento a 3 Meses Sin Intereses (Tarjetas Participantes)', section_h2))

            cant_lbl = f"Juego ({cant_req} pzas)" if cant_req == 4 else f"Total ({cant_req} pzas)"
            msi_headers = [
                'Marca y Modelo',
                'Medida',
                f'Total Contado ({cant_lbl})',
                '3 Meses Sin Intereses',
            ]
            msi_data = [msi_headers]

            for op in cotizacion.opciones.all():
                marca_mod = f"<b>{op.marca}</b> {op.modelo}".strip()
                if op.recomendada:
                    marca_mod += ' <font color="#df000a"><b>★</b></font>'
                pu = float(op.precio_unitario_publico or 0)
                p_par = float(op.precio_par) if (op.precio_par is not None and float(op.precio_par) > 0) else float(pu * 2)
                p_j4 = float(op.precio_juego_4) if (op.precio_juego_4 is not None and float(op.precio_juego_4) > 0) else float(pu * 4)

                if op.precio_cantidad_solicitada is not None and float(op.precio_cantidad_solicitada) > 0:
                    p_tot = float(op.precio_cantidad_solicitada)
                elif cant_req == 4:
                    p_tot = p_j4
                elif cant_req == 2:
                    p_tot = p_par
                elif cant_req == 1:
                    p_tot = pu
                else:
                    p_tot = float(pu * cant_req)

                tot_3 = p_tot
                mens_3 = round(tot_3 / 3, 2)

                celda_3msi = Paragraph(
                    f"<b>${mens_3:,.2f}</b>/mes<br/><font size='6.5' color='#4b5563'>3 pagos de ${mens_3:,.2f}</font>",
                    cell_style
                )

                msi_data.append([
                    Paragraph(marca_mod, cell_style),
                    Paragraph(op.medida, cell_style),
                    f"${tot_3:,.2f}",
                    celda_3msi,
                ])

            msi_tbl = Table(
                msi_data,
                colWidths=[6.0 * cm, 3.5 * cm, 4.3 * cm, 4.3 * cm],
                repeatRows=1
            )
            msi_tbl.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1f2937')),
                ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 7.5),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, ALT_BG]),
                ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#d1d5db')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (2, 1), (2, -1), 'RIGHT'),
                ('ALIGN', (3, 1), (3, -1), 'CENTER'),
                ('PADDING', (0, 0), (-1, -1), 5),
            ]))
            story.append(msi_tbl)
            story.append(Spacer(1, 0.3 * cm))

        # 1. CONDICIONES DE COMPRA Y BENEFICIOS EXCLUSIVOS + 2. CONDICIONES DE PAGO
        extras = []
        if cotizacion.incluye_alineacion:
            extras.append('✔ Alineación computarizada incluida')
        if isinstance(cotizacion.servicios_adicionales, list):
            for srv in cotizacion.servicios_adicionales:
                if srv and str(srv).strip():
                    extras.append(f'✔ {str(srv).strip()}')
        extras_txt = f"<br/><b>Servicios Adicionales:</b> {', '.join(extras)}" if extras else ""

        bloque_condiciones_beneficios = [
            Paragraph('<b>CONDICIONES DE COMPRA Y BENEFICIOS</b>', ParagraphStyle('CBTitle', parent=cell_bold, fontSize=8.5, textColor=RED, spaceAfter=3)),
            Paragraph('<b>Condiciones de Compra:</b><br/>'
                      '• <b>Garantía:</b> Hasta 5 años (Varía dependiendo de la marca) contra defectos de fábrica.<br/>'
                      '• <b>Disponibilidad:</b> Precios válidos hasta agotar existencias.', cell_style),
            Spacer(1, 0.1 * cm),
            Paragraph('<b>Beneficios Exclusivos:</b><br/>'
                      '• <b>Desde 1 llanta:</b> Incluye instalación, válvula, balanceo y llenado con nitrógeno.<br/>'
                      '• <b>En la compra de 2 llantas:</b> Te regalamos 2 años de nitrógeno y revisión periódica.<br/>'
                      '• <b>Si te llevas las 4 llantas:</b> Paga a 3 Meses Sin Intereses con BBVA y llévate 2 años de mantenimiento completo (calibración con nitrógeno, revisiones y reparación de pinchaduras).'
                      f'{extras_txt}', cell_style),
        ]

        bloque_condiciones_pago = [
            Paragraph('<b>CONDICIONES DE PAGO</b>', ParagraphStyle('CPTitle', parent=cell_bold, fontSize=8.5, textColor=DARK_NAVY, spaceAfter=3)),
            Paragraph('• Todos nuestros precios ya incluyen IVA.<br/>'
                      '• Para confirmar tu solicitud, requerimos el <b>50% de anticipo</b> o el pago total.<br/><br/>'
                      '<b>Métodos de pago aceptados:</b><br/>'
                      '• Efectivo, transferencia o depósito.<br/>'
                      '• Tarjetas de crédito y débito (excepto American Express).', cell_style),
        ]

        condiciones_tbl = Table(
            [[bloque_condiciones_beneficios, bloque_condiciones_pago]],
            colWidths=[10.5 * cm, 8.0 * cm]
        )
        condiciones_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#f0fdf4')),
            ('BACKGROUND', (1, 0), (1, 0), ALT_BG),
            ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ('BOX', (0, 0), (0, 0), 1, GREEN),
            ('BOX', (1, 0), (1, 0), 1, DARK_NAVY),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('PADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(condiciones_tbl)
        story.append(Spacer(1, 0.25 * cm))

        # 3. TABLA INSTITUCIONAL DE DATOS BANCARIOS (TRANSFERENCIA Ó DEPÓSITO)
        datos_bancarios_data = [
            [Paragraph('<b>Datos para transferencia ó Deposito</b>', bank_header_style), ''],
            [Paragraph('<b>Titular:</b>', cell_bold), Paragraph('Emir Amilcar Rosado Mendoza', cell_style)],
            [Paragraph('<b>Banco:</b>', cell_bold), Paragraph('Santander', cell_style)],
            [Paragraph('<b>Num de tarjeta para transferencia:</b>', cell_bold), Paragraph('<font name="Helvetica-Bold" size="9" color="#0f172a">5579070041019087</font>', cell_style)],
            [Paragraph('<b>Clabe interbancaria:</b>', cell_bold), Paragraph('<font name="Helvetica-Bold" size="9" color="#0f172a">014910605635788786</font>', cell_style)],
            [Paragraph('<b>Correo:</b>', cell_bold), Paragraph('emircentrollantero@gmail.com', cell_style)],
        ]

        banco_tbl = Table(datos_bancarios_data, colWidths=[6.0 * cm, 12.5 * cm])
        banco_tbl.setStyle(TableStyle([
            ('SPAN', (0, 0), (1, 0)),
            ('BACKGROUND', (0, 0), (1, 0), DARK_NAVY),
            ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, ALT_BG]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 3),
        ]))
        story.append(banco_tbl)
        story.append(Spacer(1, 0.25 * cm))

        # Observaciones y condiciones comerciales (SOLO notas_cliente, NUNCA notas_internas)
        if cotizacion.notas_cliente:
            story.append(Paragraph('Observaciones y Condiciones Especiales', section_h2))
            story.append(Paragraph(cotizacion.notas_cliente, cell_style))
            story.append(Spacer(1, 0.2 * cm))

        # 4. ATENCIÓN AL CLIENTE, HORARIOS Y UBICACIÓN
        footer_col1 = [
            Paragraph('<b>ATENCIÓN EN LOS NÚMEROS:</b>', footer_title_style),
            Paragraph('📞 (999) 111 8213<br/>📞 (999) 371 8502', footer_cell_style),
        ]
        footer_col2 = [
            Paragraph('<b>HORARIOS DE ATENCIÓN:</b>', footer_title_style),
            Paragraph('Lunes a Viernes: 8:00 AM a 6:45 PM<br/>Sábados: 8:00 AM a 4:45 PM<br/>Domingos: 8:30 AM a 12:45 PM', footer_cell_style),
        ]
        footer_col3 = [
            Paragraph('<b>REDES Y DIRECCIÓN:</b>', footer_title_style),
            Paragraph('🌐 Facebook/EmirScentrollantero<br/>📍 Calle 42 # 282 por 45 Francisco de Montejo', footer_cell_style),
        ]

        footer_tbl = Table(
            [[footer_col1, footer_col2, footer_col3]],
            colWidths=[5.5 * cm, 6.5 * cm, 6.5 * cm]
        )
        footer_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), DARK_NAVY),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#334155')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('PADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(footer_tbl)

        doc.build(story)
        pdf_bytes = buf.getvalue()
        buf.close()

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="Cotizacion_{cotizacion.folio}.pdf"'
        return response


class SolicitudAutorizacionViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gestionar el flujo de autorizaciones remotas y locales de ventas.
    """
    queryset = SolicitudAutorizacion.objects.select_related(
        'venta', 'solicitado_por', 'autorizado_por'
    ).all()
    serializer_class = SolicitudAutorizacionSerializer
    lookup_field = 'token'

    def get_permissions(self):
        if self.action in ['detalle_publico', 'aprobar_remoto', 'rechazar_remoto']:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        request = self.request
        ip = request.META.get('HTTP_X_FORWARDED_FOR')
        if ip:
            ip = ip.split(',')[0].strip()
        else:
            ip = request.META.get('REMOTE_ADDR')

        serializer.save(
            solicitado_por=request.user,
            ip_solicitud=ip
        )

    @action(detail=True, methods=['get'], permission_classes=[permissions.AllowAny])
    def detalle_publico(self, request, token=None):
        """
        Consulta el estado de una solicitud para la pantalla móvil vía enlace de WhatsApp.
        """
        solicitud = self.get_object()

        # Si ya vencieron los 15 minutos, actualizar a expirada
        if solicitud.estado == 'pendiente' and solicitud.esta_expirada:
            solicitud.estado = 'expirada'
            solicitud.save(update_fields=['estado'])

        serializer = self.get_serializer(solicitud)
        data = serializer.data

        # Por seguridad no mostrar OTP al público antes de la aprobación
        if solicitud.estado != 'aprobada':
            data.pop('codigo_otp', None)
            data.pop('whatsapp_mensaje', None)

        return Response(data)

    @action(detail=True, methods=['post'], permission_classes=[permissions.AllowAny])
    def aprobar_remoto(self, request, token=None):
        """
        Aprueba remotamente la solicitud tras validar el PIN numérico del Administrador.
        """
        solicitud = self.get_object()

        if solicitud.esta_expirada:
            solicitud.estado = 'expirada'
            solicitud.save(update_fields=['estado'])
            return Response(
                {'error': 'La solicitud ha expirado. Por favor solicita una nueva autorización.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if solicitud.estado != 'pendiente':
            return Response(
                {'error': f'La solicitud ya no puede ser aprobada (estado actual: {solicitud.get_estado_display()}).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        pin_admin = request.data.get('pin_admin') or request.data.get('pin')
        if not pin_admin or not str(pin_admin).isdigit() or not (4 <= len(str(pin_admin)) <= 6):
            return Response(
                {'error': 'Debes ingresar un PIN numérico válido de 4 a 6 dígitos.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from apps.usuarios.models import Usuario
        admins = Usuario.objects.filter(activo=True).filter(
            Q(rol='admin') | Q(is_superuser=True) | Q(is_staff=True)
        )
        admin_aprobador = None
        for admin_user in admins:
            if admin_user.check_pin(str(pin_admin)):
                admin_aprobador = admin_user
                break

        if not admin_aprobador:
            return Response(
                {'error': 'PIN de Administrador inválido o no configurado.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        solicitud.estado = 'aprobada'
        solicitud.autorizado_por = admin_aprobador
        solicitud.save(update_fields=['estado', 'autorizado_por'])

        return Response({
            'mensaje': 'Solicitud aprobada exitosamente.',
            'estado': 'aprobada',
            'codigo_otp': solicitud.codigo_otp,
            'autorizado_por': admin_aprobador.get_full_name() or admin_aprobador.username
        })

    @action(detail=True, methods=['post'], permission_classes=[permissions.AllowAny])
    def rechazar_remoto(self, request, token=None):
        """
        Rechaza remotamente la solicitud desde la interfaz móvil.
        """
        solicitud = self.get_object()

        if solicitud.estado != 'pendiente':
            return Response(
                {'error': f'La solicitud no está pendiente (estado actual: {solicitud.get_estado_display()}).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        solicitud.estado = 'rechazada'
        solicitud.save(update_fields=['estado'])
        return Response({
            'mensaje': 'Solicitud rechazada.',
            'estado': 'rechazada'
        })

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def consumir_otp(self, request, token=None):
        """
        Valida el código OTP de 6 dígitos ingresado en caja para desbloquear la acción.
        """
        solicitud = self.get_object()

        if solicitud.esta_expirada:
            solicitud.estado = 'expirada'
            solicitud.save(update_fields=['estado'])
            return Response(
                {'error': 'La solicitud ha expirado.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if solicitud.estado != 'aprobada':
            return Response(
                {'error': f'La solicitud no está aprobada (estado actual: {solicitud.get_estado_display()}).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        codigo_ingresado = str(request.data.get('codigo_otp') or '').strip()
        if not codigo_ingresado or codigo_ingresado != solicitud.codigo_otp:
            return Response(
                {'error': 'Código OTP incorrecto.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        solicitud.estado = 'consumida'
        solicitud.save(update_fields=['estado'])
        return Response({
            'mensaje': 'Código OTP validado y solicitud consumida exitosamente.',
            'estado': 'consumida'
        })


