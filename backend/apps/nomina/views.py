"""
Views para el módulo de Nómina
"""
from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import Empleado
from .serializers import EmpleadoSerializer


class EmpleadoViewSet(viewsets.ModelViewSet):
    """
    ViewSet para empleados
    """
    queryset = Empleado.objects.all()
    serializer_class = EmpleadoSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['activo', 'puesto']
    search_fields = ['nombre', 'apellido', 'telefono']
    ordering_fields = ['nombre', 'apellido', 'fecha_ingreso']
    ordering = ['apellido', 'nombre']
    
    def get_queryset(self):
        """
        Opcionalmente filtrar solo empleados activos
        """
        queryset = super().get_queryset()
        activos = self.request.query_params.get('activos', None)
        
        if activos is not None:
            queryset = queryset.filter(activo=True)
        
        return queryset
