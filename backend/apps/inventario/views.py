from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Marca, Proveedor, Producto, EntradaInventario, SalidaInventario
from .serializers import (
    MarcaSerializer, ProveedorSerializer, ProductoSerializer,
    EntradaInventarioSerializer, SalidaInventarioSerializer
)


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
