"""
Views para el módulo de Caja
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Sum, Count
from django.utils import timezone
from datetime import timedelta
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
