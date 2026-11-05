"""
Views para el módulo de Caja
"""
from decimal import Decimal
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Sum, Count
from django.utils import timezone
from datetime import timedelta, date
from .models import Caja, MovimientoCaja, ArqueoCaja
from .serializers import (
    CajaSerializer,
    CajaListSerializer,
    CerrarCajaSerializer,
    ModificarCierreCajaSerializer,
    MovimientoCajaSerializer,
    ArqueoCajaSerializer
)
from apps.usuarios.models import LogAuditoria


class CajaViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gestionar cajas
    """
    queryset = Caja.objects.select_related(
        'empleado_apertura', 
        'empleado_cierre'
    ).prefetch_related('movimientos', 'arqueos')
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['folio']
    ordering_fields = ['fecha_apertura', 'fecha_cierre']
    ordering = ['-fecha_apertura']
    
    def get_serializer_class(self):
        """Usar serializer simplificado para listado"""
        if self.action == 'list':
            return CajaListSerializer
        return CajaSerializer
    
    def get_queryset(self):
        """Filtrar cajas por estado, fecha, etc."""
        queryset = super().get_queryset()
        
        # Filtrar por estado
        estado = self.request.query_params.get('estado')
        if estado:
            queryset = queryset.filter(estado=estado)
        
        # Filtrar por fecha
        fecha_inicio = self.request.query_params.get('fecha_inicio')
        fecha_fin = self.request.query_params.get('fecha_fin')
        
        if fecha_inicio:
            queryset = queryset.filter(fecha_apertura__gte=fecha_inicio)
        if fecha_fin:
            queryset = queryset.filter(fecha_apertura__lte=fecha_fin)
        
        # Filtrar por empleado
        empleado_id = self.request.query_params.get('empleado')
        if empleado_id:
            queryset = queryset.filter(
                Q(empleado_apertura_id=empleado_id) | 
                Q(empleado_cierre_id=empleado_id)
            )
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def caja_actual(self, request):
        """
        Obtener la caja abierta actualmente
        """
        caja = Caja.objects.filter(estado='abierta').first()
        if caja:
            serializer = CajaSerializer(caja)
            return Response(serializer.data)
        return Response(
            {'mensaje': 'No hay una caja abierta actualmente'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    
    @action(detail=True, methods=['post'])
    def cerrar(self, request, pk=None):
        """
        Cerrar una caja
        """
        caja = self.get_object()
        
        if caja.estado == 'cerrada':
            return Response(
                {'error': 'Esta caja ya está cerrada'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = CerrarCajaSerializer(data=request.data)
        if serializer.is_valid():
            monto_final = serializer.validated_data['monto_final']
            tiene_movimientos = (
                caja.num_ventas > 0 or
                caja.total_ventas > Decimal('0.00') or
                caja.total_ingresos_extra > Decimal('0.00') or
                caja.total_egresos > Decimal('0.00') or
                caja.monto_inicial > Decimal('0.00') or
                caja.saldo_esperado > Decimal('0.00')
            )
            if monto_final <= Decimal('0.00') and tiene_movimientos:
                return Response(
                    {
                        'error': (
                            f'No es posible cerrar la caja en $0.00 porque tiene movimientos registrados '
                            f'(saldo esperado ${caja.saldo_esperado:,.2f} con {caja.num_ventas} operaciones). '
                            f'Debe realizar el conteo de efectivo correspondiente.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            caja.empleado_cierre_id = serializer.validated_data['empleado_cierre']
            caja.monto_final = monto_final
            caja.notas_cierre = serializer.validated_data.get('notas_cierre', '')
            caja.fecha_cierre = timezone.now()
            caja.estado = 'cerrada'
            caja.save()

            diferencia = caja.diferencia
            advertencia = None
            if diferencia is not None and abs(float(diferencia)) > 0.01:
                advertencia = f'Caja cerrada con diferencia de ${diferencia:+.2f}. Requiere revisión.'

            data = CajaSerializer(caja).data
            if advertencia:
                data['advertencia'] = advertencia
            return Response(data)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def modificar_cierre(self, request, pk=None):
        """
        Modificar el cierre de una caja cerrada (Solo Administradores)
        """
        es_admin = (
            getattr(request.user, 'rol', None) == 'admin' or 
            getattr(request.user, 'role', None) == 'admin' or 
            request.user.is_staff or 
            request.user.is_superuser or
            getattr(request.user, 'es_admin', False)
        )
        if not es_admin:
            return Response(
                {'error': 'Solo los administradores pueden modificar el cierre de caja'},
                status=status.HTTP_403_FORBIDDEN
            )

        caja = self.get_object()
        if caja.estado != 'cerrada':
            return Response(
                {'error': 'Solo se pueden modificar cajas cerradas'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = ModificarCierreCajaSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        nuevo_monto_final = serializer.validated_data['monto_final']
        if (caja.num_ventas > 0 or caja.saldo_esperado > Decimal('0.00')) and nuevo_monto_final <= Decimal('0.00'):
            return Response(
                {'error': 'No es posible establecer un monto final de $0.00 en una caja con movimientos registrados.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        monto_final_ant = caja.monto_final
        diferencia_ant = caja.diferencia
        motivo = serializer.validated_data['motivo']

        caja.monto_final = nuevo_monto_final
        if serializer.validated_data.get('empleado_cierre'):
            caja.empleado_cierre_id = serializer.validated_data['empleado_cierre']

        notas_base = serializer.validated_data.get('notas_cierre') or caja.notas_cierre or ''
        admin_tag = f"\n[MODIFICADO POR ADMIN {request.user.username}]: {motivo} | Anterior: ${monto_final_ant} -> Nuevo: ${caja.monto_final}"
        caja.notas_cierre = f"{notas_base}{admin_tag}".strip()
        caja.save()

        try:
            LogAuditoria.objects.create(
                usuario=request.user if request.user.is_authenticated else None,
                accion='actualizar',
                tabla='caja',
                registro_id=caja.id,
                datos_anteriores={
                    'monto_final': float(monto_final_ant) if monto_final_ant is not None else None,
                    'diferencia': float(diferencia_ant) if diferencia_ant is not None else None,
                },
                datos_nuevos={
                    'monto_final': float(caja.monto_final),
                    'diferencia': float(caja.diferencia) if caja.diferencia is not None else None,
                    'motivo': motivo,
                    'empleado_cierre': caja.empleado_cierre_id,
                },
                ip=request.META.get('REMOTE_ADDR'),
            )
        except Exception:
            pass

        return Response(CajaSerializer(caja).data)

    @action(detail=True, methods=['post'])
    def reabrir(self, request, pk=None):
        """
        Reabrir una caja cerrada (Solo Administradores)
        """
        es_admin = (
            getattr(request.user, 'rol', None) == 'admin' or 
            getattr(request.user, 'role', None) == 'admin' or 
            request.user.is_staff or 
            request.user.is_superuser or
            getattr(request.user, 'es_admin', False)
        )
        if not es_admin:
            return Response(
                {'error': 'Solo los administradores pueden reabrir una caja'},
                status=status.HTTP_403_FORBIDDEN
            )

        caja = self.get_object()
        if caja.estado != 'cerrada':
            return Response(
                {'error': 'Solo se pueden reabrir cajas cerradas'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if Caja.objects.filter(estado='abierta').exists():
            return Response(
                {'error': 'Ya existe una caja abierta actualmente. No puede haber dos cajas abiertas simultáneas.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        motivo = request.data.get('motivo', '').strip()
        if len(motivo) < 5:
            return Response(
                {'error': 'El motivo de reapertura debe contener al menos 5 caracteres'},
                status=status.HTTP_400_BAD_REQUEST
            )

        monto_final_ant = caja.monto_final
        caja.estado = 'abierta'
        caja.fecha_cierre = None
        caja.monto_final = None
        caja.empleado_cierre = None
        admin_tag = f"\n[REAPERTURA POR ADMIN {request.user.username}]: {motivo}"
        caja.notas_cierre = f"{caja.notas_cierre or ''}{admin_tag}".strip()
        caja.save()

        try:
            LogAuditoria.objects.create(
                usuario=request.user if request.user.is_authenticated else None,
                accion='actualizar',
                tabla='caja',
                registro_id=caja.id,
                datos_anteriores={
                    'estado': 'cerrada',
                    'monto_final': float(monto_final_ant) if monto_final_ant is not None else None,
                },
                datos_nuevos={
                    'estado': 'abierta',
                    'motivo': motivo,
                },
                ip=request.META.get('REMOTE_ADDR'),
            )
        except Exception:
            pass

        return Response(CajaSerializer(caja).data)
    
    @action(detail=True, methods=['get'])
    def ventas_caja(self, request, pk=None):
        """
        Todas las ventas registradas dentro de esta caja con detalle completo
        (detalles con producto/servicio, vehículo, formas de pago, empleado, cliente)
        para renderizado y reimpresión de ticket térmico formal y consulta histórica.
        """
        caja = self.get_object()
        from apps.ventas.models import Venta
        from apps.ventas.serializers import VentaSerializer
        ventas = (
            Venta.objects
            .filter(caja=caja)
            .select_related('empleado', 'cliente', 'vehiculo')
            .prefetch_related('detalles__producto', 'detalles__servicio')
            .order_by('-fecha')
        )
        serializer = VentaSerializer(ventas, many=True)
        return Response({
            'caja_folio': caja.folio,
            'total_ventas': caja.num_ventas,
            'total_monto': float(caja.total_ventas),
            'ventas': serializer.data,
        })

    @action(detail=False, methods=['get'])
    def historial(self, request):
        """
        GET /api/caja/cajas/historial/?periodo=hoy|semana|mes|rango
        &fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD

        Devuelve cajas agrupadas con sus totales de ventas, egresos y saldo.
        """
        hoy = timezone.localdate()
        periodo = request.query_params.get('periodo', 'hoy')

        if periodo == 'hoy':
            inicio = hoy
            fin = hoy
            cajas = (
                Caja.objects
                .filter(Q(fecha_apertura__date=hoy) | Q(estado='abierta'))
                .select_related('empleado_apertura', 'empleado_cierre')
                .distinct()
                .order_by('-fecha_apertura')
            )
        elif periodo == 'semana':
            inicio = hoy - timedelta(days=hoy.weekday())  # lunes de esta semana
            fin = hoy
            cajas = (
                Caja.objects
                .filter(fecha_apertura__date__gte=inicio, fecha_apertura__date__lte=fin)
                .select_related('empleado_apertura', 'empleado_cierre')
                .order_by('-fecha_apertura')
            )
        elif periodo == 'mes':
            inicio = hoy.replace(day=1)
            fin = hoy
            cajas = (
                Caja.objects
                .filter(fecha_apertura__date__gte=inicio, fecha_apertura__date__lte=fin)
                .select_related('empleado_apertura', 'empleado_cierre')
                .order_by('-fecha_apertura')
            )
        elif periodo == 'rango':
            try:
                inicio = date.fromisoformat(request.query_params.get('fecha_inicio', str(hoy)))
                fin = date.fromisoformat(request.query_params.get('fecha_fin', str(hoy)))
            except ValueError:
                return Response({'error': 'Fechas inválidas. Use formato YYYY-MM-DD.'}, status=400)
            cajas = (
                Caja.objects
                .filter(fecha_apertura__date__gte=inicio, fecha_apertura__date__lte=fin)
                .select_related('empleado_apertura', 'empleado_cierre')
                .order_by('-fecha_apertura')
            )
        else:
            return Response({'error': 'Periodo no válido. Use: hoy, semana, mes, rango.'}, status=400)

        # Construir resumen
        resultado = []
        for caja in cajas:
            # Omitir del historial cajas accidentales cerradas en ceros sin operaciones ni movimientos
            es_caja_cero_accidental = (
                caja.estado == 'cerrada' and
                caja.num_ventas == 0 and
                caja.total_ventas == Decimal('0.00') and
                caja.total_ingresos_extra == Decimal('0.00') and
                caja.total_egresos == Decimal('0.00') and
                (
                    (caja.monto_inicial == Decimal('0.00') and (caja.monto_final == Decimal('0.00') or caja.monto_final is None))
                    or (caja.monto_final == Decimal('0.00') and caja.saldo_esperado == Decimal('0.00'))
                )
            )
            if es_caja_cero_accidental:
                continue

            resultado.append({
                'id': caja.id,
                'folio': caja.folio,
                'estado': caja.estado,
                'fecha_apertura': caja.fecha_apertura.strftime('%Y-%m-%d %H:%M'),
                'fecha_cierre': caja.fecha_cierre.strftime('%Y-%m-%d %H:%M') if caja.fecha_cierre else None,
                'empleado_apertura': caja.empleado_apertura.nombre_completo if caja.empleado_apertura else '',
                'empleado_cierre': caja.empleado_cierre.nombre_completo if caja.empleado_cierre else '',
                'monto_inicial': float(caja.monto_inicial),
                'monto_final': float(caja.monto_final) if caja.monto_final is not None else None,
                'num_ventas': caja.num_ventas,
                'total_ventas': float(caja.total_ventas),
                'total_ventas_efectivo': float(caja.total_ventas_efectivo),
                'total_ventas_electronico': float(caja.total_ventas_electronico),
                'total_ingresos': float(caja.total_ingresos),
                'total_egresos': float(caja.total_egresos),
                'saldo_esperado': float(caja.saldo_esperado),
                'diferencia': float(caja.diferencia) if caja.diferencia is not None else None,
            })

        # Totales del periodo
        total_periodo = {
            'cajas': len(resultado),
            'ventas': sum(r['num_ventas'] for r in resultado),
            'monto_ventas': sum(r['total_ventas'] for r in resultado),
            'efectivo': sum(r['total_ventas_efectivo'] for r in resultado),
            'electronico': sum(r['total_ventas_electronico'] for r in resultado),
            'egresos': sum(r['total_egresos'] for r in resultado),
        }

        return Response({
            'periodo': periodo,
            'fecha_inicio': str(inicio),
            'fecha_fin': str(fin),
            'totales': total_periodo,
            'cajas': resultado,
        })

    @action(detail=False, methods=['get'])
    def estadisticas_hoy(self, request):
        """
        Estadísticas de caja del día
        """
        hoy = timezone.localdate()
        
        # Buscar caja del día
        caja_hoy = Caja.objects.filter(
            fecha_apertura__date=hoy
        ).first()
        
        if not caja_hoy:
            return Response({
                'mensaje': 'No hay caja registrada para hoy',
                'fecha': hoy
            })
        
        # Obtener estadísticas de ventas
        from apps.ventas.models import Venta
        ventas_hoy = Venta.objects.filter(
            fecha__gte=caja_hoy.fecha_apertura
        )
        
        if caja_hoy.estado == 'cerrada' and caja_hoy.fecha_cierre:
            ventas_hoy = ventas_hoy.filter(fecha__lte=caja_hoy.fecha_cierre)
        
        return Response({
            'caja': CajaSerializer(caja_hoy).data,
            'ventas': {
                'total_ventas': caja_hoy.num_ventas,
                'total_efectivo': float(caja_hoy.total_ventas_efectivo),
                'total_electronico': float(caja_hoy.total_ventas_electronico),
                'total_general': float(caja_hoy.total_ventas),
            },
            'saldo_inicial': caja_hoy.monto_inicial,
            'total_ingresos': caja_hoy.total_ingresos,
            'total_egresos': caja_hoy.total_egresos,
            'saldo_esperado': caja_hoy.saldo_esperado,
            'monto_final': caja_hoy.monto_final,
            'diferencia': caja_hoy.diferencia
        })
    
    @action(detail=True, methods=['get'])
    def reporte(self, request, pk=None):
        """
        Reporte detallado de caja
        """
        caja = self.get_object()
        
        # Obtener ventas del periodo
        from apps.ventas.models import Venta
        ventas = Venta.objects.filter(
            fecha__gte=caja.fecha_apertura
        )
        
        if caja.fecha_cierre:
            ventas = ventas.filter(fecha__lte=caja.fecha_cierre)
        
        # Desglose por método de pago
        ventas_por_metodo = ventas.values('metodo_pago').annotate(
            cantidad=Count('id'),
            total=Sum('total')
        )
        
        return Response({
            'caja': CajaSerializer(caja).data,
            'resumen_ventas': {
                'total_ventas': caja.num_ventas,
                'total_efectivo': float(caja.total_ventas_efectivo),
                'total_electronico': float(caja.total_ventas_electronico),
                'total_general': float(caja.total_ventas),
            },
            'ventas_por_metodo': list(ventas_por_metodo),
            'movimientos': MovimientoCajaSerializer(
                caja.movimientos.all(), 
                many=True
            ).data,
            'arqueos': ArqueoCajaSerializer(
                caja.arqueos.all(), 
                many=True
            ).data
        })


class MovimientoCajaViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gestionar movimientos de caja
    """
    queryset = MovimientoCaja.objects.select_related('caja', 'empleado')
    serializer_class = MovimientoCajaSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['concepto', 'descripcion', 'categoria']
    ordering_fields = ['fecha', 'monto']
    ordering = ['-fecha']
    
    def get_queryset(self):
        """Filtrar movimientos"""
        queryset = super().get_queryset()
        
        # Filtrar por caja
        caja_id = self.request.query_params.get('caja')
        if caja_id:
            queryset = queryset.filter(caja_id=caja_id)
        
        # Filtrar por tipo
        tipo = self.request.query_params.get('tipo')
        if tipo:
            queryset = queryset.filter(tipo=tipo)
        
        # Filtrar por categoría
        categoria = self.request.query_params.get('categoria')
        if categoria:
            queryset = queryset.filter(categoria__icontains=categoria)
        
        # Filtrar por fecha
        fecha_inicio = self.request.query_params.get('fecha_inicio')
        fecha_fin = self.request.query_params.get('fecha_fin')
        
        if fecha_inicio:
            queryset = queryset.filter(fecha__gte=fecha_inicio)
        if fecha_fin:
            queryset = queryset.filter(fecha__lte=fecha_fin)
        
        return queryset
    
    def perform_create(self, serializer):
        """Validar que la caja esté abierta antes de crear movimiento"""
        from rest_framework.exceptions import ValidationError
        caja_id = self.request.data.get('caja')
        try:
            caja = Caja.objects.get(id=caja_id)
            if caja.estado == 'cerrada':
                raise ValidationError(
                    'No se pueden registrar movimientos en una caja cerrada'
                )
        except Caja.DoesNotExist:
            raise ValidationError('La caja especificada no existe')
        
        serializer.save()

    def update(self, request, *args, **kwargs):
        """Validar admin y caja abierta al modificar movimiento"""
        es_admin = (
            getattr(request.user, 'rol', None) == 'admin' or 
            getattr(request.user, 'role', None) == 'admin' or 
            request.user.is_staff or 
            request.user.is_superuser
        )
        if not es_admin:
            return Response(
                {'error': 'Solo los administradores pueden modificar movimientos de caja'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        movimiento = self.get_object()
        if movimiento.caja and movimiento.caja.estado == 'cerrada':
            return Response(
                {'error': 'No se pueden modificar movimientos de una caja cerrada'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Validar admin y caja abierta al eliminar movimiento"""
        es_admin = (
            getattr(request.user, 'rol', None) == 'admin' or 
            getattr(request.user, 'role', None) == 'admin' or 
            request.user.is_staff or 
            request.user.is_superuser
        )
        if not es_admin:
            return Response(
                {'error': 'Solo los administradores pueden eliminar movimientos de caja'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        movimiento = self.get_object()
        if movimiento.caja and movimiento.caja.estado == 'cerrada':
            return Response(
                {'error': 'No se pueden eliminar movimientos de una caja cerrada'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return super().destroy(request, *args, **kwargs)


class ArqueoCajaViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gestionar arqueos de caja
    """
    queryset = ArqueoCaja.objects.select_related('caja', 'empleado')
    serializer_class = ArqueoCajaSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['fecha', 'total']
    ordering = ['-fecha']
    
    def get_queryset(self):
        """Filtrar arqueos"""
        queryset = super().get_queryset()
        
        # Filtrar por caja
        caja_id = self.request.query_params.get('caja')
        if caja_id:
            queryset = queryset.filter(caja_id=caja_id)
        
        # Filtrar por fecha
        fecha_inicio = self.request.query_params.get('fecha_inicio')
        fecha_fin = self.request.query_params.get('fecha_fin')
        
        if fecha_inicio:
            queryset = queryset.filter(fecha__gte=fecha_inicio)
        if fecha_fin:
            queryset = queryset.filter(fecha__lte=fecha_fin)
        
        return queryset
    
    def perform_create(self, serializer):
        """Validar que la caja esté abierta antes de crear arqueo"""
        caja_id = self.request.data.get('caja')
        try:
            caja = Caja.objects.get(id=caja_id)
            if caja.estado == 'cerrada':
                raise serializers.ValidationError(
                    'No se pueden realizar arqueos en una caja cerrada'
                )
        except Caja.DoesNotExist:
            raise serializers.ValidationError('La caja especificada no existe')
        
        serializer.save()
