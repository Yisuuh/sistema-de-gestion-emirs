"""
Views para el módulo de Caja
"""
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
    MovimientoCajaSerializer,
    ArqueoCajaSerializer
)


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
            caja.empleado_cierre_id = serializer.validated_data['empleado_cierre']
            caja.monto_final = serializer.validated_data['monto_final']
            caja.notas_cierre = serializer.validated_data.get('notas_cierre', '')
            caja.fecha_cierre = timezone.now()
            caja.estado = 'cerrada'
            caja.save()
            
            return Response(CajaSerializer(caja).data)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def ventas_caja(self, request, pk=None):
        """
        Todas las ventas registradas dentro de esta caja.
        Devuelve lista con folio, empleado, método de pago, total y hora.
        """
        caja = self.get_object()
        from apps.ventas.models import Venta
        from apps.ventas.serializers import VentaListSerializer
        ventas = (
            Venta.objects
            .filter(caja=caja)
            .select_related('empleado', 'cliente')
            .prefetch_related('detalles')
            .order_by('-fecha')
        )
        serializer = VentaListSerializer(ventas, many=True)
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
        hoy = timezone.now().date()
        periodo = request.query_params.get('periodo', 'hoy')

        if periodo == 'hoy':
            inicio = hoy
            fin = hoy
        elif periodo == 'semana':
            inicio = hoy - timedelta(days=hoy.weekday())  # lunes de esta semana
            fin = hoy
        elif periodo == 'mes':
            inicio = hoy.replace(day=1)
            fin = hoy
        elif periodo == 'rango':
            try:
                inicio = date.fromisoformat(request.query_params.get('fecha_inicio', str(hoy)))
                fin = date.fromisoformat(request.query_params.get('fecha_fin', str(hoy)))
            except ValueError:
                return Response({'error': 'Fechas inválidas. Use formato YYYY-MM-DD.'}, status=400)
        else:
            return Response({'error': 'Periodo no válido. Use: hoy, semana, mes, rango.'}, status=400)

        cajas = (
            Caja.objects
            .filter(fecha_apertura__date__gte=inicio, fecha_apertura__date__lte=fin)
            .select_related('empleado_apertura', 'empleado_cierre')
            .order_by('-fecha_apertura')
        )

        # Construir resumen
        resultado = []
        for caja in cajas:
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
        hoy = timezone.now().date()
        
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
        
        stats_ventas = ventas_hoy.aggregate(
            total_ventas=Count('id'),
            total_efectivo=Sum('monto_efectivo'),
            total_electronico=Sum('monto_electronico'),
            total_general=Sum('total')
        )
        
        return Response({
            'caja': CajaSerializer(caja_hoy).data,
            'ventas': stats_ventas,
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
        
        stats_ventas = ventas.aggregate(
            total_ventas=Count('id'),
            total_efectivo=Sum('monto_efectivo'),
            total_electronico=Sum('monto_electronico'),
            total_general=Sum('total')
        )
        
        # Desglose por método de pago
        ventas_por_metodo = ventas.values('metodo_pago').annotate(
            cantidad=Count('id'),
            total=Sum('total')
        )
        
        return Response({
            'caja': CajaSerializer(caja).data,
            'resumen_ventas': stats_ventas,
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
        caja_id = self.request.data.get('caja')
        try:
            caja = Caja.objects.get(id=caja_id)
            if caja.estado == 'cerrada':
                raise serializers.ValidationError(
                    'No se pueden registrar movimientos en una caja cerrada'
                )
        except Caja.DoesNotExist:
            raise serializers.ValidationError('La caja especificada no existe')
        
        serializer.save()


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
