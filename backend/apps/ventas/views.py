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
from .models import Venta, DetalleVenta, Servicio
from .serializers import (
    VentaSerializer, 
    VentaListSerializer,
    DetalleVentaSerializer, 
    ServicioSerializer
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
        Filtrar servicios activos por defecto
        """
        queryset = super().get_queryset()
        
        # Filtrar solo activos si no se especifica lo contrario
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
        
        # Filtrar por método de pago
        metodo_pago = self.request.query_params.get('metodo_pago')
        if metodo_pago:
            queryset = queryset.filter(metodo_pago=metodo_pago)
        
        return queryset
    
    def perform_create(self, serializer):
        """
        Guardar la venta (el empleado viene en los datos del request)
        """
        serializer.save()
    
    @action(detail=False, methods=['get'])
    def ventas_hoy(self, request):
        """
        Obtener ventas del día actual
        """
        hoy = timezone.now().date()
        ventas = self.get_queryset().filter(fecha__date=hoy)
        serializer = self.get_serializer(ventas, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def estadisticas_hoy(self, request):
        """
        Estadísticas de ventas del día
        """
        hoy = timezone.now().date()
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
        hoy = timezone.now().date()
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
            'producto__descripcion_completa'
        ).annotate(
            cantidad_total=Sum('cantidad'),
            ventas_total=Sum('subtotal'),
            num_ventas=Count('venta', distinct=True)
        ).order_by('-cantidad_total')[:limite]
        
        return Response(list(productos_vendidos))
    
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
