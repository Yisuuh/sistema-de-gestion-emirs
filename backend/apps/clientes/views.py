from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Cliente, Vehiculo
from .serializers import ClienteSerializer, VehiculoSerializer


class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.prefetch_related('vehiculos', 'ventas').all()
    serializer_class = ClienteSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nombre', 'telefono', 'email', 'rfc']
    ordering_fields = ['nombre', 'created_at']
    ordering = ['nombre']

    @action(detail=True, methods=['get'])
    def ventas(self, request, pk=None):
        from apps.ventas.serializers import VentaSerializer
        cliente = self.get_object()
        ventas = cliente.ventas.order_by('-fecha')[:20]
        serializer = VentaSerializer(ventas, many=True)
        return Response(serializer.data)


class VehiculoViewSet(viewsets.ModelViewSet):
    queryset = Vehiculo.objects.select_related('cliente').all()
    serializer_class = VehiculoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['cliente']
    search_fields = ['marca', 'modelo', 'placas', 'medida_llantas']
